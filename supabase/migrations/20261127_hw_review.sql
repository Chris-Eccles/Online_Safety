-- Personal review: the student view (questions only, no answers or mark schemes) of up to 3 earlier homeworks,
-- so a device can bring back questions it got wrong. Which questions, and when, is decided on the device.
create or replace function public.site_hw_review(p_codes text[]) returns json
language sql stable security definer set search_path to '' as $$
  select json_build_object('ok', true, 'homeworks', coalesce(json_object_agg(h.code, json_build_object('title', h.title, 'student', h.student)), '{}'::json))
  from abity.homeworks h where h.code = any (p_codes[1:3]);
$$;
revoke all on function public.site_hw_review(text[]) from public;
grant execute on function public.site_hw_review(text[]) to anon;
