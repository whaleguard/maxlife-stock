-- MAX라이프 주식 v11 — AI 자금조달 분석(전환사채·신주인수권부사채·교환사채·유상증자·전환가액 조정·CB 전환 상장 공시 수집)
-- v10.sql 다음에 실행 (여러 번 실행해도 안전)

-- HTML 공시 본문 → 표 칸 단위 텍스트 (짧은 칸만 남기고, 조정 한도 문장은 따로)
create or replace function mls_strip(h text) returns text language sql immutable as $$
  select regexp_replace(replace(replace(replace(replace(replace(regexp_replace(coalesce(h, ''), '<[^>]+>', ' | ', 'g'), '&nbsp;', ' '), '&#160;', ' '), '&lt;', '<'), '&gt;', '>'), '&amp;', '&'), '(\s*\|\s*)+', ' | ', 'g')
$$;

create or replace function mls_funding(p_code text) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare r extensions.http_response; c mls_disc; L jsonb; x record; d jsonb; t text; v_short text; v_long text; out jsonb := '[]'::jsonb; titles jsonb; n_new int := 0; partial boolean := false; v_k text;
begin
  if coalesce(p_code, '') !~ '^[0-9A-Z]{6}$' then return null; end if;
  select * into c from mls_disc where k = p_code || ':fund' and at > now() - interval '1 hour';
  if found then return c.d; end if;
  -- 최근 공시 100건
  v_k := p_code || ':flist';
  select * into c from mls_disc where k = v_k and at > now() - interval '1 hour';
  if found then L := c.d; else
    begin
      perform extensions.http_set_curlopt('CURLOPT_TIMEOUT', '5');
      select * into r from extensions.http_get('https://m.stock.naver.com/api/stock/' || p_code || '/disclosure?pageSize=100&page=1');
      if r.status = 200 then L := r.content::jsonb; insert into mls_disc (k, d, at) values (v_k, L, now()) on conflict (k) do update set d = excluded.d, at = excluded.at; end if;
    exception when others then null; end;
    if L is null then L := coalesce((select d from mls_disc where k = v_k), '[]'::jsonb); end if;
  end if;
  if jsonb_typeof(L) <> 'array' then L := '[]'::jsonb; end if;
  -- 자본·지배구조 관련 공시 제목 (본문 없이)
  select coalesce(jsonb_agg(jsonb_build_object('id', e->>'disclosureId', 'title', e->>'title', 'at', e->>'datetime') order by e->>'datetime' desc), '[]'::jsonb) into titles
    from jsonb_array_elements(L) e
    where e->>'title' ~ '전환사채|신주인수권|교환사채|증자|감자|자기주식|최대주주|대량보유|주식등의|추가상장|전환가액|행사가액|교환가액|만기전사채|조기상환|무상|주식분할|주식병합|합병|분할결정';
  -- 본문이 필요한 공시 (발행결정 우선, 최대 14건)
  for x in
    select * from (select *, row_number() over (partition by pr order by at desc) as rn from (
      select e->>'disclosureId' as id, e->>'title' as title, e->>'datetime' as at,
        case when e->>'title' ~ '(전환사채권|신주인수권부사채권|교환사채권)발행결정' then 1 when e->>'title' ~ '유상증자결정' then 2
          when e->>'title' ~ '(전환|행사|교환)가액의?\s*조정' then 3 when e->>'title' ~ '만기전\s*사채\s*취득' then 4 else 5 end as pr
      from jsonb_array_elements(L) e
      where e->>'title' ~ '(전환사채권|신주인수권부사채권|교환사채권)발행결정|유상증자결정|(전환|행사|교환)가액의?\s*조정|추가상장\(.*(CB|전환|신주인수권|BW|교환|유상)|만기전\s*사채\s*취득'
        and e->>'title' !~ '종속회사|자회사') y) z
    where rn <= case pr when 1 then 6 when 2 then 3 when 3 then 5 when 4 then 2 else 4 end
    order by pr, at desc
  loop
    exit when jsonb_array_length(out) >= 14;
    if not exists (select 1 from mls_disc where k = p_code || ':' || x.id) then
      if n_new >= 7 then partial := true; continue; end if;
      n_new := n_new + 1;
    end if;
    d := mls_disc_get(p_code, x.id);
    t := mls_strip(d->'disclosure'->>'contents');
    if length(t) < 20 then continue; end if;
    select string_agg(s, ' | ' order by i) into v_short from regexp_split_to_table(t, '\s*\|\s*') with ordinality a(s, i) where length(s) between 1 and 160 and s !~ '^[①-⑳]';
    v_short := left(substr(v_short, greatest(1, strpos(v_short, '1.'))), 6000);
    select left(string_agg(left(s, 600), ' || ' order by i), 1800) into v_long from regexp_split_to_table(t, '\s*\|\s*') with ordinality a(s, i) where length(s) > 160 and s ~ '이상이어야|이상으로 한다|최저 조정|하향 조정|리픽싱|미만으로 조정|조기상환청구|매도청구|콜옵션|풋옵션';
    out := out || jsonb_build_object('id', x.id, 'title', x.title, 'at', x.at, 'text', v_short, 'extra', coalesce(v_long, ''));
  end loop;
  d := jsonb_build_object('docs', out, 'titles', titles, 'partial', partial, 'count', jsonb_array_length(L), 'since', (select min(e->>'datetime') from jsonb_array_elements(L) e));
  if not partial then insert into mls_disc (k, d, at) values (p_code || ':fund', d, now()) on conflict (k) do update set d = excluded.d, at = excluded.at; end if;
  return d;
end $$;
revoke all on function mls_funding(text) from public;

do $$ begin
  if (select prosrc from pg_proc where proname = 'mls_api' and pronamespace = 'public'::regnamespace) not like '%mls_api_v10(%' then
    drop function if exists mls_api_v10(text, jsonb, text);
    alter function mls_api(text, jsonb, text) rename to mls_api_v10;
  end if;
end $$;

create or replace function mls_api(p_action text, p_body jsonb default '{}'::jsonb, p_token text default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
  if p_action = 'funding' then return jsonb_build_object('ok', true, 'data', mls_funding(upper(coalesce(p_body->>'code', '')))); end if;
  return mls_api_v10(p_action, p_body, p_token);
exception
  when others then raise warning '[mls11] % % %', p_action, sqlstate, sqlerrm; return jsonb_build_object('ok', false, 'error', '서버 오류가 발생했습니다.');
end $$;
revoke all on function mls_api_v10(text, jsonb, text) from public;
revoke all on function mls_api(text, jsonb, text) from public;
do $$ begin if exists (select 1 from pg_roles where rolname = 'anon') then
  revoke all on function mls_api_v10(text, jsonb, text) from anon, authenticated;
  grant execute on function mls_api(text, jsonb, text) to anon, authenticated;
end if; end $$;
select 'v11 설치 완료' as result;
