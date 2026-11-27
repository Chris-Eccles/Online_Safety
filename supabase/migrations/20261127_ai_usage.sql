-- Daily Workers AI use by the marking function (neurons, Cloudflare's billing unit). The free allowance is 10,000 a day
-- for the whole account, reset at 00:00 UTC. The function stops calling the AI past its own budget and leaves written
-- answers for the teacher instead. No student data here: just a number per day.
create table if not exists abity.ai_usage (day date primary key, neurons numeric not null default 0, requests int not null default 0);
alter table abity.ai_usage enable row level security;
revoke all on abity.ai_usage from anon, authenticated;

create or replace function public.site_ai_usage(p_add numeric) returns json
language plpgsql security definer set search_path to '' as $$
declare d date := (now() at time zone 'utc')::date; t numeric;
begin
  delete from abity.ai_usage where day < d - 60;
  if coalesce(p_add, 0) > 0 then
    insert into abity.ai_usage (day, neurons, requests) values (d, p_add, 1)
      on conflict (day) do update set neurons = abity.ai_usage.neurons + excluded.neurons, requests = abity.ai_usage.requests + 1;
  end if;
  select neurons into t from abity.ai_usage where day = d;
  return json_build_object('ok', true, 'today', coalesce(t, 0));
end $$;
revoke all on function public.site_ai_usage(numeric) from public, anon, authenticated;
grant execute on function public.site_ai_usage(numeric) to service_role;

-- Homework list in admin also shows today's AI use and the last 14 days
create or replace function abity.hw_admin(p_action text, a jsonb)
 returns json language plpgsql security definer set search_path to '' as $function$
declare c text; alphabet text := 'abcdefghjkmnpqrstuvwxyz23456789'; i int;
begin
  delete from abity.hw_pending where at < now() - interval '7 days';
  if p_action = 'hw_list' then
    return json_build_object('ok', true, 'homeworks', coalesce((select json_agg(json_build_object('id', h.id, 'code', h.code, 'year', h.year,
      'title', h.title, 'spec', h.spec, 'total', h.total, 'open', h.open, 'created_at', h.created_at,
      'submitted', (select count(*) from abity.hw_receipts r where r.hw_id = h.id
                      and not exists (select 1 from abity.hw_pending p where p.hw_id = h.id and p.hash = r.hash)),
      'awaiting', (select count(*) from abity.hw_pending p where p.hw_id = h.id)) order by h.created_at desc) from abity.homeworks h), '[]'::json),
      'email', (select v from abity.config where k = 'teacher_email'),
      'ai', json_build_object('today', coalesce((select round(neurons) from abity.ai_usage where day = (now() at time zone 'utc')::date), 0),
        'days', coalesce((select json_agg(json_build_object('day', day, 'neurons', round(neurons), 'requests', requests) order by day desc)
                 from abity.ai_usage where day > (now() at time zone 'utc')::date - 14), '[]'::json)));
  elsif p_action = 'hw_get' then
    return json_build_object('ok', true, 'homework', (select json_build_object('id', id, 'code', code, 'year', year, 'title', title, 'source', source, 'data', data) from abity.homeworks where id = (a->>'id')::uuid));
  elsif p_action = 'hw_save' then
    if a->>'id' is not null and a->>'id' <> '' then
      update abity.homeworks set year = (a->>'year')::int, title = a->>'title', spec = coalesce(a->>'spec',''), source = a->>'source',
        data = a->'data', student = a->'student', total = (a->>'total')::int where id = (a->>'id')::uuid;
      return json_build_object('ok', true);
    end if;
    loop
      c := ''; for i in 1..8 loop c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1); end loop;
      exit when not exists (select 1 from abity.homeworks where code = c);
    end loop;
    insert into abity.homeworks (code, year, title, spec, source, data, student, total)
      values (c, (a->>'year')::int, a->>'title', coalesce(a->>'spec',''), a->>'source', a->'data', a->'student', (a->>'total')::int);
    return json_build_object('ok', true, 'code', c);
  elsif p_action = 'hw_open' then
    update abity.homeworks set open = (a->>'on')::boolean where id = (a->>'id')::uuid;
    return json_build_object('ok', true);
  elsif p_action = 'hw_delete' then
    delete from abity.homeworks where id = (a->>'id')::uuid;
    return json_build_object('ok', true);
  elsif p_action = 'hw_reset' then
    delete from abity.hw_pending where hw_id = (a->>'id')::uuid;
    delete from abity.hw_receipts where hw_id = (a->>'id')::uuid;
    return json_build_object('ok', true);
  elsif p_action = 'teacher_email' then
    if coalesce(a->>'email','') !~* '^[^@\s]+@mgs\.kent\.sch\.uk$' then
      return json_build_object('ok', false, 'error', 'Use a school address ending @mgs.kent.sch.uk.');
    end if;
    update abity.config set v = lower(trim(a->>'email')) where k = 'teacher_email';
    return json_build_object('ok', true);
  end if;
  return null;
end $function$;
