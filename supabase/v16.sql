-- MAX라이프 주식 v16 — 주력 시장(회원) · 지사별 노출 시장 · 지사 소속 회원 보기
-- v15.sql 다음에 실행 (여러 번 실행해도 안전)

alter table mls_users add column if not exists main_market text default '';
alter table mls_partners add column if not exists markets jsonb not null default '[]'::jsonb;  -- 비어 있으면 전체 시장

-- 회원에게 보일 시장: 담당 지사(없으면 상위 지사)의 설정, 아무 데도 없으면 전체
create or replace function mls_user_markets(p_partner text) returns jsonb language sql stable as $$
  with recursive ch as (
    select id, parent_id, markets, 1 as d from mls_partners where id = p_partner
    union all select p.id, p.parent_id, p.markets, ch.d + 1 from mls_partners p join ch on p.id = ch.parent_id where ch.d < 10)
  select coalesce((select markets from ch where jsonb_array_length(markets) > 0 order by d limit 1), '[]'::jsonb)
$$;

create or replace function mls_user_pub(u mls_users) returns jsonb language sql stable as $$
  select jsonb_build_object('id', u.id, 'username', u.username, 'name', u.name, 'role', u.role, 'status', u.status, 'phone', u.phone, 'email', u.email,
    'cash', u.cash::float8, 'initial', u.initial::float8, 'watch', coalesce(u.watch, '[]'::jsonb), 'cardTier', coalesce(u.card_tier, ''), 'grade', coalesce(u.grade, 'basic'), 'createdAt', mls_iso(u.created_at), 'lastLogin', mls_iso(u.last_login),
    'demo', coalesce(u.demo, false), 'usdt', coalesce(u.usdt, 0)::float8,
    'convKrw', coalesce((select sum(case when kind = 'convert_in' then krw when kind = 'convert_out' then -krw else 0 end) from mls_usdt_flows where user_id = u.id), 0)::float8,
    'mainMarket', coalesce(u.main_market, ''), 'markets', case when u.role = 'user' then mls_user_markets(u.partner_id) else '[]'::jsonb end)
$$;

create or replace function mls_partner_j(p mls_partners) returns jsonb language sql stable as $$
  select jsonb_build_object('id', p.id, 'name', p.name, 'code', p.code, 'parentId', p.parent_id, 'level', p.level, 'username', p.username, 'rateSub', p.rate_sub::float8, 'rateCharge', p.rate_charge::float8,
    'balance', p.balance::float8, 'withdrawn', p.withdrawn::float8, 'status', p.status, 'phone', p.phone, 'memo', p.memo, 'createdAt', mls_iso(p.created_at),
    'users', (select count(*) from mls_users u where u.partner_id = p.id), 'subs', (select count(*) from mls_partners c where c.parent_id = p.id),
    'markets', coalesce(p.markets, '[]'::jsonb))
$$;

create or replace function mls_markets_clean(j jsonb) returns jsonb language sql immutable as $$
  select coalesce((select jsonb_agg(distinct m) from jsonb_array_elements_text(case when jsonb_typeof(j) = 'array' then j else '[]'::jsonb end) m where m in ('KR', 'US', 'EU', 'JP', 'CN')), '[]'::jsonb)
$$;

do $$ begin
  if (select prosrc from pg_proc where proname = 'mls_api' and pronamespace = 'public'::regnamespace) not like '%mls_api_v15(%' then
    drop function if exists mls_api_v15(text, jsonb, text);
    alter function mls_api(text, jsonb, text) rename to mls_api_v15;
  end if;
end $$;

create or replace function mls_api(p_action text, p_body jsonb default '{}'::jsonb, p_token text default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare me mls_users; b jsonb := coalesce(p_body, '{}'::jsonb); r jsonb; v text; v_code text;
begin
  if p_action in ('setMainMarket', 'partnerUsers', 'partnerSave') then
    if p_token ~ '^[a-f0-9]{64}$' then select x.* into me from mls_sessions s join mls_users x on x.id = s.user_id where s.token = p_token and s.expires_at > now(); end if;
    if me.id is null then return jsonb_build_object('ok', false, 'error', '로그인이 필요합니다.'); end if;
  end if;
  if p_action = 'setMainMarket' then
    v := upper(coalesce(b->>'market', ''));
    if v not in ('', 'KR', 'US', 'EU', 'JP', 'CN') then return jsonb_build_object('ok', false, 'error', '알 수 없는 요청입니다.'); end if;
    update mls_users set main_market = v where id = me.id returning * into me;
    return jsonb_build_object('ok', true, 'data', mls_user_pub(me));
  end if;
  if p_action = 'partnerUsers' then
    if me.role <> 'admin' then return jsonb_build_object('ok', false, 'error', '관리자 권한이 필요합니다.'); end if;
    return jsonb_build_object('ok', true, 'data', coalesce((select jsonb_agg(jsonb_build_object('id', u.id, 'username', u.username, 'name', u.name, 'status', u.status, 'grade', coalesce(u.grade, 'basic'),
        'cash', u.cash::float8, 'createdAt', mls_iso(u.created_at), 'lastSeen', mls_iso(coalesce(u.last_seen, u.last_login)), 'partner', p.name, 'mainMarket', coalesce(u.main_market, '')) order by u.created_at desc)
      from mls_users u join mls_partners p on p.id = u.partner_id
      where u.role = 'user' and (u.partner_id = b->>'id' or (coalesce((b->>'withSubs')::boolean, false) and u.partner_id in (
        with recursive t as (select id from mls_partners where parent_id = b->>'id' union all select c.id from mls_partners c join t on c.parent_id = t.id) select id from t)))), '[]'::jsonb));
  end if;
  r := mls_api_v15(p_action, p_body, p_token);
  if p_action = 'partnerSave' and coalesce((r->>'ok')::boolean, false) and me.role = 'admin' and not coalesce(me.demo, false) and b ? 'markets' then
    v_code := upper(regexp_replace(coalesce(b->>'code', ''), '[^A-Za-z0-9]', '', 'g'));
    update mls_partners set markets = mls_markets_clean(b->'markets') where (coalesce(b->>'id', '') <> '' and id = b->>'id') or (coalesce(b->>'id', '') = '' and code = v_code);
  end if;
  return r;
end $$;
revoke all on function mls_api_v15(text, jsonb, text) from public;
revoke all on function mls_api(text, jsonb, text) from public;
grant execute on function mls_api(text, jsonb, text) to anon, authenticated;

select 'v16 설치 완료' as result;
