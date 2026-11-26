-- MAX라이프 주식 v13 — 등급 한도를 넘는 MAX 버프 신청·종목 집중 버프(총 5·6배)를 관리자 심사로 접수, 집중 버프는 해당 종목만 매수
-- v12.sql 다음에 실행 (여러 번 실행해도 안전)

do $$ begin
  if (select prosrc from pg_proc where proname = 'mls_api' and pronamespace = 'public'::regnamespace) not like '%mls_api_v12(%' then
    drop function if exists mls_api_v12(text, jsonb, text);
    alter function mls_api(text, jsonb, text) rename to mls_api_v12;
  end if;
end $$;

create or replace function mls_api(p_action text, p_body jsonb default '{}'::jsonb, p_token text default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare b jsonb := coalesce(p_body, '{}'::jsonb); me mls_users; st jsonb; g jsonb; v_m numeric; e jsonb; v_id text; bf mls_buffs; v_tc text; v_focus boolean;
begin
  if p_action = 'requestBuff' and p_token ~ '^[a-f0-9]{64}$' then
    select x.* into me from mls_sessions s join mls_users x on x.id = s.user_id where s.token = p_token and s.expires_at > now() and x.status = 'active';
    v_m := coalesce((b->>'mult')::numeric, 0);
    if me.id is not null and v_m in (2, 3, 4, 5) then
      st := mls_settings(); g := mls_grade(me); v_focus := v_m >= 4;
      v_tc := substring(coalesce(b->>'memo', '') from '\[종목 [^\]]* ([0-9A-Z.]{1,12})\]');
      if v_focus and (v_tc is null or not exists (select 1 from mls_quotes where code = v_tc)) then return jsonb_build_object('ok', false, 'error', '종목 집중 신청은 투자할 종목을 선택해야 합니다.'); end if;
      -- 등급(또는 전체) 한도를 넘는 배수·종목 집중: 거절하지 않고 관리자 심사로 접수 (자동 승인 안 함)
      if v_focus or v_m > least(coalesce((st->>'buffMaxMult')::numeric, 3), coalesce((g->>'maxMult')::numeric, 1)) then
        if mls_access_err(me) is not null then return jsonb_build_object('ok', false, 'error', mls_access_err(me)); end if;
        if not coalesce((st->>'buffEnabled')::boolean, true) then return jsonb_build_object('ok', false, 'error', '현재 MAX 버프 신청이 중단되었습니다.'); end if;
        if exists (select 1 from mls_buffs where user_id = me.id and status in ('pending', 'active')) then return jsonb_build_object('ok', false, 'error', '이미 신청 중이거나 사용 중인 버프가 있습니다.'); end if;
        e := mls_eval(me.id);
        if (e->>'net')::numeric < coalesce((st->>'buffMinNet')::numeric, 0) then return jsonb_build_object('ok', false, 'error', '순자산 ' || to_char((st->>'buffMinNet')::numeric, 'FM999,999,999,999') || '원 이상부터 신청할 수 있습니다.'); end if;
        v_id := mls_uid('b');
        insert into mls_buffs (id, user_id, mult, amount, status, rate, maintain, base_net, memo, created_at)
          values (v_id, me.id, v_m, round((e->>'net')::numeric * v_m), 'pending', (g->>'rate')::numeric, case when v_focus then 110 else (g->>'maintain')::numeric end, (e->>'net')::numeric,
            left(coalesce(b->>'memo', '') || case when v_focus then ' [종목 집중 총 ' || (v_m + 1) || '배]' else ' [등급 초과 총 ' || (v_m + 1) || '배]' end, 120), now());
        select * into bf from mls_buffs where id = v_id;
        return jsonb_build_object('ok', true, 'data', mls_buff_j(bf) || jsonb_build_object('review', true));
      end if;
    end if;
  end if;
  -- 종목 집중 버프 사용 중: 다른 종목 매수 차단
  if p_action in ('placeOrder', 'reserveOrder') and coalesce(b->>'side', '') = 'buy' and p_token ~ '^[a-f0-9]{64}$' then
    select x.* into me from mls_sessions s join mls_users x on x.id = s.user_id where s.token = p_token and s.expires_at > now();
    if me.id is not null then
      select * into bf from mls_buffs where user_id = me.id and status = 'active' and memo like '%[종목 집중%' order by approved_at desc limit 1;
      if found then
        v_tc := substring(coalesce(bf.memo, '') from '\[종목 [^\]]* ([0-9A-Z.]{1,12})\]');
        if v_tc is not null and upper(coalesce(b->>'code', '')) <> v_tc then
          return jsonb_build_object('ok', false, 'error', '종목 집중 버프 사용 중에는 ' || coalesce(substring(bf.memo from '\[종목 ([^\]]*) [0-9A-Z.]{1,12}\]'), v_tc) || '만 매수할 수 있습니다. 버프를 상환하면 다른 종목도 매수할 수 있습니다.');
        end if;
      end if;
    end if;
  end if;
  return mls_api_v12(p_action, p_body, p_token);
exception
  when sqlstate 'P0001' then return jsonb_build_object('ok', false, 'error', sqlerrm);
  when others then raise warning '[mls13] % % %', p_action, sqlstate, sqlerrm; return jsonb_build_object('ok', false, 'error', '서버 오류가 발생했습니다.');
end $$;
revoke all on function mls_api_v12(text, jsonb, text) from public;
revoke all on function mls_api(text, jsonb, text) from public;
do $$ begin if exists (select 1 from pg_roles where rolname = 'anon') then
  revoke all on function mls_api_v12(text, jsonb, text) from anon, authenticated;
  grant execute on function mls_api(text, jsonb, text) to anon, authenticated;
end if; end $$;
select 'v13 설치 완료' as result;
