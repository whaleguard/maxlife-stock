-- MAX라이프 주식 v8 — 운영 기능 확장
-- 머니 로그(모든 잔고 변동 자동 기록), IP·기기 차단, 접속 중 회원, 인수인계, 팝업, FAQ, 약관, 메시지 템플릿, 공지 동의,
-- 투자 대회, 미션, 페이지 통계, 날짜별·회원별 통계, OCO(손절·익절 묶음), 점검 시간, 파트너(지사)·하부 파트너·수수료 정산
-- v7.sql 다음에 실행 (여러 번 실행해도 안전)

alter table mls_users add column if not exists last_seen timestamptz;
alter table mls_users add column if not exists partner_id text;
alter table mls_users add column if not exists device text;
alter table mls_logins add column if not exists device text;
alter table mls_orders add column if not exists oco text;
alter table mls_notices add column if not exists need_consent boolean not null default false;

create table if not exists mls_money_log (id bigserial primary key, user_id text not null, asset text not null, delta numeric(24,6) not null, balance numeric(24,6) not null, ctx text default '', at timestamptz not null default now());
create index if not exists mls_money_log_u on mls_money_log(user_id, at desc);
create table if not exists mls_blocks (id bigserial primary key, kind text not null check (kind in ('ip', 'device')), value text not null, memo text default '', by_user text default '', at timestamptz not null default now(), unique (kind, value));
create table if not exists mls_handover (id bigserial primary key, body text not null, by_user text not null, done boolean not null default false, done_by text, at timestamptz not null default now());
create table if not exists mls_popups (id text primary key, title text not null, body text default '', image text default '', link text default '', starts_at timestamptz, ends_at timestamptz, active boolean not null default true, sort int not null default 0, at timestamptz not null default now());
create table if not exists mls_faqs (id text primary key, cat text default '일반', q text not null, a text not null, sort int not null default 0);
create table if not exists mls_terms (k text primary key, title text not null, body text not null default '', updated_at timestamptz not null default now());
create table if not exists mls_templates (id text primary key, title text not null, body text not null, kind text default 'answer', sort int not null default 0);
create table if not exists mls_consents (notice_id text not null, user_id text not null, at timestamptz not null default now(), primary key (notice_id, user_id));
create table if not exists mls_contests (id text primary key, title text not null, descr text default '', prize text default '', starts_at timestamptz not null, ends_at timestamptz not null, max_users int default 0, status text not null default 'open', created_at timestamptz not null default now());
create table if not exists mls_contest_entries (contest_id text not null, user_id text not null, start_net numeric(20,2) not null, joined_at timestamptz not null default now(), final_net numeric(20,2), final_pct numeric(12,4), rank int, primary key (contest_id, user_id));
create table if not exists mls_missions (id text primary key, title text not null, descr text default '', kind text not null, target numeric not null default 1, reward numeric(20,2) not null default 0, active boolean not null default true, sort int not null default 0);
create table if not exists mls_mission_claims (mission_id text not null, user_id text not null, reward numeric(20,2) not null, at timestamptz not null default now(), primary key (mission_id, user_id));
create table if not exists mls_pageviews (d date not null, page text not null, n int not null default 0, primary key (d, page));
create table if not exists mls_partners (id text primary key, name text not null, code text not null unique, parent_id text, level int not null default 1, username text not null unique, pw text not null,
  rate_sub numeric(6,3) not null default 0, rate_charge numeric(6,3) not null default 0, balance numeric(20,2) not null default 0, withdrawn numeric(20,2) not null default 0, status text not null default 'active',
  phone text default '', memo text default '', created_at timestamptz not null default now());
create table if not exists mls_psessions (token text primary key, partner_id text not null, expires_at timestamptz not null);
create table if not exists mls_partner_comm (id bigserial primary key, partner_id text not null, user_id text not null, kind text not null, ref_id text, base numeric(20,2) not null, rate numeric(6,3) not null, amount numeric(20,2) not null, at timestamptz not null default now());
create index if not exists mls_partner_comm_p on mls_partner_comm(partner_id, at desc);
create table if not exists mls_partner_wd (id text primary key, partner_id text not null, amount numeric(20,2) not null, bank text default '', status text not null default 'pending', memo text default '', admin_memo text default '', created_at timestamptz not null default now(), processed_at timestamptz, processed_by text);
create table if not exists mls_partner_inq (id text primary key, partner_id text not null, title text not null, body text default '', answer text default '', status text not null default 'open', created_at timestamptz not null default now(), answered_at timestamptz);
do $$ declare t text; begin
  foreach t in array array['mls_money_log', 'mls_blocks', 'mls_handover', 'mls_popups', 'mls_faqs', 'mls_terms', 'mls_templates', 'mls_consents', 'mls_contests', 'mls_contest_entries', 'mls_missions', 'mls_mission_claims', 'mls_pageviews', 'mls_partners', 'mls_psessions', 'mls_partner_comm', 'mls_partner_wd', 'mls_partner_inq'] loop
    execute format('alter table %I enable row level security', t); execute format('revoke all on %I from public', t);
    if exists (select 1 from pg_roles where rolname = 'anon') then execute format('revoke all on %I from anon, authenticated', t); end if;
  end loop;
end $$;

-- 기본 데이터
insert into mls_faqs (id, cat, q, a, sort) values
  ('f1', '입출금', '충전은 어떻게 하나요?', '입출금 메뉴에서 수단을 고르고 신청하면 관리자 승인 후 예수금에 반영됩니다.', 1),
  ('f2', 'MAX 버프', 'MAX 버프는 무엇인가요?', '순자산의 1~3배를 지원받아 더 크게 투자하는 기능입니다. 담보비율이 등급별 기준 아래로 내려가면 자동 청산됩니다.', 2),
  ('f3', '주문', '감시주문은 어떻게 쓰나요?', '종목 주문 화면에서 감시주문을 고르고 가격과 조건을 정하면 현재가가 그 가격에 닿을 때 시장가로 자동 주문됩니다.', 3),
  ('f4', '코인 선물', '코인 선물은 실제 코인 거래인가요?', '아닙니다. 실제 시세로 체결되는 가상 USDT 거래입니다. 실제 코인이나 현금으로 지급되지 않습니다.', 4),
  ('f5', '스테이킹', '스테이킹 이자는 언제 받나요?', '만기일에 원금과 이자가 가상 USDT 지갑으로 들어옵니다. 중도 해지하면 원금만 돌려받습니다.', 5)
on conflict (id) do nothing;
insert into mls_terms (k, title, body) values
  ('terms', '이용약관', 'MAX라이프 주식 이용약관 본문을 관리자 화면에서 입력하세요.'),
  ('privacy', '개인정보처리방침', '개인정보처리방침 본문을 관리자 화면에서 입력하세요.'),
  ('risk', '가상 자산·투자 위험 고지', '이 서비스의 예수금·USDT·포인트는 앱 안에서만 쓰는 가상 자산이며 실제 현금·코인으로 지급되지 않습니다. 시세는 실제 시장 시세를 사용하지만 체결은 가상으로 처리됩니다. 화면의 분석·추천은 투자 권유가 아닙니다.')
on conflict (k) do nothing;
insert into mls_templates (id, title, body, kind, sort) values
  ('t1', '입금 확인', '안녕하세요. 신청하신 충전이 확인되어 예수금에 반영되었습니다. 이용해 주셔서 감사합니다.', 'answer', 1),
  ('t2', '확인 중', '문의 주셔서 감사합니다. 확인 후 빠르게 안내드리겠습니다.', 'answer', 2),
  ('t3', '이벤트 안내', '이번 주 MAX 리딩 이벤트에 참여해 보세요. 자세한 내용은 공지를 확인해 주세요.', 'message', 3)
on conflict (id) do nothing;
insert into mls_missions (id, title, descr, kind, target, reward, sort) values
  ('m_first', '첫 매매 하기', '아무 종목이나 처음 체결해 보세요', 'trades', 1, 100000, 1),
  ('m_t10', '10번 매매', '누적 체결 10회', 'trades', 10, 300000, 2),
  ('m_ai', 'AI 분석 써보기', 'MAX AI로 종목 1개 분석', 'ai', 1, 50000, 3),
  ('m_watch', '관심종목 5개', '관심종목 5개 등록', 'watch', 5, 50000, 4),
  ('m_cf', '코인 선물 첫 거래', '코인 선물 1회 체결', 'cf', 1, 100000, 5)
on conflict (id) do nothing;

-- ───────── 머니 로그 (잔고 변동 자동 기록) ─────────
create or replace function mls_money_trg() returns trigger language plpgsql as $$
declare c text := coalesce(nullif(current_setting('mls.ctx', true), ''), '자동 처리');
begin
  if new.cash is distinct from old.cash then insert into mls_money_log (user_id, asset, delta, balance, ctx) values (new.id, 'KRW', new.cash - old.cash, new.cash, c); end if;
  if new.usdt is distinct from old.usdt then insert into mls_money_log (user_id, asset, delta, balance, ctx) values (new.id, 'USDT', new.usdt - old.usdt, new.usdt, c); end if;
  return new;
end $$;
drop trigger if exists mls_money on mls_users;
create trigger mls_money after update of cash, usdt on mls_users for each row execute function mls_money_trg();

-- ───────── OCO: 같은 묶음의 주문 하나가 체결되면 나머지 자동 취소 ─────────

-- 주문 JSON에 OCO 묶음 표시 (이용자 화면에서 묶음 매도 수량을 한 번만 잡도록)
create or replace function mls_order_j(o mls_orders) returns jsonb language sql stable as $$
  select jsonb_build_object('id', o.id, 'userId', o.user_id, 'code', o.code, 'name', o.name, 'side', o.side, 'type', o.type, 'price', o.price::float8, 'qty', o.qty, 'filled', o.filled,
    'avgFill', o.avg_fill::float8, 'status', o.status, 'currency', o.currency, 'amended', o.amended, 'reason', o.reason, 'triggerPrice', o.trigger_price::float8, 'triggerCond', o.trigger_cond,
    'oco', o.oco, 'createdAt', mls_iso(o.created_at), 'updatedAt', mls_iso(o.updated_at))
$$;
create or replace function mls_oco_trg() returns trigger language plpgsql as $$
begin
  if new.status = 'filled' and old.status = 'pending' and new.oco is not null then
    update mls_orders set status = 'cancelled', reason = '연결 주문 체결로 자동 취소', updated_at = now() where oco = new.oco and id <> new.id and status = 'pending';
  end if;
  return new;
end $$;
drop trigger if exists mls_oco on mls_orders;
create trigger mls_oco after update of status on mls_orders for each row execute function mls_oco_trg();

-- ───────── 파트너 수수료 (서비스 매출 기준: AI 구독료 · 충전액) ─────────
-- 회원의 담당 파트너가 자기 비율만큼, 상위 파트너는 (자기 비율 - 하위 비율) 차이만큼 받습니다.
create or replace function mls_partner_accrue(p_uid text, p_kind text, p_ref text, p_base numeric) returns void language plpgsql as $$
declare pid text; p mls_partners; prev numeric := 0; r numeric; amt numeric; guard int := 0;
begin
  select partner_id into pid from mls_users where id = p_uid;
  while pid is not null and guard < 10 loop
    guard := guard + 1;
    select * into p from mls_partners where id = pid; exit when not found;
    r := case when p_kind = 'sub' then p.rate_sub else p.rate_charge end;
    if p.status = 'active' and r > prev then
      amt := round(p_base * (r - prev) / 100);
      if amt > 0 then
        update mls_partners set balance = balance + amt where id = p.id;
        insert into mls_partner_comm (partner_id, user_id, kind, ref_id, base, rate, amount) values (p.id, p_uid, p_kind, p_ref, p_base, r - prev, amt);
      end if;
    end if;
    prev := greatest(prev, r); pid := p.parent_id;
  end loop;
end $$;
create or replace function mls_cash_comm_trg() returns trigger language plpgsql as $$
begin
  if new.status = 'approved' and old.status = 'pending' and new.type = 'deposit' and coalesce(new.method, 'cash') <> 'admin' and coalesce(new.memo, '') not like '[관리자%' then
    perform mls_partner_accrue(new.user_id, 'charge', new.id, new.amount);
  end if;
  return new;
end $$;
drop trigger if exists mls_cash_comm on mls_cashflows;
create trigger mls_cash_comm after update of status on mls_cashflows for each row execute function mls_cash_comm_trg();
create or replace function mls_sub_comm_trg() returns trigger language plpgsql as $$
begin
  if new.status = 'active' and old.status = 'pending' and new.price > 0 then perform mls_partner_accrue(new.user_id, 'sub', new.id, new.price); end if;
  return new;
end $$;
drop trigger if exists mls_sub_comm on mls_subs;
create trigger mls_sub_comm after update of status on mls_subs for each row execute function mls_sub_comm_trg();

create or replace function mls_partner_j(p mls_partners) returns jsonb language sql stable as $$
  select jsonb_build_object('id', p.id, 'name', p.name, 'code', p.code, 'parentId', p.parent_id, 'level', p.level, 'username', p.username, 'rateSub', p.rate_sub::float8, 'rateCharge', p.rate_charge::float8,
    'balance', p.balance::float8, 'withdrawn', p.withdrawn::float8, 'status', p.status, 'phone', p.phone, 'memo', p.memo, 'createdAt', mls_iso(p.created_at),
    'users', (select count(*) from mls_users u where u.partner_id = p.id), 'subs', (select count(*) from mls_partners c where c.parent_id = p.id))
$$;
-- 파트너 하위 트리 (자기 포함)
create or replace function mls_partner_tree(p_id text) returns setof text language sql stable as $$
  with recursive t(id, depth) as (select p_id, 0 union all select c.id, t.depth + 1 from mls_partners c join t on c.parent_id = t.id where t.depth < 10) select id from t
$$;

-- 미션 진행도
create or replace function mls_mission_progress(p_uid text, p_kind text) returns numeric language sql stable as $$
  select case p_kind
    when 'trades' then (select count(*) from mls_fills where user_id = p_uid)::numeric
    when 'ai' then (select coalesce(sum(n), 0) from mls_ai_usage where user_id = p_uid)::numeric
    when 'watch' then (select coalesce(jsonb_array_length(watch), 0) from mls_users where id = p_uid)::numeric
    when 'cf' then (select count(*) from mls_cf_fills where user_id = p_uid)::numeric
    when 'deposit' then (select count(*) from mls_cashflows where user_id = p_uid and type = 'deposit' and status = 'approved')::numeric
    when 'login' then (select count(distinct (at at time zone 'Asia/Seoul')::date) from mls_logins where user_id = p_uid)::numeric
    else 0 end
$$;

-- ───────── API ─────────

-- ───────── 국내 주식 실시간 시세 (네이버 실시간 시세, 2초 캐시) ─────────
create table if not exists mls_rt (code text primary key, d jsonb not null, at timestamptz not null default now());
create or replace function mls_rt_num(t text) returns numeric language sql immutable as $$ select nullif(regexp_replace(coalesce(t, ''), '[^0-9.\-]', '', 'g'), '')::numeric $$;
create or replace function mls_rt_get(p_codes text[]) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare need text[]; r extensions.http_response; j jsonb; x jsonb; px numeric;
begin
  p_codes := array(select distinct c from unnest(p_codes) c where c ~ '^[0-9A-Z]{6}$' limit 40);
  need := array(select c from unnest(p_codes) c where not exists (select 1 from mls_rt t where t.code = c and t.at > now() - interval '2 seconds'));
  if array_length(need, 1) > 0 then
    begin
      perform extensions.http_set_curlopt('CURLOPT_TIMEOUT', '3');
      select * into r from extensions.http_get('https://polling.finance.naver.com/api/realtime/domestic/stock/' || array_to_string(need, ','));
      j := r.content::jsonb;
      for x in select * from jsonb_array_elements(coalesce(j->'datas', '[]'::jsonb)) loop
        px := mls_rt_num(x->>'closePrice'); if px is null or px <= 0 then continue; end if;
        insert into mls_rt (code, d, at) values (x->>'itemCode', jsonb_build_object('price', px, 'open', mls_rt_num(x->>'openPrice'), 'high', mls_rt_num(x->>'highPrice'), 'low', mls_rt_num(x->>'lowPrice'),
          'volume', mls_rt_num(x->>'accumulatedTradingVolume'), 'change', mls_rt_num(x->>'compareToPreviousClosePrice'),
          'changePct', mls_rt_num(x->>'fluctuationsRatio'), 'status', x->>'marketStatus', 'at', mls_iso(now())), now())
          on conflict (code) do update set d = excluded.d, at = excluded.at;
        -- 주문 체결 기준가도 실시간으로
        update mls_quotes set price = px, at = now() where code = x->>'itemCode' and price is distinct from px;
      end loop;
    exception when others then null; end;
  end if;
  return coalesce((select jsonb_object_agg(code, d) from mls_rt where code = any(p_codes)), '{}'::jsonb);
end $$;
revoke all on function mls_rt_get(text[]) from public;

do $$ begin
  if (select prosrc from pg_proc where proname = 'mls_api' and pronamespace = 'public'::regnamespace) not like '%mls_api_v7(%' then
    drop function if exists mls_api_v7(text, jsonb, text);
    alter function mls_api(text, jsonb, text) rename to mls_api_v7;
  end if;
end $$;

create or replace function mls_api(p_action text, p_body jsonb default '{}'::jsonb, p_token text default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare b jsonb := coalesce(p_body, '{}'::jsonb); me mls_users; pa mls_partners; st jsonb := mls_settings(); e jsonb; v_id text; v_ip text := mls_req_ip(); sb jsonb; hm int; s0 int; s1 int; v_n int; x record; v_code text; amt numeric;
begin
  perform set_config('mls.ctx', p_action, true);
  -- 공개(로그인 불필요)
  if p_action in ('signup', 'login') then
    if exists (select 1 from mls_blocks where (kind = 'ip' and value = v_ip) or (kind = 'device' and value = nullif(b->>'device', ''))) then
      return jsonb_build_object('ok', false, 'error', '접속이 제한된 환경입니다. 고객센터로 문의해 주세요.');
    end if;
    if p_action = 'signup' and coalesce(b->>'ref', '') <> '' and not exists (select 1 from mls_partners where code = upper(b->>'ref') and status = 'active') then
      return jsonb_build_object('ok', false, 'error', '추천 코드를 확인해 주세요.');
    end if;
    e := mls_api_v7(p_action, p_body, p_token);
    if (e->>'ok')::boolean then
      v_id := e->'data'->'user'->>'id';
      if p_action = 'signup' and coalesce(b->>'ref', '') <> '' then update mls_users set partner_id = (select id from mls_partners where code = upper(b->>'ref')) where id = v_id; end if;
      if coalesce(b->>'device', '') <> '' then
        update mls_users set device = left(b->>'device', 64) where id = v_id;
        update mls_logins set device = left(b->>'device', 64) where id = (select max(id) from mls_logins where user_id = v_id);
      end if;
    end if;
    return e;
  end if;
  if p_action = 'publicInfo' then
    return jsonb_build_object('ok', true, 'data', jsonb_build_object(
      'popups', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'title', title, 'body', body, 'image', image, 'link', link) order by sort) from mls_popups where active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now())), '[]'::jsonb),
      'faqs', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'cat', cat, 'q', q, 'a', a) order by sort) from mls_faqs), '[]'::jsonb),
      'terms', coalesce((select jsonb_object_agg(k, jsonb_build_object('title', title, 'body', body, 'updatedAt', mls_iso(updated_at))) from mls_terms), '{}'::jsonb),
      'service', coalesce(st->'serviceBlock', '{}'::jsonb)));
  end if;
  if p_action = 'rt' then
    return jsonb_build_object('ok', true, 'data', mls_rt_get(array(select jsonb_array_elements_text(case when jsonb_typeof(b->'codes') = 'array' then b->'codes' else '[]'::jsonb end))));
  end if;
  if p_action = 'pv' then
    insert into mls_pageviews (d, page, n) select (now() at time zone 'Asia/Seoul')::date, left(x2->>'p', 40), least(100, greatest(1, coalesce((x2->>'n')::int, 1))) from jsonb_array_elements(case when jsonb_typeof(b->'items') = 'array' then b->'items' else '[]'::jsonb end) x2
      on conflict (d, page) do update set n = mls_pageviews.n + excluded.n;
    return jsonb_build_object('ok', true, 'data', true);
  end if;
  -- 파트너 포털
  if p_action like 'p\_%' escape '\' then return mls_partner_api(p_action, b, p_token); end if;

  if p_token ~ '^[a-f0-9]{64}$' then select x2.* into me from mls_sessions s join mls_users x2 on x2.id = s.user_id where s.token = p_token and s.expires_at > now() and x2.status = 'active'; end if;
  -- 접속 중 표시 + IP 차단 확인
  if me.id is not null then
    if me.last_seen is null or me.last_seen < now() - interval '50 seconds' then update mls_users set last_seen = now() where id = me.id; end if;
    if me.role <> 'admin' and exists (select 1 from mls_blocks where (kind = 'ip' and value = v_ip) or (kind = 'device' and value = me.device)) then
      delete from mls_sessions where token = p_token; return jsonb_build_object('ok', false, 'error', '접속이 제한되었습니다. 고객센터로 문의해 주세요.');
    end if;
    -- 점검 시간: 이용자 주문·충전 차단
    sb := st->'serviceBlock';
    if me.role = 'user' and coalesce((sb->>'enabled')::boolean, false) and p_action in ('placeOrder', 'amendOrder', 'cfOrder', 'requestCash', 'requestBuff', 'stakeStart', 'cfConvert') then
      hm := extract(hour from now() at time zone 'Asia/Seoul') * 60 + extract(minute from now() at time zone 'Asia/Seoul');
      s0 := split_part(coalesce(sb->>'start', '00:00'), ':', 1)::int * 60 + split_part(coalesce(sb->>'start', '00:00'), ':', 2)::int;
      s1 := split_part(coalesce(sb->>'end', '00:00'), ':', 1)::int * 60 + split_part(coalesce(sb->>'end', '00:00'), ':', 2)::int;
      if (s0 <= s1 and hm >= s0 and hm < s1) or (s0 > s1 and (hm >= s0 or hm < s1)) then return jsonb_build_object('ok', false, 'error', coalesce(nullif(sb->>'message', ''), '점검 시간입니다. 잠시 후 이용해 주세요.')); end if;
    end if;
  end if;
  -- 익절·손절 연결 주문(OCO): 한쪽이 체결되면 나머지 자동 취소
  if p_action = 'placeOrder' and coalesce(b->>'oco', '') <> '' and me.id is not null then
    -- 같은 묶음의 기존 매도 주문은 수량 예약에서 잠시 제외 (둘 중 하나만 체결되므로)
    update mls_orders set status = 'rejected', reason = '__ocohold' where user_id = me.id and oco = left(b->>'oco', 40) and status = 'pending';
    e := mls_api_v7(p_action, p_body, p_token);
    update mls_orders set status = 'pending', reason = '' where user_id = me.id and oco = left(b->>'oco', 40) and reason = '__ocohold';
    if (e->>'ok')::boolean then update mls_orders set oco = left(b->>'oco', 40) where id = e->'data'->'order'->>'id' and user_id = me.id; end if;
    return e;
  end if;
  if p_action not in ('consents', 'consent', 'missions', 'claimMission', 'contests', 'joinContest', 'contestRank', 'myMoneyLog',
      'adminTop', 'moneyLog', 'blocks', 'blockSave', 'blockDelete', 'handover', 'handoverSave', 'handoverDone', 'popupSave', 'popupDelete', 'faqSave', 'termsSave', 'templates', 'templateSave',
      'noticeConsents', 'setNoticeConsent', 'contestSave', 'contestDelete', 'contestFinish', 'missionSave', 'dailyStats', 'userStats', 'pageStats', 'online',
      'partners', 'partnerSave', 'partnerDelete', 'partnerComm', 'partnerWds', 'partnerWdProcess', 'partnerInqs', 'partnerInqAnswer', 'assignPartner', 'adminPoll', 'saveSettings') then
    return mls_api_v7(p_action, p_body, p_token);
  end if;
  if me.id is null then return jsonb_build_object('ok', false, 'error', '로그인이 필요합니다.'); end if;
  if p_action not in ('consents', 'consent', 'missions', 'claimMission', 'contests', 'joinContest', 'contestRank', 'myMoneyLog', 'adminPoll', 'saveSettings') and me.role <> 'admin' then
    return jsonb_build_object('ok', false, 'error', '관리자 권한이 필요합니다.');
  end if;
  case p_action
  when 'saveSettings' then
    e := '{}'::jsonb;
    if b ? 'serviceBlock' and jsonb_typeof(b->'serviceBlock') = 'object' then e := e || jsonb_build_object('serviceBlock', jsonb_build_object('enabled', coalesce((b->'serviceBlock'->>'enabled')::boolean, false),
      'start', left(coalesce(b->'serviceBlock'->>'start', '00:00'), 5), 'end', left(coalesce(b->'serviceBlock'->>'end', '00:00'), 5), 'message', left(coalesce(b->'serviceBlock'->>'message', ''), 200))); end if;
    if b ? 'guard' and jsonb_typeof(b->'guard') = 'object' then e := e || jsonb_build_object('guard', jsonb_build_object('blur', coalesce((b->'guard'->>'blur')::boolean, true), 'mark', coalesce((b->'guard'->>'mark')::boolean, true))); end if;
    if b ? 'liqWarn' then e := e || jsonb_build_object('liqWarn', greatest(1, least(90, coalesce((b->>'liqWarn')::numeric, 20)))); end if;
    if b ? 'liqCooldown' then e := e || jsonb_build_object('liqCooldown', greatest(1, least(1440, coalesce((b->>'liqCooldown')::int, 10)))); end if;
    if e <> '{}'::jsonb then insert into mls_kv (k, v) values ('settings', mls_settings() || e) on conflict (k) do update set v = excluded.v; end if;
    b := b - 'serviceBlock' - 'liqWarn' - 'liqCooldown' - 'guard';
    if b = '{}'::jsonb then return jsonb_build_object('ok', true, 'data', mls_settings()); end if;
    return mls_api_v7(p_action, b, p_token);
  -- ── 이용자 ──
  when 'consents' then
    return jsonb_build_object('ok', true, 'data', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'title', title, 'body', body, 'at', mls_iso(at)) order by at) from mls_notices n2 where n2.need_consent and not exists (select 1 from mls_consents c where c.notice_id = n2.id and c.user_id = me.id)), '[]'::jsonb));
  when 'consent' then
    insert into mls_consents (notice_id, user_id) values (b->>'id', me.id) on conflict do nothing; return jsonb_build_object('ok', true, 'data', true);
  when 'missions' then
    return jsonb_build_object('ok', true, 'data', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'title', m.title, 'descr', m.descr, 'kind', m.kind, 'target', m.target::float8, 'reward', m.reward::float8,
      'progress', mls_mission_progress(me.id, m.kind)::float8, 'claimed', exists (select 1 from mls_mission_claims c where c.mission_id = m.id and c.user_id = me.id)) order by m.sort) from mls_missions m where m.active), '[]'::jsonb));
  when 'claimMission' then
    select * into x from mls_missions where id = b->>'id' and active; if not found then return jsonb_build_object('ok', false, 'error', '미션을 찾을 수 없습니다.'); end if;
    if exists (select 1 from mls_mission_claims where mission_id = x.id and user_id = me.id) then return jsonb_build_object('ok', false, 'error', '이미 보상을 받았습니다.'); end if;
    if mls_mission_progress(me.id, x.kind) < x.target then return jsonb_build_object('ok', false, 'error', '아직 미션을 달성하지 않았습니다.'); end if;
    insert into mls_mission_claims (mission_id, user_id, reward) values (x.id, me.id, x.reward);
    perform set_config('mls.ctx', '미션 보상 · ' || x.title, true);
    update mls_users set cash = cash + x.reward where id = me.id;
    insert into mls_cashflows (id, user_id, type, amount, memo, status, at, processed_at, processed_by, method) values (mls_uid('c'), me.id, 'deposit', x.reward, '[미션 보상] ' || x.title, 'approved', now(), now(), 'system', 'admin');
    return jsonb_build_object('ok', true, 'data', x.reward::float8);
  when 'contests' then
    return jsonb_build_object('ok', true, 'data', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'title', c.title, 'descr', c.descr, 'prize', c.prize, 'startsAt', mls_iso(c.starts_at), 'endsAt', mls_iso(c.ends_at), 'status', c.status, 'maxUsers', c.max_users,
      'users', (select count(*) from mls_contest_entries e2 where e2.contest_id = c.id), 'joined', exists (select 1 from mls_contest_entries e2 where e2.contest_id = c.id and e2.user_id = me.id)) order by c.starts_at desc) from mls_contests c where c.status <> 'hidden'), '[]'::jsonb));
  when 'joinContest' then
    select * into x from mls_contests where id = b->>'id'; if not found or x.status <> 'open' or x.ends_at < now() then return jsonb_build_object('ok', false, 'error', '참가할 수 없는 대회입니다.'); end if;
    if x.max_users > 0 and (select count(*) from mls_contest_entries where contest_id = x.id) >= x.max_users then return jsonb_build_object('ok', false, 'error', '참가 인원이 마감되었습니다.'); end if;
    insert into mls_contest_entries (contest_id, user_id, start_net) values (x.id, me.id, coalesce((mls_eval(me.id)->>'net')::numeric, me.cash)) on conflict do nothing;
    return jsonb_build_object('ok', true, 'data', true);
  when 'contestRank' then
    return jsonb_build_object('ok', true, 'data', coalesce((select jsonb_agg(r order by (r->>'pct')::float8 desc) from (
      select jsonb_build_object('userId', e2.user_id, 'name', u.name, 'me', e2.user_id = me.id, 'startNet', e2.start_net::float8,
        'net', coalesce(e2.final_net, (mls_eval(e2.user_id)->>'net')::numeric)::float8,
        'pct', coalesce(e2.final_pct, case when e2.start_net > 0 then ((mls_eval(e2.user_id)->>'net')::numeric / e2.start_net - 1) * 100 else 0 end)::float8, 'rank', e2.rank) r
      from mls_contest_entries e2 join mls_users u on u.id = e2.user_id where e2.contest_id = b->>'id') z), '[]'::jsonb));
  when 'myMoneyLog' then
    return jsonb_build_object('ok', true, 'data', coalesce((select jsonb_agg(jsonb_build_object('asset', asset, 'delta', delta::float8, 'balance', balance::float8, 'ctx', ctx, 'at', mls_iso(at)) order by at desc) from (select * from mls_money_log where user_id = me.id order by at desc limit 300) l), '[]'::jsonb));
  when 'adminPoll' then
    e := mls_api_v7(p_action, p_body, p_token);
    if (e->>'ok')::boolean and me.role = 'admin' then
      e := jsonb_set(e, '{data,top}', jsonb_build_object(
        'signupsToday', (select count(*) from mls_users where created_at >= date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul' and role = 'user'),
        'depToday', coalesce((select sum(amount) from mls_cashflows where type = 'deposit' and status = 'approved' and processed_at >= date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul' and coalesce(method, '') <> 'admin'), 0)::float8,
        'wdToday', coalesce((select sum(amount) from mls_cashflows where type = 'withdraw' and status = 'approved' and processed_at >= date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul'), 0)::float8,
        'tradersToday', (select count(distinct user_id) from mls_fills where at >= date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul'),
        'online', (select count(*) from mls_users where last_seen > now() - interval '2 minutes'),
        'handover', (select count(*) from mls_handover where not done),
        'partnerWd', (select count(*) from mls_partner_wd where status = 'pending'),
        'partnerInq', (select count(*) from mls_partner_inq where status = 'open'),
        'feeToday', coalesce((select sum(fee + tax) from mls_fills where at >= date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul'), 0)::float8));
      e := jsonb_set(e, '{data,partnerWds}', coalesce((select jsonb_agg(jsonb_build_object('id', w.id, 'at', mls_iso(w.created_at), 'amount', w.amount::float8, 'name', p.name)) from mls_partner_wd w join mls_partners p on p.id = w.partner_id where w.status = 'pending'), '[]'::jsonb));
    end if;
    return e;
  -- ── 관리자 ──
  when 'online' then
    return jsonb_build_object('ok', true, 'data', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'username', username, 'lastSeen', mls_iso(last_seen)) order by last_seen desc) from mls_users where last_seen > now() - interval '2 minutes'), '[]'::jsonb));
  when 'moneyLog' then
    return jsonb_build_object('ok', true, 'data', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'userId', l.user_id, 'name', u.name, 'username', u.username, 'asset', l.asset, 'delta', l.delta::float8, 'balance', l.balance::float8, 'ctx', l.ctx, 'at', mls_iso(l.at)) order by l.at desc)
      from (select * from mls_money_log where (coalesce(b->>'userId', '') = '' or user_id = b->>'userId') order by at desc limit least(2000, coalesce((b->>'limit')::int, 500))) l left join mls_users u on u.id = l.user_id), '[]'::jsonb));
  when 'blocks' then
    return jsonb_build_object('ok', true, 'data', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'kind', kind, 'value', value, 'memo', memo, 'by', by_user, 'at', mls_iso(at)) order by at desc) from mls_blocks), '[]'::jsonb));
  when 'blockSave' then
    if coalesce(b->>'kind', '') not in ('ip', 'device') or trim(coalesce(b->>'value', '')) = '' then return jsonb_build_object('ok', false, 'error', '차단할 값을 입력해 주세요.'); end if;
    insert into mls_blocks (kind, value, memo, by_user) values (b->>'kind', trim(b->>'value'), left(coalesce(b->>'memo', ''), 200), me.username) on conflict (kind, value) do update set memo = excluded.memo;
    insert into mls_audit (at, by_user, action, detail) values (now(), me.username, 'block', (b->>'kind') || ' ' || (b->>'value'));
    return jsonb_build_object('ok', true, 'data', true);
  when 'blockDelete' then
    delete from mls_blocks where id = (b->>'id')::bigint; return jsonb_build_object('ok', true, 'data', true);
  when 'handover' then
    return jsonb_build_object('ok', true, 'data', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'body', body, 'by', by_user, 'done', done, 'doneBy', done_by, 'at', mls_iso(at)) order by done, at desc) from (select * from mls_handover order by at desc limit 200) h), '[]'::jsonb));
  when 'handoverSave' then
    if trim(coalesce(b->>'body', '')) = '' then return jsonb_build_object('ok', false, 'error', '내용을 입력해 주세요.'); end if;
    insert into mls_handover (body, by_user) values (left(b->>'body', 2000), me.name); return jsonb_build_object('ok', true, 'data', true);
  when 'handoverDone' then
    update mls_handover set done = not done, done_by = me.name where id = (b->>'id')::bigint; return jsonb_build_object('ok', true, 'data', true);
  when 'popupSave' then
    insert into mls_popups (id, title, body, image, link, starts_at, ends_at, active, sort) values (coalesce(nullif(b->>'id', ''), mls_uid('pp')), left(coalesce(b->>'title', '팝업'), 100), left(coalesce(b->>'body', ''), 2000),
      left(coalesce(b->>'image', ''), 500), left(coalesce(b->>'link', ''), 300), nullif(b->>'startsAt', '')::timestamptz, nullif(b->>'endsAt', '')::timestamptz, coalesce((b->>'active')::boolean, true), coalesce((b->>'sort')::int, 0))
    on conflict (id) do update set title = excluded.title, body = excluded.body, image = excluded.image, link = excluded.link, starts_at = excluded.starts_at, ends_at = excluded.ends_at, active = excluded.active, sort = excluded.sort;
    return jsonb_build_object('ok', true, 'data', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'title', title, 'body', body, 'image', image, 'link', link, 'startsAt', mls_iso(starts_at), 'endsAt', mls_iso(ends_at), 'active', active, 'sort', sort) order by sort) from mls_popups), '[]'::jsonb));
  when 'popupDelete' then
    delete from mls_popups where id = b->>'id';
    return jsonb_build_object('ok', true, 'data', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'title', title, 'body', body, 'image', image, 'link', link, 'startsAt', mls_iso(starts_at), 'endsAt', mls_iso(ends_at), 'active', active, 'sort', sort) order by sort) from mls_popups), '[]'::jsonb));
  when 'faqSave' then
    if jsonb_typeof(b->'faqs') <> 'array' then return jsonb_build_object('ok', false, 'error', 'FAQ 목록이 필요합니다.'); end if;
    delete from mls_faqs;
    insert into mls_faqs (id, cat, q, a, sort) select coalesce(nullif(g->>'id', ''), 'f' || ord), left(coalesce(g->>'cat', '일반'), 20), left(coalesce(g->>'q', ''), 300), left(coalesce(g->>'a', ''), 3000), ord from jsonb_array_elements(b->'faqs') with ordinality t(g, ord) where coalesce(g->>'q', '') <> '';
    return jsonb_build_object('ok', true, 'data', true);
  when 'termsSave' then
    insert into mls_terms (k, title, body, updated_at) values (left(b->>'k', 20), left(coalesce(b->>'title', ''), 60), left(coalesce(b->>'body', ''), 50000), now()) on conflict (k) do update set title = excluded.title, body = excluded.body, updated_at = now();
    return jsonb_build_object('ok', true, 'data', true);
  when 'templates' then
    return jsonb_build_object('ok', true, 'data', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'title', title, 'body', body, 'kind', kind) order by sort) from mls_templates), '[]'::jsonb));
  when 'templateSave' then
    if jsonb_typeof(b->'items') <> 'array' then return jsonb_build_object('ok', false, 'error', '목록이 필요합니다.'); end if;
    delete from mls_templates;
    insert into mls_templates (id, title, body, kind, sort) select coalesce(nullif(g->>'id', ''), 't' || ord), left(coalesce(g->>'title', ''), 60), left(coalesce(g->>'body', ''), 3000), coalesce(g->>'kind', 'answer'), ord from jsonb_array_elements(b->'items') with ordinality t(g, ord) where coalesce(g->>'title', '') <> '';
    return jsonb_build_object('ok', true, 'data', true);
  when 'setNoticeConsent' then
    update mls_notices set need_consent = coalesce((b->>'need')::boolean, false) where id = b->>'id'; return jsonb_build_object('ok', true, 'data', true);
  when 'noticeConsents' then
    return jsonb_build_object('ok', true, 'data', coalesce((select jsonb_agg(jsonb_build_object('id', n2.id, 'title', n2.title, 'needConsent', n2.need_consent, 'at', mls_iso(n2.at),
      'agreed', (select count(*) from mls_consents c where c.notice_id = n2.id), 'total', (select count(*) from mls_users where role = 'user' and status = 'active')) order by n2.at desc) from mls_notices n2), '[]'::jsonb));
  when 'contestSave' then
    insert into mls_contests (id, title, descr, prize, starts_at, ends_at, max_users, status) values (coalesce(nullif(b->>'id', ''), mls_uid('ct')), left(coalesce(b->>'title', '투자 대회'), 100), left(coalesce(b->>'descr', ''), 2000), left(coalesce(b->>'prize', ''), 1000),
      coalesce(nullif(b->>'startsAt', '')::timestamptz, now()), coalesce(nullif(b->>'endsAt', '')::timestamptz, now() + interval '28 days'), coalesce((b->>'maxUsers')::int, 0), coalesce(nullif(b->>'status', ''), 'open'))
    on conflict (id) do update set title = excluded.title, descr = excluded.descr, prize = excluded.prize, starts_at = excluded.starts_at, ends_at = excluded.ends_at, max_users = excluded.max_users, status = excluded.status;
    return jsonb_build_object('ok', true, 'data', true);
  when 'contestDelete' then
    delete from mls_contest_entries where contest_id = b->>'id'; delete from mls_contests where id = b->>'id'; return jsonb_build_object('ok', true, 'data', true);
  when 'contestFinish' then
    -- 종료: 현재 순자산으로 최종 수익률·순위 확정
    update mls_contest_entries e2 set final_net = (mls_eval(e2.user_id)->>'net')::numeric, final_pct = case when e2.start_net > 0 then ((mls_eval(e2.user_id)->>'net')::numeric / e2.start_net - 1) * 100 else 0 end where e2.contest_id = b->>'id';
    update mls_contest_entries e2 set rank = r.rk from (select user_id, rank() over (order by final_pct desc) rk from mls_contest_entries where contest_id = b->>'id') r where e2.contest_id = b->>'id' and e2.user_id = r.user_id;
    update mls_contests set status = 'finished' where id = b->>'id';
    insert into mls_audit (at, by_user, action, detail) values (now(), me.username, 'contestFinish', b->>'id');
    return jsonb_build_object('ok', true, 'data', true);
  when 'missionSave' then
    if jsonb_typeof(b->'items') <> 'array' then return jsonb_build_object('ok', false, 'error', '목록이 필요합니다.'); end if;
    insert into mls_missions (id, title, descr, kind, target, reward, active, sort) select coalesce(nullif(g->>'id', ''), 'm' || ord), left(coalesce(g->>'title', ''), 60), left(coalesce(g->>'descr', ''), 200), coalesce(g->>'kind', 'trades'), greatest(1, coalesce((g->>'target')::numeric, 1)), greatest(0, coalesce((g->>'reward')::numeric, 0)), coalesce((g->>'active')::boolean, true), ord
      from jsonb_array_elements(b->'items') with ordinality t(g, ord) where coalesce(g->>'title', '') <> ''
    on conflict (id) do update set title = excluded.title, descr = excluded.descr, kind = excluded.kind, target = excluded.target, reward = excluded.reward, active = excluded.active, sort = excluded.sort;
    delete from mls_missions where id not in (select coalesce(nullif(g->>'id', ''), 'm' || ord) from jsonb_array_elements(b->'items') with ordinality t(g, ord));
    return jsonb_build_object('ok', true, 'data', true);
  when 'dailyStats' then
    return jsonb_build_object('ok', true, 'data', coalesce((select jsonb_agg(jsonb_build_object('d', to_char(d, 'YYYY-MM-DD'),
      'signups', (select count(*) from mls_users where role = 'user' and (created_at at time zone 'Asia/Seoul')::date = d),
      'logins', (select count(distinct user_id) from mls_logins where (at at time zone 'Asia/Seoul')::date = d),
      'traders', (select count(distinct user_id) from mls_fills where (at at time zone 'Asia/Seoul')::date = d),
      'fills', (select count(*) from mls_fills where (at at time zone 'Asia/Seoul')::date = d),
      'volume', coalesce((select sum(amount) from mls_fills where (at at time zone 'Asia/Seoul')::date = d), 0)::float8,
      'fee', coalesce((select sum(fee + tax) from mls_fills where (at at time zone 'Asia/Seoul')::date = d), 0)::float8,
      'deposit', coalesce((select sum(amount) from mls_cashflows where type = 'deposit' and status = 'approved' and coalesce(method, '') <> 'admin' and (processed_at at time zone 'Asia/Seoul')::date = d), 0)::float8,
      'withdraw', coalesce((select sum(amount) from mls_cashflows where type = 'withdraw' and status = 'approved' and (processed_at at time zone 'Asia/Seoul')::date = d), 0)::float8,
      'cfFills', (select count(*) from mls_cf_fills where (at at time zone 'Asia/Seoul')::date = d),
      'pv', coalesce((select sum(n) from mls_pageviews where mls_pageviews.d = dd.d), 0)) order by d desc)
      from (select generate_series((now() at time zone 'Asia/Seoul')::date - least(180, coalesce((b->>'days')::int, 30)) + 1, (now() at time zone 'Asia/Seoul')::date, interval '1 day')::date d) dd), '[]'::jsonb));
  when 'userStats' then
    return jsonb_build_object('ok', true, 'data', coalesce((select jsonb_agg(z order by (z->>'volume')::float8 desc) from (select jsonb_build_object('id', u.id, 'name', u.name, 'username', u.username, 'grade', u.grade,
      'fills', (select count(*) from mls_fills f where f.user_id = u.id), 'volume', coalesce((select sum(amount) from mls_fills f where f.user_id = u.id), 0)::float8,
      'realized', coalesce((select sum(pnl) from mls_fills f where f.user_id = u.id), 0)::float8, 'fee', coalesce((select sum(fee + tax) from mls_fills f where f.user_id = u.id), 0)::float8,
      'deposit', coalesce((select sum(amount) from mls_cashflows c where c.user_id = u.id and c.type = 'deposit' and c.status = 'approved' and coalesce(c.method, '') <> 'admin'), 0)::float8,
      'cfFills', (select count(*) from mls_cf_fills f where f.user_id = u.id), 'cfPnl', coalesce((select sum(pnl) from mls_cf_fills f where f.user_id = u.id), 0)::float8,
      'logins', (select count(*) from mls_logins l where l.user_id = u.id), 'lastSeen', mls_iso(coalesce(u.last_seen, u.last_login)), 'partner', (select name from mls_partners p where p.id = u.partner_id)) z from mls_users u where u.role = 'user') q), '[]'::jsonb));
  when 'pageStats' then
    return jsonb_build_object('ok', true, 'data', jsonb_build_object(
      'pages', coalesce((select jsonb_agg(jsonb_build_object('page', page, 'n', n) order by n desc) from (select page, sum(n) n from mls_pageviews where d > (now() at time zone 'Asia/Seoul')::date - coalesce((b->>'days')::int, 30) group by page) z), '[]'::jsonb),
      'daily', coalesce((select jsonb_agg(jsonb_build_object('d', to_char(d, 'YYYY-MM-DD'), 'n', n) order by d) from (select d, sum(n) n from mls_pageviews where d > (now() at time zone 'Asia/Seoul')::date - coalesce((b->>'days')::int, 30) group by d) z), '[]'::jsonb)));
  -- ── 파트너 관리 ──
  when 'partners' then
    return jsonb_build_object('ok', true, 'data', coalesce((select jsonb_agg(mls_partner_j(p2) order by p2.level, p2.created_at) from mls_partners p2), '[]'::jsonb));
  when 'partnerSave' then
    v_code := upper(regexp_replace(coalesce(b->>'code', ''), '[^A-Za-z0-9]', '', 'g'));
    if coalesce(b->>'name', '') = '' or length(v_code) < 3 then return jsonb_build_object('ok', false, 'error', '이름과 추천 코드(영문·숫자 3자 이상)를 입력해 주세요.'); end if;
    if coalesce(b->>'id', '') = '' then
      if coalesce(b->>'username', '') !~ '^[a-zA-Z0-9_]{4,20}$' or length(coalesce(b->>'pw', '')) < 6 then return jsonb_build_object('ok', false, 'error', '파트너 아이디(영문·숫자 4~20자)와 비밀번호(6자 이상)를 입력해 주세요.'); end if;
      if exists (select 1 from mls_partners where code = v_code or username = b->>'username') then return jsonb_build_object('ok', false, 'error', '이미 쓰는 추천 코드 또는 아이디입니다.'); end if;
      insert into mls_partners (id, name, code, parent_id, level, username, pw, rate_sub, rate_charge, phone, memo)
        values (mls_uid('pt'), left(b->>'name', 40), v_code, nullif(b->>'parentId', ''), coalesce((select level + 1 from mls_partners where id = nullif(b->>'parentId', '')), 1), b->>'username', extensions.crypt(b->>'pw', extensions.gen_salt('bf')),
          greatest(0, least(100, coalesce((b->>'rateSub')::numeric, 0))), greatest(0, least(100, coalesce((b->>'rateCharge')::numeric, 0))), left(coalesce(b->>'phone', ''), 40), left(coalesce(b->>'memo', ''), 300));
    else
      if exists (select 1 from mls_partners where code = v_code and id <> b->>'id') then return jsonb_build_object('ok', false, 'error', '이미 쓰는 추천 코드입니다.'); end if;
      update mls_partners set name = left(b->>'name', 40), code = v_code, rate_sub = greatest(0, least(100, coalesce((b->>'rateSub')::numeric, rate_sub))), rate_charge = greatest(0, least(100, coalesce((b->>'rateCharge')::numeric, rate_charge))),
        status = coalesce(nullif(b->>'status', ''), status), phone = left(coalesce(b->>'phone', phone), 40), memo = left(coalesce(b->>'memo', memo), 300),
        pw = case when length(coalesce(b->>'pw', '')) >= 6 then extensions.crypt(b->>'pw', extensions.gen_salt('bf')) else pw end where id = b->>'id';
    end if;
    insert into mls_audit (at, by_user, action, detail) values (now(), me.username, 'partnerSave', b->>'name');
    return jsonb_build_object('ok', true, 'data', true);
  when 'partnerDelete' then
    if exists (select 1 from mls_partners where parent_id = b->>'id') then return jsonb_build_object('ok', false, 'error', '하부 파트너가 있으면 삭제할 수 없습니다.'); end if;
    update mls_users set partner_id = null where partner_id = b->>'id'; delete from mls_psessions where partner_id = b->>'id'; delete from mls_partners where id = b->>'id';
    return jsonb_build_object('ok', true, 'data', true);
  when 'partnerComm' then
    return jsonb_build_object('ok', true, 'data', coalesce((select jsonb_agg(jsonb_build_object('partner', p2.name, 'user', u.name, 'kind', c.kind, 'base', c.base::float8, 'rate', c.rate::float8, 'amount', c.amount::float8, 'at', mls_iso(c.at)) order by c.at desc)
      from (select * from mls_partner_comm where coalesce(b->>'partnerId', '') = '' or partner_id = b->>'partnerId' order by at desc limit 1000) c join mls_partners p2 on p2.id = c.partner_id left join mls_users u on u.id = c.user_id), '[]'::jsonb));
  when 'partnerWds' then
    return jsonb_build_object('ok', true, 'data', coalesce((select jsonb_agg(jsonb_build_object('id', w.id, 'partner', p2.name, 'partnerId', p2.id, 'amount', w.amount::float8, 'bank', w.bank, 'memo', w.memo, 'status', w.status, 'adminMemo', w.admin_memo, 'at', mls_iso(w.created_at), 'processedAt', mls_iso(w.processed_at)) order by w.created_at desc) from mls_partner_wd w join mls_partners p2 on p2.id = w.partner_id), '[]'::jsonb));
  when 'partnerWdProcess' then
    select * into x from mls_partner_wd where id = b->>'id' and status = 'pending' for update; if not found then return jsonb_build_object('ok', false, 'error', '처리할 수 없는 신청입니다.'); end if;
    if coalesce((b->>'approve')::boolean, false) then
      if (select balance from mls_partners where id = x.partner_id) < x.amount then return jsonb_build_object('ok', false, 'error', '파트너 잔액이 부족합니다.'); end if;
      update mls_partners set balance = balance - x.amount, withdrawn = withdrawn + x.amount where id = x.partner_id;
      update mls_partner_wd set status = 'approved', processed_at = now(), processed_by = me.username, admin_memo = left(coalesce(b->>'memo', ''), 200) where id = x.id;
    else update mls_partner_wd set status = 'rejected', processed_at = now(), processed_by = me.username, admin_memo = left(coalesce(b->>'memo', ''), 200) where id = x.id; end if;
    return jsonb_build_object('ok', true, 'data', true);
  when 'partnerInqs' then
    return jsonb_build_object('ok', true, 'data', coalesce((select jsonb_agg(jsonb_build_object('id', q.id, 'partner', p2.name, 'title', q.title, 'body', q.body, 'answer', q.answer, 'status', q.status, 'at', mls_iso(q.created_at), 'answeredAt', mls_iso(q.answered_at)) order by q.created_at desc) from mls_partner_inq q join mls_partners p2 on p2.id = q.partner_id), '[]'::jsonb));
  when 'partnerInqAnswer' then
    update mls_partner_inq set answer = left(coalesce(b->>'answer', ''), 3000), status = 'answered', answered_at = now() where id = b->>'id'; return jsonb_build_object('ok', true, 'data', true);
  when 'assignPartner' then
    update mls_users set partner_id = nullif(b->>'partnerId', '') where id = b->>'userId'; return jsonb_build_object('ok', true, 'data', true);
  end case;
  return null;
exception
  when sqlstate 'P0001' then return jsonb_build_object('ok', false, 'error', sqlerrm);
  when others then raise warning '[mls8] % % %', p_action, sqlstate, sqlerrm; return jsonb_build_object('ok', false, 'error', '서버 오류가 발생했습니다.');
end $$;

-- ───────── 파트너 포털 API ─────────
create or replace function mls_partner_api(p_action text, b jsonb, p_token text) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare pa mls_partners; t text; v_id text; tree text[];
begin
  if p_action = 'p_login' then
    select * into pa from mls_partners where username = b->>'username';
    if not found or pa.pw <> extensions.crypt(coalesce(b->>'pw', ''), pa.pw) then perform pg_sleep(0.4); return jsonb_build_object('ok', false, 'error', '아이디 또는 비밀번호가 올바르지 않습니다.'); end if;
    if pa.status <> 'active' then return jsonb_build_object('ok', false, 'error', '사용이 정지된 파트너 계정입니다.'); end if;
    t := encode(extensions.gen_random_bytes(32), 'hex');
    insert into mls_psessions (token, partner_id, expires_at) values (t, pa.id, now() + interval '7 days');
    return jsonb_build_object('ok', true, 'data', jsonb_build_object('token', t, 'partner', mls_partner_j(pa) - 'balance'));
  end if;
  if p_token ~ '^[a-f0-9]{64}$' then select p2.* into pa from mls_psessions s join mls_partners p2 on p2.id = s.partner_id where s.token = p_token and s.expires_at > now() and p2.status = 'active'; end if;
  if pa.id is null then return jsonb_build_object('ok', false, 'error', '파트너 로그인이 필요합니다.'); end if;
  tree := array(select mls_partner_tree(pa.id));
  case p_action
  when 'p_logout' then delete from mls_psessions where token = p_token; return jsonb_build_object('ok', true, 'data', true);
  when 'p_me' then
    return jsonb_build_object('ok', true, 'data', jsonb_build_object('partner', mls_partner_j(pa),
      'direct', (select count(*) from mls_users where partner_id = pa.id), 'all', (select count(*) from mls_users where partner_id = any(tree)),
      'active7', (select count(*) from mls_users where partner_id = any(tree) and coalesce(last_seen, last_login) > now() - interval '7 days'),
      'commTotal', coalesce((select sum(amount) from mls_partner_comm where partner_id = pa.id), 0)::float8,
      'commMonth', coalesce((select sum(amount) from mls_partner_comm where partner_id = pa.id and at >= date_trunc('month', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul'), 0)::float8,
      'charge', coalesce((select sum(c.amount) from mls_cashflows c join mls_users u on u.id = c.user_id where u.partner_id = any(tree) and c.type = 'deposit' and c.status = 'approved' and coalesce(c.method, '') <> 'admin'), 0)::float8,
      'subs', coalesce((select sum(s.price) from mls_subs s join mls_users u on u.id = s.user_id where u.partner_id = any(tree) and s.status in ('active', 'expired')), 0)::float8,
      'top', coalesce((select jsonb_agg(z) from (select jsonb_build_object('name', u.name, 'username', left(u.username, 2) || '***', 'joined', mls_iso(u.created_at), 'lastSeen', mls_iso(coalesce(u.last_seen, u.last_login)),
        'charge', coalesce((select sum(amount) from mls_cashflows c where c.user_id = u.id and c.type = 'deposit' and c.status = 'approved' and coalesce(c.method, '') <> 'admin'), 0)::float8) z
        from mls_users u where u.partner_id = pa.id order by u.created_at desc limit 20) q), '[]'::jsonb)));
  when 'p_users' then
    return jsonb_build_object('ok', true, 'data', coalesce((select jsonb_agg(jsonb_build_object('name', u.name, 'username', left(u.username, 2) || '***', 'partner', p2.name, 'direct', u.partner_id = pa.id, 'joined', mls_iso(u.created_at),
      'lastSeen', mls_iso(coalesce(u.last_seen, u.last_login)), 'status', u.status, 'fills', (select count(*) from mls_fills f where f.user_id = u.id),
      'charge', coalesce((select sum(amount) from mls_cashflows c where c.user_id = u.id and c.type = 'deposit' and c.status = 'approved' and coalesce(c.method, '') <> 'admin'), 0)::float8,
      'ai', (select plan_name from mls_subs s where s.user_id = u.id and s.status = 'active' order by ends_at desc limit 1)) order by u.created_at desc)
      from mls_users u join mls_partners p2 on p2.id = u.partner_id where u.partner_id = any(tree)), '[]'::jsonb));
  when 'p_stats' then
    return jsonb_build_object('ok', true, 'data', coalesce((select jsonb_agg(jsonb_build_object('d', to_char(d, 'YYYY-MM-DD'),
      'signups', (select count(*) from mls_users u where u.partner_id = any(tree) and (u.created_at at time zone 'Asia/Seoul')::date = dd.d),
      'active', (select count(distinct l.user_id) from mls_logins l join mls_users u on u.id = l.user_id where u.partner_id = any(tree) and (l.at at time zone 'Asia/Seoul')::date = dd.d),
      'charge', coalesce((select sum(c.amount) from mls_cashflows c join mls_users u on u.id = c.user_id where u.partner_id = any(tree) and c.type = 'deposit' and c.status = 'approved' and coalesce(c.method, '') <> 'admin' and (c.processed_at at time zone 'Asia/Seoul')::date = dd.d), 0)::float8,
      'comm', coalesce((select sum(amount) from mls_partner_comm where partner_id = pa.id and (at at time zone 'Asia/Seoul')::date = dd.d), 0)::float8) order by d desc)
      from (select generate_series((now() at time zone 'Asia/Seoul')::date - least(180, coalesce((b->>'days')::int, 30)) + 1, (now() at time zone 'Asia/Seoul')::date, interval '1 day')::date d) dd), '[]'::jsonb));
  when 'p_summary' then
    -- 통계 화면: 회원 분포(활성/비활성), 인기 거래 종목, 월별 요약
    return jsonb_build_object('ok', true, 'data', jsonb_build_object(
      'active', (select count(*) from mls_users where partner_id = any(tree) and coalesce(last_seen, last_login) > now() - interval '7 days'),
      'inactive', (select count(*) from mls_users where partner_id = any(tree) and (coalesce(last_seen, last_login) is null or coalesce(last_seen, last_login) <= now() - interval '7 days')),
      'popular', coalesce((select jsonb_agg(z) from (select jsonb_build_object('code', f.code, 'name', max(f.name), 'n', count(*), 'amount', sum(f.amount)::float8) z
        from mls_fills f join mls_users u on u.id = f.user_id where u.partner_id = any(tree) and f.at > now() - interval '30 days' group by f.code order by count(*) desc limit 10) q), '[]'::jsonb),
      'popularCoin', coalesce((select jsonb_agg(z) from (select jsonb_build_object('sym', f.sym, 'n', count(*), 'amount', sum(f.qty * f.price)::float8) z
        from mls_cf_fills f join mls_users u on u.id = f.user_id where u.partner_id = any(tree) and f.at > now() - interval '30 days' group by f.sym order by count(*) desc limit 10) q), '[]'::jsonb),
      'monthly', coalesce((select jsonb_agg(z order by z->>'m' desc) from (select jsonb_build_object('m', to_char(mm, 'YYYY-MM'),
        'signups', (select count(*) from mls_users u where u.partner_id = any(tree) and date_trunc('month', u.created_at at time zone 'Asia/Seoul') = mm),
        'traders', (select count(distinct f.user_id) from mls_fills f join mls_users u on u.id = f.user_id where u.partner_id = any(tree) and date_trunc('month', f.at at time zone 'Asia/Seoul') = mm),
        'fills', (select count(*) from mls_fills f join mls_users u on u.id = f.user_id where u.partner_id = any(tree) and date_trunc('month', f.at at time zone 'Asia/Seoul') = mm),
        'volume', coalesce((select sum(f.amount) from mls_fills f join mls_users u on u.id = f.user_id where u.partner_id = any(tree) and date_trunc('month', f.at at time zone 'Asia/Seoul') = mm), 0)::float8,
        'charge', coalesce((select sum(c.amount) from mls_cashflows c join mls_users u on u.id = c.user_id where u.partner_id = any(tree) and c.type = 'deposit' and c.status = 'approved' and coalesce(c.method, '') <> 'admin' and date_trunc('month', c.processed_at at time zone 'Asia/Seoul') = mm), 0)::float8,
        'comm', coalesce((select sum(amount) from mls_partner_comm where partner_id = pa.id and date_trunc('month', at at time zone 'Asia/Seoul') = mm), 0)::float8) z
        from generate_series(date_trunc('month', now() at time zone 'Asia/Seoul') - interval '5 months', date_trunc('month', now() at time zone 'Asia/Seoul'), interval '1 month') mm) q), '[]'::jsonb)));
  when 'p_fills' then
    -- 소속 회원 체결 내역 (주식 + 코인 선물, 최근 500건)
    return jsonb_build_object('ok', true, 'data', coalesce((select jsonb_agg(z order by z->>'at' desc) from (
      (select jsonb_build_object('at', mls_iso(f.at), 'name', u.name, 'kind', 'stock', 'item', f.name, 'side', f.side, 'qty', f.qty::float8, 'price', f.price::float8, 'amount', f.amount::float8, 'pnl', f.pnl::float8, 'fee', (f.fee + f.tax)::float8) z
        from mls_fills f join mls_users u on u.id = f.user_id where u.partner_id = any(tree) order by f.at desc limit 500)
      union all
      (select jsonb_build_object('at', mls_iso(f.at), 'name', u.name, 'kind', 'coin', 'item', f.sym || 'USDT', 'side', f.side, 'action', f.action, 'qty', f.qty::float8, 'price', f.price::float8, 'amount', (f.qty * f.price)::float8, 'pnl', f.pnl::float8, 'fee', f.fee::float8)
        from mls_cf_fills f join mls_users u on u.id = f.user_id where u.partner_id = any(tree) order by f.at desc limit 500)) q), '[]'::jsonb));
  when 'p_cash' then
    -- 소속 회원 입출금 내역 (관리자 지급 제외)
    return jsonb_build_object('ok', true, 'data', coalesce((select jsonb_agg(jsonb_build_object('at', mls_iso(c.at), 'name', u.name, 'type', c.type, 'amount', c.amount::float8, 'method', c.method, 'status', c.status, 'processedAt', mls_iso(c.processed_at)) order by c.at desc)
      from (select c2.* from mls_cashflows c2 join mls_users u2 on u2.id = c2.user_id where u2.partner_id = any(tree) and coalesce(c2.method, '') <> 'admin' and (coalesce(b->>'type', '') = '' or c2.type = b->>'type') order by c2.at desc limit 500) c join mls_users u on u.id = c.user_id), '[]'::jsonb));
  when 'p_comm' then
    return jsonb_build_object('ok', true, 'data', coalesce((select jsonb_agg(jsonb_build_object('user', u.name, 'kind', c.kind, 'base', c.base::float8, 'rate', c.rate::float8, 'amount', c.amount::float8, 'at', mls_iso(c.at)) order by c.at desc) from (select * from mls_partner_comm where partner_id = pa.id order by at desc limit 500) c left join mls_users u on u.id = c.user_id), '[]'::jsonb));
  when 'p_subs' then
    return jsonb_build_object('ok', true, 'data', coalesce((select jsonb_agg(mls_partner_j(p2) - 'balance' - 'withdrawn' order by p2.level, p2.created_at) from mls_partners p2 where p2.id = any(tree) and p2.id <> pa.id), '[]'::jsonb));
  when 'p_createSub' then
    -- 하부 파트너는 자기 비율 이하로만 만들 수 있음
    if coalesce(b->>'username', '') !~ '^[a-zA-Z0-9_]{4,20}$' or length(coalesce(b->>'pw', '')) < 6 or coalesce(b->>'name', '') = '' then return jsonb_build_object('ok', false, 'error', '이름, 아이디(영문·숫자 4~20자), 비밀번호(6자 이상)를 입력해 주세요.'); end if;
    if exists (select 1 from mls_partners where username = b->>'username' or code = upper(b->>'code')) then return jsonb_build_object('ok', false, 'error', '이미 쓰는 아이디 또는 추천 코드입니다.'); end if;
    if coalesce((b->>'rateSub')::numeric, 0) > pa.rate_sub or coalesce((b->>'rateCharge')::numeric, 0) > pa.rate_charge then return jsonb_build_object('ok', false, 'error', '하부 파트너 비율은 내 비율보다 높을 수 없습니다.'); end if;
    insert into mls_partners (id, name, code, parent_id, level, username, pw, rate_sub, rate_charge)
      values (mls_uid('pt'), left(b->>'name', 40), upper(regexp_replace(coalesce(nullif(b->>'code', ''), b->>'username'), '[^A-Za-z0-9]', '', 'g')), pa.id, pa.level + 1, b->>'username', extensions.crypt(b->>'pw', extensions.gen_salt('bf')),
        greatest(0, coalesce((b->>'rateSub')::numeric, 0)), greatest(0, coalesce((b->>'rateCharge')::numeric, 0)));
    return jsonb_build_object('ok', true, 'data', true);
  when 'p_wds' then
    return jsonb_build_object('ok', true, 'data', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'amount', amount::float8, 'bank', bank, 'status', status, 'memo', memo, 'adminMemo', admin_memo, 'at', mls_iso(created_at), 'processedAt', mls_iso(processed_at)) order by created_at desc) from mls_partner_wd where partner_id = pa.id), '[]'::jsonb));
  when 'p_wdReq' then
    if coalesce((b->>'amount')::numeric, 0) < 10000 then return jsonb_build_object('ok', false, 'error', '최소 10,000원부터 신청할 수 있습니다.'); end if;
    if (b->>'amount')::numeric > pa.balance - coalesce((select sum(amount) from mls_partner_wd where partner_id = pa.id and status = 'pending'), 0) then return jsonb_build_object('ok', false, 'error', '정산 가능 금액을 초과했습니다.'); end if;
    insert into mls_partner_wd (id, partner_id, amount, bank, memo) values (mls_uid('pw'), pa.id, (b->>'amount')::numeric, left(coalesce(b->>'bank', ''), 100), left(coalesce(b->>'memo', ''), 200));
    return jsonb_build_object('ok', true, 'data', true);
  when 'p_inqs' then
    return jsonb_build_object('ok', true, 'data', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'title', title, 'body', body, 'answer', answer, 'status', status, 'at', mls_iso(created_at), 'answeredAt', mls_iso(answered_at)) order by created_at desc) from mls_partner_inq where partner_id = pa.id), '[]'::jsonb));
  when 'p_ask' then
    if trim(coalesce(b->>'title', '')) = '' then return jsonb_build_object('ok', false, 'error', '제목을 입력해 주세요.'); end if;
    insert into mls_partner_inq (id, partner_id, title, body) values (mls_uid('pq'), pa.id, left(b->>'title', 100), left(coalesce(b->>'body', ''), 3000));
    return jsonb_build_object('ok', true, 'data', true);
  when 'p_password' then
    if pa.pw <> extensions.crypt(coalesce(b->>'oldPw', ''), pa.pw) or length(coalesce(b->>'newPw', '')) < 6 then return jsonb_build_object('ok', false, 'error', '비밀번호를 확인해 주세요. (새 비밀번호 6자 이상)'); end if;
    update mls_partners set pw = extensions.crypt(b->>'newPw', extensions.gen_salt('bf')) where id = pa.id; return jsonb_build_object('ok', true, 'data', true);
  else return jsonb_build_object('ok', false, 'error', '알 수 없는 요청입니다.');
  end case;
exception
  when sqlstate 'P0001' then return jsonb_build_object('ok', false, 'error', sqlerrm);
  when others then raise warning '[mlsP] % % %', p_action, sqlstate, sqlerrm; return jsonb_build_object('ok', false, 'error', '서버 오류가 발생했습니다.');
end $$;
revoke all on function mls_partner_api(text, jsonb, text) from public;
revoke all on function mls_api_v7(text, jsonb, text) from public;
revoke all on function mls_api(text, jsonb, text) from public;
do $$ begin if exists (select 1 from pg_roles where rolname = 'anon') then
  revoke all on function mls_api_v7(text, jsonb, text) from anon, authenticated;
  revoke all on function mls_partner_api(text, jsonb, text) from anon, authenticated;
  grant execute on function mls_api(text, jsonb, text) to anon, authenticated;
end if; end $$;
select 'v8 설치 완료' as result;
