-- ============================================================
-- AM/PM — БҮХ ТОХИРГОО НЭГ ДОР (хэдэн ч удаа ажиллуулж болно)
-- Supabase Dashboard → SQL Editor дээр бүтнээр нь ажиллуулна.
-- ⚠️ Хамгийн доод мөрөнд админ имэйлээ солино!
-- ============================================================

-- 1. Бүтээгдэхүүн
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  descr text not null default 'AM/PM цуглуулгын бүтээгдэхүүн.',
  price integer not null check (price > 0),
  badge text,
  image text,
  created_at timestamptz not null default now()
);
alter table public.products add column if not exists category text;
alter table public.products enable row level security;

-- 2. Захиалга
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  items jsonb not null,
  total integer not null check (total > 0),
  contact text not null,
  address text not null,
  lat double precision,
  lng double precision,
  status text not null default 'new',
  created_at timestamptz not null default now()
);
alter table public.orders add column if not exists payment_method text default 'transfer';
alter table public.orders enable row level security;

-- 3. Админ эрх
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.admins enable row level security;

-- 4. Профайл
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  name text,
  phone text,
  address text,
  created_at timestamptz default now()
);
alter table public.profiles enable row level security;

-- 5. Мэдэгдэл
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  title text not null,
  body text not null default '',
  read boolean not null default false,
  created_at timestamptz default now()
);
alter table public.notifications enable row level security;

-- ============ БОДЛОГУУД (хуучныг устгаад шинээр) ============

-- products
drop policy if exists "Public read products" on public.products;
drop policy if exists "Admins insert products" on public.products;
drop policy if exists "Admins delete products" on public.products;
drop policy if exists "Only admins insert products" on public.products;
drop policy if exists "Only admins update products" on public.products;
drop policy if exists "Only admins delete products" on public.products;
create policy "Public read products" on public.products
  for select to anon, authenticated using (true);
create policy "Only admins insert products" on public.products
  for insert to authenticated
  with check (exists(select 1 from public.admins a where a.user_id = auth.uid()));
create policy "Only admins update products" on public.products
  for update to authenticated
  using (exists(select 1 from public.admins a where a.user_id = auth.uid()));
create policy "Only admins delete products" on public.products
  for delete to authenticated
  using (exists(select 1 from public.admins a where a.user_id = auth.uid()));

-- orders
drop policy if exists "Anyone can place orders" on public.orders;
drop policy if exists "Admins read orders" on public.orders;
drop policy if exists "Admins update orders" on public.orders;
drop policy if exists "Only admins read orders" on public.orders;
drop policy if exists "Only admins update orders" on public.orders;
create policy "Anyone can place orders" on public.orders
  for insert to anon, authenticated with check (true);
create policy "Only admins read orders" on public.orders
  for select to authenticated
  using (exists(select 1 from public.admins a where a.user_id = auth.uid()));
create policy "Only admins update orders" on public.orders
  for update to authenticated
  using (exists(select 1 from public.admins a where a.user_id = auth.uid()));

-- admins
drop policy if exists "Admins readable by self" on public.admins;
create policy "Admins readable by self" on public.admins
  for select to authenticated using (user_id = auth.uid());

-- profiles
drop policy if exists "Own profile read" on public.profiles;
drop policy if exists "Own profile insert" on public.profiles;
drop policy if exists "Own profile update" on public.profiles;
create policy "Own profile read" on public.profiles
  for select to authenticated
  using (id = auth.uid() or exists(select 1 from public.admins a where a.user_id = auth.uid()));
create policy "Own profile insert" on public.profiles
  for insert to authenticated with check (id = auth.uid());
create policy "Own profile update" on public.profiles
  for update to authenticated using (id = auth.uid());

-- notifications
drop policy if exists "Read own notifications" on public.notifications;
drop policy if exists "Admins send notifications" on public.notifications;
drop policy if exists "Mark own read" on public.notifications;
create policy "Read own notifications" on public.notifications
  for select to authenticated
  using (user_id = auth.uid() or user_id is null);
create policy "Admins send notifications" on public.notifications
  for insert to authenticated
  with check (exists(select 1 from public.admins a where a.user_id = auth.uid()));
create policy "Mark own read" on public.notifications
  for update to authenticated using (user_id = auth.uid());

-- ============ REALTIME (давхардвал алгасна) ============
do $$ begin
  alter publication supabase_realtime add table public.orders;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null; end $$;

-- ============ ⚠️ АДМИН ЭРХ ОЛГОХ ============
-- Доорх мөрөнд ӨӨРИЙН админ имэйлээ бичээд ажиллуулна:
insert into public.admins(user_id)
select id from auth.users where email = 'ТАНЫ_АДМИН_ИМЭЙЛ@ЭНД.БИЧНЭ'
on conflict do nothing;
