-- Badges (KS4/5) and class questions with answer buttons. Everything is linked to a device's random sign-in code,
-- never to a name, and is deleted with that code (group password change, group deleted, or 1 August).
create table if not exists abity.badges (
  id text primary key, name text not null, descr text not null, grp text not null,
  secret boolean not null default false, glyph text not null, sort int not null);
create table if not exists abity.badge_earned (
  token text not null references abity.tokens(token) on delete cascade,
  badge text not null references abity.badges(id) on delete cascade,
  at timestamptz not null default now(), primary key (token, badge));
create table if not exists abity.polls (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references abity.groups(id) on delete cascade,
  kind text not null check (kind in ('abcd','tf')),
  opened_at timestamptz not null default now(),
  closed boolean not null default false, correct int, done boolean not null default false);
create table if not exists abity.poll_answers (
  poll_id uuid not null references abity.polls(id) on delete cascade,
  token text not null references abity.tokens(token) on delete cascade,
  choice int not null, at timestamptz not null default now(), primary key (poll_id, token));
alter table abity.badges enable row level security;
alter table abity.badge_earned enable row level security;
alter table abity.polls enable row level security;
alter table abity.poll_answers enable row level security;
revoke all on abity.badges, abity.badge_earned, abity.polls, abity.poll_answers from anon, authenticated;

insert into abity.badges (id, name, descr, grp, secret, glyph, sort) values
 ('first','First Steps','Hand in your first worksheet','Habits',false,'1st',10),
 ('prepared','Prepared','Do the prep quick check before the lesson','Habits',false,'✎',11),
 ('early','Early Bird','Hand in a worksheet on the day it opens','Habits',false,'☀',12),
 ('roll','On a Roll','Complete 3 worksheets in a row','Habits',false,'3×',13),
 ('unstoppable','Unstoppable','Complete 10 worksheets','Habits',false,'10',14),
 ('catchup','Catch-Up','Complete a worksheet marked "Catch up"','Habits',false,'↺',15),
 ('room','In the Room','Answer every class question in a lesson','Habits',false,'✋',16),
 ('bounce','Bounce Back','Close the gap on a follow-up task','Using feedback',false,'↗',20),
 ('second','Second Thoughts','Full marks on a follow-up after under half on that question','Using feedback',false,'2nd',21),
 ('comeback','Comeback','Beat your score on the previous worksheet','Using feedback',false,'▲',22),
 ('climber','Steady Climber','Improve your score three worksheets running','Using feedback',false,'↑↑',23),
 ('redgreen','Red to Green','Move a spec point from red to green','Using feedback',false,'R→G',24),
 ('selfaware','Self-Aware','Rate your confidence on 10 spec points','Using feedback',false,'◐',25),
 ('flawless','Flawless','Full marks on a worksheet','Mastery',false,'★',30),
 ('sharp','Sharpshooter','Every multiple-choice question right on one worksheet','Mastery',false,'◎',31),
 ('examready','Exam Ready','Full marks on a 6-mark question','Mastery',false,'6',32),
 ('stretched','Stretched','Full marks on a stretch question','Mastery',false,'+',33),
 ('memory','Long Memory','All the earlier-topic questions on a worksheet right','Mastery',false,'∞',34),
 ('halfway','Halfway There','Complete half the spec points','Mastery',false,'½',35),
 ('t11','Architect','Complete every worksheet in 1.1 Systems architecture','Topics',false,'1.1',40),
 ('t12','Storage Keeper','Complete every worksheet in 1.2 Memory and storage','Topics',false,'1.2',41),
 ('t13','Network Navigator','Complete every worksheet in 1.3 Networks','Topics',false,'1.3',42),
 ('t14','Defender','Complete every worksheet in 1.4 Network security','Topics',false,'1.4',43),
 ('t15','Operator','Complete every worksheet in 1.5 Systems software','Topics',false,'1.5',44),
 ('t16','Conscience','Complete every worksheet in 1.6 Ethical, legal and environmental impacts','Topics',false,'1.6',45),
 ('t21','Algorithmist','Complete every worksheet in 2.1 Algorithms','Topics',false,'2.1',46),
 ('t22','Coder','Complete every worksheet in 2.2 Programming fundamentals','Topics',false,'2.2',47),
 ('t23','Bulletproof','Complete every worksheet in 2.3 Producing robust programs','Topics',false,'2.3',48),
 ('t24','Gatekeeper','Complete every worksheet in 2.4 Boolean logic','Topics',false,'2.4',49),
 ('specmaster','Spec Master','Complete every spec point','Topics',false,'100',50),
 ('hello','Hello, World!','Sign in for the first time','Just for fun',false,'>_',60),
 ('curious','Curious','Open the badges page','Just for fun',true,'?',61),
 ('f404','404','Try to open a worksheet before it''s unlocked','Just for fun',true,'404',62),
 ('fullhouse','Full House','Pick A, B, C and D at least once in class questions','Just for fun',true,'ABCD',63),
 ('ctrls','Ctrl+S','Come back to a saved worksheet and finish it','Just for fun',true,'^S',64),
 ('byte','Byte Size','Earn 8 badges','Just for fun',false,'8b',65),
 ('collector','Collector','Earn 20 badges','Just for fun',false,'20',66),
 ('easter','Easter Egg','Find the hidden egg on one of the prep pages','Just for fun',true,'egg',67),
 ('team','Team Player','Be in a lesson where the whole class gets a class question right','Just for fun',true,'All',68),
 ('plottwist','Plot Twist','Get a class question right that most of the class got wrong','Just for fun',true,'!?',69),
 ('weekend','Weekend Warrior','Hand in a worksheet at the weekend','Just for fun',true,'Sa',70),
 ('bug','Bug Squasher','Fix the bug in a code task','Just for fun',false,'{ }',71)
on conflict (id) do update set name = excluded.name, descr = excluded.descr, grp = excluded.grp, secret = excluded.secret, glyph = excluded.glyph, sort = excluded.sort;

-- The group a sign-in code belongs to (null if the code is no longer valid)
create or replace function abity.tok_group(p_token text) returns abity.groups
language sql stable security definer set search_path to '' as $$
  select g.* from abity.tokens t join abity.groups g on g.id = t.group_id
   where t.token = p_token and t.pw_ver = g.pw_ver and t.created_at >= abity.year_start();
$$;

create or replace function abity.award(p_token text, p_badge text) returns boolean
language plpgsql security definer set search_path to '' as $$
declare n int;
begin
  insert into abity.badge_earned (token, badge) values (p_token, p_badge) on conflict do nothing;
  if not found then return false; end if;
  select count(*) into n from abity.badge_earned where token = p_token;
  if n >= 8 then insert into abity.badge_earned (token, badge) values (p_token, 'byte') on conflict do nothing; end if;
  select count(*) into n from abity.badge_earned where token = p_token;
  if n >= 20 then insert into abity.badge_earned (token, badge) values (p_token, 'collector') on conflict do nothing; end if;
  return true;
end $$;

-- Every badge, with this device's earned ones marked. Secret badges keep their name but hide how to earn them.
create or replace function public.site_badges(p_token text) returns json
language plpgsql security definer set search_path to '' as $$
declare g abity.groups;
begin
  g := abity.tok_group(p_token);
  if g.id is null then return json_build_object('ok', false); end if;
  return json_build_object('ok', true, 'year', g.year, 'badges', (select json_agg(json_build_object(
      'id', b.id, 'name', b.name, 'grp', b.grp, 'glyph', b.glyph, 'secret', b.secret,
      'descr', case when e.badge is not null or not b.secret then b.descr end,
      'earned', e.badge is not null, 'at', e.at) order by b.sort)
    from abity.badges b left join abity.badge_earned e on e.badge = b.id and e.token = p_token));
end $$;

-- Badges a page can award itself. All the others are awarded by the database or the marking function.
create or replace function public.site_badge(p_token text, p_badge text) returns json
language plpgsql security definer set search_path to '' as $$
declare g abity.groups; isnew boolean;
begin
  g := abity.tok_group(p_token);
  if g.id is null or g.year < 10 or p_badge not in ('hello','curious','f404','easter') then return json_build_object('ok', false); end if;
  isnew := abity.award(p_token, p_badge);
  return json_build_object('ok', true, 'new', isnew);
end $$;

-- The class question open for this device's group, its own answer, and its earned badges (for "Badge unlocked")
create or replace function public.site_poll(p_token text) returns json
language plpgsql security definer set search_path to '' as $$
declare g abity.groups; p abity.polls; mine int;
begin
  g := abity.tok_group(p_token);
  if g.id is null then return json_build_object('ok', false); end if;
  select * into p from abity.polls where group_id = g.id and not done and opened_at > now() - interval '3 hours' order by opened_at desc limit 1;
  if p.id is not null then select choice into mine from abity.poll_answers where poll_id = p.id and token = p_token; end if;
  return json_build_object('ok', true,
    'poll', case when p.id is null then null else json_build_object('id', p.id, 'kind', p.kind, 'closed', p.closed, 'correct', p.correct) end,
    'mine', mine,
    'earned', coalesce((select json_agg(badge) from abity.badge_earned where token = p_token), '[]'::json));
end $$;

create or replace function public.site_poll_answer(p_token text, p_poll uuid, p_choice int) returns json
language plpgsql security definer set search_path to '' as $$
declare g abity.groups; p abity.polls;
begin
  g := abity.tok_group(p_token);
  if g.id is null then return json_build_object('ok', false); end if;
  select * into p from abity.polls where id = p_poll and group_id = g.id and not closed and not done;
  if p.id is null then return json_build_object('ok', false, 'closed', true); end if;
  if p_choice < 0 or p_choice > (case when p.kind = 'abcd' then 3 else 1 end) then return json_build_object('ok', false); end if;
  insert into abity.poll_answers (poll_id, token, choice) values (p.id, p_token, p_choice)
    on conflict (poll_id, token) do update set choice = excluded.choice, at = now();
  if (select count(distinct a.choice) from abity.poll_answers a join abity.polls q on q.id = a.poll_id
       where a.token = p_token and q.kind = 'abcd') = 4 then perform abity.award(p_token, 'fullhouse'); end if;
  return json_build_object('ok', true);
end $$;

-- Teacher controls (called through site_admin, so they need the admin password)
create or replace function abity.poll_admin(p_action text, a jsonb) returns json
language plpgsql security definer set search_path to '' as $$
declare p abity.polls; gid uuid; n int; ok int; t record;
begin
  if p_action = 'poll_groups' then
    return json_build_object('ok', true, 'groups', coalesce((select json_agg(json_build_object('id', id, 'year', year, 'name', name, 'demo', hidden) order by hidden, year, name)
      from abity.groups where year >= 10), '[]'::json));
  elsif p_action = 'poll_start' then
    gid := (a->>'group_id')::uuid;
    update abity.polls set done = true, closed = true where group_id = gid and not done;
    insert into abity.polls (group_id, kind) values (gid, case when a->>'kind' = 'tf' then 'tf' else 'abcd' end) returning * into p;
    return json_build_object('ok', true, 'id', p.id);
  elsif p_action = 'poll_state' then
    gid := (a->>'group_id')::uuid;
    select * into p from abity.polls where group_id = gid and not done order by opened_at desc limit 1;
    return json_build_object('ok', true,
      'devices', (select count(*) from abity.tokens t join abity.groups g on g.id = t.group_id where g.id = gid and t.pw_ver = g.pw_ver and t.created_at >= abity.year_start()),
      'poll', case when p.id is null then null else json_build_object('id', p.id, 'kind', p.kind, 'closed', p.closed, 'correct', p.correct,
        'counts', (select json_agg(coalesce((select count(*) from abity.poll_answers x where x.poll_id = p.id and x.choice = c), 0) order by c)
                   from generate_series(0, case when p.kind = 'abcd' then 3 else 1 end) c),
        'total', (select count(*) from abity.poll_answers x where x.poll_id = p.id)) end);
  elsif p_action = 'poll_close' then
    update abity.polls set closed = true where id = (a->>'id')::uuid;
    return json_build_object('ok', true);
  elsif p_action = 'poll_reveal' then
    update abity.polls set closed = true, correct = (a->>'correct')::int where id = (a->>'id')::uuid returning * into p;
    select count(*), count(*) filter (where choice = p.correct) into n, ok from abity.poll_answers where poll_id = p.id;
    if n >= 5 and ok = n then
      perform abity.award(x.token, 'team') from abity.poll_answers x where x.poll_id = p.id;
    elsif n >= 5 and ok * 2 < n then
      perform abity.award(x.token, 'plottwist') from abity.poll_answers x where x.poll_id = p.id and x.choice = p.correct;
    end if;
    -- In the Room: answered every class question in today's lesson (at least 3 questions)
    select count(*) into n from abity.polls q where q.group_id = p.group_id and q.opened_at::date = now()::date and q.closed;
    if n >= 3 then
      for t in select x.token from abity.poll_answers x join abity.polls q on q.id = x.poll_id
                where q.group_id = p.group_id and q.opened_at::date = now()::date and q.closed
                group by x.token having count(*) >= n loop
        perform abity.award(t.token, 'room');
      end loop;
    end if;
    return json_build_object('ok', true);
  elsif p_action = 'poll_end' then
    update abity.polls set done = true, closed = true where id = (a->>'id')::uuid;
    return json_build_object('ok', true);
  end if;
  return null;
end $$;

drop function if exists abity.demo_token();
create or replace function abity.demo_token(p_year int default 7) returns json
language plpgsql security definer set search_path to '' as $$
declare g abity.groups; t text; y int := greatest(7, least(13, coalesce(p_year, 7)));
begin
  select * into g from abity.groups where year = y and name = 'DEMO';
  if g.id is null then
    insert into abity.groups (year, name, pw, hidden) values (y, 'DEMO', encode(extensions.gen_random_bytes(12), 'hex'), true) returning * into g;
  end if;
  insert into abity.switches select g.id, l.item, l.lesson from abity.lessons l join abity.items i on i.item = l.item where i.year = y on conflict do nothing;
  t := encode(extensions.gen_random_bytes(24), 'hex');
  insert into abity.tokens (token, group_id, pw_ver) values (t, g.id, g.pw_ver);
  return json_build_object('ok', true, 'token', t, 'year', g.year, 'group', g.name);
end $$;

revoke all on function public.site_badges(text), public.site_badge(text, text), public.site_poll(text), public.site_poll_answer(text, uuid, int) from public;
grant execute on function public.site_badges(text), public.site_badge(text, text), public.site_poll(text), public.site_poll_answer(text, uuid, int) to anon;
revoke all on function abity.tok_group(text), abity.award(text, text), abity.poll_admin(text, jsonb), abity.demo_token(int) from public, anon, authenticated;

create or replace function public.site_admin(p_pw text, p_action text, p_args jsonb DEFAULT '{}'::jsonb)
 returns json language plpgsql security definer set search_path to '' as $function$
declare a jsonb := coalesce(p_args, '{}'::jsonb); gid uuid;
begin
  if abity.limited() then return json_build_object('ok', false, 'wait', true); end if;
  if not abity.pw_ok('admin_pw', p_pw) then perform abity.fail(); return json_build_object('ok', false, 'auth', false); end if;

  if p_action = 'list' then
    return json_build_object('ok', true,
      'groups', coalesce((select json_agg(json_build_object('id', id, 'year', year, 'name', name, 'pw', pw) order by year, name) from abity.groups where not hidden), '[]'::json),
      'items', coalesce((select json_agg(json_build_object('item', i.item, 'year', i.year, 'term', i.term, 'title', i.title,
          'lessons', (select json_agg(json_build_object('lesson', l.lesson, 'title', l.title) order by l.sort) from abity.lessons l where l.item = i.item))
          order by i.year, i.term, i.sort) from abity.items i), '[]'::json),
      'switches', coalesce((select json_agg(json_build_object('group_id', group_id, 'item', item, 'lesson', lesson)) from abity.switches), '[]'::json));
  elsif p_action like 'hw\_%' or p_action = 'teacher_email' then
    return abity.hw_admin(p_action, a);
  elsif p_action like 'poll\_%' then
    return abity.poll_admin(p_action, a);
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
  elsif p_action = 'group_add' then
    insert into abity.groups (year, name, pw) values ((a->>'year')::int, upper(trim(a->>'name')), lower(trim(a->>'pw')));
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
