-- MAX라이프 주식 v9 — 회원 접속 제한(기간 정지·강제 로그아웃·중복 접속 차단·접속 허용 시간), 투자성향 진단
-- v8.sql 다음에 실행 (여러 번 실행해도 안전)

alter table mls_users add column if not exists suspend_until timestamptz;
alter table mls_users add column if not exists suspend_reason text default '';
alter table mls_users add column if not exists risk jsonb;
alter table mls_users add column if not exists access_hours text default '';   -- 예: '09:00-18:00' (비우면 제한 없음)

-- 접속 허용 시간 확인 (KST, 자정 넘김 지원)
create or replace function mls_in_hours(p text) returns boolean language plpgsql stable as $$
declare a int; b int; hm int := extract(hour from now() at time zone 'Asia/Seoul') * 60 + extract(minute from now() at time zone 'Asia/Seoul');
begin
  if coalesce(p, '') !~ '^\d{2}:\d{2}-\d{2}:\d{2}$' then return true; end if;
  a := split_part(split_part(p, '-', 1), ':', 1)::int * 60 + split_part(split_part(p, '-', 1), ':', 2)::int;
  b := split_part(split_part(p, '-', 2), ':', 1)::int * 60 + split_part(split_part(p, '-', 2), ':', 2)::int;
  return case when a <= b then hm >= a and hm < b else hm >= a or hm < b end;
end $$;

create or replace function mls_access_err(u mls_users) returns text language sql stable as $$
  select case
    when u.role = 'admin' then null
    when u.suspend_until is not null and u.suspend_until > now() then '접속이 제한된 계정입니다. (' || to_char(u.suspend_until at time zone 'Asia/Seoul', 'YYYY-MM-DD HH24:MI') || '까지' || coalesce(' · ' || nullif(u.suspend_reason, ''), '') || ')'
    when not mls_in_hours(u.access_hours) then '지금은 접속할 수 없는 시간입니다. (접속 가능 시간 ' || u.access_hours || ')'
    else null end
$$;

do $$ begin
  if (select prosrc from pg_proc where proname = 'mls_api' and pronamespace = 'public'::regnamespace) not like '%mls_api_v8(%' then
    drop function if exists mls_api_v8(text, jsonb, text);
    alter function mls_api(text, jsonb, text) rename to mls_api_v8;
  end if;
end $$;

create or replace function mls_api(p_action text, p_body jsonb default '{}'::jsonb, p_token text default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare b jsonb := coalesce(p_body, '{}'::jsonb); me mls_users; u mls_users; e jsonb; v_err text; v_tok text; st jsonb := mls_settings(); n int;
begin
  -- 로그인: 기간 정지·접속 시간 확인, 중복 접속 차단
  if p_action = 'login' then
    e := mls_api_v8(p_action, p_body, p_token);
    if (e->>'ok')::boolean then
      select * into u from mls_users where id = e->'data'->'user'->>'id';
      v_tok := e->'data'->>'token'; v_err := mls_access_err(u);
      if v_err is not null then delete from mls_sessions where token = v_tok; return jsonb_build_object('ok', false, 'error', v_err); end if;
      if coalesce((st->>'singleSession')::boolean, false) and u.role <> 'admin' then delete from mls_sessions where user_id = u.id and token <> v_tok; end if;
    end if;
    return e;
  end if;
  if p_token ~ '^[a-f0-9]{64}$' and p_action not like 'p\_%' escape '\' then
    select x.* into me from mls_sessions s join mls_users x on x.id = s.user_id where s.token = p_token and s.expires_at > now() and x.status = 'active';
    if me.id is not null then
      v_err := mls_access_err(me);
      if v_err is not null then delete from mls_sessions where token = p_token; return jsonb_build_object('ok', false, 'error', v_err); end if;
    end if;
  end if;
  if p_action not in ('riskSave', 'riskGet', 'suspendUser', 'kickUser', 'accessHours', 'memberAccess', 'riskList', 'saveSettings') then return mls_api_v8(p_action, p_body, p_token); end if;
  if me.id is null then return jsonb_build_object('ok', false, 'error', '로그인이 필요합니다.'); end if;
  case p_action
  when 'saveSettings' then
    if me.role <> 'admin' then return mls_api_v8(p_action, p_body, p_token); end if;
    if b ? 'singleSession' then insert into mls_kv (k, v) values ('settings', mls_settings() || jsonb_build_object('singleSession', coalesce((b->>'singleSession')::boolean, false))) on conflict (k) do update set v = excluded.v; end if;
    b := b - 'singleSession';
    if b = '{}'::jsonb then return jsonb_build_object('ok', true, 'data', mls_settings()); end if;
    return mls_api_v8(p_action, b, p_token);
  when 'riskSave' then
    -- 투자성향 진단 결과 저장 (점수·유형·응답)
    if jsonb_typeof(b->'answers') <> 'array' then return jsonb_build_object('ok', false, 'error', '응답이 필요합니다.'); end if;
    update mls_users set risk = jsonb_build_object('score', greatest(0, least(100, coalesce((b->>'score')::int, 0))), 'type', left(coalesce(b->>'type', ''), 20), 'answers', b->'answers', 'at', mls_iso(now())) where id = me.id;
    return jsonb_build_object('ok', true, 'data', true);
  when 'riskGet' then
    return jsonb_build_object('ok', true, 'data', (select risk from mls_users where id = case when me.role = 'admin' and coalesce(b->>'userId', '') <> '' then b->>'userId' else me.id end));
  else null;
  end case;
  if me.role <> 'admin' then return jsonb_build_object('ok', false, 'error', '관리자 권한이 필요합니다.'); end if;
  case p_action
  when 'suspendUser' then
    -- 기간 정지: until 비우면 해제
    select * into u from mls_users where id = b->>'userId'; if not found or u.role = 'admin' then return jsonb_build_object('ok', false, 'error', '대상 회원을 확인해 주세요.'); end if;
    update mls_users set suspend_until = nullif(b->>'until', '')::timestamptz, suspend_reason = left(coalesce(b->>'reason', ''), 200) where id = u.id;
    if nullif(b->>'until', '') is not null then delete from mls_sessions where user_id = u.id; end if;
    insert into mls_audit (at, by_user, action, detail) values (now(), me.username, 'suspend', u.username || ' → ' || coalesce(nullif(b->>'until', ''), '해제') || coalesce(' · ' || nullif(b->>'reason', ''), ''));
    return jsonb_build_object('ok', true, 'data', true);
  when 'kickUser' then
    delete from mls_sessions where user_id = b->>'userId'; get diagnostics n = row_count;
    insert into mls_audit (at, by_user, action, detail) values (now(), me.username, 'kick', coalesce(b->>'userId', '') || ' · ' || n || '개 세션');
    return jsonb_build_object('ok', true, 'data', n);
  when 'accessHours' then
    if coalesce(b->>'hours', '') <> '' and b->>'hours' !~ '^\d{2}:\d{2}-\d{2}:\d{2}$' then return jsonb_build_object('ok', false, 'error', '시간을 09:00-18:00 형식으로 입력해 주세요.'); end if;
    update mls_users set access_hours = coalesce(b->>'hours', '') where id = b->>'userId' and role <> 'admin';
    return jsonb_build_object('ok', true, 'data', true);
  when 'memberAccess' then
    select * into u from mls_users where id = b->>'userId';
    return jsonb_build_object('ok', true, 'data', jsonb_build_object('suspendUntil', mls_iso(u.suspend_until), 'suspendReason', u.suspend_reason, 'accessHours', u.access_hours, 'risk', u.risk,
      'sessions', (select count(*) from mls_sessions where user_id = u.id and expires_at > now()), 'lastSeen', mls_iso(u.last_seen), 'device', u.device));
  when 'riskList' then
    return jsonb_build_object('ok', true, 'data', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'username', username, 'risk', risk, 'suspendUntil', mls_iso(suspend_until), 'accessHours', access_hours)) from mls_users where role = 'user'), '[]'::jsonb));
  end case;
  return null;
exception
  when sqlstate 'P0001' then return jsonb_build_object('ok', false, 'error', sqlerrm);
  when others then raise warning '[mls9] % % %', p_action, sqlstate, sqlerrm; return jsonb_build_object('ok', false, 'error', '서버 오류가 발생했습니다.');
end $$;
revoke all on function mls_api_v8(text, jsonb, text) from public;
revoke all on function mls_api(text, jsonb, text) from public;
do $$ begin if exists (select 1 from pg_roles where rolname = 'anon') then
  revoke all on function mls_api_v8(text, jsonb, text) from anon, authenticated;
  grant execute on function mls_api(text, jsonb, text) to anon, authenticated;
end if; end $$;
select 'v9 설치 완료' as result;
