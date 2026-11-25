-- MAX라이프 주식 v6 — 계정 삭제(관리자 개별·일괄, 이용자 탈퇴), 문의·쪽지 삭제
-- v5.sql 다음에 실행 (여러 번 실행해도 안전)

-- 계정과 그 계정의 모든 기록 삭제
create or replace function mls_purge_user(p_uid text) returns void language plpgsql as $$
begin
  delete from mls_sessions where user_id = p_uid;
  delete from mls_positions where user_id = p_uid;
  delete from mls_orders where user_id = p_uid;
  delete from mls_fills where user_id = p_uid;
  delete from mls_cashflows where user_id = p_uid;
  delete from mls_likes where user_id = p_uid;
  delete from mls_comments where user_id = p_uid;
  delete from mls_snapshots where user_id = p_uid;
  delete from mls_logins where user_id = p_uid;
  delete from mls_buffs where user_id = p_uid;
  delete from mls_inquiries where user_id = p_uid;
  delete from mls_subs where user_id = p_uid;
  delete from mls_ai_usage where user_id = p_uid;
  delete from mls_users where id = p_uid;
end $$;
revoke all on function mls_purge_user(text) from public;

do $$ begin
  if (select prosrc from pg_proc where proname = 'mls_api' and pronamespace = 'public'::regnamespace) not like '%mls_api_v5(%' then
    drop function if exists mls_api_v5(text, jsonb, text);
    alter function mls_api(text, jsonb, text) rename to mls_api_v5;
  end if;
end $$;

create or replace function mls_api(p_action text, p_body jsonb default '{}'::jsonb, p_token text default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare b jsonb := coalesce(p_body, '{}'::jsonb); me mls_users; u mls_users; v_id text; n int := 0; v_names text := '';
begin
  if p_action not in ('deleteUsers', 'deleteMe', 'deleteInquiries') then return mls_api_v5(p_action, p_body, p_token); end if;
  if p_token ~ '^[a-f0-9]{64}$' then
    select x.* into me from mls_sessions s join mls_users x on x.id = s.user_id where s.token = p_token and s.expires_at > now() and x.status = 'active';
  end if;
  if me.id is null then return jsonb_build_object('ok', false, 'error', '로그인이 필요합니다.'); end if;
  case p_action
  when 'deleteUsers' then
    -- 관리자: 회원 계정 삭제 (본인·다른 관리자 계정은 제외)
    if me.role <> 'admin' then return jsonb_build_object('ok', false, 'error', '관리자 권한이 필요합니다.'); end if;
    for v_id in select jsonb_array_elements_text(case when jsonb_typeof(b->'ids') = 'array' then b->'ids' else '[]'::jsonb end) loop
      select * into u from mls_users where id = v_id;
      if u.id is null or u.id = me.id or u.role = 'admin' then continue; end if;
      perform mls_purge_user(u.id); n := n + 1; v_names := v_names || u.username || ' ';
    end loop;
    if n > 0 then insert into mls_audit (at, by_user, action, detail) values (now(), me.username, 'deleteUser', left(n || '명 · ' || v_names || coalesce(' · ' || nullif(b->>'reason', ''), ''), 500)); end if;
    return jsonb_build_object('ok', true, 'data', n);
  when 'deleteMe' then
    -- 이용자 탈퇴: 비밀번호 확인, 버프 사용 중이면 불가
    if me.role = 'admin' then return jsonb_build_object('ok', false, 'error', '관리자 계정은 탈퇴할 수 없습니다.'); end if;
    if me.pw <> extensions.crypt(coalesce(b->>'pw', ''), me.pw) then perform pg_sleep(0.4); return jsonb_build_object('ok', false, 'error', '비밀번호가 올바르지 않습니다.'); end if;
    if exists (select 1 from mls_buffs where user_id = me.id and status = 'active') then return jsonb_build_object('ok', false, 'error', 'MAX 버프 사용 중에는 탈퇴할 수 없습니다. 먼저 상환해 주세요.'); end if;
    insert into mls_audit (at, by_user, action, detail) values (now(), me.username, 'withdraw', left('회원 탈퇴 · ' || me.name || coalesce(' · ' || nullif(b->>'reason', ''), ''), 500));
    perform mls_purge_user(me.id);
    return jsonb_build_object('ok', true, 'data', true);
  when 'deleteInquiries' then
    if me.role <> 'admin' then return jsonb_build_object('ok', false, 'error', '관리자 권한이 필요합니다.'); end if;
    delete from mls_inquiries where id in (select jsonb_array_elements_text(case when jsonb_typeof(b->'ids') = 'array' then b->'ids' else '[]'::jsonb end));
    get diagnostics n = row_count;
    insert into mls_audit (at, by_user, action, detail) values (now(), me.username, 'deleteInquiry', n || '건');
    return jsonb_build_object('ok', true, 'data', n);
  end case;
  return null;
exception
  when sqlstate 'P0001' then return jsonb_build_object('ok', false, 'error', sqlerrm);
  when others then raise warning '[mls6] % %', sqlstate, sqlerrm; return jsonb_build_object('ok', false, 'error', '서버 오류가 발생했습니다.');
end $$;
revoke all on function mls_api_v5(text, jsonb, text) from public;
revoke all on function mls_api(text, jsonb, text) from public;
do $$ begin if exists (select 1 from pg_roles where rolname = 'anon') then
  revoke all on function mls_api_v5(text, jsonb, text) from anon, authenticated;
  grant execute on function mls_api(text, jsonb, text) to anon, authenticated;
end if; end $$;
select 'v6 설치 완료' as result;
