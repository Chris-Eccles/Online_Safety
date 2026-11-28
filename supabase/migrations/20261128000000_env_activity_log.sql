-- Env Sci activity log for the admin page. Anonymous: a random browser ID, never names, emails or IP addresses.
-- Only the env-log edge function (service role) reads or writes it. Rows older than 30 days are deleted by that function.
create table if not exists public.env_activity (
  id bigint generated always as identity primary key,
  uid text not null check (uid ~ '^[0-9a-f]{8}$'),
  at timestamptz not null default now(),
  kind text not null check (kind in ('page','mark','maths')),
  page text not null default '' check (length(page) <= 120),
  detail jsonb not null default '{}'::jsonb check (length(detail::text) <= 600)
);
create index if not exists env_activity_at on public.env_activity (at desc);
create index if not exists env_activity_uid on public.env_activity (uid, at desc);
alter table public.env_activity enable row level security;
revoke all on public.env_activity from anon, authenticated;
comment on table public.env_activity is 'Env Sci (env.abity.co.uk) anonymous activity log; 30-day retention; service role only.';
