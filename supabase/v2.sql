-- MAX라이프 주식 v2 — 감시주문(손절·익절), MAX 버프(담보 신용·자동 청산), 충전 수단(MOA·MAX 포인트), MAX DAY LIFE 카드 등급
-- schema.sql 다음에 실행 (여러 번 실행해도 안전)

alter table mls_cashflows add column if not exists method text default 'cash';
alter table mls_users add column if not exists card_tier text default '';
alter table mls_users add column if not exists grade text default 'basic';
alter table mls_orders add column if not exists trigger_price numeric(20,4);
alter table mls_orders add column if not exists trigger_cond text;
alter table mls_orders drop constraint if exists mls_orders_type_check;
alter table mls_orders add constraint mls_orders_type_check check (type in ('limit', 'market', 'stop'));

create table if not exists mls_buffs (
  id text primary key, user_id text not null, mult numeric(4,1) not null, amount numeric(20,2) not null,
  status text not null check (status in ('pending', 'active', 'rejected', 'cancelled', 'repaid', 'liquidated')),
  rate numeric(6,3) not null default 0, base_net numeric(20,2) not null default 0, memo text default '', admin_memo text default '',
  created_at timestamptz not null default now(), approved_at timestamptz, closed_at timestamptz, interest numeric(20,2) default 0, closed_by text default ''
);
create index if not exists mls_buffs_user on mls_buffs(user_id);
alter table mls_buffs add column if not exists maintain numeric(6,2) not null default 120;
alter table mls_buffs enable row level security;
revoke all on mls_buffs from public;
do $$ begin if exists (select 1 from pg_roles where rolname = 'anon') then revoke all on mls_buffs from anon, authenticated; end if; end $$;

-- 기본 설정에 버프·충전 항목 추가
create or replace function mls_settings() returns jsonb language sql stable as $$
  select '{"feeKr":0.015,"feeUs":0.25,"taxKr":0.20,"initialCash":10000000,"autoApprove":false,"enforceHours":false,"allowSignup":true,"maxDeposit":100000000,"minOrderKrw":0,"overrides":{"hidden":[],"base":{}},
    "buffEnabled":true,"buffMaxMult":3,"buffRate":8,"buffMaintain":120,"buffWarn":140,"buffAuto":false,"buffMinNet":1000000,
    "payMethods":{"cash":true,"card":true,"moa":true,"usdt":true,"usdc":true,"usd1":true,"maxp":true},"moaKrw":0,"maxpKrw":1,
    "grades":[{"id":"basic","name":"일반","maxMult":1,"rate":9,"maintain":130},{"id":"silver","name":"실버","maxMult":2,"rate":8,"maintain":125},{"id":"gold","name":"골드","maxMult":3,"rate":7,"maintain":120},{"id":"vip","name":"VIP","maxMult":3,"rate":5,"maintain":115}]}'::jsonb
    || coalesce((select v from mls_kv where k = 'settings'), '{}'::jsonb)
$$;

-- ───────── 출력 형태 (v2 필드 포함) ─────────
create or replace function mls_user_pub(u mls_users) returns jsonb language sql stable as $$
  select jsonb_build_object('id', u.id, 'username', u.username, 'name', u.name, 'role', u.role, 'status', u.status, 'phone', u.phone, 'email', u.email,
    'cash', u.cash::float8, 'initial', u.initial::float8, 'watch', coalesce(u.watch, '[]'::jsonb), 'cardTier', coalesce(u.card_tier, ''), 'grade', coalesce(u.grade, 'basic'), 'createdAt', mls_iso(u.created_at), 'lastLogin', mls_iso(u.last_login))
$$;
create or replace function mls_order_j(o mls_orders) returns jsonb language sql stable as $$
  select jsonb_build_object('id', o.id, 'userId', o.user_id, 'code', o.code, 'name', o.name, 'side', o.side, 'type', o.type, 'price', o.price::float8, 'qty', o.qty, 'filled', o.filled,
    'avgFill', o.avg_fill::float8, 'status', o.status, 'currency', o.currency, 'amended', o.amended, 'reason', o.reason, 'triggerPrice', o.trigger_price::float8, 'triggerCond', o.trigger_cond,
    'createdAt', mls_iso(o.created_at), 'updatedAt', mls_iso(o.updated_at))
$$;
create or replace function mls_cash_j(c mls_cashflows) returns jsonb language sql stable as $$
  select jsonb_build_object('id', c.id, 'userId', c.user_id, 'type', c.type, 'amount', c.amount::float8, 'memo', c.memo, 'adminMemo', c.admin_memo, 'status', c.status, 'method', coalesce(c.method, 'cash'),
    'at', mls_iso(c.at), 'processedAt', mls_iso(c.processed_at), 'processedBy', c.processed_by)
$$;
create or replace function mls_buff_j(b mls_buffs) returns jsonb language sql stable as $$
  select jsonb_build_object('id', b.id, 'userId', b.user_id, 'mult', b.mult::float8, 'amount', b.amount::float8, 'status', b.status, 'rate', b.rate::float8, 'baseNet', b.base_net::float8,
    'memo', b.memo, 'adminMemo', b.admin_memo, 'interest', b.interest::float8, 'closedBy', b.closed_by, 'maintain', b.maintain::float8,
    'createdAt', mls_iso(b.created_at), 'approvedAt', mls_iso(b.approved_at), 'closedAt', mls_iso(b.closed_at))
$$;

-- ───────── 평가 · 담보비율 ─────────
-- 버프 이자 (연이율, 일할)
create or replace function mls_buff_interest(b mls_buffs) returns numeric language sql stable as $$
  select case when b.status = 'active' then round(b.amount * b.rate / 100 * greatest(0, extract(epoch from now() - b.approved_at) / 86400) / 365) else coalesce(b.interest, 0) end
$$;
create or replace function mls_eval(p_uid text) returns jsonb language plpgsql stable as $$
declare v_cash numeric; v_stock numeric; b mls_buffs; v_loan numeric := 0; v_int numeric := 0; v_total numeric;
begin
  select cash into v_cash from mls_users where id = p_uid;
  select coalesce(sum(mls_tokrw(q.price * p.qty, q.currency)), 0) into v_stock from mls_positions p join mls_quotes q on q.code = p.code where p.user_id = p_uid and p.qty > 0;
  select * into b from mls_buffs where user_id = p_uid and status = 'active' order by approved_at desc limit 1;
  if found then v_loan := b.amount; v_int := mls_buff_interest(b); end if;
  v_total := coalesce(v_cash, 0) + v_stock;
  return jsonb_build_object('cash', v_cash, 'stock', v_stock, 'total', v_total, 'loan', v_loan, 'interest', v_int, 'net', v_total - v_loan - v_int, 'maintain', case when v_loan > 0 then b.maintain else null end,
    'ratio', case when v_loan > 0 then round(v_total / (v_loan + v_int) * 100, 2) else null end);
end $$;

-- 반대매매(자동 청산): 담보비율이 유지비율 미만이면 보유 전량 시장가 매도 후 상환
create or replace function mls_liquidate(p_uid text, p_by text) returns boolean language plpgsql as $$
declare b mls_buffs; r record; v_oid text; e jsonb; v_owed numeric;
begin
  select * into b from mls_buffs where user_id = p_uid and status = 'active' order by approved_at desc limit 1 for update;
  if not found then return false; end if;
  update mls_orders set status = 'cancelled', reason = '반대매매로 취소', updated_at = now() where user_id = p_uid and status = 'pending';
  for r in select p.code, p.qty, q.name, q.currency from mls_positions p join mls_quotes q on q.code = p.code where p.user_id = p_uid and p.qty > 0 loop
    v_oid := mls_uid('o');
    insert into mls_orders (id, user_id, code, name, side, type, price, qty, filled, status, currency, reason, created_at)
      values (v_oid, p_uid, r.code, r.name, 'sell', 'market', 0, r.qty, 0, 'pending', r.currency, '반대매매', now());
    perform mls_execute(v_oid, (select mls_best_bid(q) from mls_quotes q where q.code = r.code));
  end loop;
  v_owed := b.amount + mls_buff_interest(b);
  update mls_users set cash = cash - v_owed where id = p_uid;
  update mls_buffs set status = 'liquidated', interest = mls_buff_interest(b), closed_at = now(), closed_by = p_by where id = b.id;
  insert into mls_audit (by_user, action, detail) values (p_by, 'liquidate', p_uid || ' 상환 ' || round(v_owed));
  return true;
end $$;
create or replace function mls_check_margins() returns int language plpgsql as $$
declare r record; e jsonb; n int := 0; st jsonb := mls_settings();
begin
  for r in select distinct user_id from mls_buffs where status = 'active' loop
    e := mls_eval(r.user_id);
    if (e->>'ratio') is not null and (e->>'ratio')::numeric < coalesce((e->>'maintain')::numeric, (st->>'buffMaintain')::numeric) then
      if mls_liquidate(r.user_id, 'auto') then n := n + 1; end if;
    end if;
  end loop;
  return n;
end $$;

-- ───────── 주문 검증 (감시주문 포함) ─────────
create or replace function mls_validate2(u mls_users, p_code text, p_side text, p_type text, p_price numeric, p_qty bigint, p_trig numeric, p_cond text, p_excl text default null) returns text language plpgsql stable as $$
declare q mls_quotes; st jsonb := mls_settings(); need numeric;
begin
  if p_type <> 'stop' then return mls_validate(u, p_code, p_side, p_type, p_price, p_qty, p_excl); end if;
  if not mls_is_live() then return '시세를 불러오는 중입니다. 잠시 후 다시 주문해 주세요.'; end if;
  select * into q from mls_quotes where code = p_code; if not found then return '종목을 찾을 수 없습니다.'; end if;
  if u.status = 'suspended' then return '정지된 계정은 주문할 수 없습니다.'; end if;
  if p_qty is null or p_qty <= 0 or p_qty > 1000000 then return '주문 수량을 확인해 주세요.'; end if;
  if p_side not in ('buy', 'sell') then return '잘못된 주문입니다.'; end if;
  if not (p_trig > 0) then return '감시 가격을 입력해 주세요.'; end if;
  if p_cond not in ('ge', 'le') then return '감시 조건을 선택해 주세요.'; end if;
  if p_side = 'buy' then
    need := mls_tokrw(p_trig * p_qty, q.currency) * (1 + mls_fee(st, q.currency));
    if need > mls_orderable(u.id, p_excl) + 0.5 then return '주문가능금액이 부족합니다.'; end if;
  else
    if mls_sellable(u.id, p_code, p_excl) < p_qty then return '매도가능수량이 부족합니다.'; end if;
  end if;
  return null;
end $$;

-- 주문가능금액: 감시 매수주문은 감시가 기준으로 묶음
create or replace function mls_orderable(p_uid text, p_excl text default null) returns numeric language plpgsql stable as $$
declare st jsonb := mls_settings(); v_cash numeric; res numeric; wd numeric;
begin
  select u.cash into v_cash from mls_users u where u.id = p_uid;
  select coalesce(sum(mls_tokrw(case when type = 'stop' then trigger_price else price end * (qty - filled), currency) * (1 + mls_fee(st, currency))), 0) into res
    from mls_orders where user_id = p_uid and status = 'pending' and side = 'buy' and id is distinct from p_excl;
  select coalesce(sum(amount), 0) into wd from mls_cashflows where user_id = p_uid and status = 'pending' and type = 'withdraw';
  return greatest(0, v_cash - res - wd);
end $$;

-- 체결 시도: 감시주문은 조건 충족 시 시장가로 체결
create or replace function mls_try_fill(p_oid text) returns jsonb language plpgsql as $$
declare o mls_orders; q mls_quotes; ask numeric; bid numeric; px numeric;
begin
  select * into o from mls_orders where id = p_oid; if not found or o.status <> 'pending' or not mls_is_live() then return null; end if;
  select * into q from mls_quotes where code = o.code; if not found then return null; end if;
  if (mls_settings()->>'enforceHours')::boolean and not mls_session_open(q.market) then return null; end if;
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

-- 체결 검사 + 담보비율 검사
create or replace function mls_match_pending(p_force boolean default false) returns int language plpgsql as $$
declare last numeric; n int := 0; r record;
begin
  select (v->>'t')::numeric into last from mls_kv where k = 'last_match';
  if not p_force and last is not null and extract(epoch from now()) - last < 30 then return 0; end if;
  insert into mls_kv (k, v) values ('last_match', jsonb_build_object('t', extract(epoch from now()))) on conflict (k) do update set v = excluded.v;
  for r in select id from mls_orders where status = 'pending' order by created_at loop
    if mls_try_fill(r.id) is not null then n := n + 1; end if;
  end loop;
  perform mls_check_margins();
  return n;
end $$;

-- 번들에 버프 · 담보 평가 포함
create or replace function mls_bundle(p_uid text) returns jsonb language plpgsql stable as $$
declare u mls_users;
begin
  select * into u from mls_users where id = p_uid; if not found then perform mls_fail('회원을 찾을 수 없습니다.'); end if;
  return jsonb_build_object(
    'user', mls_user_pub(u),
    'positions', coalesce((select jsonb_object_agg(code, jsonb_build_object('qty', qty, 'avg', avg::float8, 'cost', cost::float8)) from mls_positions where user_id = p_uid and qty > 0), '{}'::jsonb),
    'orders', coalesce((select jsonb_agg(mls_order_j(o) order by o.created_at desc) from (select * from mls_orders where user_id = p_uid order by created_at desc limit 1000) o), '[]'::jsonb),
    'fills', coalesce((select jsonb_agg(mls_fill_j(f) order by f.at desc) from (select * from mls_fills where user_id = p_uid order by at desc limit 2000) f), '[]'::jsonb),
    'cashflows', coalesce((select jsonb_agg(mls_cash_j(c) order by c.at desc) from mls_cashflows c where c.user_id = p_uid), '[]'::jsonb),
    'buffs', coalesce((select jsonb_agg(mls_buff_j(b) || jsonb_build_object('interestNow', mls_buff_interest(b)::float8) order by b.created_at desc) from mls_buffs b where b.user_id = p_uid), '[]'::jsonb),
    'margin', mls_eval(p_uid),
    'snapshots', coalesce((select jsonb_agg(jsonb_build_array(to_char(d, 'YYYY-MM-DD'), total::float8) order by d desc) from (select * from mls_snapshots where user_id = p_uid order by d desc limit 400) s), '[]'::jsonb));
end $$;

create or replace function mls_grade(u mls_users) returns jsonb language sql stable as $$
  select coalesce((select g from jsonb_array_elements(mls_settings()->'grades') g where g->>'id' = coalesce(u.grade, 'basic') limit 1),
    (select g from jsonb_array_elements(mls_settings()->'grades') g limit 1), '{"id":"basic","name":"일반","maxMult":1,"rate":9,"maintain":130}'::jsonb)
$$;
-- 버프 승인 처리
create or replace function mls_activate_buff(p_bid text, p_by text, p_mult numeric default null) returns void language plpgsql as $$
declare b mls_buffs; st jsonb := mls_settings(); e jsonb; amt numeric; m numeric;
begin
  select * into b from mls_buffs where id = p_bid for update;
  if not found or b.status <> 'pending' then perform mls_fail('처리할 수 없는 신청입니다.'); end if;
  if exists (select 1 from mls_buffs where user_id = b.user_id and status = 'active') then perform mls_fail('이미 사용 중인 버프가 있습니다.'); end if;
  e := mls_eval(b.user_id);
  m := coalesce(p_mult, b.mult); if m <= 0 or m > 5 then perform mls_fail('배수를 확인해 주세요.'); end if;
  amt := round((e->>'net')::numeric * m);
  if amt <= 0 then perform mls_fail('순자산이 없어 버프를 지급할 수 없습니다.'); end if;
  update mls_buffs set status = 'active', mult = m, amount = amt, base_net = (e->>'net')::numeric, approved_at = now(), closed_by = p_by where id = b.id;
  update mls_users set cash = cash + amt where id = b.user_id;
end $$;

-- ───────── API v2 (새 요청 처리 후 기존 mls_api 로 넘김) ─────────
do $$ begin
  -- 현재 mls_api 가 기본(v1) 버전이면 v1 으로 이름을 바꿔 보존
  if (select prosrc from pg_proc where proname = 'mls_api' and pronamespace = 'public'::regnamespace) not like '%mls_api_v1(%' then
    drop function if exists mls_api_v1(text, jsonb, text);
    alter function mls_api(text, jsonb, text) rename to mls_api_v1;
  end if;
end $$;
create or replace function mls_api(p_action text, p_body jsonb default '{}'::jsonb, p_token text default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare b jsonb := coalesce(p_body, '{}'::jsonb); me mls_users; st jsonb; v_err text; v_id text; v_fill jsonb; q mls_quotes; o mls_orders; bf mls_buffs; e jsonb; v_m numeric; v_t text; v_amt numeric; c mls_cashflows;
begin
  if p_action not in ('placeOrder', 'amendOrder', 'requestCash', 'requestBuff', 'cancelBuff', 'repayBuff', 'buffs', 'processBuff', 'forceLiquidate', 'setCardTier', 'margin', 'setGrade', 'adjustBuff', 'saveSettings', 'ranking') then
    return mls_api_v1(p_action, p_body, p_token);
  end if;
  if p_token ~ '^[a-f0-9]{64}$' then
    select u2.* into me from mls_sessions s join mls_users u2 on u2.id = s.user_id where s.token = p_token and s.expires_at > now() and u2.status = 'active';
  end if;
  if me.id is null then perform mls_fail('로그인이 필요합니다.'); end if;
  if mls_is_live() then perform mls_match_pending(false); end if;
  st := mls_settings();
  case p_action
  when 'placeOrder' then
    if b->>'type' <> 'stop' then return mls_api_v1(p_action, p_body, p_token); end if;
    v_err := mls_validate2(me, left(coalesce(b->>'code', ''), 16), b->>'side', 'stop', 0, (b->>'qty')::bigint, (b->>'triggerPrice')::numeric, b->>'triggerCond');
    if v_err is not null then perform mls_fail(v_err); end if;
    select * into q from mls_quotes where code = b->>'code'; v_id := mls_uid('o');
    insert into mls_orders (id, user_id, code, name, side, type, price, qty, filled, status, currency, trigger_price, trigger_cond, created_at)
      values (v_id, me.id, q.code, q.name, b->>'side', 'stop', 0, (b->>'qty')::bigint, 0, 'pending', q.currency, (b->>'triggerPrice')::numeric, b->>'triggerCond', now());
    v_fill := mls_try_fill(v_id); select * into o from mls_orders where id = v_id;
    return jsonb_build_object('ok', true, 'data', jsonb_build_object('order', mls_order_j(o), 'fill', v_fill));
  when 'amendOrder' then
    select * into o from mls_orders where id = b->>'id' and user_id = me.id;
    if not found or o.status <> 'pending' then perform mls_fail('정정할 수 없는 주문입니다.'); end if;
    if o.type <> 'stop' then return mls_api_v1(p_action, p_body, p_token); end if;
    v_err := mls_validate2(me, o.code, o.side, 'stop', 0, (b->>'qty')::bigint, coalesce((b->>'triggerPrice')::numeric, (b->>'price')::numeric), coalesce(b->>'triggerCond', o.trigger_cond), o.id);
    if v_err is not null then perform mls_fail(v_err); end if;
    update mls_orders set trigger_price = coalesce((b->>'triggerPrice')::numeric, (b->>'price')::numeric), trigger_cond = coalesce(b->>'triggerCond', o.trigger_cond), qty = (b->>'qty')::bigint, amended = amended + 1, updated_at = now() where id = o.id;
    v_fill := mls_try_fill(o.id); select * into o from mls_orders where id = o.id;
    return jsonb_build_object('ok', true, 'data', jsonb_build_object('order', mls_order_j(o), 'fill', v_fill));
  when 'requestCash' then
    v_t := coalesce(nullif(b->>'method', ''), 'cash');
    if v_t not in ('cash', 'card', 'moa', 'usdt', 'usdc', 'usd1', 'maxp') then perform mls_fail('충전 수단을 확인해 주세요.'); end if;
    if b->>'type' <> 'withdraw' and not coalesce((st->'payMethods'->>v_t)::boolean, false) then perform mls_fail('현재 사용할 수 없는 충전 수단입니다.'); end if;
    if b->>'type' = 'withdraw' and exists (select 1 from mls_buffs where user_id = me.id and status = 'active') then perform mls_fail('버프 사용 중에는 출금할 수 없습니다. 먼저 상환해 주세요.'); end if;
    e := mls_api_v1('requestCash', b, p_token);
    if (e->>'ok')::boolean then update mls_cashflows set method = v_t where id = e->'data'->>'id'; select * into c from mls_cashflows where id = e->'data'->>'id'; e := jsonb_build_object('ok', true, 'data', mls_cash_j(c)); end if;
    return e;
  when 'margin' then return jsonb_build_object('ok', true, 'data', mls_eval(me.id));
  when 'ranking' then
    return jsonb_build_object('ok', true, 'data', coalesce((select jsonb_agg(x) from (
      select jsonb_build_object('user', jsonb_build_object('id', u3.id, 'name', u3.name, 'grade', coalesce(u3.grade, 'basic'), 'initial', u3.initial::float8, 'cash', u3.cash::float8, 'status', 'active', 'createdAt', mls_iso(u3.created_at)),
        'positions', coalesce((select jsonb_object_agg(code, jsonb_build_object('qty', qty, 'avg', avg::float8, 'cost', cost::float8)) from mls_positions where user_id = u3.id and qty > 0), '{}'::jsonb),
        'orders', '[]'::jsonb,
        'fills', coalesce((select jsonb_agg(jsonb_build_object('pnl', pnl::float8, 'at', mls_iso(at), 'side', side)) from mls_fills where user_id = u3.id), '[]'::jsonb),
        'cashflows', coalesce((select jsonb_agg(mls_cash_j(c5)) from mls_cashflows c5 where c5.user_id = u3.id and c5.status = 'approved'), '[]'::jsonb),
        'buffs', coalesce((select jsonb_agg(mls_buff_j(b5) || jsonb_build_object('interestNow', mls_buff_interest(b5)::float8)) from mls_buffs b5 where b5.user_id = u3.id and b5.status = 'active'), '[]'::jsonb),
        'snapshots', coalesce((select jsonb_agg(jsonb_build_array(to_char(d, 'YYYY-MM-DD'), total::float8) order by d desc) from (select * from mls_snapshots where user_id = u3.id order by d desc limit 40) s5), '[]'::jsonb)) x
      from mls_users u3 where u3.role <> 'admin' and u3.status = 'active') r), '[]'::jsonb));
  when 'requestBuff' then
    if not (st->>'buffEnabled')::boolean then perform mls_fail('현재 MAX 버프 신청이 중단되었습니다.'); end if;
    v_m := coalesce((b->>'mult')::numeric, 0);
    if v_m not in (1, 2, 3) or v_m > least((st->>'buffMaxMult')::numeric, (mls_grade(me)->>'maxMult')::numeric) then perform mls_fail((mls_grade(me)->>'name') || ' 등급은 최대 ' || (mls_grade(me)->>'maxMult') || '배까지 신청할 수 있습니다.'); end if;
    if exists (select 1 from mls_buffs where user_id = me.id and status in ('pending', 'active')) then perform mls_fail('이미 신청 중이거나 사용 중인 버프가 있습니다.'); end if;
    e := mls_eval(me.id);
    if (e->>'net')::numeric < (st->>'buffMinNet')::numeric then perform mls_fail('순자산 ' || to_char((st->>'buffMinNet')::numeric, 'FM999,999,999,999') || '원 이상부터 신청할 수 있습니다.'); end if;
    v_id := mls_uid('b');
    insert into mls_buffs (id, user_id, mult, amount, status, rate, maintain, base_net, memo, created_at)
      values (v_id, me.id, v_m, round((e->>'net')::numeric * v_m), 'pending', (mls_grade(me)->>'rate')::numeric, (mls_grade(me)->>'maintain')::numeric, (e->>'net')::numeric, left(coalesce(b->>'memo', ''), 100), now());
    if (st->>'buffAuto')::boolean then perform mls_activate_buff(v_id, 'auto'); end if;
    select * into bf from mls_buffs where id = v_id;
    return jsonb_build_object('ok', true, 'data', mls_buff_j(bf));
  when 'cancelBuff' then
    update mls_buffs set status = 'cancelled', closed_at = now() where id = b->>'id' and user_id = me.id and status = 'pending';
    if not found then perform mls_fail('취소할 수 없습니다.'); end if;
    return jsonb_build_object('ok', true, 'data', true);
  when 'repayBuff' then
    select * into bf from mls_buffs where user_id = me.id and status = 'active' for update;
    if not found then perform mls_fail('상환할 버프가 없습니다.'); end if;
    v_amt := bf.amount + mls_buff_interest(bf);
    if v_amt > mls_orderable(me.id) + 0.5 then perform mls_fail('상환에 필요한 현금이 부족합니다. (필요 ' || to_char(v_amt, 'FM999,999,999,999') || '원) 보유 종목을 일부 매도한 뒤 상환해 주세요.'); end if;
    update mls_users set cash = cash - v_amt where id = me.id;
    update mls_buffs set status = 'repaid', interest = mls_buff_interest(bf), closed_at = now(), closed_by = me.username where id = bf.id;
    return jsonb_build_object('ok', true, 'data', true);
  else null;
  end case;
  -- 관리자
  if me.role <> 'admin' then perform mls_fail('관리자 권한이 필요합니다.'); end if;
  case p_action
  when 'buffs' then
    return jsonb_build_object('ok', true, 'data', coalesce((select jsonb_agg(mls_buff_j(x) || jsonb_build_object('username', u.username, 'name', u.name, 'interestNow', mls_buff_interest(x)::float8, 'margin', case when x.status = 'active' then mls_eval(x.user_id) else null end) order by x.created_at desc)
      from mls_buffs x left join mls_users u on u.id = x.user_id), '[]'::jsonb));
  when 'processBuff' then
    if coalesce((b->>'approve')::boolean, false) then perform mls_activate_buff(b->>'id', me.username, nullif(b->>'mult', '')::numeric);
    else update mls_buffs set status = 'rejected', admin_memo = left(coalesce(b->>'memo', ''), 100), closed_at = now(), closed_by = me.username where id = b->>'id' and status = 'pending';
      if not found then perform mls_fail('처리할 수 없는 신청입니다.'); end if; end if;
    insert into mls_audit (by_user, action, detail) values (me.username, 'buff', (b->>'id') || ' ' || coalesce(b->>'approve', 'false'));
    return jsonb_build_object('ok', true, 'data', true);
  when 'forceLiquidate' then
    if not mls_liquidate(b->>'userId', me.username) then perform mls_fail('사용 중인 버프가 없습니다.'); end if;
    return jsonb_build_object('ok', true, 'data', true);
  when 'setCardTier' then
    update mls_users set card_tier = case when b->>'tier' in ('', 'white', 'blue', 'red', 'black') then b->>'tier' else '' end where id = b->>'id';
    insert into mls_audit (by_user, action, detail) values (me.username, 'card', (b->>'id') || ' ' || coalesce(b->>'tier', ''));
    return jsonb_build_object('ok', true, 'data', true);
  when 'setGrade' then
    if not exists (select 1 from jsonb_array_elements(st->'grades') g where g->>'id' = b->>'grade') then perform mls_fail('등급을 확인해 주세요.'); end if;
    update mls_users set grade = b->>'grade' where id = b->>'id';
    insert into mls_audit (by_user, action, detail) values (me.username, 'grade', (b->>'id') || ' ' || (b->>'grade'));
    return jsonb_build_object('ok', true, 'data', true);
  when 'adjustBuff' then
    update mls_buffs set maintain = coalesce(nullif(b->>'maintain', '')::numeric, maintain), rate = coalesce(nullif(b->>'rate', '')::numeric, rate) where id = b->>'id' and status = 'active';
    if not found then perform mls_fail('조정할 수 없는 버프입니다.'); end if;
    insert into mls_audit (by_user, action, detail) values (me.username, 'adjustBuff', (b->>'id') || ' ' || b::text);
    return jsonb_build_object('ok', true, 'data', true);
  when 'saveSettings' then
    perform mls_save_settings_v2(b);
    return mls_api_v1('saveSettings', b, p_token);
  else perform mls_fail('알 수 없는 요청입니다.');
  end case;
  return null;
exception
  when sqlstate 'P0001' then return jsonb_build_object('ok', false, 'error', sqlerrm);
  when others then raise warning '[mls2] % %', sqlstate, sqlerrm; return jsonb_build_object('ok', false, 'error', '서버 오류가 발생했습니다.');
end $$;
revoke all on function mls_api_v1(text, jsonb, text) from public;
revoke all on function mls_api(text, jsonb, text) from public;
do $$ begin if exists (select 1 from pg_roles where rolname = 'anon') then
  revoke all on function mls_api_v1(text, jsonb, text) from anon, authenticated;
  grant execute on function mls_api(text, jsonb, text) to anon, authenticated;
end if; end $$;

-- 관리자 설정 저장: 버프·충전 항목 허용
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
  if vv <> '{}'::jsonb then insert into mls_kv (k, v) values ('settings', mls_settings() || vv) on conflict (k) do update set v = excluded.v; end if;
  return vv;
end $$;
