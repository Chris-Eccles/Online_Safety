-- Waiting for Chris's go. Security hardening, hand-in rate limit, and a separate AI total for Env Sci.

-- 1) site_groups checked the site password with no limit on wrong guesses: now counts towards the same lockout as sign-in
create or replace function public.site_groups(p_pw text, p_year integer)
returns json language plpgsql security definer set search_path to '' as $$
begin
  if abity.limited() then return null; end if;
  if not abity.pw_ok('site_pw', lower(trim(p_pw))) then perform abity.fail(); return null; end if;
  return coalesce((select json_agg(name order by name) from abity.groups where year = p_year and not hidden), '[]'::json);
end $$;

-- 2) Rate limit per signed-in device (hand-ins) or per connection (Env Sci marking)
create table if not exists abity.hw_rate (key text not null, at timestamptz not null default now());
create index if not exists hw_rate_key_at on abity.hw_rate (key, at);
alter table abity.hw_rate enable row level security;
revoke all on abity.hw_rate from public, anon, authenticated;

create or replace function public.site_hw_rate(p_key text, p_max integer, p_mins integer)
returns boolean language plpgsql security definer set search_path to '' as $$
declare n int;
begin
  delete from abity.hw_rate where at < now() - interval '1 day';
  select count(*) into n from abity.hw_rate where key = p_key and at > now() - make_interval(mins => p_mins);
  if n >= p_max then return false; end if;
  insert into abity.hw_rate (key) values (p_key);
  return true;
end $$;

-- 3) A separate daily AI total for each extra site (Env Sci: key 'env'), on top of the shared total in abity.ai_usage
create table if not exists abity.ai_usage_key (key text not null, day date not null, neurons numeric not null default 0, primary key (key, day));
alter table abity.ai_usage_key enable row level security;
revoke all on abity.ai_usage_key from public, anon, authenticated;

create or replace function public.site_ai_usage_key(p_key text, p_add numeric)
returns json language plpgsql security definer set search_path to '' as $$
declare d date := (now() at time zone 'utc')::date; t numeric;
begin
  delete from abity.ai_usage_key where day < d - 60;
  if coalesce(p_add, 0) > 0 then
    insert into abity.ai_usage_key (key, day, neurons) values (p_key, d, p_add)
      on conflict (key, day) do update set neurons = abity.ai_usage_key.neurons + excluded.neurons;
  end if;
  select neurons into t from abity.ai_usage_key where key = p_key and day = d;
  return json_build_object('ok', true, 'today', coalesce(t, 0));
end $$;

-- 4) Only the website's public key (anon) may call the public functions; the rest are for the server functions only
do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'site\_%' loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
    if f.proname in ('site_admin','site_answer','site_badge','site_badges','site_confidence','site_gate','site_groups',
                     'site_hw','site_hw_review','site_join','site_poll','site_poll_answer','site_state') then
      execute format('grant execute on function %s to anon', f.sig);
    end if;
  end loop;
end $$;
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon, authenticated;
alter default privileges in schema abity revoke execute on functions from public;
