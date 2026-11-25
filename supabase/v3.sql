-- MAX라이프 주식 v3 — 1:1 문의·쪽지, 관리자 실시간 알림(폴링), 관리자 수익 통계
-- v2.sql 다음에 실행 (여러 번 실행해도 안전)

create table if not exists mls_inquiries (
  id text primary key, user_id text not null, category text not null default 'etc', title text not null, body text not null default '',
  status text not null default 'open' check (status in ('open', 'answered', 'closed')), answer text default '', answered_by text default '',
  from_admin boolean not null default false, read_by_user boolean not null default false,
  created_at timestamptz not null default now(), answered_at timestamptz
);
create index if not exists mls_inq_user on mls_inquiries(user_id);
alter table mls_inquiries enable row level security;
revoke all on mls_inquiries from public;
do $$ begin if exists (select 1 from pg_roles where rolname = 'anon') then revoke all on mls_inquiries from anon, authenticated; end if; end $$;

create or replace function mls_inq_j(i mls_inquiries) returns jsonb language sql stable as $$
  select jsonb_build_object('id', i.id, 'userId', i.user_id, 'category', i.category, 'title', i.title, 'body', i.body, 'status', i.status, 'answer', i.answer, 'answeredBy', i.answered_by,
    'fromAdmin', i.from_admin, 'readByUser', i.read_by_user, 'createdAt', mls_iso(i.created_at), 'answeredAt', mls_iso(i.answered_at))
$$;

-- v3 요청 처리 후 기존(v2) 로 넘김
do $$ begin
  if (select prosrc from pg_proc where proname = 'mls_api' and pronamespace = 'public'::regnamespace) not like '%mls_api_v2(%' then
    drop function if exists mls_api_v2(text, jsonb, text);
    alter function mls_api(text, jsonb, text) rename to mls_api_v2;
  end if;
end $$;

create or replace function mls_api(p_action text, p_body jsonb default '{}'::jsonb, p_token text default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare b jsonb := coalesce(p_body, '{}'::jsonb); me mls_users; v_id text; i mls_inquiries; v_out jsonb;
begin
  if p_action not in ('myInquiries', 'createInquiry', 'readInquiries', 'adminInquiries', 'answerInquiry', 'closeInquiry', 'sendMessage', 'adminPoll', 'revenue', 'bulkCash') then
    return mls_api_v2(p_action, p_body, p_token);
  end if;
  if p_token ~ '^[a-f0-9]{64}$' then
    select u2.* into me from mls_sessions s join mls_users u2 on u2.id = s.user_id where s.token = p_token and s.expires_at > now() and u2.status = 'active';
  end if;
  if me.id is null then perform mls_fail('로그인이 필요합니다.'); end if;
  case p_action
  when 'myInquiries' then
    return jsonb_build_object('ok', true, 'data', coalesce((select jsonb_agg(mls_inq_j(x) order by x.created_at desc) from mls_inquiries x where x.user_id = me.id), '[]'::jsonb));
  when 'createInquiry' then
    if left(trim(coalesce(b->>'title', '')), 100) = '' then perform mls_fail('제목을 입력해 주세요.'); end if;
    if (select count(*) from mls_inquiries where user_id = me.id and created_at > now() - interval '1 hour') >= 10 then perform mls_fail('잠시 후 다시 문의해 주세요.'); end if;
    v_id := mls_uid('q');
    insert into mls_inquiries (id, user_id, category, title, body, read_by_user) values (v_id, me.id, case when b->>'category' in ('cash', 'buff', 'order', 'account', 'lead', 'etc') then b->>'category' else 'etc' end, left(trim(b->>'title'), 100), left(coalesce(b->>'body', ''), 3000), true)
      returning * into i;
    return jsonb_build_object('ok', true, 'data', mls_inq_j(i));
  when 'readInquiries' then
    update mls_inquiries set read_by_user = true where user_id = me.id and read_by_user = false;
    return jsonb_build_object('ok', true, 'data', true);
  else null;
  end case;
  if me.role <> 'admin' then perform mls_fail('관리자 권한이 필요합니다.'); end if;
  case p_action
  when 'adminInquiries' then
    return jsonb_build_object('ok', true, 'data', coalesce((select jsonb_agg(mls_inq_j(x) || jsonb_build_object('username', u.username, 'name', u.name) order by x.created_at desc) from (select * from mls_inquiries order by created_at desc limit 1000) x left join mls_users u on u.id = x.user_id), '[]'::jsonb));
  when 'answerInquiry' then
    if left(trim(coalesce(b->>'answer', '')), 3000) = '' then perform mls_fail('답변을 입력해 주세요.'); end if;
    update mls_inquiries set answer = left(trim(b->>'answer'), 3000), status = 'answered', answered_by = me.username, answered_at = now(), read_by_user = false where id = b->>'id';
    if not found then perform mls_fail('문의를 찾을 수 없습니다.'); end if;
    return jsonb_build_object('ok', true, 'data', true);
  when 'closeInquiry' then
    update mls_inquiries set status = 'closed' where id = b->>'id'; return jsonb_build_object('ok', true, 'data', true);
  when 'sendMessage' then
    if left(trim(coalesce(b->>'title', '')), 100) = '' then perform mls_fail('제목을 입력해 주세요.'); end if;
    insert into mls_inquiries (id, user_id, category, title, body, status, answer, answered_by, from_admin, read_by_user, answered_at)
      select mls_uid('m'), u.id, 'notice', left(trim(b->>'title'), 100), '', 'answered', left(coalesce(b->>'body', ''), 3000), me.username, true, false, now()
      from mls_users u where (case when jsonb_typeof(b->'userIds') = 'array' then u.id in (select jsonb_array_elements_text(b->'userIds')) else u.role <> 'admin' end);
    insert into mls_audit (by_user, action, detail) values (me.username, 'message', left(coalesce(b->>'title', ''), 200));
    return jsonb_build_object('ok', true, 'data', true);
  when 'bulkCash' then
    -- 이벤트·랭킹 보상 일괄 지급
    if coalesce((b->>'amount')::numeric, 0) = 0 then perform mls_fail('금액을 입력해 주세요.'); end if;
    for v_id in select jsonb_array_elements_text(case when jsonb_typeof(b->'userIds') = 'array' then b->'userIds' else '[]'::jsonb end) loop
      perform mls_api_v2('adjustCash', jsonb_build_object('id', v_id, 'amount', (b->>'amount')::numeric, 'memo', coalesce(b->>'memo', '이벤트 지급')), p_token);
    end loop;
    return jsonb_build_object('ok', true, 'data', true);
  when 'adminPoll' then
    -- 관리자 알림용: 처리 대기 건수와 최신 항목
    return jsonb_build_object('ok', true, 'data', jsonb_build_object(
      'now', mls_iso(now()),
      'cash', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'at', mls_iso(c.at), 'type', c.type, 'amount', c.amount::float8, 'method', c.method, 'name', u.name) order by c.at desc) from mls_cashflows c join mls_users u on u.id = c.user_id where c.status = 'pending'), '[]'::jsonb),
      'buffs', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'at', mls_iso(x.created_at), 'mult', x.mult::float8, 'amount', x.amount::float8, 'name', u.name) order by x.created_at desc) from mls_buffs x join mls_users u on u.id = x.user_id where x.status = 'pending'), '[]'::jsonb),
      'inquiries', coalesce((select jsonb_agg(jsonb_build_object('id', q.id, 'at', mls_iso(q.created_at), 'title', q.title, 'category', q.category, 'name', u.name) order by q.created_at desc) from mls_inquiries q join mls_users u on u.id = q.user_id where q.status = 'open' and not q.from_admin), '[]'::jsonb),
      'signups', coalesce((select jsonb_agg(jsonb_build_object('id', u.id, 'at', mls_iso(u.created_at), 'name', u.name, 'username', u.username) order by u.created_at desc) from mls_users u where u.created_at > now() - interval '1 day' and u.role = 'user'), '[]'::jsonb),
      'liquidations', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'at', mls_iso(x.closed_at), 'name', u.name, 'amount', x.amount::float8) order by x.closed_at desc) from mls_buffs x join mls_users u on u.id = x.user_id where x.status = 'liquidated' and x.closed_at > now() - interval '1 day'), '[]'::jsonb),
      'danger', coalesce((select jsonb_agg(jsonb_build_object('userId', x.user_id, 'name', u.name, 'ratio', (mls_eval(x.user_id)->>'ratio')::float8, 'maintain', x.maintain::float8)) from mls_buffs x join mls_users u on u.id = x.user_id where x.status = 'active' and (mls_eval(x.user_id)->>'ratio')::numeric < (mls_settings()->>'buffWarn')::numeric), '[]'::jsonb)));
  when 'revenue' then
    -- 운영 수익: 수수료·세금·버프 이자 (일별 30일)
    return jsonb_build_object('ok', true, 'data', jsonb_build_object(
      'total', jsonb_build_object('fee', coalesce((select sum(fee) from mls_fills), 0)::float8, 'tax', coalesce((select sum(tax) from mls_fills), 0)::float8,
        'interest', coalesce((select sum(case when status = 'active' then mls_buff_interest(x) else interest end) from mls_buffs x where status in ('active', 'repaid', 'liquidated')), 0)::float8,
        'volume', coalesce((select sum(amount) from mls_fills), 0)::float8, 'loan', coalesce((select sum(amount) from mls_buffs where status = 'active'), 0)::float8),
      'daily', coalesce((select jsonb_agg(jsonb_build_object('d', d, 'fee', fee, 'tax', tax, 'vol', vol, 'n', n) order by d) from (
        select to_char(at at time zone 'Asia/Seoul', 'YYYY-MM-DD') d, sum(fee)::float8 fee, sum(tax)::float8 tax, sum(amount)::float8 vol, count(*) n from mls_fills where at > now() - interval '30 days' group by 1) z), '[]'::jsonb),
      'signups', coalesce((select jsonb_agg(jsonb_build_object('d', d, 'n', n) order by d) from (select to_char(created_at at time zone 'Asia/Seoul', 'YYYY-MM-DD') d, count(*) n from mls_users where created_at > now() - interval '30 days' and role = 'user' group by 1) z), '[]'::jsonb)));
  else perform mls_fail('알 수 없는 요청입니다.');
  end case;
  return null;
exception
  when sqlstate 'P0001' then return jsonb_build_object('ok', false, 'error', sqlerrm);
  when others then raise warning '[mls3] % %', sqlstate, sqlerrm; return jsonb_build_object('ok', false, 'error', '서버 오류가 발생했습니다.');
end $$;
revoke all on function mls_api_v2(text, jsonb, text) from public;
revoke all on function mls_api(text, jsonb, text) from public;
do $$ begin if exists (select 1 from pg_roles where rolname = 'anon') then
  revoke all on function mls_api_v2(text, jsonb, text) from anon, authenticated;
  grant execute on function mls_api(text, jsonb, text) to anon, authenticated;
end if; end $$;

-- 번들에 문의·쪽지 포함 (이용자 알림센터용)
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
    'inquiries', coalesce((select jsonb_agg(mls_inq_j(q) order by q.created_at desc) from mls_inquiries q where q.user_id = p_uid), '[]'::jsonb),
    'margin', mls_eval(p_uid),
    'snapshots', coalesce((select jsonb_agg(jsonb_build_array(to_char(d, 'YYYY-MM-DD'), total::float8) order by d desc) from (select * from mls_snapshots where user_id = p_uid order by d desc limit 400) s), '[]'::jsonb));
end $$;
select 'v3 설치 완료' as result;
