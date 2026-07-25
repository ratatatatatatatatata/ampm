-- Захиалгад төлбөрийн мэдээлэл нэмэх
-- Supabase Dashboard → SQL Editor дээр ажиллуулна.

alter table public.orders
  add column if not exists payment_method text default 'transfer';
