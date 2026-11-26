-- MAX라이프 주식 v7 — 가상 USDT 지갑, 코인 선물(무기한 · 가상 체결), 스테이킹(가상 USDT 예치)
-- 모든 금액은 앱 안의 가상 자산이며 실제 코인·현금으로 지급되지 않습니다.
-- v6.sql 다음에 실행 (여러 번 실행해도 안전)

alter table mls_users add column if not exists usdt numeric(24,6) not null default 0;

create table if not exists mls_cf_prices (sym text primary key, last numeric(24,10) not null default 0, mark numeric(24,10) not null default 0, bid numeric(24,10) default 0, ask numeric(24,10) default 0,
  open24 numeric(24,10) default 0, high24 numeric(24,10) default 0, low24 numeric(24,10) default 0, vol24 numeric(30,4) default 0, funding numeric(14,10) default 0, updated_at timestamptz not null default now());
create table if not exists mls_cf_orders (id text primary key, user_id text not null, sym text not null, side text not null check (side in ('buy', 'sell')), type text not null check (type in ('market', 'limit')),
  price numeric(24,10) not null default 0, qty numeric(30,10) not null, lev int not null default 10, reduce_only boolean not null default false, tp numeric(24,10), sl numeric(24,10),
  status text not null default 'pending' check (status in ('pending', 'filled', 'cancelled', 'rejected')), fill_price numeric(24,10), reason text default '', created_at timestamptz not null default now(), updated_at timestamptz);
create index if not exists mls_cf_orders_u on mls_cf_orders(user_id, created_at desc);
create table if not exists mls_cf_positions (user_id text not null, sym text not null, side text not null check (side in ('long', 'short')), qty numeric(30,10) not null, entry numeric(24,10) not null,
  lev int not null, margin numeric(24,6) not null, tp numeric(24,10), sl numeric(24,10), opened_at timestamptz not null default now(), updated_at timestamptz not null default now(), primary key (user_id, sym));
create table if not exists mls_cf_fills (id text primary key, user_id text not null, order_id text, sym text not null, action text not null, side text not null, qty numeric(30,10) not null, price numeric(24,10) not null,
  fee numeric(24,6) not null default 0, pnl numeric(24,6) not null default 0, at timestamptz not null default now());
create index if not exists mls_cf_fills_u on mls_cf_fills(user_id, at desc);
create table if not exists mls_usdt_flows (id bigserial primary key, user_id text not null, kind text not null, amount numeric(24,6) not null, krw numeric(20,2) default 0, memo text default '', at timestamptz not null default now());
create index if not exists mls_usdt_flows_u on mls_usdt_flows(user_id, at desc);
create table if not exists mls_stake_products (id text primary key, name text not null, apr numeric(8,3) not null, days int not null, min_amt numeric(24,6) not null default 10, max_amt numeric(24,6) not null default 100000,
  active boolean not null default true, sort int not null default 0, badge text default '', descr text default '');
create table if not exists mls_stakes (id text primary key, user_id text not null, product_id text not null, name text not null, amount numeric(24,6) not null, apr numeric(8,3) not null, days int not null,
  started_at timestamptz not null default now(), ends_at timestamptz not null, status text not null default 'active' check (status in ('active', 'matured', 'redeemed')), interest numeric(24,6) not null default 0, closed_at timestamptz);
create index if not exists mls_stakes_u on mls_stakes(user_id);
do $$ declare t text; begin
  foreach t in array array['mls_cf_prices', 'mls_cf_orders', 'mls_cf_positions', 'mls_cf_fills', 'mls_usdt_flows', 'mls_stake_products', 'mls_stakes'] loop
    execute format('alter table %I enable row level security', t); execute format('revoke all on %I from public', t);
    if exists (select 1 from pg_roles where rolname = 'anon') then execute format('revoke all on %I from anon, authenticated', t); end if;
  end loop;
end $$;

insert into mls_stake_products (id, name, apr, days, min_amt, max_amt, sort, badge, descr) values
  ('st30', 'USDT 스테이킹 30일', 4, 30, 10, 10000, 1, '단기', '30일 고정 예치 · 만기 시 원금과 이자를 가상 USDT 지갑으로 지급'),
  ('st90', 'USDT 스테이킹 90일', 6, 90, 50, 20000, 2, '인기', '분기 단위 예치'),
  ('st180', 'USDT 스테이킹 180일', 8, 180, 100, 50000, 3, '', '반기 예치'),
  ('st365', 'USDT 스테이킹 365일', 10, 365, 200, 100000, 4, '장기', '1년 만기 예치')
on conflict (id) do nothing;

do $$ begin
  if not exists (select 1 from mls_kv where k = 'v7_applied') then
    insert into mls_kv (k, v) values ('settings', '{"cfEnabled":true,"cfMaxLev":100,"cfMakerFee":0.02,"cfTakerFee":0.05,"cfMaint":0.5,"cfMinNotional":5,"stakeEnabled":true,"cfSymbols":["BTC","ETH","SOL","XRP","DOGE","BNB","ADA","AVAX","LINK","TON","SUI","TRX","DOT","LTC","NEAR","APT","ARB","OP","PEPE","SHIB"]}'::jsonb)
      on conflict (k) do update set v = '{"cfEnabled":true,"cfMaxLev":100,"cfMakerFee":0.02,"cfTakerFee":0.05,"cfMaint":0.5,"cfMinNotional":5,"stakeEnabled":true,"cfSymbols":["BTC","ETH","SOL","XRP","DOGE","BNB","ADA","AVAX","LINK","TON","SUI","TRX","DOT","LTC","NEAR","APT","ARB","OP","PEPE","SHIB"]}'::jsonb || mls_kv.v;
    insert into mls_kv (k, v) values ('v7_applied', '{"t":1}'::jsonb);
  end if;
end $$;

-- ───────── 시세 (OKX 공개 시세) ─────────
create or replace function mls_cf_upsert(t jsonb) returns void language plpgsql as $$
declare s text := split_part(t->>'instId', '-', 1);
begin
  insert into mls_cf_prices (sym, last, mark, bid, ask, open24, high24, low24, vol24, updated_at)
  values (s, (t->>'last')::numeric, coalesce(nullif(t->>'markPx', '')::numeric, (t->>'last')::numeric), nullif(t->>'bidPx', '')::numeric, nullif(t->>'askPx', '')::numeric,
    nullif(t->>'open24h', '')::numeric, nullif(t->>'high24h', '')::numeric, nullif(t->>'low24h', '')::numeric, nullif(t->>'volCcy24h', '')::numeric * (t->>'last')::numeric, now())
  on conflict (sym) do update set last = excluded.last, mark = excluded.last, bid = excluded.bid, ask = excluded.ask, open24 = excluded.open24, high24 = excluded.high24, low24 = excluded.low24, vol24 = excluded.vol24, updated_at = now();
end $$;
create or replace function mls_cf_fetch(p_sym text) returns numeric language plpgsql security definer set search_path = public, extensions as $$
declare r extensions.http_response; j jsonb;
begin
  begin
    perform extensions.http_set_curlopt('CURLOPT_TIMEOUT', '4');
    select * into r from extensions.http_get('https://www.okx.com/api/v5/market/ticker?instId=' || upper(p_sym) || '-USDT-SWAP');
    j := r.content::jsonb;
    if j->>'code' = '0' and jsonb_array_length(j->'data') > 0 then perform mls_cf_upsert(j->'data'->0); end if;
  exception when others then null; end;
  return (select case when updated_at > now() - interval '3 minutes' then last end from mls_cf_prices where sym = upper(p_sym));
end $$;
create or replace function mls_cf_pull() returns int language plpgsql security definer set search_path = public, extensions as $$
declare r extensions.http_response; j jsonb; t jsonb; syms jsonb := coalesce(mls_settings()->'cfSymbols', '[]'::jsonb); n int := 0;
begin
  begin
    perform extensions.http_set_curlopt('CURLOPT_TIMEOUT', '10');
    select * into r from extensions.http_get('https://www.okx.com/api/v5/market/tickers?instType=SWAP');
    j := r.content::jsonb;
    for t in select x from jsonb_array_elements(j->'data') x where x->>'instId' like '%-USDT-SWAP' and syms ? split_part(x->>'instId', '-', 1) loop
      perform mls_cf_upsert(t); n := n + 1;
    end loop;
  exception when others then raise warning '[cf_pull] %', sqlerrm; end;
  perform mls_cf_match();
  return n;
end $$;
revoke all on function mls_cf_pull() from public; revoke all on function mls_cf_fetch(text) from public;

-- ───────── 계산 ─────────
create or replace function mls_cf_liq(p_side text, p_entry numeric, p_lev int) returns numeric language sql stable as $$
  select case when p_side = 'long' then p_entry * (1 - 1.0 / p_lev + coalesce((mls_settings()->>'cfMaint')::numeric, 0.5) / 100)
    else p_entry * (1 + 1.0 / p_lev - coalesce((mls_settings()->>'cfMaint')::numeric, 0.5) / 100) end
$$;
create or replace function mls_cf_pos_j(p mls_cf_positions) returns jsonb language plpgsql stable as $$
declare px numeric; upnl numeric;
begin
  select last into px from mls_cf_prices where sym = p.sym; px := coalesce(px, p.entry);
  upnl := case when p.side = 'long' then (px - p.entry) * p.qty else (p.entry - px) * p.qty end;
  return jsonb_build_object('sym', p.sym, 'side', p.side, 'qty', p.qty::float8, 'entry', p.entry::float8, 'lev', p.lev, 'margin', p.margin::float8, 'tp', p.tp::float8, 'sl', p.sl::float8,
    'liq', mls_cf_liq(p.side, p.entry, p.lev)::float8, 'mark', px::float8, 'upnl', upnl::float8, 'roe', case when p.margin > 0 then (upnl / p.margin * 100)::float8 else 0 end, 'openedAt', mls_iso(p.opened_at));
end $$;
create or replace function mls_cf_order_j(o mls_cf_orders) returns jsonb language sql stable as $$
  select jsonb_build_object('id', o.id, 'sym', o.sym, 'side', o.side, 'type', o.type, 'price', o.price::float8, 'qty', o.qty::float8, 'lev', o.lev, 'reduceOnly', o.reduce_only, 'tp', o.tp::float8, 'sl', o.sl::float8,
    'status', o.status, 'fillPrice', o.fill_price::float8, 'reason', o.reason, 'createdAt', mls_iso(o.created_at), 'updatedAt', mls_iso(o.updated_at))
$$;
create or replace function mls_cf_flow(p_uid text, p_kind text, p_amt numeric, p_memo text default '', p_krw numeric default 0) returns void language sql as $$
  insert into mls_usdt_flows (user_id, kind, amount, krw, memo) values (p_uid, p_kind, p_amt, p_krw, left(coalesce(p_memo, ''), 200))
$$;

-- 체결 (단방향 포지션: 반대 방향 주문은 먼저 줄이고 남으면 반대로 진입)
create or replace function mls_cf_exec(p_oid text, p_px numeric, p_action text default 'trade') returns jsonb language plpgsql as $$
declare o mls_cf_orders; p mls_cf_positions; st jsonb := mls_settings(); fr numeric; fee numeric; rem numeric; cq numeric; pnl numeric := 0; rel numeric; need numeric; dir text; tot_pnl numeric := 0; tot_fee numeric := 0; bal numeric;
begin
  select * into o from mls_cf_orders where id = p_oid for update; if not found or o.status <> 'pending' then return null; end if;
  fr := (case when o.type = 'limit' and p_action = 'trade' then coalesce((st->>'cfMakerFee')::numeric, 0.02) else coalesce((st->>'cfTakerFee')::numeric, 0.05) end) / 100;
  dir := case when o.side = 'buy' then 'long' else 'short' end;
  select * into p from mls_cf_positions where user_id = o.user_id and sym = o.sym for update;
  rem := o.qty;
  -- 반대 포지션 축소
  if p.user_id is not null and p.side <> dir then
    cq := least(rem, p.qty);
    pnl := case when p.side = 'long' then (p_px - p.entry) * cq else (p.entry - p_px) * cq end;
    rel := p.margin * cq / p.qty; fee := p_px * cq * fr;
    update mls_users set usdt = usdt + rel + pnl - fee where id = o.user_id;
    insert into mls_cf_fills (id, user_id, order_id, sym, action, side, qty, price, fee, pnl) values (mls_uid('k'), o.user_id, o.id, o.sym, case when p_action = 'trade' then 'close' else p_action end, p.side, cq, p_px, fee, pnl);
    tot_pnl := pnl; tot_fee := fee;
    if cq >= p.qty then delete from mls_cf_positions where user_id = o.user_id and sym = o.sym; p := null;
    else update mls_cf_positions set qty = qty - cq, margin = margin - rel, updated_at = now() where user_id = o.user_id and sym = o.sym; end if;
    rem := rem - cq;
  end if;
  if rem > 0 and o.reduce_only then rem := 0; end if;
  -- 진입 / 추가
  if rem > 0 then
    need := p_px * rem / o.lev; fee := p_px * rem * fr;
    select usdt into bal from mls_users where id = o.user_id for update;
    if bal + 1e-9 < need + fee then
      if o.qty = rem then update mls_cf_orders set status = 'rejected', reason = '증거금이 부족합니다.', updated_at = now() where id = o.id; return jsonb_build_object('error', '증거금이 부족합니다.'); end if;
      rem := 0; -- 축소분만 체결
    end if;
  end if;
  if rem > 0 then
    update mls_users set usdt = usdt - need - fee where id = o.user_id;
    if p.user_id is not null then
      update mls_cf_positions set entry = (entry * qty + p_px * rem) / (qty + rem), qty = qty + rem, margin = margin + need, lev = o.lev, tp = coalesce(o.tp, tp), sl = coalesce(o.sl, sl), updated_at = now() where user_id = o.user_id and sym = o.sym;
    else
      insert into mls_cf_positions (user_id, sym, side, qty, entry, lev, margin, tp, sl) values (o.user_id, o.sym, dir, rem, p_px, o.lev, need, o.tp, o.sl);
    end if;
    insert into mls_cf_fills (id, user_id, order_id, sym, action, side, qty, price, fee, pnl) values (mls_uid('k'), o.user_id, o.id, o.sym, 'open', dir, rem, p_px, fee, 0);
    tot_fee := tot_fee + fee;
  end if;
  update mls_cf_orders set status = 'filled', fill_price = p_px, updated_at = now() where id = o.id;
  return jsonb_build_object('price', p_px::float8, 'qty', o.qty::float8, 'pnl', tot_pnl::float8, 'fee', tot_fee::float8, 'sym', o.sym, 'side', o.side);
end $$;

-- 포지션 강제 종료 (TP·SL·청산)
create or replace function mls_cf_close_pos(p_uid text, p_sym text, p_px numeric, p_action text) returns void language plpgsql as $$
declare p mls_cf_positions; oid text := mls_uid('c');
begin
  select * into p from mls_cf_positions where user_id = p_uid and sym = p_sym; if not found then return; end if;
  if p_action = 'liq' then
    -- 청산: 증거금 전액 손실 (수수료 없음)
    delete from mls_cf_positions where user_id = p_uid and sym = p_sym;
    insert into mls_cf_fills (id, user_id, order_id, sym, action, side, qty, price, fee, pnl) values (mls_uid('k'), p_uid, null, p_sym, 'liq', p.side, p.qty, p_px, 0, -p.margin);
    return;
  end if;
  insert into mls_cf_orders (id, user_id, sym, side, type, price, qty, lev, reduce_only, status, reason) values (oid, p_uid, p_sym, case when p.side = 'long' then 'sell' else 'buy' end, 'market', 0, p.qty, p.lev, true, 'pending', p_action);
  perform mls_cf_exec(oid, p_px, p_action);
end $$;

-- 주기 검사: 지정가 체결 · TP/SL · 청산 · 펀딩비 · 스테이킹 만기
create or replace function mls_cf_match() returns int language plpgsql as $$
declare r record; n int := 0; px numeric; liq numeric; lastf timestamptz; slot timestamptz;
begin
  for r in select o.id, o.side, o.price, c.last from mls_cf_orders o join mls_cf_prices c on c.sym = o.sym where o.status = 'pending' and o.type = 'limit' and c.updated_at > now() - interval '5 minutes' loop
    if (r.side = 'buy' and r.last <= r.price) or (r.side = 'sell' and r.last >= r.price) then perform mls_cf_exec(r.id, r.price, 'trade'); n := n + 1; end if;
  end loop;
  for r in select p.*, c.last from mls_cf_positions p join mls_cf_prices c on c.sym = p.sym where c.updated_at > now() - interval '5 minutes' loop
    liq := mls_cf_liq(r.side, r.entry, r.lev);
    if (r.side = 'long' and r.last <= liq) or (r.side = 'short' and r.last >= liq) then perform mls_cf_close_pos(r.user_id, r.sym, liq, 'liq'); n := n + 1;
    elsif r.sl is not null and ((r.side = 'long' and r.last <= r.sl) or (r.side = 'short' and r.last >= r.sl)) then perform mls_cf_close_pos(r.user_id, r.sym, r.last, 'sl'); n := n + 1;
    elsif r.tp is not null and ((r.side = 'long' and r.last >= r.tp) or (r.side = 'short' and r.last <= r.tp)) then perform mls_cf_close_pos(r.user_id, r.sym, r.last, 'tp'); n := n + 1;
    end if;
  end loop;
  -- 펀딩비 (8시간마다, 0.01% 고정 · 롱이 숏에게)
  slot := date_trunc('hour', now()) - make_interval(hours => extract(hour from now() at time zone 'UTC')::int % 8);
  select (v->>'t')::timestamptz into lastf from mls_kv where k = 'cf_funding';
  if lastf is null or lastf < slot then
    insert into mls_kv (k, v) values ('cf_funding', jsonb_build_object('t', slot)) on conflict (k) do update set v = excluded.v;
    if lastf is not null then
      for r in select p.user_id, p.sym, p.side, p.qty * c.last as notional from mls_cf_positions p join mls_cf_prices c on c.sym = p.sym loop
        px := r.notional * 0.0001 * case when r.side = 'long' then -1 else 1 end;
        update mls_users set usdt = usdt + px where id = r.user_id;
        perform mls_cf_flow(r.user_id, 'funding', px, r.sym || ' 펀딩비');
      end loop;
    end if;
  end if;
  -- 스테이킹 만기 지급
  for r in select * from mls_stakes where status = 'active' and ends_at <= now() loop
    px := round(r.amount * r.apr / 100 * r.days / 365, 6);
    update mls_stakes set status = 'matured', interest = px, closed_at = now() where id = r.id;
    update mls_users set usdt = usdt + r.amount + px where id = r.user_id;
    perform mls_cf_flow(r.user_id, 'stake_end', r.amount + px, r.name || ' 만기 (이자 ' || px || ')');
  end loop;
  return n;
end $$;

-- ───────── API ─────────
do $$ begin
  if (select prosrc from pg_proc where proname = 'mls_api' and pronamespace = 'public'::regnamespace) not like '%mls_api_v6(%' then
    drop function if exists mls_api_v6(text, jsonb, text);
    alter function mls_api(text, jsonb, text) rename to mls_api_v6;
  end if;
end $$;

create or replace function mls_api(p_action text, p_body jsonb default '{}'::jsonb, p_token text default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare b jsonb := coalesce(p_body, '{}'::jsonb); me mls_users; st jsonb; v_id text; px numeric; qty numeric; lev int; o mls_cf_orders; p mls_cf_positions; e jsonb; amt numeric; fx numeric; sp mls_stake_products; sk mls_stakes; v_sym text; tp numeric; sl numeric;
begin
  if p_action = 'cfMarkets' then
    return jsonb_build_object('ok', true, 'data', coalesce((select jsonb_agg(jsonb_build_object('sym', sym, 'last', last::float8, 'open24', open24::float8, 'high24', high24::float8, 'low24', low24::float8, 'vol24', vol24::float8, 'updatedAt', mls_iso(updated_at)) order by vol24 desc nulls last) from mls_cf_prices), '[]'::jsonb));
  end if;
  if p_action = 'stakeProducts' then
    return jsonb_build_object('ok', true, 'data', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'apr', apr::float8, 'days', days, 'min', min_amt::float8, 'max', max_amt::float8, 'active', active, 'badge', badge, 'descr', descr) order by sort) from mls_stake_products where active or p_body->>'all' = '1'), '[]'::jsonb));
  end if;
  if p_action not in ('cfState', 'cfConvert', 'cfOrder', 'cfCancel', 'cfClose', 'cfTpSl', 'stakeStart', 'stakeRedeem', 'cfAdmin', 'stakeAdmin', 'stakeSave', 'saveSettings', 'revenue', 'adminPoll') then return mls_api_v6(p_action, p_body, p_token); end if;
  if p_token ~ '^[a-f0-9]{64}$' then select x.* into me from mls_sessions s join mls_users x on x.id = s.user_id where s.token = p_token and s.expires_at > now() and x.status = 'active'; end if;
  if me.id is null then return jsonb_build_object('ok', false, 'error', '로그인이 필요합니다.'); end if;
  st := mls_settings();
  if p_action in ('cfAdmin', 'stakeAdmin', 'stakeSave') and me.role <> 'admin' then return jsonb_build_object('ok', false, 'error', '관리자 권한이 필요합니다.'); end if;
  case p_action
  when 'cfState' then
    perform mls_cf_match();
    select * into me from mls_users where id = me.id;
    return jsonb_build_object('ok', true, 'data', jsonb_build_object(
      'usdt', me.usdt::float8, 'cash', me.cash::float8, 'fx', mls_fx()::float8,
      'positions', coalesce((select jsonb_agg(mls_cf_pos_j(x) order by x.opened_at) from mls_cf_positions x where x.user_id = me.id), '[]'::jsonb),
      'orders', coalesce((select jsonb_agg(mls_cf_order_j(x) order by x.created_at desc) from (select * from mls_cf_orders where user_id = me.id order by created_at desc limit 200) x), '[]'::jsonb),
      'fills', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'sym', f.sym, 'action', f.action, 'side', f.side, 'qty', f.qty::float8, 'price', f.price::float8, 'fee', f.fee::float8, 'pnl', f.pnl::float8, 'at', mls_iso(f.at)) order by f.at desc) from (select * from mls_cf_fills where user_id = me.id order by at desc limit 300) f), '[]'::jsonb),
      'flows', coalesce((select jsonb_agg(jsonb_build_object('kind', w.kind, 'amount', w.amount::float8, 'krw', w.krw::float8, 'memo', w.memo, 'at', mls_iso(w.at)) order by w.at desc) from (select * from mls_usdt_flows where user_id = me.id order by at desc limit 200) w), '[]'::jsonb),
      'stakes', coalesce((select jsonb_agg(jsonb_build_object('id', k.id, 'productId', k.product_id, 'name', k.name, 'amount', k.amount::float8, 'apr', k.apr::float8, 'days', k.days, 'startedAt', mls_iso(k.started_at), 'endsAt', mls_iso(k.ends_at), 'status', k.status, 'interest', k.interest::float8,
        'accrued', case when k.status = 'active' then round(k.amount * k.apr / 100 * least(k.days, extract(epoch from now() - k.started_at) / 86400) / 365, 6)::float8 else k.interest::float8 end, 'closedAt', mls_iso(k.closed_at)) order by k.started_at desc) from mls_stakes k where k.user_id = me.id), '[]'::jsonb)));
  when 'cfConvert' then
    -- 원화 예수금 ↔ 가상 USDT (환율 = 원/달러)
    amt := round(coalesce((b->>'amount')::numeric, 0), 2); fx := mls_fx();
    if amt <= 0 then return jsonb_build_object('ok', false, 'error', '금액을 입력해 주세요.'); end if;
    if b->>'dir' = 'toUsdt' then
      if amt > mls_orderable(me.id) then return jsonb_build_object('ok', false, 'error', '전환 가능한 예수금이 부족합니다.'); end if;
      update mls_users set cash = cash - amt, usdt = usdt + round(amt / fx, 6) where id = me.id;
      perform mls_cf_flow(me.id, 'convert_in', round(amt / fx, 6), '원화 → USDT', amt);
    else
      if amt > me.usdt then return jsonb_build_object('ok', false, 'error', 'USDT 잔고가 부족합니다.'); end if;
      update mls_users set usdt = usdt - amt, cash = cash + round(amt * fx) where id = me.id;
      perform mls_cf_flow(me.id, 'convert_out', -amt, 'USDT → 원화', round(amt * fx));
    end if;
    return jsonb_build_object('ok', true, 'data', true);
  when 'cfOrder' then
    if not coalesce((st->>'cfEnabled')::boolean, true) then return jsonb_build_object('ok', false, 'error', '코인 선물 거래가 일시 중지되었습니다.'); end if;
    v_sym := upper(left(coalesce(b->>'sym', ''), 12));
    if not coalesce(st->'cfSymbols', '[]'::jsonb) ? v_sym then return jsonb_build_object('ok', false, 'error', '거래할 수 없는 종목입니다.'); end if;
    if coalesce(b->>'side', '') not in ('buy', 'sell') or coalesce(b->>'type', '') not in ('market', 'limit') then return jsonb_build_object('ok', false, 'error', '잘못된 주문입니다.'); end if;
    lev := greatest(1, least(coalesce((st->>'cfMaxLev')::int, 100), coalesce((b->>'lev')::int, 10)));
    qty := coalesce((b->>'qty')::numeric, 0); if qty <= 0 then return jsonb_build_object('ok', false, 'error', '수량을 입력해 주세요.'); end if;
    px := mls_cf_fetch(v_sym); if px is null then return jsonb_build_object('ok', false, 'error', '시세를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'); end if;
    if b->>'type' = 'limit' and not (coalesce((b->>'price')::numeric, 0) > 0) then return jsonb_build_object('ok', false, 'error', '주문 가격을 입력해 주세요.'); end if;
    if qty * px < coalesce((st->>'cfMinNotional')::numeric, 5) and not coalesce((b->>'reduceOnly')::boolean, false) then return jsonb_build_object('ok', false, 'error', '최소 주문 금액은 ' || coalesce(st->>'cfMinNotional', '5') || ' USDT입니다.'); end if;
    tp := nullif((b->>'tp')::numeric, 0); sl := nullif((b->>'sl')::numeric, 0);
    if tp is not null and ((b->>'side' = 'buy' and tp <= px) or (b->>'side' = 'sell' and tp >= px)) then return jsonb_build_object('ok', false, 'error', '익절가는 ' || case when b->>'side' = 'buy' then '현재가보다 높아야' else '현재가보다 낮아야' end || ' 합니다.'); end if;
    if sl is not null and ((b->>'side' = 'buy' and sl >= px) or (b->>'side' = 'sell' and sl <= px)) then return jsonb_build_object('ok', false, 'error', '손절가는 ' || case when b->>'side' = 'buy' then '현재가보다 낮아야' else '현재가보다 높아야' end || ' 합니다.'); end if;
    v_id := mls_uid('q');
    insert into mls_cf_orders (id, user_id, sym, side, type, price, qty, lev, reduce_only, tp, sl) values (v_id, me.id, v_sym, b->>'side', b->>'type', coalesce((b->>'price')::numeric, 0), qty, lev, coalesce((b->>'reduceOnly')::boolean, false), tp, sl);
    if b->>'type' = 'market' then
      e := mls_cf_exec(v_id, case when b->>'side' = 'buy' then coalesce((select nullif(ask, 0) from mls_cf_prices where sym = v_sym), px) else coalesce((select nullif(bid, 0) from mls_cf_prices where sym = v_sym), px) end, 'trade');
      if e ? 'error' then return jsonb_build_object('ok', false, 'error', e->>'error'); end if;
    else
      -- 지정가: 이미 유리한 가격이면 바로 체결, 아니면 대기 (증거금은 체결 시점에 확인)
      if (b->>'side' = 'buy' and px <= (b->>'price')::numeric) or (b->>'side' = 'sell' and px >= (b->>'price')::numeric) then e := mls_cf_exec(v_id, (b->>'price')::numeric, 'trade'); end if;
    end if;
    select * into o from mls_cf_orders where id = v_id;
    return jsonb_build_object('ok', true, 'data', jsonb_build_object('order', mls_cf_order_j(o), 'fill', e));
  when 'cfCancel' then
    update mls_cf_orders set status = 'cancelled', updated_at = now() where user_id = me.id and status = 'pending' and (id = b->>'id' or (b->>'all' = '1'));
    return jsonb_build_object('ok', true, 'data', true);
  when 'cfClose' then
    select * into p from mls_cf_positions where user_id = me.id and sym = upper(b->>'sym'); if not found then return jsonb_build_object('ok', false, 'error', '포지션이 없습니다.'); end if;
    px := mls_cf_fetch(p.sym); if px is null then return jsonb_build_object('ok', false, 'error', '시세를 불러오지 못했습니다.'); end if;
    qty := least(p.qty, coalesce(nullif((b->>'qty')::numeric, 0), p.qty)); v_id := mls_uid('q');
    insert into mls_cf_orders (id, user_id, sym, side, type, price, qty, lev, reduce_only) values (v_id, me.id, p.sym, case when p.side = 'long' then 'sell' else 'buy' end, 'market', 0, qty, p.lev, true);
    e := mls_cf_exec(v_id, px, 'trade');
    return jsonb_build_object('ok', true, 'data', e);
  when 'cfTpSl' then
    update mls_cf_positions set tp = nullif((b->>'tp')::numeric, 0), sl = nullif((b->>'sl')::numeric, 0), updated_at = now() where user_id = me.id and sym = upper(b->>'sym');
    if not found then return jsonb_build_object('ok', false, 'error', '포지션이 없습니다.'); end if;
    return jsonb_build_object('ok', true, 'data', true);
  when 'stakeStart' then
    if not coalesce((st->>'stakeEnabled')::boolean, true) then return jsonb_build_object('ok', false, 'error', '스테이킹이 일시 중지되었습니다.'); end if;
    select * into sp from mls_stake_products where id = b->>'productId' and active; if not found then return jsonb_build_object('ok', false, 'error', '상품을 선택해 주세요.'); end if;
    amt := round(coalesce((b->>'amount')::numeric, 0), 6);
    if amt < sp.min_amt or amt > sp.max_amt then return jsonb_build_object('ok', false, 'error', '예치 금액은 ' || sp.min_amt::float8 || ' ~ ' || sp.max_amt::float8 || ' USDT입니다.'); end if;
    if amt > me.usdt then return jsonb_build_object('ok', false, 'error', 'USDT 잔고가 부족합니다.'); end if;
    update mls_users set usdt = usdt - amt where id = me.id;
    v_id := mls_uid('t');
    insert into mls_stakes (id, user_id, product_id, name, amount, apr, days, ends_at) values (v_id, me.id, sp.id, sp.name, amt, sp.apr, sp.days, now() + make_interval(days => sp.days));
    perform mls_cf_flow(me.id, 'stake', -amt, sp.name || ' 예치');
    return jsonb_build_object('ok', true, 'data', v_id);
  when 'stakeRedeem' then
    -- 중도 해지: 원금만 반환 (이자 없음)
    select * into sk from mls_stakes where id = b->>'id' and user_id = me.id and status = 'active' for update; if not found then return jsonb_build_object('ok', false, 'error', '해지할 수 없는 예치입니다.'); end if;
    update mls_stakes set status = 'redeemed', interest = 0, closed_at = now() where id = sk.id;
    update mls_users set usdt = usdt + sk.amount where id = me.id;
    perform mls_cf_flow(me.id, 'stake_redeem', sk.amount, sk.name || ' 중도 해지 (원금만 반환)');
    return jsonb_build_object('ok', true, 'data', true);
  when 'cfAdmin' then
    perform mls_cf_match();
    return jsonb_build_object('ok', true, 'data', jsonb_build_object(
      'positions', coalesce((select jsonb_agg(mls_cf_pos_j(x) || jsonb_build_object('userId', x.user_id, 'name', u.name, 'username', u.username) order by x.margin desc) from mls_cf_positions x join mls_users u on u.id = x.user_id), '[]'::jsonb),
      'fills', coalesce((select jsonb_agg(jsonb_build_object('sym', f.sym, 'action', f.action, 'side', f.side, 'qty', f.qty::float8, 'price', f.price::float8, 'fee', f.fee::float8, 'pnl', f.pnl::float8, 'at', mls_iso(f.at), 'name', u.name) order by f.at desc) from (select * from mls_cf_fills order by at desc limit 300) f join mls_users u on u.id = f.user_id), '[]'::jsonb),
      'pending', (select count(*) from mls_cf_orders where status = 'pending'),
      'fees', coalesce((select sum(fee) from mls_cf_fills), 0)::float8, 'liqs', (select count(*) from mls_cf_fills where action = 'liq'),
      'usdtTotal', coalesce((select sum(usdt) from mls_users), 0)::float8, 'prices', (select count(*) from mls_cf_prices where updated_at > now() - interval '5 minutes')));
  when 'stakeAdmin' then
    return jsonb_build_object('ok', true, 'data', jsonb_build_object(
      'products', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'apr', apr::float8, 'days', days, 'min', min_amt::float8, 'max', max_amt::float8, 'active', active, 'badge', badge, 'descr', descr, 'sort', sort) order by sort) from mls_stake_products), '[]'::jsonb),
      'stakes', coalesce((select jsonb_agg(jsonb_build_object('id', k.id, 'name', k.name, 'amount', k.amount::float8, 'apr', k.apr::float8, 'days', k.days, 'startedAt', mls_iso(k.started_at), 'endsAt', mls_iso(k.ends_at), 'status', k.status, 'interest', k.interest::float8, 'user', u.name, 'username', u.username) order by k.started_at desc) from mls_stakes k join mls_users u on u.id = k.user_id), '[]'::jsonb)));
  when 'stakeSave' then
    if jsonb_typeof(b->'products') <> 'array' then return jsonb_build_object('ok', false, 'error', '상품 목록이 필요합니다.'); end if;
    insert into mls_stake_products (id, name, apr, days, min_amt, max_amt, active, sort, badge, descr)
      select left(coalesce(nullif(g->>'id', ''), 'st' || ord), 20), left(coalesce(g->>'name', '스테이킹'), 40), greatest(0, coalesce((g->>'apr')::numeric, 0)), greatest(1, least(3650, coalesce((g->>'days')::int, 30))),
        greatest(0, coalesce((g->>'min')::numeric, 10)), greatest(1, coalesce((g->>'max')::numeric, 100000)), coalesce((g->>'active')::boolean, true), ord, left(coalesce(g->>'badge', ''), 10), left(coalesce(g->>'descr', ''), 200)
      from jsonb_array_elements(b->'products') with ordinality t(g, ord)
    on conflict (id) do update set name = excluded.name, apr = excluded.apr, days = excluded.days, min_amt = excluded.min_amt, max_amt = excluded.max_amt, active = excluded.active, sort = excluded.sort, badge = excluded.badge, descr = excluded.descr;
    delete from mls_stake_products where id not in (select left(coalesce(nullif(g->>'id', ''), 'st' || ord), 20) from jsonb_array_elements(b->'products') with ordinality t(g, ord)) and id not in (select product_id from mls_stakes where status = 'active');
    insert into mls_audit (at, by_user, action, detail) values (now(), me.username, 'stakeSave', jsonb_array_length(b->'products') || '개 상품');
    return jsonb_build_object('ok', true, 'data', true);
  when 'saveSettings' then
    if me.role <> 'admin' then return jsonb_build_object('ok', false, 'error', '관리자 권한이 필요합니다.'); end if;
    e := '{}'::jsonb;
    if b ? 'cfEnabled' then e := e || jsonb_build_object('cfEnabled', coalesce((b->>'cfEnabled')::boolean, true)); end if;
    if b ? 'stakeEnabled' then e := e || jsonb_build_object('stakeEnabled', coalesce((b->>'stakeEnabled')::boolean, true)); end if;
    if b ? 'cfMaxLev' then e := e || jsonb_build_object('cfMaxLev', greatest(1, least(125, coalesce((b->>'cfMaxLev')::int, 100)))); end if;
    if b ? 'cfMakerFee' then e := e || jsonb_build_object('cfMakerFee', greatest(0, least(1, coalesce((b->>'cfMakerFee')::numeric, 0.02)))); end if;
    if b ? 'cfTakerFee' then e := e || jsonb_build_object('cfTakerFee', greatest(0, least(1, coalesce((b->>'cfTakerFee')::numeric, 0.05)))); end if;
    if b ? 'cfMaint' then e := e || jsonb_build_object('cfMaint', greatest(0.1, least(10, coalesce((b->>'cfMaint')::numeric, 0.5)))); end if;
    if b ? 'cfMinNotional' then e := e || jsonb_build_object('cfMinNotional', greatest(0, coalesce((b->>'cfMinNotional')::numeric, 5))); end if;
    if b ? 'cfSymbols' and jsonb_typeof(b->'cfSymbols') = 'array' then e := e || jsonb_build_object('cfSymbols', (select coalesce(jsonb_agg(distinct upper(x)), '[]'::jsonb) from jsonb_array_elements_text(b->'cfSymbols') x where x ~ '^[A-Za-z0-9]{1,12}$')); end if;
    if e <> '{}'::jsonb then insert into mls_kv (k, v) values ('settings', mls_settings() || e) on conflict (k) do update set v = excluded.v; end if;
    b := b - 'cfEnabled' - 'stakeEnabled' - 'cfMaxLev' - 'cfMakerFee' - 'cfTakerFee' - 'cfMaint' - 'cfMinNotional' - 'cfSymbols';
    if b = '{}'::jsonb then return jsonb_build_object('ok', true, 'data', mls_settings()); end if;
    return mls_api_v6(p_action, b, p_token);
  when 'revenue' then
    e := mls_api_v6(p_action, p_body, p_token);
    if (e->>'ok')::boolean then e := jsonb_set(e, '{data,total,cfFee}', to_jsonb(coalesce((select sum(fee) from mls_cf_fills), 0)::float8)); end if;
    return e;
  when 'adminPoll' then
    e := mls_api_v6(p_action, p_body, p_token);
    if (e->>'ok')::boolean then
      e := jsonb_set(e, '{data,liquidations}', coalesce(e->'data'->'liquidations', '[]'::jsonb) || coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'at', mls_iso(f.at), 'name', u.name || ' · ' || f.sym || ' 선물', 'amount', round(abs(f.pnl) * mls_fx())::float8)) from mls_cf_fills f join mls_users u on u.id = f.user_id where f.action = 'liq' and f.at > now() - interval '1 day'), '[]'::jsonb));
    end if;
    return e;
  end case;
  return null;
exception
  when sqlstate 'P0001' then return jsonb_build_object('ok', false, 'error', sqlerrm);
  when others then raise warning '[mls7] % %', sqlstate, sqlerrm; return jsonb_build_object('ok', false, 'error', '서버 오류가 발생했습니다.');
end $$;
revoke all on function mls_api_v6(text, jsonb, text) from public;
revoke all on function mls_api(text, jsonb, text) from public;
do $$ begin if exists (select 1 from pg_roles where rolname = 'anon') then
  revoke all on function mls_api_v6(text, jsonb, text) from anon, authenticated;
  grant execute on function mls_api(text, jsonb, text) to anon, authenticated;
end if; end $$;

-- 15초마다 코인 시세 갱신 + 체결·청산·만기 검사
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'mls-cf';
    begin perform cron.schedule('mls-cf', '15 seconds', 'select public.mls_cf_pull()');
    exception when others then perform cron.schedule('mls-cf', '* * * * *', 'select public.mls_cf_pull()'); end;
  end if;
exception when others then null; end $$;
select 'v7 설치 완료' as result;
