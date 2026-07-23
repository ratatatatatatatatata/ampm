-- AM/PM дэлгүүрийн бүтээгдэхүүний хүснэгт
-- Supabase Dashboard → SQL Editor дээр энэ файлыг бүтнээр нь ажиллуулна.

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  descr text not null default 'AM/PM цуглуулгын бүтээгдэхүүн.',
  price integer not null check (price > 0),
  badge text,
  image text, -- data URL эсвэл зургийн URL
  created_at timestamptz not null default now()
);

alter table public.products enable row level security;

-- Хэн ч бүтээгдэхүүнийг унших боломжтой (дэлгүүрийн хуудас)
create policy "Public read products"
  on public.products for select
  to anon, authenticated
  using (true);

-- Зөвхөн нэвтэрсэн админ нэмэх, устгах боломжтой
create policy "Admins insert products"
  on public.products for insert
  to authenticated
  with check (true);

create policy "Admins delete products"
  on public.products for delete
  to authenticated
  using (true);

-- ГАРЫН АВЛАГА: Админ хэрэглэгч үүсгэх
-- Dashboard → Authentication → Users → "Add user" → имэйл + нууц үг оруулаад
-- "Auto confirm user" сонголтыг идэвхжүүлнэ. Тэр имэйл/нууц үгээр
-- сайтын /#admin хуудсанд нэвтэрнэ.
