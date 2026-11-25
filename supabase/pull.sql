-- 시세 자동 반영: Supabase 가 5분마다 GitHub data 브랜치의 quotes.json 을 직접 가져옴 (비밀값 불필요)
create extension if not exists http with schema extensions;
create extension if not exists pg_cron;

create or replace function mls_pull_quotes() returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare r extensions.http_response; j jsonb; n int;
begin
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT', '30');
  select * into r from extensions.http_get('https://raw.githubusercontent.com/whaleguard/maxlife-stock/data/quotes.json');
  if r.status <> 200 then return jsonb_build_object('ok', false, 'status', r.status); end if;
  j := r.content::jsonb;
  if coalesce(j->>'status', '') <> 'LIVE' then return jsonb_build_object('ok', false, 'error', 'not live'); end if;
  insert into mls_quotes (code, name, market, currency, price, prev, ask, bid, upper, lower, at)
    select e.key, e.value->>'name', e.value->>'market', e.value->>'currency', (e.value->>'price')::numeric, nullif(e.value->>'prevClose', '')::numeric,
      nullif(j->'books'->e.key->'asks'->0->>0, '')::numeric, nullif(j->'books'->e.key->'bids'->0->>0, '')::numeric,
      nullif(e.value->>'upper', '')::numeric, nullif(e.value->>'lower', '')::numeric, now()
    from jsonb_each(j->'items') e where (e.value->>'price')::numeric > 0
  on conflict (code) do update set name = excluded.name, market = excluded.market, currency = excluded.currency, price = excluded.price, prev = excluded.prev,
    ask = excluded.ask, bid = excluded.bid, upper = excluded.upper, lower = excluded.lower, at = excluded.at;
  get diagnostics n = row_count;
  -- 호가가 없어진 종목은 호가 비움
  update mls_quotes set ask = null, bid = null where at < now() - interval '1 second' and ask is not null and not (j->'books' ? code);
  insert into mls_kv (k, v) values ('quotes_meta', jsonb_build_object('fx', coalesce((j->>'fx')::numeric, mls_fx()), 'at', now(), 'n', n, 'src', j->>'updatedAt')) on conflict (k) do update set v = excluded.v;
  perform mls_match_pending(true);
  return jsonb_build_object('ok', true, 'n', n, 'src', j->>'updatedAt');
end $$;
revoke all on function mls_pull_quotes() from public;
do $$ begin if exists (select 1 from pg_roles where rolname = 'anon') then revoke all on function mls_pull_quotes() from anon, authenticated; end if; end $$;

select cron.unschedule(jobid) from cron.job where jobname = 'mls-quotes';
select cron.schedule('mls-quotes', '*/5 * * * *', 'select public.mls_pull_quotes()');
select mls_pull_quotes() as first_pull;
