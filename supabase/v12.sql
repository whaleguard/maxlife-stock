-- MAX라이프 주식 v12 — 테스트(체험용) 계정 보호 + AI 예측 기록·적중률
-- v11.sql 다음에 실행 (여러 번 실행해도 안전)

alter table mls_users add column if not exists demo boolean not null default false;

-- AI 예측 기록 (종목·일자당 1건, 기간이 지나면 실제 시세로 판정)
create table if not exists mls_ai_preds (
  id text primary key, code text not null, name text default '', currency text default 'KRW', day date not null,
  score int, opinion text, dir text not null,            -- dir: up(상승) / down(하락) / flat(중립)
  price numeric not null, target numeric, stop numeric, horizon int not null default 5,
  status text not null default 'open',                    -- open / hit / miss / flat
  result_price numeric, ret numeric, max_up numeric, max_dn numeric, judged_at timestamptz, created_at timestamptz not null default now(),
  unique (code, day)
);
create index if not exists mls_ai_preds_code on mls_ai_preds(code, day desc);

update mls_users set demo = true where username = 'tester' and role = 'user';

-- 원화↔USDT 전환액을 주식 계좌 원금에서 따로 계산 (전환이 손실로 보이지 않게)
create or replace function mls_user_pub(u mls_users) returns jsonb language sql stable as $$
  select jsonb_build_object('id', u.id, 'username', u.username, 'name', u.name, 'role', u.role, 'status', u.status, 'phone', u.phone, 'email', u.email,
    'cash', u.cash::float8, 'initial', u.initial::float8, 'watch', coalesce(u.watch, '[]'::jsonb), 'cardTier', coalesce(u.card_tier, ''), 'grade', coalesce(u.grade, 'basic'), 'createdAt', mls_iso(u.created_at), 'lastLogin', mls_iso(u.last_login),
    'demo', coalesce(u.demo, false), 'usdt', coalesce(u.usdt, 0)::float8,
    'convKrw', coalesce((select sum(case when kind = 'convert_in' then krw when kind = 'convert_out' then -krw else 0 end) from mls_usdt_flows where user_id = u.id), 0)::float8)
$$;

create or replace function mls_demo_list() returns jsonb language sql stable as $$
  select coalesce(mls_settings()->'demoAccounts', '[]'::jsonb)
$$;

-- 예측 판정: 기간(거래일 기준 근사: 달력일 horizon*7/5) 경과 또는 목표가·손절가 도달
create or replace function mls_ai_judge() returns int language plpgsql security definer set search_path = public as $$
declare r record; q mls_quotes; n int := 0; v_ret numeric; v_st text; v_due boolean;
begin
  for r in select * from mls_ai_preds where status = 'open' order by day limit 500 loop
    select * into q from mls_quotes where code = r.code; if not found or coalesce(q.price, 0) <= 0 then continue; end if;
    v_ret := (q.price / r.price - 1) * 100;
    update mls_ai_preds set max_up = greatest(coalesce(max_up, v_ret), v_ret), max_dn = least(coalesce(max_dn, v_ret), v_ret) where id = r.id;
    v_due := (now() at time zone 'Asia/Seoul')::date >= r.day + ceil(r.horizon * 7.0 / 5)::int;
    v_st := null;
    if r.dir = 'up' then
      if r.target is not null and q.price >= r.target then v_st := 'hit'; elsif r.stop is not null and q.price <= r.stop then v_st := 'miss';
      elsif v_due then v_st := case when v_ret > 0 then 'hit' else 'miss' end; end if;
    elsif r.dir = 'down' then
      if r.stop is not null and q.price <= r.stop then v_st := 'hit'; elsif r.target is not null and q.price >= r.target then v_st := 'miss';
      elsif v_due then v_st := case when v_ret < 0 then 'hit' else 'miss' end; end if;
    elsif v_due then v_st := case when abs(v_ret) <= 3 then 'hit' else 'miss' end;
    end if;
    if v_st is not null then update mls_ai_preds set status = v_st, result_price = q.price, ret = v_ret, judged_at = now() where id = r.id; n := n + 1; end if;
  end loop;
  return n;
end $$;
revoke all on function mls_ai_judge() from public;

create or replace function mls_ai_stats(p_code text) returns jsonb language sql stable as $$
  with j as (select * from mls_ai_preds where status in ('hit', 'miss') and (p_code is null or code = p_code)),
       d as (select * from j where dir <> 'flat')
  select jsonb_build_object(
    'judged', (select count(*) from j), 'hit', (select count(*) from j where status = 'hit'),
    'rate', (select round(100.0 * count(*) filter (where status = 'hit') / nullif(count(*), 0), 1) from j),
    -- 예측 수익률: 상승 예측은 매수, 하락 예측은 매도(회피)했을 때의 평균 수익률
    'avgRet', (select round(avg(case when dir = 'up' then ret else -ret end), 2) from d),
    'sumRet', (select round(sum(case when dir = 'up' then ret else -ret end), 2) from d),
    'upN', (select count(*) from j where dir = 'up'), 'upHit', (select count(*) from j where dir = 'up' and status = 'hit'),
    'open', (select count(*) from mls_ai_preds where status = 'open' and (p_code is null or code = p_code)),
    'recent', coalesce((select jsonb_agg(jsonb_build_object('code', code, 'name', name, 'day', day, 'dir', dir, 'score', score, 'opinion', opinion, 'price', price, 'target', target, 'stop', stop,
        'status', status, 'result', result_price, 'ret', ret, 'maxUp', max_up, 'maxDn', max_dn, 'horizon', horizon) order by day desc, created_at desc)
      from (select * from mls_ai_preds where (p_code is null or code = p_code) order by day desc, created_at desc limit case when p_code is null then 60 else 20 end) x), '[]'::jsonb),
    'top', case when p_code is null then coalesce((select jsonb_agg(t order by (t->>'rate')::numeric desc nulls last) from (
        select jsonb_build_object('code', code, 'name', max(name), 'n', count(*), 'rate', round(100.0 * count(*) filter (where status = 'hit') / count(*), 1), 'avgRet', round(avg(case when dir = 'up' then ret when dir = 'down' then -ret end), 2)) t
        from j group by code having count(*) >= 2 limit 30) z), '[]'::jsonb) else null end)
$$;

do $$ begin
  if (select prosrc from pg_proc where proname = 'mls_api' and pronamespace = 'public'::regnamespace) not like '%mls_api_v11(%' then
    drop function if exists mls_api_v11(text, jsonb, text);
    alter function mls_api(text, jsonb, text) rename to mls_api_v11;
  end if;
end $$;

create or replace function mls_api(p_action text, p_body jsonb default '{}'::jsonb, p_token text default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare b jsonb := coalesce(p_body, '{}'::jsonb); me mls_users; u mls_users; e jsonb; L jsonb; v_tid text; v_ids jsonb; v_un text; v_tok text; v_dir text; R jsonb;
begin
  -- 공개: 로그인 화면 테스트 계정 목록 포함, AI 적중률
  if p_action = 'publicInfo' then
    e := mls_api_v11(p_action, p_body, p_token);
    if (e->>'ok')::boolean then e := jsonb_set(e, '{data,demoAccounts}', mls_demo_list()); end if;
    return e;
  end if;
  if p_action = 'aiStats' then
    perform mls_ai_judge();
    return jsonb_build_object('ok', true, 'data', mls_ai_stats(nullif(upper(coalesce(b->>'code', '')), '')));
  end if;
  if p_token ~ '^[a-f0-9]{64}$' and p_action not like 'p\_%' escape '\' then
    select x.* into me from mls_sessions s join mls_users x on x.id = s.user_id where s.token = p_token and s.expires_at > now() and x.status = 'active';
  end if;

  -- 테스트 계정: 본인도 비밀번호·정보 변경, 탈퇴, 주문 비밀번호 설정 불가
  if me.id is not null and me.demo and p_action in ('changePassword', 'updateProfile', 'deleteMe', 'setOrderPin') then
    return jsonb_build_object('ok', false, 'error', '테스트 계정은 비밀번호·정보를 바꾸거나 탈퇴할 수 없습니다.');
  end if;

  -- 관리자: 테스트 계정 변경·삭제 차단
  if me.id is not null and me.role = 'admin' then
    v_tid := case when p_action in ('setUserStatus', 'setUserRole', 'setGrade') then b->>'id' when p_action in ('suspendUser', 'accessHours') then b->>'userId' end;
    if v_tid is not null and exists (select 1 from mls_users where id = v_tid and demo) then
      return jsonb_build_object('ok', false, 'error', '테스트 계정은 변경할 수 없습니다. 「수수료·설정 → 테스트 계정」에서 먼저 해제하세요.');
    end if;
    if p_action = 'deleteUsers' and jsonb_typeof(b->'ids') = 'array' then
      if exists (select 1 from mls_users where demo and id in (select jsonb_array_elements_text(b->'ids'))) then
        select coalesce(jsonb_agg(x), '[]'::jsonb) into v_ids from jsonb_array_elements_text(b->'ids') x where x not in (select id from mls_users where demo);
        if jsonb_array_length(v_ids) = 0 then return jsonb_build_object('ok', false, 'error', '테스트 계정은 삭제할 수 없습니다.'); end if;
        b := jsonb_set(b, '{ids}', v_ids);
        return mls_api_v11(p_action, b, p_token);
      end if;
    end if;
    if p_action = 'demoList' then
      return jsonb_build_object('ok', true, 'data', coalesce((select jsonb_agg(d || jsonb_build_object('exists', u2.id is not null, 'userId', u2.id, 'name', u2.name, 'lastSeen', mls_iso(u2.last_seen)))
        from jsonb_array_elements(mls_demo_list()) d left join mls_users u2 on u2.username = d->>'id'), '[]'::jsonb));
    end if;
    if p_action = 'demoAdd' then
      v_un := lower(trim(coalesce(b->>'id', '')));
      if v_un !~ '^[a-z0-9_]{3,20}$' or length(coalesce(b->>'pw', '')) < 4 then return jsonb_build_object('ok', false, 'error', '아이디(영문·숫자 3~20자)와 비밀번호(4자 이상)를 입력해 주세요.'); end if;
      if exists (select 1 from jsonb_array_elements(mls_demo_list()) d where d->>'id' = v_un) then return jsonb_build_object('ok', false, 'error', '이미 등록된 테스트 계정입니다.'); end if;
      select * into u from mls_users where username = v_un;
      if found then
        if u.role = 'admin' then return jsonb_build_object('ok', false, 'error', '관리자 계정은 테스트 계정으로 지정할 수 없습니다.'); end if;
        if u.pw <> extensions.crypt(b->>'pw', u.pw) then return jsonb_build_object('ok', false, 'error', '이미 있는 아이디입니다. 그 계정의 비밀번호가 맞아야 등록됩니다.'); end if;
      else
        e := mls_api_v11('signup', jsonb_build_object('username', v_un, 'pw', b->>'pw', 'name', coalesce(nullif(trim(b->>'name'), ''), v_un)), null);
        if not coalesce((e->>'ok')::boolean, false) then return e; end if;
        v_tok := e->'data'->>'token'; delete from mls_sessions where token = v_tok;
        select * into u from mls_users where username = v_un;
      end if;
      update mls_users set demo = true where id = u.id;
      L := mls_demo_list() || jsonb_build_array(jsonb_build_object('label', left(coalesce(nullif(trim(b->>'label'), ''), '테스터'), 20), 'id', v_un, 'pw', left(b->>'pw', 40)));
      insert into mls_kv (k, v) values ('settings', mls_settings() || jsonb_build_object('demoAccounts', L)) on conflict (k) do update set v = excluded.v;
      insert into mls_audit (by_user, action, detail) values (me.username, 'demoAdd', v_un);
      return jsonb_build_object('ok', true, 'data', L);
    end if;
    if p_action = 'demoRemove' then
      v_un := lower(trim(coalesce(b->>'id', '')));
      select coalesce(jsonb_agg(d), '[]'::jsonb) into L from jsonb_array_elements(mls_demo_list()) d where d->>'id' <> v_un;
      update mls_users set demo = false where username = v_un;
      insert into mls_kv (k, v) values ('settings', mls_settings() || jsonb_build_object('demoAccounts', L)) on conflict (k) do update set v = excluded.v;
      if coalesce((b->>'delete')::boolean, false) then
        select * into u from mls_users where username = v_un;
        if found and u.role <> 'admin' then perform mls_api_v11('deleteUsers', jsonb_build_object('ids', jsonb_build_array(u.id)), p_token); end if;
      end if;
      insert into mls_audit (by_user, action, detail) values (me.username, 'demoRemove', v_un || case when coalesce((b->>'delete')::boolean, false) then ' (계정 삭제)' else '' end);
      return jsonb_build_object('ok', true, 'data', L);
    end if;
  end if;

  -- AI 분석 사용 시 예측 기록 (종목·하루 1건)
  if p_action = 'aiPred' then
    if me.id is null then return jsonb_build_object('ok', false, 'error', '로그인이 필요합니다.'); end if;
    v_dir := case when b->>'dir' in ('up', 'down', 'flat') then b->>'dir' else 'flat' end;
    if coalesce((b->>'price')::numeric, 0) <= 0 or not exists (select 1 from mls_quotes where code = upper(b->>'code')) then return jsonb_build_object('ok', false, 'error', '예측을 기록할 수 없습니다.'); end if;
    insert into mls_ai_preds (id, code, name, currency, day, score, opinion, dir, price, target, stop, horizon)
    values (mls_uid('ap'), upper(b->>'code'), left(coalesce(b->>'name', ''), 40), coalesce(b->>'currency', 'KRW'), (now() at time zone 'Asia/Seoul')::date,
      greatest(0, least(100, coalesce((b->>'score')::int, 50))), left(coalesce(b->>'opinion', ''), 20), v_dir, (b->>'price')::numeric,
      nullif(b->>'target', '')::numeric, nullif(b->>'stop', '')::numeric, greatest(1, least(20, coalesce((b->>'horizon')::int, 5))))
    on conflict (code, day) do nothing;
    return jsonb_build_object('ok', true, 'data', true);
  end if;

  return mls_api_v11(p_action, p_body, p_token);
exception
  when sqlstate 'P0001' then return jsonb_build_object('ok', false, 'error', sqlerrm);
  when others then raise warning '[mls12] % % %', p_action, sqlstate, sqlerrm; return jsonb_build_object('ok', false, 'error', '서버 오류가 발생했습니다.');
end $$;
revoke all on function mls_api_v11(text, jsonb, text) from public;
revoke all on function mls_api(text, jsonb, text) from public;
do $$ begin if exists (select 1 from pg_roles where rolname = 'anon') then
  revoke all on function mls_api_v11(text, jsonb, text) from anon, authenticated;
  grant execute on function mls_api(text, jsonb, text) to anon, authenticated;
end if; end $$;

-- 기존 테스트 계정(tester)을 목록에 등록
do $$ begin
  if exists (select 1 from mls_users where username = 'tester') and not exists (select 1 from jsonb_array_elements(mls_demo_list()) d where d->>'id' = 'tester') then
    insert into mls_kv (k, v) values ('settings', mls_settings() || jsonb_build_object('demoAccounts', mls_demo_list() || '[{"label":"테스터","id":"tester","pw":"tester1234"}]'::jsonb))
    on conflict (k) do update set v = excluded.v;
  end if;
end $$;

-- 매시간 예측 판정
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'mls-ai-judge';
    perform cron.schedule('mls-ai-judge', '7 * * * *', 'select public.mls_ai_judge()');
  end if;
exception when others then null; end $$;
select 'v12 설치 완료' as result;
