-- MAX라이프 주식 v5 — 접속 IP·지역 기록, 회원 요약, MAX AI 분석 월정액 구독
-- v4.sql 다음에 실행 (여러 번 실행해도 안전)

-- ───────── 접속 기록: IP · 기기 · 지역 ─────────
alter table mls_logins add column if not exists ip text;
alter table mls_logins add column if not exists ua text;
alter table mls_logins add column if not exists country text;
alter table mls_logins add column if not exists region text;
alter table mls_logins add column if not exists city text;
alter table mls_logins add column if not exists isp text;
alter table mls_logins add column if not exists geo_done boolean not null default false;
create index if not exists mls_logins_user on mls_logins(user_id, at desc);

create or replace function mls_req_ip() returns text language plpgsql stable as $$
declare h json; v text;
begin
  begin h := current_setting('request.headers', true)::json; exception when others then return null; end;
  if h is null then return null; end if;
  v := coalesce(h->>'cf-connecting-ip', split_part(coalesce(h->>'x-forwarded-for', ''), ',', 1), h->>'x-real-ip');
  return nullif(trim(v), '');
end $$;
create or replace function mls_req_header(k text) returns text language plpgsql stable as $$
declare h json; begin begin h := current_setting('request.headers', true)::json; exception when others then return null; end; return h->>k; end $$;

create or replace function mls_new_session(p_uid text) returns text language plpgsql as $$
declare t text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  insert into mls_sessions (token, user_id, expires_at) values (t, p_uid, now() + interval '30 days');
  update mls_users set last_login = now() where id = p_uid;
  insert into mls_logins (user_id, at, ip, ua, country) values (p_uid, now(), mls_req_ip(), left(mls_req_header('user-agent'), 300), mls_req_header('cf-ipcountry'));
  if random() < 0.02 then delete from mls_sessions where expires_at < now(); end if;
  return t;
end $$;

-- IP → 지역 (5분마다 최대 20건, ipwho.is)
create or replace function mls_resolve_ips() returns int language plpgsql security definer set search_path = public, extensions as $$
declare r record; resp extensions.http_response; j jsonb; n int := 0;
begin
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT', '5');
  for r in select distinct on (ip) id, ip from mls_logins where ip is not null and not geo_done and at > now() - interval '7 days' order by ip, at desc limit 20 loop
    begin
      if r.ip ~ '^(10\.|127\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)' then
        update mls_logins set geo_done = true, region = '내부망' where ip = r.ip and not geo_done; continue;
      end if;
      select * into resp from extensions.http_get('https://ipwho.is/' || r.ip || '?lang=ko&fields=success,country,country_code,region,city,connection');
      j := resp.content::jsonb;
      if coalesce((j->>'success')::boolean, false) then
        update mls_logins set geo_done = true, country = coalesce(j->>'country', country), region = j->>'region', city = j->>'city', isp = j->'connection'->>'isp' where ip = r.ip and not geo_done;
      else update mls_logins set geo_done = true where ip = r.ip and not geo_done; end if;
      n := n + 1;
    exception when others then update mls_logins set geo_done = true where ip = r.ip and not geo_done; end;
  end loop;
  return n;
end $$;
revoke all on function mls_resolve_ips() from public;
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'mls-geo';
    perform cron.schedule('mls-geo', '*/5 * * * *', 'select public.mls_resolve_ips()');
  end if;
exception when others then null; end $$;

create or replace function mls_login_j(l mls_logins) returns jsonb language sql stable as $$
  select jsonb_build_object('at', mls_iso(l.at), 'ip', l.ip, 'ua', l.ua, 'country', l.country, 'region', l.region, 'city', l.city, 'isp', l.isp)
$$;

-- ───────── MAX AI 분석 월정액 ─────────
create table if not exists mls_subs (
  id text primary key, user_id text not null, plan text not null, plan_name text not null default '', price numeric(20,2) not null default 0, days int not null default 30,
  method text not null default 'card', memo text default '', status text not null default 'pending' check (status in ('pending', 'active', 'rejected', 'cancelled', 'expired')),
  starts_at timestamptz, ends_at timestamptz, created_at timestamptz not null default now(), processed_at timestamptz, processed_by text default '', admin_memo text default ''
);
create index if not exists mls_subs_user on mls_subs(user_id);
create table if not exists mls_ai_usage (user_id text not null, d date not null, n int not null default 0, codes jsonb not null default '[]'::jsonb, primary key (user_id, d));
alter table mls_subs enable row level security; alter table mls_ai_usage enable row level security;
revoke all on mls_subs from public; revoke all on mls_ai_usage from public;
do $$ begin if exists (select 1 from pg_roles where rolname = 'anon') then revoke all on mls_subs, mls_ai_usage from anon, authenticated; end if; end $$;

do $$ begin
  if not exists (select 1 from mls_kv where k = 'v5_ai_applied') then
    insert into mls_kv (k, v) values ('settings', '{"aiEnabled":true,"aiFreeDaily":3,"aiCardFree":true,"aiPlans":[{"id":"basic","name":"AI 베이직","price":9900,"days":30,"daily":30,"picks":true},{"id":"pro","name":"AI 프로","price":29900,"days":30,"daily":0,"picks":true}]}'::jsonb)
      on conflict (k) do update set v = '{"aiEnabled":true,"aiFreeDaily":3,"aiCardFree":true,"aiPlans":[{"id":"basic","name":"AI 베이직","price":9900,"days":30,"daily":30,"picks":true},{"id":"pro","name":"AI 프로","price":29900,"days":30,"daily":0,"picks":true}]}'::jsonb || mls_kv.v;
    insert into mls_kv (k, v) values ('v5_ai_applied', '{"t":1}'::jsonb);
  end if;
end $$;

create or replace function mls_sub_j(s mls_subs) returns jsonb language sql stable as $$
  select jsonb_build_object('id', s.id, 'userId', s.user_id, 'plan', s.plan, 'planName', s.plan_name, 'price', s.price::float8, 'days', s.days, 'method', s.method, 'memo', s.memo, 'status', s.status,
    'startsAt', mls_iso(s.starts_at), 'endsAt', mls_iso(s.ends_at), 'createdAt', mls_iso(s.created_at), 'processedAt', mls_iso(s.processed_at), 'processedBy', s.processed_by, 'adminMemo', s.admin_memo)
$$;

-- 현재 AI 이용 상태
create or replace function mls_ai_status(u mls_users) returns jsonb language plpgsql as $$
declare st jsonb := mls_settings(); s mls_subs; pl jsonb; used int; lim int; src text;
begin
  update mls_subs set status = 'expired' where user_id = u.id and status = 'active' and ends_at < now();
  select * into s from mls_subs where user_id = u.id and status = 'active' and ends_at >= now() and coalesce(starts_at, now()) <= now() order by ends_at asc limit 1;
  if s.id is not null then
    select g into pl from jsonb_array_elements(st->'aiPlans') g where g->>'id' = s.plan; src := 'sub';
    lim := coalesce((pl->>'daily')::int, 0);
  elsif u.role in ('admin', 'instructor') then src := 'staff'; lim := 0;
  elsif coalesce((st->>'aiCardFree')::boolean, false) and coalesce(u.card_tier, '') <> '' then src := 'card'; select g into pl from jsonb_array_elements(st->'aiPlans') g limit 1; lim := coalesce((pl->>'daily')::int, 30);
  else src := 'free'; lim := coalesce((st->>'aiFreeDaily')::int, 3);
  end if;
  select coalesce(n, 0) into used from mls_ai_usage where user_id = u.id and d = (now() at time zone 'Asia/Seoul')::date; used := coalesce(used, 0);
  return jsonb_build_object('source', src, 'plan', coalesce(s.plan, case when src = 'card' then pl->>'id' end), 'planName', coalesce(s.plan_name, case src when 'card' then 'MAX DAY LIFE 카드 혜택' when 'staff' then '운영 계정' else '무료' end),
    'endsAt', mls_iso(s.ends_at), 'used', used, 'limit', lim, 'unlimited', lim = 0, 'picks', src <> 'free', 'enabled', coalesce((st->>'aiEnabled')::boolean, true),
    'pending', (select count(*) from mls_subs where user_id = u.id and status = 'pending'));
end $$;

-- 관리자 수신함/통계용 래퍼
do $$ begin
  if (select prosrc from pg_proc where proname = 'mls_api' and pronamespace = 'public'::regnamespace) not like '%mls_api_v4(%' then
    drop function if exists mls_api_v4(text, jsonb, text);
    alter function mls_api(text, jsonb, text) rename to mls_api_v4;
  end if;
end $$;

create or replace function mls_api(p_action text, p_body jsonb default '{}'::jsonb, p_token text default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare b jsonb := coalesce(p_body, '{}'::jsonb); me mls_users; u2 mls_users; s mls_subs; st jsonb; pl jsonb; v_id text; e jsonb; stt jsonb; v_code text; v_days int;
begin
  if p_action not in ('aiStatus', 'aiUse', 'requestSub', 'cancelSub', 'mySubs', 'adminSubs', 'processSub', 'grantSub', 'revokeSub', 'userLogins', 'memberSummary', 'adminPoll', 'revenue', 'saveSettings') then
    return mls_api_v4(p_action, p_body, p_token);
  end if;
  if p_token ~ '^[a-f0-9]{64}$' then
    select x.* into me from mls_sessions ss join mls_users x on x.id = ss.user_id where ss.token = p_token and ss.expires_at > now() and x.status = 'active';
  end if;
  if me.id is null then return jsonb_build_object('ok', false, 'error', '로그인이 필요합니다.'); end if;
  st := mls_settings();
  -- 관리자 전용
  if p_action in ('adminSubs', 'processSub', 'grantSub', 'revokeSub', 'userLogins', 'memberSummary') and me.role <> 'admin' then return jsonb_build_object('ok', false, 'error', '관리자 권한이 필요합니다.'); end if;
  case p_action
  when 'aiStatus' then return jsonb_build_object('ok', true, 'data', mls_ai_status(me));
  when 'aiUse' then
    stt := mls_ai_status(me); v_code := left(coalesce(b->>'code', ''), 16);
    if not (stt->>'enabled')::boolean then return jsonb_build_object('ok', false, 'error', 'AI 분석이 일시 중지되었습니다.'); end if;
    -- 오늘 이미 분석한 종목은 다시 봐도 차감하지 않음
    if exists (select 1 from mls_ai_usage where user_id = me.id and d = (now() at time zone 'Asia/Seoul')::date and codes ? v_code) then return jsonb_build_object('ok', true, 'data', stt); end if;
    if not (stt->>'unlimited')::boolean and (stt->>'used')::int >= (stt->>'limit')::int then
      return jsonb_build_object('ok', false, 'error', case when stt->>'source' = 'free' then '오늘 무료 분석 ' || (stt->>'limit') || '회를 모두 사용했습니다. AI 월정액을 구독하면 더 많이 분석할 수 있습니다.' else '오늘 분석 한도(' || (stt->>'limit') || '회)를 모두 사용했습니다.' end, 'code', 'LIMIT');
    end if;
    insert into mls_ai_usage (user_id, d, n, codes) values (me.id, (now() at time zone 'Asia/Seoul')::date, 1, jsonb_build_array(v_code))
      on conflict (user_id, d) do update set n = mls_ai_usage.n + 1, codes = mls_ai_usage.codes || jsonb_build_array(v_code);
    return jsonb_build_object('ok', true, 'data', mls_ai_status(me));
  when 'requestSub' then
    select g into pl from jsonb_array_elements(st->'aiPlans') g where g->>'id' = b->>'plan';
    if pl is null then return jsonb_build_object('ok', false, 'error', '요금제를 선택해 주세요.'); end if;
    if coalesce(b->>'method', '') not in ('cash', 'card', 'moa', 'usdt', 'usdc', 'usd1', 'maxp') then return jsonb_build_object('ok', false, 'error', '결제 수단을 선택해 주세요.'); end if;
    if exists (select 1 from mls_subs where user_id = me.id and status = 'pending') then return jsonb_build_object('ok', false, 'error', '처리 대기 중인 구독 신청이 있습니다.'); end if;
    v_id := mls_uid('s');
    insert into mls_subs (id, user_id, plan, plan_name, price, days, method, memo) values (v_id, me.id, pl->>'id', pl->>'name', (pl->>'price')::numeric, coalesce((pl->>'days')::int, 30), b->>'method', left(coalesce(b->>'memo', ''), 200)) returning * into s;
    return jsonb_build_object('ok', true, 'data', mls_sub_j(s));
  when 'cancelSub' then
    update mls_subs set status = 'cancelled', processed_at = now() where id = b->>'id' and user_id = me.id and status = 'pending';
    if not found then return jsonb_build_object('ok', false, 'error', '취소할 수 없는 신청입니다.'); end if;
    return jsonb_build_object('ok', true, 'data', true);
  when 'mySubs' then return jsonb_build_object('ok', true, 'data', coalesce((select jsonb_agg(mls_sub_j(x) order by x.created_at desc) from mls_subs x where x.user_id = me.id), '[]'::jsonb));
  when 'adminSubs' then
    update mls_subs set status = 'expired' where status = 'active' and ends_at < now();
    return jsonb_build_object('ok', true, 'data', coalesce((select jsonb_agg(mls_sub_j(x) || jsonb_build_object('username', y.username, 'name', y.name, 'cardTier', y.card_tier) order by x.created_at desc) from mls_subs x join mls_users y on y.id = x.user_id), '[]'::jsonb));
  when 'processSub' then
    select * into s from mls_subs where id = b->>'id' for update;
    if s.id is null or s.status <> 'pending' then return jsonb_build_object('ok', false, 'error', '처리할 수 없는 신청입니다.'); end if;
    if coalesce((b->>'approve')::boolean, false) then
      -- 사용 중인 구독이 있으면 그 종료일 뒤로 연장
      update mls_subs set status = 'active', starts_at = greatest(now(), coalesce((select max(ends_at) from mls_subs where user_id = s.user_id and status = 'active'), now())),
        processed_at = now(), processed_by = me.username, admin_memo = left(coalesce(b->>'memo', ''), 200) where id = s.id;
      update mls_subs set ends_at = starts_at + make_interval(days => days) where id = s.id;
    else update mls_subs set status = 'rejected', processed_at = now(), processed_by = me.username, admin_memo = left(coalesce(b->>'memo', ''), 200) where id = s.id; end if;
    insert into mls_audit (at, by_user, action, detail) values (now(), me.username, 'processSub', s.id || ' ' || coalesce(b->>'approve', ''));
    select * into s from mls_subs where id = s.id;
    return jsonb_build_object('ok', true, 'data', mls_sub_j(s));
  when 'grantSub' then
    select g into pl from jsonb_array_elements(st->'aiPlans') g where g->>'id' = b->>'plan';
    if pl is null then return jsonb_build_object('ok', false, 'error', '요금제를 확인하세요.'); end if;
    v_days := greatest(1, least(3650, coalesce((b->>'days')::int, 30)));
    v_id := mls_uid('s');
    insert into mls_subs (id, user_id, plan, plan_name, price, days, method, memo, status, starts_at, ends_at, processed_at, processed_by)
      values (v_id, b->>'userId', pl->>'id', pl->>'name', 0, v_days, 'grant', left(coalesce(b->>'memo', '관리자 지급'), 200), 'active',
        greatest(now(), coalesce((select max(ends_at) from mls_subs where user_id = b->>'userId' and status = 'active'), now())), null, now(), me.username) returning * into s;
    update mls_subs set ends_at = starts_at + make_interval(days => v_days) where id = s.id;
    insert into mls_audit (at, by_user, action, detail) values (now(), me.username, 'grantSub', (b->>'userId') || ' ' || (pl->>'id') || ' ' || v_days);
    return jsonb_build_object('ok', true, 'data', true);
  when 'revokeSub' then
    update mls_subs set status = 'cancelled', ends_at = now(), processed_at = now(), processed_by = me.username where id = b->>'id' and status = 'active';
    return jsonb_build_object('ok', true, 'data', true);
  when 'userLogins' then
    return jsonb_build_object('ok', true, 'data', coalesce((select jsonb_agg(mls_login_j(l) order by l.at desc) from (select * from mls_logins where user_id = b->>'userId' order by at desc limit 100) l), '[]'::jsonb));
  when 'memberSummary' then
    -- 회원 목록용: 최근 접속 IP·지역, 충전·출금 합계, AI 구독
    return jsonb_build_object('ok', true, 'data', coalesce((select jsonb_object_agg(x.id, jsonb_build_object(
      'last', (select mls_login_j(l) from mls_logins l where l.user_id = x.id order by at desc limit 1),
      'logins30', (select count(*) from mls_logins l where l.user_id = x.id and l.at > now() - interval '30 days'),
      'ips', (select count(distinct ip) from mls_logins l where l.user_id = x.id and l.at > now() - interval '30 days'),
      'dep', coalesce((select sum(amount) from mls_cashflows c where c.user_id = x.id and c.type = 'deposit' and c.status = 'approved'), 0)::float8,
      'wd', coalesce((select sum(amount) from mls_cashflows c where c.user_id = x.id and c.type = 'withdraw' and c.status = 'approved'), 0)::float8,
      'fee', coalesce((select sum(fee + tax) from mls_fills f where f.user_id = x.id), 0)::float8,
      'vol', coalesce((select sum(amount) from mls_fills f where f.user_id = x.id), 0)::float8,
      'ai', (select jsonb_build_object('plan', plan_name, 'endsAt', mls_iso(ends_at)) from mls_subs s2 where s2.user_id = x.id and s2.status = 'active' and s2.ends_at > now() and coalesce(s2.starts_at, now()) <= now() order by ends_at asc limit 1))) from mls_users x), '{}'::jsonb));
  when 'adminPoll' then
    e := mls_api_v4(p_action, p_body, p_token);
    if (e->>'ok')::boolean then
      e := jsonb_set(e, '{data,subs}', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'at', mls_iso(x.created_at), 'planName', x.plan_name, 'price', x.price::float8, 'method', x.method, 'name', y.name) order by x.created_at desc) from mls_subs x join mls_users y on y.id = x.user_id where x.status = 'pending'), '[]'::jsonb));
    end if;
    return e;
  when 'revenue' then
    e := mls_api_v4(p_action, p_body, p_token);
    if (e->>'ok')::boolean then
      e := jsonb_set(e, '{data,total,ai}', to_jsonb(coalesce((select sum(price) from mls_subs where status in ('active', 'expired')), 0)::float8));
      e := jsonb_set(e, '{data,total,aiActive}', to_jsonb((select count(distinct user_id) from mls_subs where status = 'active' and ends_at > now())));
    end if;
    return e;
  when 'saveSettings' then
    if me.role <> 'admin' then return jsonb_build_object('ok', false, 'error', '관리자 권한이 필요합니다.'); end if;
    e := '{}'::jsonb;
    if b ? 'aiEnabled' then e := e || jsonb_build_object('aiEnabled', coalesce((b->>'aiEnabled')::boolean, true)); end if;
    if b ? 'aiCardFree' then e := e || jsonb_build_object('aiCardFree', coalesce((b->>'aiCardFree')::boolean, false)); end if;
    if b ? 'aiFreeDaily' then e := e || jsonb_build_object('aiFreeDaily', greatest(0, least(100, coalesce((b->>'aiFreeDaily')::int, 3)))); end if;
    if b ? 'aiPlans' and jsonb_typeof(b->'aiPlans') = 'array' and jsonb_array_length(b->'aiPlans') between 1 and 6 then
      e := e || jsonb_build_object('aiPlans', (select jsonb_agg(jsonb_build_object('id', left(coalesce(g->>'id', 'p' || ord), 20), 'name', left(coalesce(g->>'name', '요금제'), 30),
        'price', greatest(0, coalesce((g->>'price')::numeric, 0)), 'days', greatest(1, least(3650, coalesce((g->>'days')::int, 30))), 'daily', greatest(0, coalesce((g->>'daily')::int, 0)), 'picks', true)) from jsonb_array_elements(b->'aiPlans') with ordinality t(g, ord)));
    end if;
    if e <> '{}'::jsonb then insert into mls_kv (k, v) values ('settings', mls_settings() || e) on conflict (k) do update set v = excluded.v; end if;
    b := b - 'aiEnabled' - 'aiCardFree' - 'aiFreeDaily' - 'aiPlans';
    if b = '{}'::jsonb then return jsonb_build_object('ok', true, 'data', mls_settings()); end if;
    return mls_api_v4(p_action, b, p_token);
  end case;
  return null;
exception
  when sqlstate 'P0001' then return jsonb_build_object('ok', false, 'error', sqlerrm);
  when others then raise warning '[mls5] % %', sqlstate, sqlerrm; return jsonb_build_object('ok', false, 'error', '서버 오류가 발생했습니다.');
end $$;
revoke all on function mls_api_v4(text, jsonb, text) from public;
revoke all on function mls_api(text, jsonb, text) from public;
do $$ begin if exists (select 1 from pg_roles where rolname = 'anon') then
  revoke all on function mls_api_v4(text, jsonb, text) from anon, authenticated;
  grant execute on function mls_api(text, jsonb, text) to anon, authenticated;
end if; end $$;
select 'v5 설치 완료' as result;
