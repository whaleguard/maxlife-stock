-- MAX라이프 주식 v4 — 장 운영 세션(장전·정규장·동시호가·장후 시간외·시간외 단일가·미국 프리/애프터마켓), 시간외 주문
-- v3.sql 다음에 실행 (여러 번 실행해도 안전)

alter table mls_orders drop constraint if exists mls_orders_type_check;
alter table mls_orders add constraint mls_orders_type_check check (type in ('limit', 'market', 'stop', 'ext'));

-- 휴장일 (관리자 설정 krHolidays: ["2026-12-25", ...])
-- 세션 코드
--   국내: pre_close(08:30~08:40 장전 시간외 종가) · pre_auction(08:40~09:00 장 시작 동시호가) · regular(09:00~15:20)
--         close_auction(15:20~15:30 장 마감 동시호가) · post_wait(15:30~15:40) · post_close(15:40~16:00 장후 시간외 종가)
--         single(16:00~18:00 시간외 단일가) · closed
--   미국(뉴욕 시간): pre(04:00~09:30 프리마켓) · regular(09:30~16:00) · after(16:00~20:00 애프터마켓) · closed
create or replace function mls_session2(p_market text) returns text language plpgsql stable as $$
declare k timestamp := now() at time zone 'Asia/Seoul'; n timestamp := now() at time zone 'America/New_York'; hm int; hol jsonb := coalesce(mls_settings()->'krHolidays', '[]'::jsonb);
begin
  if p_market in ('KOSPI', 'KOSDAQ', 'KONEX', 'KR') then
    if extract(isodow from k) > 5 or hol ? to_char(k, 'YYYY-MM-DD') then return 'closed'; end if;
    hm := extract(hour from k) * 60 + extract(minute from k);
    return case when hm >= 510 and hm < 520 then 'pre_close' when hm >= 520 and hm < 540 then 'pre_auction' when hm >= 540 and hm < 920 then 'regular'
      when hm >= 920 and hm < 930 then 'close_auction' when hm >= 930 and hm < 940 then 'post_wait' when hm >= 940 and hm < 960 then 'post_close'
      when hm >= 960 and hm < 1080 then 'single' else 'closed' end;
  end if;
  if extract(isodow from n) > 5 then return 'closed'; end if;
  hm := extract(hour from n) * 60 + extract(minute from n);
  return case when hm >= 240 and hm < 570 then 'pre' when hm >= 570 and hm < 960 then 'regular' when hm >= 960 and hm < 1200 then 'after' else 'closed' end;
end $$;

create or replace function mls_session_label(s text) returns text language sql immutable as $$
  select case s when 'pre_close' then '장전 시간외 종가' when 'pre_auction' then '장 시작 동시호가' when 'regular' then '정규장' when 'close_auction' then '장 마감 동시호가'
    when 'post_wait' then '장 마감' when 'post_close' then '장후 시간외 종가' when 'single' then '시간외 단일가' when 'pre' then '프리마켓' when 'after' then '애프터마켓' else '장 마감' end
$$;

-- 정규장(체결 가능) 여부: 기존 함수 교체 → 지정가·시장가·감시주문은 정규장에서만 체결
create or replace function mls_session_open(market text) returns boolean language sql stable as $$ select mls_session2(market) = 'regular' $$;
-- 시간외 주문 가능 세션
create or replace function mls_session_ext(market text) returns boolean language sql stable as $$ select mls_session2(market) in ('pre_close', 'post_close', 'single', 'pre', 'after') $$;

-- 실제 장 시간 적용을 기본값으로 (관리자 설정에서 끌 수 있음)
do $$ begin
  if not exists (select 1 from mls_kv where k = 'v4_hours_applied') then
    insert into mls_kv (k, v) values ('settings', '{"enforceHours":true}'::jsonb) on conflict (k) do update set v = mls_kv.v || '{"enforceHours":true}'::jsonb;
    insert into mls_kv (k, v) values ('v4_hours_applied', '{"t":1}'::jsonb);
  end if;
end $$;

create or replace function mls_order_j(o mls_orders) returns jsonb language sql stable as $$
  select jsonb_build_object('id', o.id, 'userId', o.user_id, 'code', o.code, 'name', o.name, 'side', o.side, 'type', o.type, 'price', o.price::float8, 'qty', o.qty, 'filled', o.filled,
    'avgFill', o.avg_fill::float8, 'status', o.status, 'currency', o.currency, 'amended', o.amended, 'reason', o.reason, 'triggerPrice', o.trigger_price::float8, 'triggerCond', o.trigger_cond,
    'createdAt', mls_iso(o.created_at), 'updatedAt', mls_iso(o.updated_at))
$$;

-- 체결 시도 (세션 반영)
create or replace function mls_try_fill(p_oid text) returns jsonb language plpgsql as $$
declare o mls_orders; q mls_quotes; ask numeric; bid numeric; px numeric; ses text; enf boolean := coalesce((mls_settings()->>'enforceHours')::boolean, false);
begin
  select * into o from mls_orders where id = p_oid; if not found or o.status <> 'pending' or not mls_is_live() then return null; end if;
  select * into q from mls_quotes where code = o.code; if not found then return null; end if;
  ses := mls_session2(q.market);
  if o.type = 'ext' then
    -- 시간외: 세션이 끝나면 미체결분 자동 취소, 세션 중에는 현재가(종가·단일가) 기준 체결
    if ses not in ('pre_close', 'post_close', 'single', 'pre', 'after') then
      update mls_orders set status = 'cancelled', reason = '시간외 거래 시간 종료로 자동 취소', updated_at = now() where id = o.id; return null;
    end if;
    if (o.side = 'buy' and o.price >= q.price) or (o.side = 'sell' and o.price <= q.price) then return mls_execute(o.id, q.price); end if;
    return null;
  end if;
  if enf and ses <> 'regular' then return null; end if;
  ask := mls_best_ask(q); bid := mls_best_bid(q);
  if o.type = 'stop' then
    if not ((o.trigger_cond = 'ge' and q.price >= o.trigger_price) or (o.trigger_cond = 'le' and q.price <= o.trigger_price)) then return null; end if;
    px := case when o.side = 'buy' then ask else bid end;
  elsif o.type = 'market' then px := case when o.side = 'buy' then ask else bid end;
  elsif o.side = 'buy' and ask <= o.price then px := least(ask, o.price);
  elsif o.side = 'sell' and bid >= o.price then px := greatest(bid, o.price);
  end if;
  if px is null then return null; end if;
  return mls_execute(o.id, px);
end $$;

-- 시간외 주문 검증
create or replace function mls_validate_ext(u mls_users, p_code text, p_side text, p_price numeric, p_qty bigint) returns text language plpgsql stable as $$
declare q mls_quotes; st jsonb := mls_settings(); ses text; need numeric;
begin
  if not mls_is_live() then return '시세를 불러오는 중입니다.'; end if;
  select * into q from mls_quotes where code = p_code; if not found then return '종목을 찾을 수 없습니다.'; end if;
  if u.status = 'suspended' then return '정지된 계정은 주문할 수 없습니다.'; end if;
  if p_qty is null or p_qty <= 0 or p_qty > 1000000 then return '주문 수량을 확인해 주세요.'; end if;
  if p_side not in ('buy', 'sell') then return '잘못된 주문입니다.'; end if;
  ses := mls_session2(q.market);
  if ses not in ('pre_close', 'post_close', 'single', 'pre', 'after') then
    return case when q.currency = 'KRW' then '지금은 시간외 거래 시간이 아닙니다. (장전 08:30~08:40 · 장후 15:40~16:00 · 단일가 16:00~18:00)' else '지금은 프리마켓·애프터마켓 시간이 아닙니다.' end;
  end if;
  if not (p_price > 0) then return '주문 가격을 입력해 주세요.'; end if;
  if ses in ('pre_close', 'post_close') and p_price <> q.price then return '시간외 종가 주문은 종가(' || to_char(q.price, 'FM999,999,999') || '원)로만 가능합니다.'; end if;
  if ses = 'single' then
    if p_price > q.price * 1.1 or p_price < q.price * 0.9 then return '시간외 단일가는 종가 대비 ±10% 이내에서만 주문할 수 있습니다.'; end if;
    if mod(p_price, mls_tick(p_price)) <> 0 then return '호가단위(' || mls_tick(p_price)::bigint || '원)에 맞지 않는 가격입니다.'; end if;
  end if;
  if p_side = 'buy' then
    need := mls_tokrw(p_price * p_qty, q.currency) * (1 + mls_fee(st, q.currency));
    if need > mls_orderable(u.id) + 0.5 then return '주문가능금액이 부족합니다.'; end if;
  elsif mls_sellable(u.id, p_code) < p_qty then return '매도가능수량이 부족합니다.'; end if;
  return null;
end $$;

create or replace function mls_save_settings_v2(p jsonb) returns jsonb language plpgsql as $$
declare vv jsonb := '{}'::jsonb; kk text;
begin
  foreach kk in array array['buffMaxMult', 'buffRate', 'buffMaintain', 'buffWarn', 'buffMinNet', 'moaKrw', 'maxpKrw'] loop
    if p ? kk then if (p->>kk)::numeric < 0 then perform mls_fail('값을 확인하세요.'); end if; vv := vv || jsonb_build_object(kk, (p->>kk)::numeric); end if;
  end loop;
  foreach kk in array array['buffEnabled', 'buffAuto'] loop if p ? kk then vv := vv || jsonb_build_object(kk, coalesce((p->>kk)::boolean, false)); end if; end loop;
  if p ? 'payMethods' and jsonb_typeof(p->'payMethods') = 'object' then vv := vv || jsonb_build_object('payMethods', p->'payMethods'); end if;
  if p ? 'grades' and jsonb_typeof(p->'grades') = 'array' and jsonb_array_length(p->'grades') between 1 and 10 then
    vv := vv || jsonb_build_object('grades', (select jsonb_agg(jsonb_build_object('id', left(coalesce(g->>'id', 'g' || ord), 20), 'name', left(coalesce(g->>'name', '등급'), 20),
      'maxMult', least(5, greatest(0, coalesce((g->>'maxMult')::numeric, 1))), 'rate', greatest(0, coalesce((g->>'rate')::numeric, 8)), 'maintain', greatest(100, coalesce((g->>'maintain')::numeric, 120)))) from jsonb_array_elements(p->'grades') with ordinality t(g, ord)));
  end if;
  if p ? 'krHolidays' and jsonb_typeof(p->'krHolidays') = 'array' then
    vv := vv || jsonb_build_object('krHolidays', coalesce((select jsonb_agg(distinct x) from jsonb_array_elements_text(p->'krHolidays') x where x ~ '^\d{4}-\d{2}-\d{2}$'), '[]'::jsonb));
  end if;
  if vv <> '{}'::jsonb then insert into mls_kv (k, v) values ('settings', mls_settings() || vv) on conflict (k) do update set v = excluded.v; end if;
  return vv;
end $$;

-- 휴장일 기본값 (관리자 설정에서 수정)
do $$ begin
  if not exists (select 1 from mls_kv where k = 'v4_hol_applied') then
    insert into mls_kv (k, v) values ('settings', '{"krHolidays":["2026-12-25","2026-12-31","2027-01-01"]}'::jsonb) on conflict (k) do update set v = mls_kv.v || '{"krHolidays":["2026-12-25","2026-12-31","2027-01-01"]}'::jsonb;
    insert into mls_kv (k, v) values ('v4_hol_applied', '{"t":1}'::jsonb);
  end if;
end $$;

-- v4 요청 처리 후 기존(v3) 로 넘김
do $$ begin
  if (select prosrc from pg_proc where proname = 'mls_api' and pronamespace = 'public'::regnamespace) not like '%mls_api_v3(%' then
    drop function if exists mls_api_v3(text, jsonb, text);
    alter function mls_api(text, jsonb, text) rename to mls_api_v3;
  end if;
end $$;

create or replace function mls_api(p_action text, p_body jsonb default '{}'::jsonb, p_token text default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare b jsonb := coalesce(p_body, '{}'::jsonb); me mls_users; q mls_quotes; o mls_orders; v_id text; v_err text; v_fill jsonb; ses text;
begin
  if p_action = 'session' then
    return jsonb_build_object('ok', true, 'data', jsonb_build_object('kr', mls_session2('KR'), 'us', mls_session2('NASDAQ'), 'krLabel', mls_session_label(mls_session2('KR')), 'usLabel', mls_session_label(mls_session2('NASDAQ')),
      'enforceHours', coalesce((mls_settings()->>'enforceHours')::boolean, false)));
  end if;
  if p_action not in ('placeOrder', 'amendOrder') then return mls_api_v3(p_action, p_body, p_token); end if;
  if p_token ~ '^[a-f0-9]{64}$' then
    select u2.* into me from mls_sessions s join mls_users u2 on u2.id = s.user_id where s.token = p_token and s.expires_at > now() and u2.status = 'active';
  end if;
  if me.id is null then return jsonb_build_object('ok', false, 'error', '로그인이 필요합니다.'); end if;
  if p_action = 'amendOrder' then
    select * into o from mls_orders where id = b->>'id' and user_id = me.id;
    if found and o.type = 'ext' then return jsonb_build_object('ok', false, 'error', '시간외 주문은 정정할 수 없습니다. 취소 후 다시 주문해 주세요.'); end if;
    return mls_api_v3(p_action, p_body, p_token);
  end if;
  select * into q from mls_quotes where code = b->>'code';
  if b->>'type' = 'market' and found and coalesce((mls_settings()->>'enforceHours')::boolean, false) then
    ses := mls_session2(q.market);
    if ses <> 'regular' then
      return jsonb_build_object('ok', false, 'error', '지금은 ' || mls_session_label(ses) || ' 시간이라 시장가 주문을 할 수 없습니다. ' ||
        case when ses in ('pre_close', 'post_close', 'single', 'pre', 'after') then '시간외 주문을 이용하거나 ' else '' end || '지정가 예약주문을 이용하세요.');
    end if;
  end if;
  if b->>'type' <> 'ext' then return mls_api_v3(p_action, p_body, p_token); end if;
  v_err := mls_validate_ext(me, left(coalesce(b->>'code', ''), 16), b->>'side', (b->>'price')::numeric, (b->>'qty')::bigint);
  if v_err is not null then return jsonb_build_object('ok', false, 'error', v_err); end if;
  v_id := mls_uid('o');
  insert into mls_orders (id, user_id, code, name, side, type, price, qty, filled, status, currency, created_at)
    values (v_id, me.id, q.code, q.name, b->>'side', 'ext', (b->>'price')::numeric, (b->>'qty')::bigint, 0, 'pending', q.currency, now());
  v_fill := mls_try_fill(v_id); select * into o from mls_orders where id = v_id;
  return jsonb_build_object('ok', true, 'data', jsonb_build_object('order', mls_order_j(o), 'fill', v_fill));
exception
  when sqlstate 'P0001' then return jsonb_build_object('ok', false, 'error', sqlerrm);
  when others then raise warning '[mls4] % %', sqlstate, sqlerrm; return jsonb_build_object('ok', false, 'error', '서버 오류가 발생했습니다.');
end $$;
revoke all on function mls_api_v3(text, jsonb, text) from public;
revoke all on function mls_api(text, jsonb, text) from public;
do $$ begin if exists (select 1 from pg_roles where rolname = 'anon') then
  revoke all on function mls_api_v3(text, jsonb, text) from anon, authenticated;
  grant execute on function mls_api(text, jsonb, text) to anon, authenticated;
end if; end $$;
select 'v4 설치 완료' as result;
