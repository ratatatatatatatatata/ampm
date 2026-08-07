-- Утасны дугаараар нэвтрэх (SMS-гүй, үнэгүй арга)
-- Supabase Dashboard → SQL Editor дээр ажиллуулна.
-- Утасны дугаараар бүртгэлтэй хэрэглэгчийн имэйлийг олж өгдөг функц —
-- нэвтрэхэд дугаар + нууц үг бичихэд систем имэйлийг нь олоод нэвтрүүлнэ.

create or replace function public.email_for_phone(p text)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select email from public.profiles
  where regexp_replace(coalesce(phone, ''), '\D', '', 'g') = regexp_replace(p, '\D', '', 'g')
    and coalesce(phone, '') <> ''
  limit 1;
$$;

grant execute on function public.email_for_phone(text) to anon, authenticated;
