-- Бүтээгдэхүүнд ангилал нэмэх
-- Supabase Dashboard → SQL Editor дээр ажиллуулна.

alter table public.products
  add column if not exists category text;
