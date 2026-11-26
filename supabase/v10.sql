-- MAX라이프 주식 v10 — 재무제표·업종별 시세(네이버 증권 경유), 주문 비밀번호, 예약주문(다음 장 시작 시 자동 주문)
-- v9.sql 다음에 실행 (여러 번 실행해도 안전)

alter table mls_users add column if not exists order_pin text;
create table if not exists mls_reserves (
  id text primary key, user_id text not null, code text not null, name text default '', body jsonb not null,
  status text not null default 'pending', run_after timestamptz not null default now(), result text default '', order_id text,
  created_at timestamptz not null default now(), done_at timestamptz
);
create index if not exists mls_reserves_due on mls_reserves(status, run_after);

-- 네이버 증권 공개 API 캐시 (허용된 경로만)
create or replace function mls_nv(p_path text, p_ttl interval) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare r extensions.http_response; c mls_disc;
begin
  if p_path !~ '^(stock/[0-9A-Z]{6}/finance/(annual|quarter)|stocks/industry(/[0-9]{1,4})?\?page=[0-9]{1,2}&pageSize=[0-9]{1,3})$' then return null; end if;
  select * into c from mls_disc where k = 'nv:' || p_path and at > now() - p_ttl;
  if found then return c.d; end if;
  begin
    perform extensions.http_set_curlopt('CURLOPT_TIMEOUT', '5');
    select * into r from extensions.http_get('https://m.stock.naver.com/api/' || p_path);
    if r.status = 200 then insert into mls_disc (k, d, at) values ('nv:' || p_path, r.content::jsonb, now()) on conflict (k) do update set d = excluded.d, at = excluded.at; return r.content::jsonb; end if;
  exception when others then null; end;
  return (select d from mls_disc where k = 'nv:' || p_path);
end $$;
revoke all on function mls_nv(text, interval) from public;

-- 다음 국내 정규장 시작 시각 (주말·휴장일 건너뜀)
create or replace function mls_next_open_kr() returns timestamptz language plpgsql stable as $$
declare d date := (now() at time zone 'Asia/Seoul')::date; hol jsonb := coalesce(mls_settings()->'krHolidays', '[]'::jsonb); i int := 0;
begin
  if (now() at time zone 'Asia/Seoul')::time >= time '09:00' then d := d + 1; end if;
  while i < 15 and (extract(isodow from d) > 5 or hol ? to_char(d, 'YYYY-MM-DD')) loop d := d + 1; i := i + 1; end loop;
  return (d + time '09:00:05') at time zone 'Asia/Seoul';
end $$;

-- 예약주문 실행: 장이 열려 있으면 회원 대신 주문 (매분)
create or replace function mls_reserve_run() returns int language plpgsql security definer set search_path = public, extensions as $$
declare r record; q mls_quotes; t text; e jsonb; n int := 0;
begin
  for r in select * from mls_reserves where status = 'pending' and run_after <= now() order by run_after, created_at limit 200 loop
    select * into q from mls_quotes where code = r.code;
    if not found then update mls_reserves set status = 'failed', result = '종목 시세를 찾을 수 없습니다.', done_at = now() where id = r.id; continue; end if;
    if mls_session2(q.market) <> 'regular' then continue; end if;
    t := encode(extensions.gen_random_bytes(32), 'hex');
    insert into mls_sessions (token, user_id, expires_at) values (t, r.user_id, now() + interval '2 minutes');
    begin e := mls_api_v9('placeOrder', r.body, t); exception when others then e := jsonb_build_object('ok', false, 'error', '주문 처리 중 오류'); end;
    delete from mls_sessions where token = t;
    if (e->>'ok')::boolean then update mls_reserves set status = 'done', order_id = e->'data'->'order'->>'id', result = case when e->'data'->'fill' is not null and e->'data'->>'fill' <> 'null' then '체결' else '주문 접수' end, done_at = now() where id = r.id; n := n + 1;
    else update mls_reserves set status = 'failed', result = left(coalesce(e->>'error', '주문 실패'), 200), done_at = now() where id = r.id; end if;
  end loop;
  return n;
end $$;
revoke all on function mls_reserve_run() from public;

do $$ begin
  if (select prosrc from pg_proc where proname = 'mls_api' and pronamespace = 'public'::regnamespace) not like '%mls_api_v9(%' then
    drop function if exists mls_api_v9(text, jsonb, text);
    alter function mls_api(text, jsonb, text) rename to mls_api_v9;
  end if;
end $$;

create or replace function mls_api(p_action text, p_body jsonb default '{}'::jsonb, p_token text default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare b jsonb := coalesce(p_body, '{}'::jsonb); me mls_users; q mls_quotes; v_id text; v_run timestamptz;
begin
  -- 공개: 재무제표 · 업종
  if p_action = 'finance' then return jsonb_build_object('ok', true, 'data', mls_nv('stock/' || upper(coalesce(b->>'code', '')) || '/finance/' || case when b->>'period' = 'quarter' then 'quarter' else 'annual' end, interval '12 hours')); end if;
  if p_action = 'industries' then return jsonb_build_object('ok', true, 'data', mls_nv('stocks/industry?page=1&pageSize=100', interval '3 minutes')); end if;
  if p_action = 'industry' then return jsonb_build_object('ok', true, 'data', mls_nv('stocks/industry/' || coalesce(nullif(regexp_replace(coalesce(b->>'no', ''), '[^0-9]', '', 'g'), ''), '0') || '?page=1&pageSize=50', interval '3 minutes')); end if;
  if p_token ~ '^[a-f0-9]{64}$' and p_action not like 'p\_%' escape '\' then
    select x.* into me from mls_sessions s join mls_users x on x.id = s.user_id where s.token = p_token and s.expires_at > now() and x.status = 'active';
  end if;
  -- 주문 비밀번호 확인 (설정한 회원만)
  if me.id is not null and me.order_pin is not null and p_action in ('placeOrder', 'amendOrder', 'cfOrder', 'cfClose', 'reserveOrder') then
    if me.order_pin <> extensions.crypt(coalesce(b->>'pin', ''), me.order_pin) then perform pg_sleep(0.3); return jsonb_build_object('ok', false, 'error', '주문 비밀번호가 올바르지 않습니다.', 'code', 'PIN'); end if;
    b := b - 'pin';
  end if;
  if p_action not in ('setOrderPin', 'orderPinStatus', 'reserveOrder', 'myReserves', 'cancelReserve', 'adminReserves') then
    return mls_api_v9(p_action, case when me.order_pin is not null then b else p_body end, p_token);
  end if;
  if me.id is null then return jsonb_build_object('ok', false, 'error', '로그인이 필요합니다.'); end if;
  case p_action
  when 'orderPinStatus' then return jsonb_build_object('ok', true, 'data', me.order_pin is not null);
  when 'setOrderPin' then
    if me.pw <> extensions.crypt(coalesce(b->>'pw', ''), me.pw) then perform pg_sleep(0.4); return jsonb_build_object('ok', false, 'error', '로그인 비밀번호가 올바르지 않습니다.'); end if;
    if coalesce(b->>'pin', '') = '' then update mls_users set order_pin = null where id = me.id; return jsonb_build_object('ok', true, 'data', false); end if;
    if b->>'pin' !~ '^[0-9]{4,6}$' then return jsonb_build_object('ok', false, 'error', '주문 비밀번호는 숫자 4~6자리입니다.'); end if;
    update mls_users set order_pin = extensions.crypt(b->>'pin', extensions.gen_salt('bf')) where id = me.id;
    return jsonb_build_object('ok', true, 'data', true);
  when 'reserveOrder' then
    -- 예약주문: 지정가·시장가만, 다음 정규장 시작 때 자동 주문 (미국은 다음 정규장)
    select * into q from mls_quotes where code = upper(coalesce(b->>'code', '')); if not found then return jsonb_build_object('ok', false, 'error', '종목을 찾을 수 없습니다.'); end if;
    if coalesce(b->>'side', '') not in ('buy', 'sell') or coalesce(b->>'type', '') not in ('limit', 'market') or coalesce((b->>'qty')::bigint, 0) <= 0 then return jsonb_build_object('ok', false, 'error', '예약주문은 지정가·시장가, 수량 1주 이상만 가능합니다.'); end if;
    if (select count(*) from mls_reserves where user_id = me.id and status = 'pending') >= 30 then return jsonb_build_object('ok', false, 'error', '대기 중인 예약주문은 30건까지입니다.'); end if;
    v_run := case when q.market in ('KOSPI', 'KOSDAQ', 'KONEX') then mls_next_open_kr() else now() + interval '1 minute' end;
    v_id := mls_uid('rv');
    insert into mls_reserves (id, user_id, code, name, body, run_after) values (v_id, me.id, q.code, q.name,
      jsonb_build_object('code', q.code, 'side', b->>'side', 'type', b->>'type', 'price', coalesce((b->>'price')::numeric, 0), 'qty', (b->>'qty')::bigint), v_run);
    return jsonb_build_object('ok', true, 'data', jsonb_build_object('id', v_id, 'runAfter', mls_iso(v_run)));
  when 'myReserves' then
    return jsonb_build_object('ok', true, 'data', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'code', code, 'name', name, 'side', body->>'side', 'type', body->>'type', 'price', (body->>'price')::float8, 'qty', (body->>'qty')::bigint,
      'status', status, 'runAfter', mls_iso(run_after), 'result', result, 'orderId', order_id, 'at', mls_iso(created_at), 'doneAt', mls_iso(done_at)) order by created_at desc) from (select * from mls_reserves where user_id = me.id order by created_at desc limit 100) x), '[]'::jsonb));
  when 'cancelReserve' then
    update mls_reserves set status = 'cancelled', done_at = now() where id = b->>'id' and user_id = me.id and status = 'pending';
    return jsonb_build_object('ok', true, 'data', true);
  when 'adminReserves' then
    if me.role <> 'admin' then return jsonb_build_object('ok', false, 'error', '관리자 권한이 필요합니다.'); end if;
    return jsonb_build_object('ok', true, 'data', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'user', u.name, 'name', r.name, 'side', r.body->>'side', 'type', r.body->>'type', 'price', (r.body->>'price')::float8, 'qty', (r.body->>'qty')::bigint, 'status', r.status, 'runAfter', mls_iso(r.run_after), 'result', r.result, 'at', mls_iso(r.created_at)) order by r.created_at desc)
      from (select * from mls_reserves order by created_at desc limit 300) r join mls_users u on u.id = r.user_id), '[]'::jsonb));
  end case;
  return null;
exception
  when sqlstate 'P0001' then return jsonb_build_object('ok', false, 'error', sqlerrm);
  when others then raise warning '[mls10] % % %', p_action, sqlstate, sqlerrm; return jsonb_build_object('ok', false, 'error', '서버 오류가 발생했습니다.');
end $$;
revoke all on function mls_api_v9(text, jsonb, text) from public;
revoke all on function mls_api(text, jsonb, text) from public;
do $$ begin if exists (select 1 from pg_roles where rolname = 'anon') then
  revoke all on function mls_api_v9(text, jsonb, text) from anon, authenticated;
  grant execute on function mls_api(text, jsonb, text) to anon, authenticated;
end if; end $$;

-- 매분 예약주문 실행
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'mls-reserve';
    perform cron.schedule('mls-reserve', '* * * * *', 'select public.mls_reserve_run()');
  end if;
exception when others then null; end $$;
select 'v10 설치 완료' as result;
