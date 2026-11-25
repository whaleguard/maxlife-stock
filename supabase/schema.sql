-- MAX라이프 주식 — Supabase(Postgres) 운영 DB
-- Supabase 대시보드 → SQL Editor 에 전체를 붙여넣고 Run 하면 설치됩니다. (여러 번 실행해도 안전)
-- 테이블은 외부에서 직접 읽거나 쓸 수 없고(RLS 잠금), 모든 요청은 public.mls_api() 함수 하나로만 처리합니다.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- ───────── 테이블 ─────────
create table if not exists mls_users (
  id text primary key, username text not null unique, pw text not null, name text not null,
  role text not null default 'user' check (role in ('user','instructor','admin')),
  status text not null default 'active' check (status in ('active','suspended')),
  phone text default '', email text default '', cash numeric(20,2) not null default 0, initial numeric(20,2) not null default 0,
  watch jsonb not null default '[]', created_at timestamptz not null default now(), last_login timestamptz
);
create table if not exists mls_sessions (token text primary key, user_id text not null, expires_at timestamptz not null);
create index if not exists mls_sessions_user on mls_sessions(user_id);
create table if not exists mls_positions (user_id text not null, code text not null, qty bigint not null default 0, avg numeric(20,4) not null default 0, cost numeric(20,2) not null default 0, primary key (user_id, code));
create table if not exists mls_orders (
  id text primary key, user_id text not null, code text not null, name text not null,
  side text not null check (side in ('buy','sell')), type text not null check (type in ('limit','market')),
  price numeric(20,4) not null default 0, qty bigint not null, filled bigint not null default 0, avg_fill numeric(20,4),
  status text not null check (status in ('pending','filled','cancelled','rejected')), currency text not null default 'KRW',
  amended int not null default 0, reason text default '', created_at timestamptz not null default now(), updated_at timestamptz
);
create index if not exists mls_orders_user on mls_orders(user_id);
create index if not exists mls_orders_status on mls_orders(status);
create table if not exists mls_fills (
  id text primary key, order_id text not null, user_id text not null, code text not null, name text not null, side text not null,
  price numeric(20,4) not null, qty bigint not null, currency text not null, fx numeric(12,4) not null default 1,
  amount numeric(20,2) not null, fee numeric(20,2) not null, tax numeric(20,2) not null, pnl numeric(20,2) not null default 0, at timestamptz not null default now()
);
create index if not exists mls_fills_user on mls_fills(user_id);
create table if not exists mls_cashflows (
  id text primary key, user_id text not null, type text not null check (type in ('deposit','withdraw')), amount numeric(20,2) not null,
  memo text default '', admin_memo text default '', status text not null check (status in ('pending','approved','rejected','cancelled')),
  at timestamptz not null default now(), processed_at timestamptz, processed_by text default ''
);
create index if not exists mls_cash_user on mls_cashflows(user_id);
create table if not exists mls_posts (
  id text primary key, author_id text not null, author_name text not null, kind text not null default 'trade', title text not null, body text,
  code text default '', side text default '', entry numeric(20,4) default 0, target numeric(20,4) default 0, stop numeric(20,4) default 0,
  result text default '', result_pct numeric(10,2) default 0, video text default '', image text default '', at timestamptz not null default now(), updated_at timestamptz
);
create table if not exists mls_comments (id text primary key, post_id text not null, user_id text not null, name text not null, text text not null, at timestamptz not null default now());
create table if not exists mls_likes (post_id text not null, user_id text not null, primary key (post_id, user_id));
create table if not exists mls_notices (id text primary key, title text not null, body text, pinned boolean not null default false, at timestamptz not null default now());
create table if not exists mls_snapshots (user_id text not null, d date not null, total numeric(20,2) not null, primary key (user_id, d));
create table if not exists mls_logins (id bigserial primary key, user_id text not null, at timestamptz not null default now());
create table if not exists mls_kv (k text primary key, v jsonb);
create table if not exists mls_audit (id bigserial primary key, at timestamptz not null default now(), by_user text not null, action text not null, detail text default '');
-- 시세 (GitHub Actions 가 5분마다 mls_push_quotes 로 갱신)
create table if not exists mls_quotes (
  code text primary key, name text not null, market text not null, currency text not null,
  price numeric(20,4) not null, prev numeric(20,4), ask numeric(20,4), bid numeric(20,4), upper numeric(20,4), lower numeric(20,4), at timestamptz not null default now()
);

do $$ declare t text; begin
  foreach t in array array['mls_users','mls_sessions','mls_positions','mls_orders','mls_fills','mls_cashflows','mls_posts','mls_comments','mls_likes','mls_notices','mls_snapshots','mls_logins','mls_kv','mls_audit','mls_quotes'] loop
    execute format('alter table %I enable row level security', t);
    execute format('revoke all on %I from public', t);
    if exists (select 1 from pg_roles where rolname = 'anon') then execute format('revoke all on %I from anon, authenticated', t); end if;
  end loop;
end $$;

-- ───────── 공용 함수 ─────────
create or replace function mls_fail(msg text) returns void language plpgsql as $$ begin raise exception using errcode = 'P0001', message = msg; end $$;
create or replace function mls_uid(p text) returns text language sql as $$ select p || to_hex((extract(epoch from clock_timestamp()) * 1000)::bigint) || encode(extensions.gen_random_bytes(4), 'hex') $$;
create or replace function mls_iso(t timestamptz) returns text language sql immutable as $$ select case when t is null then null else to_char(t at time zone 'Asia/Seoul', 'YYYY-MM-DD"T"HH24:MI:SS"+09:00"') end $$;
create or replace function mls_settings() returns jsonb language sql stable as $$
  select '{"feeKr":0.015,"feeUs":0.25,"taxKr":0.20,"initialCash":10000000,"autoApprove":false,"enforceHours":false,"allowSignup":true,"maxDeposit":100000000,"minOrderKrw":0,"overrides":{"hidden":[],"base":{}}}'::jsonb
    || coalesce((select v from mls_kv where k = 'settings'), '{}'::jsonb)
$$;
create or replace function mls_fx() returns numeric language sql stable as $$ select coalesce((select (v->>'fx')::numeric from mls_kv where k = 'quotes_meta'), 1400) $$;
create or replace function mls_tokrw(v numeric, ccy text) returns numeric language sql stable as $$ select case when ccy = 'USD' then v * mls_fx() else v end $$;
create or replace function mls_fee(st jsonb, ccy text) returns numeric language sql immutable as $$ select (case when ccy = 'USD' then (st->>'feeUs')::numeric else (st->>'feeKr')::numeric end) / 100 $$;
create or replace function mls_tax(st jsonb, ccy text) returns numeric language sql immutable as $$ select case when ccy = 'USD' then 0 else (st->>'taxKr')::numeric / 100 end $$;
create or replace function mls_tick(p numeric) returns numeric language sql immutable as $$
  select case when p < 2000 then 1 when p < 5000 then 5 when p < 20000 then 10 when p < 50000 then 50 when p < 200000 then 100 when p < 500000 then 500 else 1000 end
$$;
create or replace function mls_is_live() returns boolean language sql stable as $$ select (select count(*) from mls_quotes) >= 5 $$;
create or replace function mls_best_ask(q mls_quotes) returns numeric language sql immutable as $$
  select coalesce(nullif(q.ask, 0), case when q.currency = 'USD' then round(q.price + 0.01, 2) else q.price + mls_tick(q.price) end)
$$;
create or replace function mls_best_bid(q mls_quotes) returns numeric language sql immutable as $$ select coalesce(nullif(q.bid, 0), q.price) $$;
create or replace function mls_session_open(market text) returns boolean language plpgsql stable as $$
declare k timestamp := now() at time zone 'Asia/Seoul'; n timestamp := now() at time zone 'America/New_York'; hm int;
begin
  if market in ('KOSPI', 'KOSDAQ') then hm := extract(hour from k) * 60 + extract(minute from k); return extract(isodow from k) <= 5 and hm >= 540 and hm < 930; end if;
  hm := extract(hour from n) * 60 + extract(minute from n); return extract(isodow from n) <= 5 and hm >= 570 and hm < 960;
end $$;
create or replace function mls_mask(s text) returns text language sql immutable as $$
  select case when char_length(s) <= 1 then s when char_length(s) = 2 then left(s, 1) || '*' else left(s, 1) || repeat('*', char_length(s) - 2) || right(s, 1) end
$$;

-- ───────── 출력 형태 ─────────
create or replace function mls_user_pub(u mls_users) returns jsonb language sql stable as $$
  select jsonb_build_object('id', u.id, 'username', u.username, 'name', u.name, 'role', u.role, 'status', u.status, 'phone', u.phone, 'email', u.email,
    'cash', u.cash::float8, 'initial', u.initial::float8, 'watch', coalesce(u.watch, '[]'::jsonb), 'createdAt', mls_iso(u.created_at), 'lastLogin', mls_iso(u.last_login))
$$;
create or replace function mls_order_j(o mls_orders) returns jsonb language sql stable as $$
  select jsonb_build_object('id', o.id, 'userId', o.user_id, 'code', o.code, 'name', o.name, 'side', o.side, 'type', o.type, 'price', o.price::float8, 'qty', o.qty, 'filled', o.filled,
    'avgFill', o.avg_fill::float8, 'status', o.status, 'currency', o.currency, 'amended', o.amended, 'createdAt', mls_iso(o.created_at), 'updatedAt', mls_iso(o.updated_at))
$$;
create or replace function mls_fill_j(f mls_fills) returns jsonb language sql stable as $$
  select jsonb_build_object('id', f.id, 'orderId', f.order_id, 'userId', f.user_id, 'code', f.code, 'name', f.name, 'side', f.side, 'price', f.price::float8, 'qty', f.qty,
    'currency', f.currency, 'fx', f.fx::float8, 'amount', f.amount::float8, 'fee', f.fee::float8, 'tax', f.tax::float8, 'pnl', f.pnl::float8, 'at', mls_iso(f.at))
$$;
create or replace function mls_cash_j(c mls_cashflows) returns jsonb language sql stable as $$
  select jsonb_build_object('id', c.id, 'userId', c.user_id, 'type', c.type, 'amount', c.amount::float8, 'memo', c.memo, 'adminMemo', c.admin_memo, 'status', c.status,
    'at', mls_iso(c.at), 'processedAt', mls_iso(c.processed_at), 'processedBy', c.processed_by)
$$;
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
    'snapshots', coalesce((select jsonb_agg(jsonb_build_array(to_char(d, 'YYYY-MM-DD'), total::float8) order by d desc) from (select * from mls_snapshots where user_id = p_uid order by d desc limit 400) s), '[]'::jsonb));
end $$;

-- ───────── 계좌 계산 ─────────
create or replace function mls_orderable(p_uid text, p_excl text default null) returns numeric language plpgsql stable as $$
declare st jsonb := mls_settings(); v_cash numeric; res numeric; wd numeric;
begin
  select u.cash into v_cash from mls_users u where u.id = p_uid;
  select coalesce(sum(mls_tokrw(price * (qty - filled), currency) * (1 + mls_fee(st, currency))), 0) into res from mls_orders where user_id = p_uid and status = 'pending' and side = 'buy' and id is distinct from p_excl;
  select coalesce(sum(amount), 0) into wd from mls_cashflows where user_id = p_uid and status = 'pending' and type = 'withdraw';
  return greatest(0, v_cash - res - wd);
end $$;
create or replace function mls_sellable(p_uid text, p_code text, p_excl text default null) returns bigint language sql stable as $$
  select coalesce((select qty from mls_positions where user_id = p_uid and code = p_code), 0)
       - coalesce((select sum(qty - filled) from mls_orders where user_id = p_uid and code = p_code and status = 'pending' and side = 'sell' and id is distinct from p_excl), 0)
$$;

-- ───────── 체결 엔진 ─────────
create or replace function mls_validate(u mls_users, p_code text, p_side text, p_type text, p_price numeric, p_qty bigint, p_excl text default null) returns text language plpgsql stable as $$
declare st jsonb := mls_settings(); q mls_quotes; px numeric; need numeric;
begin
  if not mls_is_live() then return '시세를 불러오는 중입니다. 잠시 후 다시 주문해 주세요.'; end if;
  select * into q from mls_quotes where code = p_code; if not found then return '종목을 찾을 수 없습니다.'; end if;
  if coalesce(st->'overrides'->'hidden', '[]'::jsonb) ? p_code then return '거래가 중지된 종목입니다.'; end if;
  if u.status = 'suspended' then return '정지된 계정은 주문할 수 없습니다.'; end if;
  if p_qty is null or p_qty <= 0 or p_qty > 1000000 then return '주문 수량을 확인해 주세요.'; end if;
  if p_side not in ('buy', 'sell') or p_type not in ('limit', 'market') then return '잘못된 주문입니다.'; end if;
  if (st->>'enforceHours')::boolean and p_type = 'market' and not mls_session_open(q.market) then return '장 운영시간이 아닙니다. 지정가 예약주문을 이용하세요.'; end if;
  if p_type = 'limit' then
    if not (p_price > 0) then return '주문 가격을 입력해 주세요.'; end if;
    if q.currency = 'KRW' then
      if mod(p_price, mls_tick(p_price)) <> 0 then return '호가단위(' || mls_tick(p_price)::bigint || '원)에 맞지 않는 가격입니다.'; end if;
      if coalesce(q.upper, 0) > 0 and p_price > q.upper then return '상한가를 초과했습니다.'; end if;
      if coalesce(q.lower, 0) > 0 and p_price < q.lower then return '하한가 미만입니다.'; end if;
    end if;
  end if;
  if p_side = 'buy' then
    px := case when p_type = 'market' then mls_best_ask(q) * (case when q.currency = 'USD' then 1.002 else 1 end) else p_price end;
    need := mls_tokrw(px * p_qty, q.currency) * (1 + mls_fee(st, q.currency));
    if need > mls_orderable(u.id, p_excl) + 0.5 then return '주문가능금액이 부족합니다.'; end if;
  else
    if mls_sellable(u.id, p_code, p_excl) < p_qty then return '매도가능수량이 부족합니다.'; end if;
  end if;
  return null;
end $$;

create or replace function mls_execute(p_oid text, p_price numeric) returns jsonb language plpgsql as $$
declare st jsonb := mls_settings(); o mls_orders; q mls_quotes; u mls_users; p mls_positions; v_fx numeric; v_qty bigint; v_gross numeric; v_fee numeric; v_tax numeric;
  v_total numeric; nq bigint; navg numeric; v_proceeds numeric; v_costpart numeric; v_pnl numeric := 0; fid text; f mls_fills;
begin
  select * into o from mls_orders where id = p_oid for update; if not found or o.status <> 'pending' then return null; end if;
  select * into q from mls_quotes where code = o.code; if not found then return null; end if;
  v_fx := case when q.currency = 'USD' then mls_fx() else 1 end;
  v_qty := o.qty - o.filled; v_gross := p_price * v_qty * v_fx; v_fee := round(v_gross * mls_fee(st, q.currency)); v_tax := case when o.side = 'sell' then round(v_gross * mls_tax(st, q.currency)) else 0 end;
  select * into u from mls_users where id = o.user_id for update;
  select * into p from mls_positions where user_id = o.user_id and code = o.code for update;
  if o.side = 'buy' then
    v_total := v_gross + v_fee; if v_total > u.cash + 0.5 then return null; end if;
    nq := coalesce(p.qty, 0) + v_qty; navg := (coalesce(p.avg, 0) * coalesce(p.qty, 0) + p_price * v_qty) / nq;
    update mls_users set cash = cash - v_total where id = u.id;
    insert into mls_positions (user_id, code, qty, avg, cost) values (u.id, o.code, nq, navg, coalesce(p.cost, 0) + v_total)
      on conflict (user_id, code) do update set qty = excluded.qty, avg = excluded.avg, cost = excluded.cost;
  else
    if coalesce(p.qty, 0) < v_qty then return null; end if;
    v_proceeds := v_gross - v_fee - v_tax; v_costpart := p.cost * (v_qty::numeric / p.qty); v_pnl := v_proceeds - v_costpart;
    update mls_users set cash = cash + v_proceeds where id = u.id;
    nq := p.qty - v_qty;
    if nq <= 0 then delete from mls_positions where user_id = u.id and code = o.code;
    else update mls_positions set qty = nq, cost = p.cost - v_costpart where user_id = u.id and code = o.code; end if;
  end if;
  update mls_orders set status = 'filled', filled = qty, avg_fill = p_price, updated_at = now() where id = o.id;
  fid := mls_uid('f');
  insert into mls_fills (id, order_id, user_id, code, name, side, price, qty, currency, fx, amount, fee, tax, pnl, at)
    values (fid, o.id, u.id, o.code, o.name, o.side, p_price, v_qty, q.currency, v_fx, round(v_gross), v_fee, v_tax, round(v_pnl), now()) returning * into f;
  return mls_fill_j(f);
end $$;

create or replace function mls_try_fill(p_oid text) returns jsonb language plpgsql as $$
declare o mls_orders; q mls_quotes; ask numeric; bid numeric; px numeric;
begin
  select * into o from mls_orders where id = p_oid; if not found or o.status <> 'pending' or not mls_is_live() then return null; end if;
  select * into q from mls_quotes where code = o.code; if not found then return null; end if;
  if (mls_settings()->>'enforceHours')::boolean and not mls_session_open(q.market) then return null; end if;
  ask := mls_best_ask(q); bid := mls_best_bid(q);
  if o.type = 'market' then px := case when o.side = 'buy' then ask else bid end;
  elsif o.side = 'buy' and ask <= o.price then px := least(ask, o.price);
  elsif o.side = 'sell' and bid >= o.price then px := greatest(bid, o.price);
  end if;
  if px is null then return null; end if;
  return mls_execute(o.id, px);
end $$;

create or replace function mls_match_pending(p_force boolean default false) returns int language plpgsql as $$
declare last numeric; n int := 0; r record;
begin
  select (v->>'t')::numeric into last from mls_kv where k = 'last_match';
  if not p_force and last is not null and extract(epoch from now()) - last < 30 then return 0; end if;
  insert into mls_kv (k, v) values ('last_match', jsonb_build_object('t', extract(epoch from now()))) on conflict (k) do update set v = excluded.v;
  for r in select id from mls_orders where status = 'pending' order by created_at loop
    if mls_try_fill(r.id) is not null then n := n + 1; end if;
  end loop;
  return n;
end $$;

create or replace function mls_apply_cash(p_cid text, p_approve boolean, p_by text, p_memo text default '') returns void language plpgsql as $$
declare c mls_cashflows; u mls_users; res numeric; st jsonb := mls_settings(); ok boolean := p_approve; v_memo text := coalesce(p_memo, '');
begin
  select * into c from mls_cashflows where id = p_cid for update;
  if not found or c.status <> 'pending' then perform mls_fail('이미 처리된 신청입니다.'); end if;
  if ok and c.type = 'withdraw' then
    select * into u from mls_users where id = c.user_id for update;
    select coalesce(sum(mls_tokrw(price * (qty - filled), currency) * (1 + mls_fee(st, currency))), 0) into res from mls_orders where user_id = c.user_id and status = 'pending' and side = 'buy';
    if c.amount > u.cash - res then ok := false; v_memo := '출금가능금액 부족'; end if;
  end if;
  update mls_cashflows set status = case when ok then 'approved' else 'rejected' end, processed_at = now(), processed_by = p_by, admin_memo = v_memo where id = c.id;
  if ok then update mls_users set cash = cash + case when c.type = 'deposit' then c.amount else -c.amount end where id = c.user_id; end if;
end $$;

create or replace function mls_new_session(p_uid text) returns text language plpgsql as $$
declare t text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  insert into mls_sessions (token, user_id, expires_at) values (t, p_uid, now() + interval '30 days');
  update mls_users set last_login = now() where id = p_uid;
  insert into mls_logins (user_id, at) values (p_uid, now());
  if random() < 0.02 then delete from mls_sessions where expires_at < now(); end if;
  return t;
end $$;

create or replace function mls_posts_out() returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'authorId', p.author_id, 'authorName', p.author_name, 'kind', p.kind, 'title', p.title, 'body', p.body, 'code', p.code,
    'side', p.side, 'entry', p.entry::float8, 'target', p.target::float8, 'stop', p.stop::float8, 'result', p.result, 'resultPct', p.result_pct::float8, 'video', p.video, 'image', p.image,
    'at', mls_iso(p.at), 'updatedAt', mls_iso(p.updated_at),
    'comments', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'userId', c.user_id, 'name', c.name, 'text', c.text, 'at', mls_iso(c.at)) order by c.at) from mls_comments c where c.post_id = p.id), '[]'::jsonb),
    'likes', coalesce((select jsonb_agg(l.user_id) from mls_likes l where l.post_id = p.id), '[]'::jsonb)) order by p.at desc), '[]'::jsonb)
  from (select * from mls_posts order by at desc limit 200) p
$$;

-- ───────── API (유일한 공개 진입점) ─────────
create or replace function mls_api(p_action text, p_body jsonb default '{}'::jsonb, p_token text default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  b jsonb := coalesce(p_body, '{}'::jsonb); me mls_users; u mls_users; st jsonb; o mls_orders; q mls_quotes; c mls_cashflows;
  v_id text; v_err text; v_fill jsonb; v_amt numeric; v_t text; v_un text; v_pw text; v_nm text; v_g jsonb; v_all jsonb; v_x jsonb; i int; v_out jsonb; v_cnt int;
begin
  if p_token ~ '^[a-f0-9]{64}$' then
    select u2.* into me from mls_sessions s join mls_users u2 on u2.id = s.user_id where s.token = p_token and s.expires_at > now() and u2.status = 'active';
  end if;
  if mls_is_live() then perform mls_match_pending(false); end if;
  st := mls_settings();

  -- 인증 없이 되는 요청
  if p_action = 'current' then return jsonb_build_object('ok', true, 'data', case when me.id is null then null else mls_user_pub(me) end); end if;
  if p_action = 'settings' then return jsonb_build_object('ok', true, 'data', st); end if;
  if p_action = 'login' then
    select * into u from mls_users where username = left(trim(coalesce(b->>'username', '')), 40);
    if not found or u.pw <> extensions.crypt(coalesce(b->>'pw', ''), u.pw) then perform pg_sleep(0.4); perform mls_fail('아이디 또는 비밀번호가 올바르지 않습니다.'); end if;
    if u.status = 'suspended' then perform mls_fail('정지된 계정입니다. 관리자에게 문의하세요.'); end if;
    return jsonb_build_object('ok', true, 'data', jsonb_build_object('token', mls_new_session(u.id), 'user', mls_user_pub(u)));
  end if;
  if p_action = 'signup' then
    if not (st->>'allowSignup')::boolean then perform mls_fail('현재 신규 가입이 중단되었습니다.'); end if;
    v_un := left(trim(coalesce(b->>'username', '')), 40); v_pw := coalesce(b->>'pw', ''); v_nm := left(trim(coalesce(b->>'name', '')), 20);
    if v_un !~ '^[a-zA-Z0-9_]{4,20}$' then perform mls_fail('아이디는 영문/숫자 4~20자입니다.'); end if;
    if length(v_pw) < 6 then perform mls_fail('비밀번호는 6자 이상입니다.'); end if;
    if v_nm = '' then perform mls_fail('이름을 입력해 주세요.'); end if;
    if exists (select 1 from mls_users where username = v_un) then perform mls_fail('이미 사용 중인 아이디입니다.'); end if;
    v_id := mls_uid('u');
    insert into mls_users (id, username, pw, name, role, status, phone, cash, initial, watch, created_at)
      values (v_id, v_un, extensions.crypt(v_pw, extensions.gen_salt('bf')), v_nm, 'user', 'active', left(coalesce(b->>'phone', ''), 40), (st->>'initialCash')::numeric, (st->>'initialCash')::numeric, '["005930","000660","NVDA","AAPL"]', now())
      returning * into u;
    return jsonb_build_object('ok', true, 'data', jsonb_build_object('token', mls_new_session(v_id), 'user', mls_user_pub(u)));
  end if;
  if p_action = 'logout' then delete from mls_sessions where token = p_token; return jsonb_build_object('ok', true, 'data', true); end if;

  -- 로그인 필요
  if me.id is null then perform mls_fail('로그인이 필요합니다.'); end if;
  case p_action
  when 'me' then return jsonb_build_object('ok', true, 'data', mls_bundle(me.id));
  when 'placeOrder' then
    v_err := mls_validate(me, left(coalesce(b->>'code', ''), 16), b->>'side', b->>'type', coalesce((b->>'price')::numeric, 0), (b->>'qty')::bigint);
    if v_err is not null then perform mls_fail(v_err); end if;
    select * into q from mls_quotes where code = b->>'code'; v_id := mls_uid('o');
    insert into mls_orders (id, user_id, code, name, side, type, price, qty, filled, status, currency, created_at)
      values (v_id, me.id, q.code, q.name, b->>'side', b->>'type', case when b->>'type' = 'market' then 0 else (b->>'price')::numeric end, (b->>'qty')::bigint, 0, 'pending', q.currency, now());
    v_fill := mls_try_fill(v_id);
    if b->>'type' = 'market' and v_fill is null then perform mls_fail('시장가 주문이 체결되지 않았습니다.'); end if;
    select * into o from mls_orders where id = v_id;
    return jsonb_build_object('ok', true, 'data', jsonb_build_object('order', mls_order_j(o), 'fill', v_fill));
  when 'cancelOrder' then
    update mls_orders set status = 'cancelled', updated_at = now() where id = b->>'id' and user_id = me.id and status = 'pending';
    if not found then perform mls_fail('취소할 수 없는 주문입니다.'); end if;
    return jsonb_build_object('ok', true, 'data', true);
  when 'amendOrder' then
    select * into o from mls_orders where id = b->>'id' and user_id = me.id;
    if not found or o.status <> 'pending' then perform mls_fail('정정할 수 없는 주문입니다.'); end if;
    v_err := mls_validate(me, o.code, o.side, 'limit', coalesce((b->>'price')::numeric, 0), (b->>'qty')::bigint, o.id);
    if v_err is not null then perform mls_fail(v_err); end if;
    update mls_orders set price = (b->>'price')::numeric, qty = (b->>'qty')::bigint, type = 'limit', amended = amended + 1, updated_at = now() where id = o.id and status = 'pending';
    v_fill := mls_try_fill(o.id); select * into o from mls_orders where id = o.id;
    return jsonb_build_object('ok', true, 'data', jsonb_build_object('order', mls_order_j(o), 'fill', v_fill));
  when 'requestCash' then
    v_t := case when b->>'type' = 'withdraw' then 'withdraw' else 'deposit' end; v_amt := floor(coalesce((b->>'amount')::numeric, 0));
    if v_amt < 10000 then perform mls_fail('최소 10,000원 이상 신청 가능합니다.'); end if;
    if v_t = 'deposit' and v_amt > (st->>'maxDeposit')::numeric then perform mls_fail('1회 최대 ' || to_char((st->>'maxDeposit')::numeric, 'FM999,999,999,999') || '원까지 신청 가능합니다.'); end if;
    if v_t = 'withdraw' and v_amt > mls_orderable(me.id) then perform mls_fail('출금가능금액을 초과했습니다.'); end if;
    if (select count(*) from mls_cashflows where user_id = me.id and status = 'pending') >= 3 then perform mls_fail('처리 대기 중인 신청이 3건 이상입니다.'); end if;
    v_id := mls_uid('c');
    insert into mls_cashflows (id, user_id, type, amount, memo, status, at) values (v_id, me.id, v_t, v_amt, left(coalesce(b->>'memo', ''), 60), 'pending', now());
    if (st->>'autoApprove')::boolean then perform mls_apply_cash(v_id, true, 'auto'); end if;
    select * into c from mls_cashflows where id = v_id;
    return jsonb_build_object('ok', true, 'data', mls_cash_j(c));
  when 'cancelCash' then
    update mls_cashflows set status = 'cancelled', processed_at = now() where id = b->>'id' and user_id = me.id and status = 'pending';
    if not found then perform mls_fail('취소할 수 없습니다.'); end if;
    return jsonb_build_object('ok', true, 'data', true);
  when 'toggleWatch' then
    v_t := left(coalesce(b->>'code', ''), 16);
    if me.watch ? v_t then update mls_users set watch = watch - v_t where id = me.id returning * into u;
    else update mls_users set watch = case when jsonb_array_length(watch) >= 200 then watch else watch || to_jsonb(v_t) end where id = me.id returning * into u; end if;
    return jsonb_build_object('ok', true, 'data', u.watch);
  when 'watchGroups' then
    return jsonb_build_object('ok', true, 'data', coalesce((select v from mls_kv where k = 'wg:' || me.id), jsonb_build_array(jsonb_build_object('id', 'g1', 'name', '관심종목', 'codes', me.watch))));
  when 'saveWatchGroups' then
    v_g := '[]'::jsonb; v_all := '[]'::jsonb; i := 0;
    for v_x in select value from jsonb_array_elements(case when jsonb_typeof(b->'groups') = 'array' then b->'groups' else '[]'::jsonb end) loop
      i := i + 1; exit when i > 20;
      v_out := coalesce((select jsonb_agg(c3 order by mo) from (select left(value #>> '{}', 16) c3, min(ord) mo from jsonb_array_elements(case when jsonb_typeof(v_x->'codes') = 'array' then v_x->'codes' else '[]'::jsonb end) with ordinality t(value, ord) group by 1 order by 2 limit 100) w), '[]'::jsonb);
      v_g := v_g || jsonb_build_array(jsonb_build_object('id', left(coalesce(v_x->>'id', 'g' || i), 24), 'name', left(coalesce(v_x->>'name', '그룹'), 20), 'codes', v_out));
      v_all := v_all || v_out;
    end loop;
    insert into mls_kv (k, v) values ('wg:' || me.id, v_g) on conflict (k) do update set v = excluded.v;
    update mls_users set watch = coalesce((select jsonb_agg(c4 order by mo) from (select value #>> '{}' c4, min(ord) mo from jsonb_array_elements(v_all) with ordinality t(value, ord) group by 1 order by 2 limit 200) w), '[]'::jsonb) where id = me.id;
    return jsonb_build_object('ok', true, 'data', v_g);
  when 'updateProfile' then
    update mls_users set name = coalesce(nullif(left(trim(coalesce(b->>'name', '')), 20), ''), name), phone = left(coalesce(b->>'phone', ''), 40), email = left(coalesce(b->>'email', ''), 120) where id = me.id returning * into u;
    return jsonb_build_object('ok', true, 'data', mls_user_pub(u));
  when 'changePassword' then
    if me.pw <> extensions.crypt(coalesce(b->>'oldPw', ''), me.pw) then perform mls_fail('현재 비밀번호가 올바르지 않습니다.'); end if;
    if length(coalesce(b->>'newPw', '')) < 6 then perform mls_fail('새 비밀번호는 6자 이상입니다.'); end if;
    update mls_users set pw = extensions.crypt(b->>'newPw', extensions.gen_salt('bf')) where id = me.id;
    delete from mls_sessions where user_id = me.id and token <> p_token;
    return jsonb_build_object('ok', true, 'data', true);
  when 'resetAccount' then
    delete from mls_orders where user_id = me.id; delete from mls_fills where user_id = me.id; delete from mls_cashflows where user_id = me.id;
    delete from mls_positions where user_id = me.id; delete from mls_snapshots where user_id = me.id;
    update mls_users set cash = (st->>'initialCash')::numeric, initial = (st->>'initialCash')::numeric where id = me.id;
    return jsonb_build_object('ok', true, 'data', true);
  when 'recordSnapshot' then
    insert into mls_snapshots (user_id, d, total) values (me.id, (now() at time zone 'Asia/Seoul')::date, round(coalesce((b->>'total')::numeric, 0)))
      on conflict (user_id, d) do update set total = excluded.total;
    return jsonb_build_object('ok', true, 'data', true);
  when 'posts' then return jsonb_build_object('ok', true, 'data', mls_posts_out());
  when 'notices' then
    return jsonb_build_object('ok', true, 'data', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'title', title, 'body', body, 'pinned', pinned, 'at', mls_iso(at)) order by pinned desc, at desc) from (select * from mls_notices order by pinned desc, at desc limit 100) n), '[]'::jsonb));
  when 'comment' then
    if left(trim(coalesce(b->>'text', '')), 500) = '' then perform mls_fail('내용을 입력해 주세요.'); end if;
    if not exists (select 1 from mls_posts where id = b->>'postId') then perform mls_fail('게시물이 없습니다.'); end if;
    insert into mls_comments (id, post_id, user_id, name, text, at) values (mls_uid('m'), b->>'postId', me.id, me.name, left(trim(b->>'text'), 500), now());
    return jsonb_build_object('ok', true, 'data', true);
  when 'deleteComment' then
    if exists (select 1 from mls_comments where id = b->>'cid' and user_id <> me.id) and me.role = 'user' then perform mls_fail('권한이 없습니다.'); end if;
    delete from mls_comments where id = b->>'cid'; return jsonb_build_object('ok', true, 'data', true);
  when 'like' then
    delete from mls_likes where post_id = b->>'postId' and user_id = me.id;
    if not found then insert into mls_likes (post_id, user_id) values (b->>'postId', me.id); end if;
    return jsonb_build_object('ok', true, 'data', true);
  when 'ranking' then
    return jsonb_build_object('ok', true, 'data', coalesce((select jsonb_agg(x) from (
      select jsonb_build_object('user', jsonb_build_object('id', u3.id, 'name', case when u3.id = me.id then u3.name else mls_mask(u3.name) end, 'initial', u3.initial::float8, 'cash', u3.cash::float8, 'status', 'active'),
        'positions', coalesce((select jsonb_object_agg(code, jsonb_build_object('qty', qty, 'avg', avg::float8, 'cost', cost::float8)) from mls_positions where user_id = u3.id and qty > 0), '{}'::jsonb),
        'orders', '[]'::jsonb,
        'fills', coalesce((select jsonb_agg(jsonb_build_object('pnl', pnl::float8)) from mls_fills where user_id = u3.id), '[]'::jsonb),
        'cashflows', coalesce((select jsonb_agg(mls_cash_j(c5)) from mls_cashflows c5 where c5.user_id = u3.id and c5.status = 'approved'), '[]'::jsonb)) x
      from mls_users u3 where u3.role = 'user' and u3.status = 'active') r), '[]'::jsonb));
  else null;
  end case;

  -- MAX 리딩·관리자
  if p_action in ('savePost', 'deletePost', 'saveNotice', 'deleteNotice') then
    if me.role not in ('admin', 'instructor') then perform mls_fail('MAX 리딩·관리자 권한이 필요합니다.'); end if;
    if p_action = 'savePost' then
      if left(trim(coalesce(b->>'title', '')), 200) = '' then perform mls_fail('제목을 입력해 주세요.'); end if;
      if coalesce(b->>'id', '') <> '' then
        update mls_posts set kind = case when b->>'kind' = 'lesson' then 'lesson' else 'trade' end, title = left(trim(b->>'title'), 200), body = left(coalesce(b->>'body', ''), 20000), code = left(coalesce(b->>'code', ''), 16),
          side = left(coalesce(b->>'side', ''), 8), entry = coalesce((b->>'entry')::numeric, 0), target = coalesce((b->>'target')::numeric, 0), stop = coalesce((b->>'stop')::numeric, 0),
          result = left(coalesce(b->>'result', ''), 12), result_pct = coalesce((b->>'resultPct')::numeric, 0), video = left(coalesce(b->>'video', ''), 300), image = left(coalesce(b->>'image', ''), 300), updated_at = now()
          where id = b->>'id';
      else
        insert into mls_posts (id, author_id, author_name, kind, title, body, code, side, entry, target, stop, result, result_pct, video, image, at)
          values (mls_uid('p'), me.id, me.name, case when b->>'kind' = 'lesson' then 'lesson' else 'trade' end, left(trim(b->>'title'), 200), left(coalesce(b->>'body', ''), 20000), left(coalesce(b->>'code', ''), 16),
            left(coalesce(b->>'side', ''), 8), coalesce((b->>'entry')::numeric, 0), coalesce((b->>'target')::numeric, 0), coalesce((b->>'stop')::numeric, 0), left(coalesce(b->>'result', ''), 12),
            coalesce((b->>'resultPct')::numeric, 0), left(coalesce(b->>'video', ''), 300), left(coalesce(b->>'image', ''), 300), now());
      end if;
    elsif p_action = 'deletePost' then
      delete from mls_posts where id = b->>'id'; delete from mls_comments where post_id = b->>'id'; delete from mls_likes where post_id = b->>'id';
    elsif p_action = 'saveNotice' then
      if left(trim(coalesce(b->>'title', '')), 200) = '' then perform mls_fail('제목을 입력해 주세요.'); end if;
      if coalesce(b->>'id', '') <> '' then update mls_notices set title = left(trim(b->>'title'), 200), body = left(coalesce(b->>'body', ''), 5000), pinned = coalesce((b->>'pinned')::boolean, false) where id = b->>'id';
      else insert into mls_notices (id, title, body, pinned, at) values (mls_uid('n'), left(trim(b->>'title'), 200), left(coalesce(b->>'body', ''), 5000), coalesce((b->>'pinned')::boolean, false), now()); end if;
    else
      delete from mls_notices where id = b->>'id';
    end if;
    return jsonb_build_object('ok', true, 'data', true);
  end if;

  -- 관리자 전용
  if me.role <> 'admin' then perform mls_fail('관리자 권한이 필요합니다.'); end if;
  case p_action
  when 'saveSettings' then
    v_x := '{}'::jsonb;
    for v_t in select unnest(array['feeKr', 'feeUs', 'taxKr', 'initialCash', 'maxDeposit']) loop
      if b ? v_t then if (b->>v_t)::numeric < 0 then perform mls_fail('값을 확인하세요.'); end if; v_x := v_x || jsonb_build_object(v_t, (b->>v_t)::numeric); end if;
    end loop;
    for v_t in select unnest(array['autoApprove', 'enforceHours', 'allowSignup']) loop
      if b ? v_t then v_x := v_x || jsonb_build_object(v_t, coalesce((b->>v_t)::boolean, false)); end if;
    end loop;
    if b ? 'overrides' then v_x := v_x || jsonb_build_object('overrides', b->'overrides'); end if;
    insert into mls_kv (k, v) values ('settings', mls_settings() || v_x) on conflict (k) do update set v = excluded.v;
    insert into mls_audit (by_user, action, detail) values (me.username, 'settings', left(v_x::text, 500));
    return jsonb_build_object('ok', true, 'data', mls_settings());
  when 'users' then return jsonb_build_object('ok', true, 'data', coalesce((select jsonb_agg(mls_user_pub(x) order by x.created_at desc) from mls_users x), '[]'::jsonb));
  when 'userBundle' then return jsonb_build_object('ok', true, 'data', mls_bundle(b->>'id'));
  when 'allBundles' then return jsonb_build_object('ok', true, 'data', coalesce((select jsonb_agg(mls_bundle(x.id) order by x.created_at desc) from mls_users x where x.role <> 'admin'), '[]'::jsonb));
  when 'setUserStatus' then
    if b->>'id' = me.id then perform mls_fail('본인 계정은 정지할 수 없습니다.'); end if;
    v_t := case when b->>'status' = 'suspended' then 'suspended' else 'active' end;
    update mls_users set status = v_t where id = b->>'id'; if v_t = 'suspended' then delete from mls_sessions where user_id = b->>'id'; end if;
    insert into mls_audit (by_user, action, detail) values (me.username, 'status', (b->>'id') || '→' || v_t);
    return jsonb_build_object('ok', true, 'data', true);
  when 'setUserRole' then
    if b->>'id' = me.id then perform mls_fail('본인 권한은 변경할 수 없습니다.'); end if;
    v_t := case when b->>'role' in ('user', 'instructor', 'admin') then b->>'role' else 'user' end;
    update mls_users set role = v_t where id = b->>'id';
    insert into mls_audit (by_user, action, detail) values (me.username, 'role', (b->>'id') || '→' || v_t);
    return jsonb_build_object('ok', true, 'data', true);
  when 'adjustCash' then
    v_amt := round(coalesce((b->>'amount')::numeric, 0)); if v_amt = 0 then perform mls_fail('금액을 입력해 주세요.'); end if;
    v_id := mls_uid('c');
    insert into mls_cashflows (id, user_id, type, amount, memo, status, at) values (v_id, b->>'id', case when v_amt > 0 then 'deposit' else 'withdraw' end, abs(v_amt), '[관리자 조정] ' || left(coalesce(b->>'memo', ''), 100), 'pending', now());
    perform mls_apply_cash(v_id, true, me.username);
    insert into mls_audit (by_user, action, detail) values (me.username, 'adjustCash', (b->>'id') || ' ' || v_amt);
    return jsonb_build_object('ok', true, 'data', true);
  when 'cashflows' then
    return jsonb_build_object('ok', true, 'data', coalesce((select jsonb_agg(mls_cash_j(c6) || jsonb_build_object('username', u6.username, 'name', u6.name) order by c6.at desc) from (select * from mls_cashflows order by at desc limit 2000) c6 left join mls_users u6 on u6.id = c6.user_id), '[]'::jsonb));
  when 'processCash' then
    select * into c from mls_cashflows where id = b->>'id'; if not found or c.status <> 'pending' then perform mls_fail('처리할 수 없는 신청입니다.'); end if;
    perform mls_apply_cash(c.id, coalesce((b->>'approve')::boolean, false), me.username, left(coalesce(b->>'memo', ''), 100));
    return jsonb_build_object('ok', true, 'data', true);
  when 'stats' then
    return jsonb_build_object('ok', true, 'data', jsonb_build_object(
      'logins', coalesce((select jsonb_agg(jsonb_build_object('userId', user_id, 'at', mls_iso(at)) order by at desc) from (select * from mls_logins where at > now() - interval '30 days' order by at desc limit 5000) l), '[]'::jsonb),
      'audit', coalesce((select jsonb_agg(jsonb_build_object('at', mls_iso(at), 'by', by_user, 'action', action, 'detail', detail) order by id) from (select * from mls_audit order by id desc limit 200) a), '[]'::jsonb)));
  when 'exportDB' then
    return jsonb_build_object('ok', true, 'data', jsonb_build_object(
      'mls_users', coalesce((select jsonb_agg(to_jsonb(x) - 'pw') from mls_users x), '[]'::jsonb), 'mls_positions', coalesce((select jsonb_agg(to_jsonb(x)) from mls_positions x), '[]'::jsonb),
      'mls_orders', coalesce((select jsonb_agg(to_jsonb(x)) from mls_orders x), '[]'::jsonb), 'mls_fills', coalesce((select jsonb_agg(to_jsonb(x)) from mls_fills x), '[]'::jsonb),
      'mls_cashflows', coalesce((select jsonb_agg(to_jsonb(x)) from mls_cashflows x), '[]'::jsonb), 'mls_posts', coalesce((select jsonb_agg(to_jsonb(x)) from mls_posts x), '[]'::jsonb),
      'mls_comments', coalesce((select jsonb_agg(to_jsonb(x)) from mls_comments x), '[]'::jsonb), 'mls_notices', coalesce((select jsonb_agg(to_jsonb(x)) from mls_notices x), '[]'::jsonb),
      'mls_snapshots', coalesce((select jsonb_agg(to_jsonb(x)) from mls_snapshots x), '[]'::jsonb)));
  else perform mls_fail('알 수 없는 요청입니다.');
  end case;
  return null;
exception
  when sqlstate 'P0001' then return jsonb_build_object('ok', false, 'error', sqlerrm);
  when others then raise warning '[mls] % %', sqlstate, sqlerrm; return jsonb_build_object('ok', false, 'error', '서버 오류가 발생했습니다.');
end $$;

-- 시세 반영 (GitHub Actions 전용 · 비밀값 확인)
create or replace function mls_push_quotes(p_secret text, p_items jsonb, p_fx numeric default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare n int;
begin
  if p_secret is null or p_secret <> coalesce((select v->>'secret' from mls_kv where k = 'push_secret'), '') then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  insert into mls_quotes (code, name, market, currency, price, prev, ask, bid, upper, lower, at)
    select x->>0, x->>1, x->>2, x->>3, (x->>4)::numeric, nullif(x->>5, '')::numeric, nullif(x->>6, '')::numeric, nullif(x->>7, '')::numeric, nullif(x->>8, '')::numeric, nullif(x->>9, '')::numeric, now()
    from jsonb_array_elements(p_items) x where (x->>4)::numeric > 0
  on conflict (code) do update set name = excluded.name, market = excluded.market, currency = excluded.currency, price = excluded.price, prev = excluded.prev,
    ask = excluded.ask, bid = excluded.bid, upper = excluded.upper, lower = excluded.lower, at = excluded.at;
  get diagnostics n = row_count;
  insert into mls_kv (k, v) values ('quotes_meta', jsonb_build_object('fx', coalesce(p_fx, mls_fx()), 'at', now(), 'n', n)) on conflict (k) do update set v = excluded.v;
  perform mls_match_pending(true);
  return jsonb_build_object('ok', true, 'n', n);
end $$;

-- 공개 권한: 두 함수만 호출 가능
revoke all on function mls_api(text, jsonb, text) from public;
revoke all on function mls_push_quotes(text, jsonb, numeric) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    grant execute on function mls_api(text, jsonb, text) to anon, authenticated;
    grant execute on function mls_push_quotes(text, jsonb, numeric) to anon, authenticated;
  end if;
end $$;

-- ───────── 초기 데이터 (처음 한 번) ─────────
insert into mls_users (id, username, pw, name, role, status, cash, initial, watch)
  values ('u_admin', 'admin', extensions.crypt('admin1234', extensions.gen_salt('bf')), '관리자', 'admin', 'active', 0, 0, '[]')
  on conflict (username) do nothing;
insert into mls_users (id, username, pw, name, role, status, cash, initial, watch)
  values ('u_demo', 'demo', extensions.crypt('demo1234', extensions.gen_salt('bf')), '김민수', 'user', 'active', 10000000, 10000000, '["005930","000660","NVDA","AAPL","035420"]'),
         ('u_teacher', 'teacher', extensions.crypt('teacher1234', extensions.gen_salt('bf')), 'MAX 리딩', 'instructor', 'active', 10000000, 10000000, '["005930","000660","NVDA","AAPL"]')
  on conflict (username) do nothing;
insert into mls_notices (id, title, body, pinned) values ('n_open', 'MAX라이프 주식 오픈 안내', '가입 시 예수금 1,000만 원이 지급됩니다. 국내·미국 전 종목 실제 시세 기준으로 체결됩니다.', true) on conflict (id) do nothing;
insert into mls_kv (k, v) values ('push_secret', jsonb_build_object('secret', encode(extensions.gen_random_bytes(24), 'hex'))) on conflict (k) do nothing;
select '설치 완료' as result, (select v->>'secret' from mls_kv where k = 'push_secret') as push_secret;
-- 시세 자동 반영: Supabase 가 5분마다 GitHub data 브랜치의 quotes.json 을 직접 가져옴 (비밀값 불필요)
create extension if not exists http with schema extensions;
create extension if not exists pg_cron;

create or replace function mls_pull_quotes() returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare r extensions.http_response; j jsonb; n int;
begin
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT', '30');
  select * into r from extensions.http_get('https://raw.githubusercontent.com/whaleguard/maxlife-stock/data/quotes.json');
  if r.status <> 200 then return jsonb_build_object('ok', false, 'status', r.status); end if;
  j := r.content::jsonb;
  if coalesce(j->>'status', '') <> 'LIVE' then return jsonb_build_object('ok', false, 'error', 'not live'); end if;
  insert into mls_quotes (code, name, market, currency, price, prev, ask, bid, upper, lower, at)
    select e.key, e.value->>'name', e.value->>'market', e.value->>'currency', (e.value->>'price')::numeric, nullif(e.value->>'prevClose', '')::numeric,
      nullif(j->'books'->e.key->'asks'->0->>0, '')::numeric, nullif(j->'books'->e.key->'bids'->0->>0, '')::numeric,
      nullif(e.value->>'upper', '')::numeric, nullif(e.value->>'lower', '')::numeric, now()
    from jsonb_each(j->'items') e where (e.value->>'price')::numeric > 0
  on conflict (code) do update set name = excluded.name, market = excluded.market, currency = excluded.currency, price = excluded.price, prev = excluded.prev,
    ask = excluded.ask, bid = excluded.bid, upper = excluded.upper, lower = excluded.lower, at = excluded.at;
  get diagnostics n = row_count;
  -- 호가가 없어진 종목은 호가 비움
  update mls_quotes set ask = null, bid = null where at < now() - interval '1 second' and ask is not null and not (j->'books' ? code);
  insert into mls_kv (k, v) values ('quotes_meta', jsonb_build_object('fx', coalesce((j->>'fx')::numeric, mls_fx()), 'at', now(), 'n', n, 'src', j->>'updatedAt')) on conflict (k) do update set v = excluded.v;
  perform mls_match_pending(true);
  return jsonb_build_object('ok', true, 'n', n, 'src', j->>'updatedAt');
end $$;
revoke all on function mls_pull_quotes() from public;
do $$ begin if exists (select 1 from pg_roles where rolname = 'anon') then revoke all on function mls_pull_quotes() from anon, authenticated; end if; end $$;

select cron.unschedule(jobid) from cron.job where jobname = 'mls-quotes';
select cron.schedule('mls-quotes', '*/5 * * * *', 'select public.mls_pull_quotes()');
select mls_pull_quotes() as first_pull;
