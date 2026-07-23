-- Захиалгын хүснэгт + realtime мэдэгдэл
-- Supabase Dashboard → SQL Editor дээр энэ файлыг бүтнээр нь ажиллуулна.

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  items jsonb not null,            -- [{name, price, qty}]
  total integer not null check (total > 0),
  contact text not null,           -- утас эсвэл имэйл
  address text not null,
  lat double precision,
  lng double precision,
  status text not null default 'new', -- new | done
  created_at timestamptz not null default now()
);

alter table public.orders enable row level security;

-- Хэн ч (нэвтрээгүй зочин) захиалга үүсгэж чадна
create policy "Anyone can place orders"
  on public.orders for insert
  to anon, authenticated
  with check (true);

-- Зөвхөн нэвтэрсэн админ захиалгуудыг харна
create policy "Admins read orders"
  on public.orders for select
  to authenticated
  using (true);

-- Зөвхөн админ статус өөрчилнө
create policy "Admins update orders"
  on public.orders for update
  to authenticated
  using (true);

-- Админ панельд шинэ захиалгын realtime мэдэгдэл очихын тулд:
alter publication supabase_realtime add table public.orders;
