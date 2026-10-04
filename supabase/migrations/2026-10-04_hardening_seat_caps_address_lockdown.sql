-- Run this in the Supabase SQL editor (project amgttjgfryfsvalmyptr) BEFORE deploying the new code.
-- Safe to run more than once.

-- 1. School address for invoices
alter table public.orders add column if not exists school_address text;

-- 2. Seat caps enforced in the database as well as the API (max 15,000 per order / school / trust)
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'orders_seats_cap') then
    alter table public.orders add constraint orders_seats_cap check (seats_requested between 0 and 15000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'license_seats_cap') then
    alter table public.license_keys add constraint license_seats_cap check (seats_allowed between 0 and 15000 and seats_used >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'trust_seats_cap') then
    alter table public.trusts add constraint trust_seats_cap check (seats_allocated between 0 and 15000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'orders_address_len') then
    alter table public.orders add constraint orders_address_len check (school_address is null or char_length(school_address) <= 400);
  end if;
end $$;

-- 3. Browsers (anon / signed-in roles) should never touch tables directly. Everything they do goes through
--    the SECURITY DEFINER functions; the server uses the service role, which is unaffected.
revoke all on all tables in schema public from anon, authenticated;
drop policy if exists "anon can submit an order" on public.orders;
drop policy if exists "site_settings_public_read" on public.site_settings;

-- 4. The rate limiter must not be callable from a browser (an attacker could inflate someone else's counter and lock them out)
revoke execute on function public.increment_rate_limit(text, bigint) from public, anon, authenticated;
grant execute on function public.increment_rate_limit(text, bigint) to service_role;

-- 5. Safeguarding photos are uploaded only by our server, never straight from a browser. Limit size and type.
drop policy if exists "anon can upload dsl photos" on storage.objects;
update storage.buckets set file_size_limit = 2097152, allowed_mime_types = array['image/jpeg','image/png','image/webp'] where id = 'dsl-photos';
update storage.buckets set file_size_limit = 5242880, allowed_mime_types = array['application/pdf'] where id = 'reflection-pdfs';
