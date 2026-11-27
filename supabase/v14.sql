-- MAX라이프 주식 v14 — 체험용 관리자 계정(조회 전용): 로그인 화면에 공개해도 데이터를 바꿀 수 없음
-- v13.sql 다음에 실행 (여러 번 실행해도 안전)

do $$ begin
  if (select prosrc from pg_proc where proname = 'mls_api' and pronamespace = 'public'::regnamespace) not like '%mls_api_v13(%' then
    drop function if exists mls_api_v13(text, jsonb, text);
    alter function mls_api(text, jsonb, text) rename to mls_api_v13;
  end if;
end $$;

create or replace function mls_api(p_action text, p_body jsonb default '{}'::jsonb, p_token text default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare me mls_users;
begin
  if p_token ~ '^[a-f0-9]{64}$' and p_action not like 'p\_%' escape '\' then
    select x.* into me from mls_sessions s join mls_users x on x.id = s.user_id where s.token = p_token and s.expires_at > now();
    -- 체험용 관리자: 조회만 허용
    if me.id is not null and me.role = 'admin' and coalesce(me.demo, false) and p_action not in (
      'adminInquiries', 'adminPoll', 'adminReserves', 'adminSubs', 'aiStats', 'aiStatus', 'aiUse', 'aiPred', 'allBundles', 'buffs', 'cashflows', 'cfAdmin', 'cfMarkets', 'cfState',
      'consents', 'contestRank', 'contests', 'current', 'dailyStats', 'demoList', 'disclosure', 'disclosures', 'finance', 'funding', 'handover', 'industries', 'industry', 'logout', 'margin',
      'me', 'memberAccess', 'memberSummary', 'missions', 'moneyLog', 'myInquiries', 'myMoneyLog', 'myReserves', 'mySubs', 'noticeConsents', 'notices', 'online', 'orderPinStatus', 'pageStats',
      'partnerComm', 'partnerInqs', 'partnerWds', 'partners', 'posts', 'publicInfo', 'pv', 'ranking', 'revenue', 'riskGet', 'riskList', 'rt', 'settings', 'stakeAdmin', 'stakeProducts',
      'stats', 'templates', 'userBundle', 'userLogins', 'userStats', 'users', 'watchGroups', 'blocks', 'recordSnapshot', 'readInquiries', 'trades', 'watch') then
      return jsonb_build_object('ok', false, 'error', '체험용 관리자 계정은 조회만 할 수 있습니다. 승인·수정·삭제는 운영 관리자 계정에서 가능합니다.');
    end if;
  end if;
  return mls_api_v13(p_action, p_body, p_token);
end $$;
revoke all on function mls_api_v13(text, jsonb, text) from public;
revoke all on function mls_api(text, jsonb, text) from public;
do $$ begin if exists (select 1 from pg_roles where rolname = 'anon') then
  revoke all on function mls_api_v13(text, jsonb, text) from anon, authenticated;
  grant execute on function mls_api(text, jsonb, text) to anon, authenticated;
end if; end $$;

-- 체험용 관리자 계정 생성 (adminview / view1234) + 로그인 화면 목록에 등록
do $$ declare e jsonb; begin
  if not exists (select 1 from mls_users where username = 'adminview') then
    e := mls_api_v13('signup', jsonb_build_object('username', 'adminview', 'pw', 'view1234', 'name', '관리자 체험'), null);
    if coalesce((e->>'ok')::boolean, false) then delete from mls_sessions where token = e->'data'->>'token'; end if;
  end if;
  update mls_users set role = 'admin', demo = true where username = 'adminview';
  if exists (select 1 from mls_users where username = 'adminview') and not exists (select 1 from jsonb_array_elements(mls_demo_list()) d where d->>'id' = 'adminview') then
    insert into mls_kv (k, v) values ('settings', mls_settings() || jsonb_build_object('demoAccounts', mls_demo_list() || '[{"label":"관리자 체험 (조회 전용)","id":"adminview","pw":"view1234","admin":true}]'::jsonb))
    on conflict (k) do update set v = excluded.v;
  end if;
end $$;
select username, role, demo from mls_users where username = 'adminview';
