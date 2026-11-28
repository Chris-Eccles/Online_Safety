-- Admin rebuild: teachers, a course and scheme-of-work position for each group, a log of what was sent or opened
-- for each group, homework linked to a course and scheme-of-work week, a fixed master password, and homework
-- results emailed to the teacher of the student's group.

create table if not exists abity.teachers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 40),
  email text not null unique check (email ~* '^[^@\s]+@mgs\.kent\.sch\.uk$'),
  created_at timestamptz not null default now()
);
alter table abity.teachers enable row level security;
revoke all on abity.teachers from anon, authenticated;
insert into abity.teachers (name, email) values ('Mr Eccles', 'ceccles@mgs.kent.sch.uk'), ('Mr Martin', 'ojm@mgs.kent.sch.uk') on conflict (email) do nothing;

alter table abity.groups add column if not exists teacher_id uuid references abity.teachers(id) on delete set null;
alter table abity.groups add column if not exists course text not null default 'ks3' check (course in ('ks3', 'gcse3', 'gcse2', 'alevel'));
alter table abity.groups add column if not exists pos_year int check (pos_year between 7 and 13);
alter table abity.groups add column if not exists pos_term int check (pos_term between 1 and 6);
alter table abity.groups add column if not exists pos_week int check (pos_week between 1 and 7);
update abity.groups set course = case when year >= 12 then 'alevel' when year >= 10 then 'gcse3' else 'ks3' end;
update abity.groups set teacher_id = (select id from abity.teachers where email = 'ceccles@mgs.kent.sch.uk') where teacher_id is null and not hidden;

-- What has happened for each group: preps sent (ref = scheme-of-work week), homework sent (ref = homework id),
-- worksheets opened (ref = lesson id). Worksheets open for students when their row is here.
create table if not exists abity.sent (
  group_id uuid not null references abity.groups(id) on delete cascade,
  kind text not null check (kind in ('prep', 'hw', 'ws')),
  ref text not null check (length(ref) between 1 and 60),
  at timestamptz not null default now(),
  primary key (group_id, kind, ref)
);
alter table abity.sent enable row level security;
revoke all on abity.sent from anon, authenticated;

alter table abity.homeworks add column if not exists course text check (course in ('ks3', 'gcse3', 'gcse2', 'alevel'));
alter table abity.homeworks add column if not exists sow_id text check (length(sow_id) <= 30);
alter table abity.homeworks drop constraint if exists homeworks_year_check;
alter table abity.homeworks add constraint homeworks_year_check check (year between 9 and 13);

-- Master password: fixed, stored only as a bcrypt hash, and no admin action can change it.
-- (applied with the bcrypt hash of the master password; the hash is not kept in the repository)
-- insert into abity.config (k, v) values ('master_pw', '<bcrypt hash>') on conflict (k) do nothing;

create or replace function abity.admin_ok(p_pw text) returns boolean language sql stable security definer set search_path to '' as $$
  select abity.pw_ok('admin_pw', p_pw) or abity.pw_ok('master_pw', p_pw);
$$;
revoke all on function abity.admin_ok(text) from public, anon, authenticated;

-- Groups that may hand in a homework: the homework's course, or (older homeworks with no course) its year.
create or replace function abity.hw_groups(p_hw uuid) returns json language sql stable security definer set search_path to '' as $$
  select coalesce(json_agg(json_build_object('year', g.year, 'name', g.name,
           'email', coalesce(t.email, (select v from abity.config where k = 'teacher_email'))) order by g.year, g.name), '[]'::json)
  from abity.homeworks h join abity.groups g on (h.course is not null and g.course = h.course) or (h.course is null and g.year = h.year)
  left join abity.teachers t on t.id = g.teacher_id
  where h.id = p_hw and (not g.hidden or g.name = 'DEMO');
$$;
revoke all on function abity.hw_groups(uuid) from public, anon, authenticated;

create or replace function public.site_hw(p_code text) returns json language plpgsql security definer set search_path to '' as $$
declare h abity.homeworks;
begin
  select * into h from abity.homeworks where code = p_code;
  if h.id is null then return json_build_object('ok', false); end if;
  if not h.open then return json_build_object('ok', false, 'closed', true, 'title', h.title); end if;
  return json_build_object('ok', true, 'code', h.code, 'year', h.year, 'hw', h.student,
    'groups', (select coalesce(json_agg(json_build_object('year', (x->>'year')::int, 'name', x->>'name')), '[]'::json)
               from json_array_elements(abity.hw_groups(h.id)) x where x->>'name' <> 'DEMO'));
end $$;

create or replace function public.site_hw_full(p_code text) returns json language sql stable security definer set search_path to '' as $$
  select json_build_object('id', h.id, 'code', h.code, 'year', h.year, 'title', h.title, 'spec', h.spec, 'open', h.open, 'data', h.data,
    'course', h.course, 'groups', abity.hw_groups(h.id),
    'salt', (select v from abity.config where k = 'hw_salt'), 'email', (select v from abity.config where k = 'teacher_email'))
  from abity.homeworks h where h.code = p_code;
$$;

-- Admin actions for teachers, groups, positions and the sent log.
create or replace function abity.team_admin(p_action text, a jsonb) returns json language plpgsql security definer set search_path to '' as $$
declare gid uuid; tid uuid;
begin
  if p_action = 'teacher_save' then
    if coalesce(a->>'email','') !~* '^[^@\s]+@mgs\.kent\.sch\.uk$' then return json_build_object('ok', false, 'error', 'Use a school address ending @mgs.kent.sch.uk.'); end if;
    if length(trim(coalesce(a->>'name',''))) < 1 then return json_build_object('ok', false, 'error', 'Give the teacher a name.'); end if;
    if nullif(a->>'id','') is null then
      insert into abity.teachers (name, email) values (trim(a->>'name'), lower(trim(a->>'email')));
    else
      update abity.teachers set name = trim(a->>'name'), email = lower(trim(a->>'email')) where id = (a->>'id')::uuid;
    end if;
    return json_build_object('ok', true);
  elsif p_action = 'teacher_delete' then
    delete from abity.teachers where id = (a->>'id')::uuid;
    return json_build_object('ok', true);
  elsif p_action = 'group_save' then
    tid := nullif(a->>'teacher_id','')::uuid;
    if nullif(a->>'id','') is null then
      if length(trim(coalesce(a->>'pw',''))) < 4 then return json_build_object('ok', false, 'error', 'Give the group a password of 4 or more characters.'); end if;
      insert into abity.groups (year, name, pw, teacher_id, course, pos_year, pos_term, pos_week)
        values ((a->>'year')::int, upper(trim(a->>'name')), lower(trim(a->>'pw')), tid, a->>'course',
                nullif(a->>'pos_year','')::int, nullif(a->>'pos_term','')::int, nullif(a->>'pos_week','')::int);
    else
      gid := (a->>'id')::uuid;
      update abity.groups set year = (a->>'year')::int, name = upper(trim(a->>'name')), teacher_id = tid, course = a->>'course',
        pos_year = nullif(a->>'pos_year','')::int, pos_term = nullif(a->>'pos_term','')::int, pos_week = nullif(a->>'pos_week','')::int where id = gid;
      if length(trim(coalesce(a->>'pw',''))) >= 4 then
        update abity.groups set pw = lower(trim(a->>'pw')), pw_ver = pw_ver + 1 where id = gid and pw <> lower(trim(a->>'pw'));
        delete from abity.tokens t using abity.groups g where t.group_id = g.id and g.id = gid and t.pw_ver <> g.pw_ver;
      end if;
    end if;
    return json_build_object('ok', true);
  elsif p_action = 'group_pos' then
    update abity.groups set pos_year = (a->>'pos_year')::int, pos_term = (a->>'pos_term')::int, pos_week = (a->>'pos_week')::int where id = (a->>'group_id')::uuid;
    return json_build_object('ok', true);
  elsif p_action = 'mark' then
    if (a->>'on')::boolean then
      insert into abity.sent (group_id, kind, ref) values ((a->>'group_id')::uuid, a->>'kind', a->>'ref') on conflict do nothing;
    else
      delete from abity.sent where group_id = (a->>'group_id')::uuid and kind = a->>'kind' and ref = a->>'ref';
    end if;
    return json_build_object('ok', true);
  end if;
  return json_build_object('ok', false, 'error', 'unknown action');
exception when unique_violation then return json_build_object('ok', false, 'error', 'That already exists (group names are unique in a year; emails are unique).');
         when check_violation then return json_build_object('ok', false, 'error', 'Check the details: group names 1-12 characters, passwords 4-40.');
end $$;
revoke all on function abity.team_admin(text, jsonb) from public, anon, authenticated;

create or replace function public.site_admin(p_pw text, p_action text, p_args jsonb DEFAULT '{}'::jsonb) returns json language plpgsql security definer set search_path to '' as $function$
declare a jsonb := coalesce(p_args, '{}'::jsonb); gid uuid;
begin
  if abity.limited() then return json_build_object('ok', false, 'wait', true); end if;
  if not abity.admin_ok(p_pw) then perform abity.fail(); return json_build_object('ok', false, 'auth', false); end if;

  if p_action = 'list' then
    return json_build_object('ok', true,
      'groups', coalesce((select json_agg(json_build_object('id', id, 'year', year, 'name', name, 'pw', pw, 'teacher_id', teacher_id, 'course', course,
          'pos_year', pos_year, 'pos_term', pos_term, 'pos_week', pos_week) order by year, name) from abity.groups where not hidden), '[]'::json),
      'teachers', coalesce((select json_agg(json_build_object('id', id, 'name', name, 'email', email) order by created_at) from abity.teachers), '[]'::json),
      'sent', coalesce((select json_agg(json_build_object('group_id', group_id, 'kind', kind, 'ref', ref, 'at', at)) from abity.sent), '[]'::json),
      'items', coalesce((select json_agg(json_build_object('item', i.item, 'year', i.year, 'term', i.term, 'title', i.title,
          'lessons', (select json_agg(json_build_object('lesson', l.lesson, 'title', l.title) order by l.sort) from abity.lessons l where l.item = i.item))
          order by i.year, i.term, i.sort) from abity.items i), '[]'::json),
      'switches', coalesce((select json_agg(json_build_object('group_id', group_id, 'item', item, 'lesson', lesson)) from abity.switches), '[]'::json));
  elsif p_action like 'hw\_%' or p_action = 'teacher_email' then
    return abity.hw_admin(p_action, a);
  elsif p_action like 'poll\_%' then
    return abity.poll_admin(p_action, a);
  elsif p_action in ('teacher_save', 'teacher_delete', 'group_save', 'group_pos', 'mark') then
    return abity.team_admin(p_action, a);
  elsif p_action = 'demo' then
    return abity.demo_token(coalesce((a->>'year')::int, 7));
  elsif p_action = 'results' then
    return json_build_object('ok', true, 'questions', abity.results((a->>'year')::int, nullif(a->>'group_id','')::uuid, a->>'item'),
      'confidence', abity.conf_results((a->>'year')::int, nullif(a->>'group_id','')::uuid, a->>'item'));
  elsif p_action = 'results_clear' then
    delete from abity.answers an using abity.tokens t, abity.groups g
     where an.token = t.token and t.group_id = g.id and g.year = (a->>'year')::int
       and (nullif(a->>'group_id','') is null or g.id = (a->>'group_id')::uuid)
       and an.item = a->>'item' and an.qid like (a->>'lesson') || ':%';
    delete from abity.confidence cf using abity.tokens t, abity.groups g
     where cf.token = t.token and t.group_id = g.id and g.year = (a->>'year')::int
       and (nullif(a->>'group_id','') is null or g.id = (a->>'group_id')::uuid)
       and cf.item = a->>'item' and cf.lesson = a->>'lesson';
    return json_build_object('ok', true);
  elsif p_action = 'switch' then
    gid := (a->>'group_id')::uuid;
    if (a->>'on')::boolean then
      insert into abity.switches values (gid, a->>'item', a->>'lesson') on conflict do nothing;
    else
      delete from abity.switches where group_id = gid and item = a->>'item' and lesson = a->>'lesson';
    end if;
    return json_build_object('ok', true);
  elsif p_action = 'switch_year' then
    if (a->>'on')::boolean then
      insert into abity.switches select id, a->>'item', a->>'lesson' from abity.groups where year = (a->>'year')::int on conflict do nothing;
    else
      delete from abity.switches s using abity.groups g where s.group_id = g.id and g.year = (a->>'year')::int and s.item = a->>'item' and s.lesson = a->>'lesson';
    end if;
    return json_build_object('ok', true);
  elsif p_action = 'group_pw' then
    update abity.groups set pw = lower(trim(a->>'pw')), pw_ver = pw_ver + 1 where id = (a->>'group_id')::uuid;
    delete from abity.tokens t using abity.groups g where t.group_id = g.id and t.pw_ver <> g.pw_ver;
    return json_build_object('ok', true);
  elsif p_action = 'group_delete' then
    delete from abity.groups where id = (a->>'group_id')::uuid;
    return json_build_object('ok', true);
  elsif p_action in ('admin_pw', 'site_pw') then
    if length(coalesce(a->>'new','')) < (case when p_action = 'admin_pw' then 10 else 4 end) then
      return json_build_object('ok', false, 'error', 'too short');
    end if;
    update abity.config set v = extensions.crypt(case when p_action = 'site_pw' then lower(trim(a->>'new')) else a->>'new' end, extensions.gen_salt('bf', 10)) where k = p_action;
    return json_build_object('ok', true);
  end if;
  return json_build_object('ok', false, 'error', 'unknown action');
exception when unique_violation then return json_build_object('ok', false, 'error', 'That group already exists.');
         when check_violation then return json_build_object('ok', false, 'error', 'Check the name (1-12 characters) and password (4-40 characters).');
end $function$;

create or replace function abity.hw_admin(p_action text, a jsonb) returns json language plpgsql security definer set search_path to '' as $function$
declare c text; alphabet text := 'abcdefghjkmnpqrstuvwxyz23456789'; i int;
begin
  delete from abity.hw_pending where at < now() - interval '7 days';
  if p_action = 'hw_list' then
    return json_build_object('ok', true, 'homeworks', coalesce((select json_agg(json_build_object('id', h.id, 'code', h.code, 'year', h.year,
      'title', h.title, 'spec', h.spec, 'total', h.total, 'open', h.open, 'created_at', h.created_at, 'course', h.course, 'sow_id', h.sow_id,
      'submitted', (select count(*) from abity.hw_receipts r where r.hw_id = h.id
                      and not exists (select 1 from abity.hw_pending p where p.hw_id = h.id and p.hash = r.hash)),
      'awaiting', (select count(*) from abity.hw_pending p where p.hw_id = h.id)) order by h.created_at desc) from abity.homeworks h), '[]'::json),
      'email', (select v from abity.config where k = 'teacher_email'),
      'ai', json_build_object('today', coalesce((select round(neurons) from abity.ai_usage where day = (now() at time zone 'utc')::date), 0),
        'days', coalesce((select json_agg(json_build_object('day', day, 'neurons', round(neurons), 'requests', requests) order by day desc)
                 from abity.ai_usage where day > (now() at time zone 'utc')::date - 14), '[]'::json)));
  elsif p_action = 'hw_get' then
    return json_build_object('ok', true, 'homework', (select json_build_object('id', id, 'code', code, 'year', year, 'title', title, 'source', source, 'data', data, 'course', course, 'sow_id', sow_id) from abity.homeworks where id = (a->>'id')::uuid));
  elsif p_action = 'hw_save' then
    if a->>'id' is not null and a->>'id' <> '' then
      update abity.homeworks set year = (a->>'year')::int, title = a->>'title', spec = coalesce(a->>'spec',''), source = a->>'source',
        data = a->'data', student = a->'student', total = (a->>'total')::int, course = nullif(a->>'course',''), sow_id = nullif(a->>'sow_id','') where id = (a->>'id')::uuid;
      return json_build_object('ok', true);
    end if;
    loop
      c := ''; for i in 1..8 loop c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1); end loop;
      exit when not exists (select 1 from abity.homeworks where code = c);
    end loop;
    insert into abity.homeworks (code, year, title, spec, source, data, student, total, course, sow_id)
      values (c, (a->>'year')::int, a->>'title', coalesce(a->>'spec',''), a->>'source', a->'data', a->'student', (a->>'total')::int, nullif(a->>'course',''), nullif(a->>'sow_id',''));
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
