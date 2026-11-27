-- v15: 미국 주식도 보고 있는 종목은 실시간(2~3초) 시세 — 네이버 해외주식 실시간 시세, 2초 캐시
-- 기존 국내 실시간(mls_rt_get)을 확장합니다. 여러 번 실행해도 안전합니다.
create or replace function mls_rt_apply(x jsonb, p_code text, t0 timestamptz) returns void language plpgsql security definer set search_path = public, extensions as $$
declare px numeric; lo numeric; hi numeric; old mls_rt; o record;
begin
  px := mls_rt_num(x->>'closePrice'); if px is null or px <= 0 then return; end if;
  lo := mls_rt_num(x->>'lowPrice'); hi := mls_rt_num(x->>'highPrice');
  select * into old from mls_rt where code = p_code;
  insert into mls_rt (code, d, at) values (p_code, jsonb_build_object('price', px, 'open', mls_rt_num(x->>'openPrice'), 'high', hi, 'low', lo,
    'volume', mls_rt_num(x->>'accumulatedTradingVolume'), 'change', mls_rt_num(x->>'compareToPreviousClosePrice'),
    'changePct', mls_rt_num(x->>'fluctuationsRatio'), 'status', x->>'marketStatus', 'at', mls_iso(now())), now())
    on conflict (code) do update set d = excluded.d, at = excluded.at;
  update mls_quotes set price = px, ask = null, bid = null, at = now() where code = p_code and price is distinct from px;
  if x->>'marketStatus' = 'OPEN' and lo > 0 and hi > 0 then
    for o in select id, price from mls_orders where code = p_code and status = 'pending' and type = 'limit'
        and ((side = 'buy' and price >= lo and (created_at < t0 or (old.code is not null and lo < mls_rt_num(old.d->>'low') and created_at < old.at)))
          or (side = 'sell' and price <= hi and (created_at < t0 or (old.code is not null and hi > mls_rt_num(old.d->>'high') and created_at < old.at))))
        order by created_at loop
      begin perform mls_execute(o.id, o.price); exception when others then null; end;
    end loop;
  end if;
end $$;
revoke all on function mls_rt_apply(jsonb, text, timestamptz) from public;

create or replace function mls_rt_get(p_codes text[]) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare need text[]; kr text[]; us text[]; rc text[]; r extensions.http_response; j jsonb; x jsonb; c text;
  t0 timestamptz := ((now() at time zone 'Asia/Seoul')::date + time '09:00') at time zone 'Asia/Seoul';
  t1 timestamptz := ((now() at time zone 'America/New_York')::date + time '09:30') at time zone 'America/New_York';
begin
  p_codes := array(select distinct c2 from unnest(p_codes) c2 where c2 ~ '^[0-9A-Z][0-9A-Z.\-]{0,9}$' limit 40);
  need := array(select c2 from unnest(p_codes) c2 where not exists (select 1 from mls_rt t where t.code = c2 and t.at > now() - interval '2 seconds'));
  kr := array(select c2 from unnest(need) c2 where c2 ~ '^[0-9A-Z]{6}$' and exists (select 1 from mls_quotes q where q.code = c2 and q.currency = 'KRW'));
  us := array(select q.code from mls_quotes q where q.code = any(need) and q.currency = 'USD');
  if array_length(kr, 1) > 0 then
    begin
      perform extensions.http_set_curlopt('CURLOPT_TIMEOUT', '3');
      select * into r from extensions.http_get('https://polling.finance.naver.com/api/realtime/domestic/stock/' || array_to_string(kr, ','));
      j := r.content::jsonb;
      for x in select * from jsonb_array_elements(coalesce(j->'datas', '[]'::jsonb)) loop perform mls_rt_apply(x, x->>'itemCode', t0); end loop;
    exception when others then null; end;
  end if;
  if array_length(us, 1) > 0 then
    begin
      rc := array(select case when q.market = 'NASDAQ' then q.code || '.O' else q.code end from mls_quotes q where q.code = any(us));
      perform extensions.http_set_curlopt('CURLOPT_TIMEOUT', '3');
      select * into r from extensions.http_get('https://polling.finance.naver.com/api/realtime/worldstock/stock/' || array_to_string(rc, ','));
      j := r.content::jsonb;
      for x in select * from jsonb_array_elements(coalesce(j->'datas', '[]'::jsonb)) loop
        c := coalesce(x->>'symbolCode', split_part(x->>'reutersCode', '.', 1));
        if c = any(us) then perform mls_rt_apply(x, c, t1); end if;
      end loop;
    exception when others then null; end;
  end if;
  return coalesce((select jsonb_object_agg(code, d) from mls_rt where code = any(p_codes)), '{}'::jsonb);
end $$;
revoke all on function mls_rt_get(text[]) from public;

insert into mls_kv (k, v) values ('v15_installed', to_jsonb(now()::text)) on conflict (k) do update set v = excluded.v;
select 'v15 설치 완료' as result;
