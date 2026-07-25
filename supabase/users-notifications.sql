-- Хэрэглэгчийн систем: профайл, мэдэгдэл, админ эрх
-- Supabase Dashboard → SQL Editor дээр бүтнээр нь ажиллуулна.
-- ⚠️ Хамгийн доод мөрөнд өөрийн админ имэйлээ солихоо мартуузай!

-- 1. Админ эрхийн хүснэгт
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.admins enable row level security;
drop policy if exists "Admins readable by self" on public.admins;
create policy "Admins readable by self"
  on public.admins for select to authenticated
  using (user_id = auth.uid());

-- 2. Хэрэглэгчийн профайл
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  name text,
  phone text,
  address text,
  created_at timestamptz default now()
);
alter table public.profiles enable row level security;
drop policy if exists "Own profile read" on public.profiles;
create policy "Own profile read"
  on public.profiles for select to authenticated
  using (id = auth.uid() or exists(select 1 from public.admins a where a.user_id = auth.uid()));
drop policy if exists "Own profile insert" on public.profiles;
create policy "Own profile insert"
  on public.profiles for insert to authenticated
  with check (id = auth.uid());
drop policy if exists "Own profile update" on public.profiles;
create policy "Own profile update"
  on public.profiles for update to authenticated
  using (id = auth.uid());

-- 3. Мэдэгдэл (user_id null = бүх хэрэглэгчид)
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  title text not null,
  body text not null default '',
  read boolean not null default false,
  created_at timestamptz default now()
);
alter table public.notifications enable row level security;
drop policy if exists "Read own notifications" on public.notifications;
create policy "Read own notifications"
  on public.notifications for select to authenticated
  using (user_id = auth.uid() or user_id is null);
drop policy if exists "Admins send notifications" on public.notifications;
create policy "Admins send notifications"
  on public.notifications for insert to authenticated
  with check (exists(select 1 from public.admins a where a.user_id = auth.uid()));
drop policy if exists "Mark own read" on public.notifications;
create policy "Mark own read"
  on public.notifications for update to authenticated
  using (user_id = auth.uid());

alter publication supabase_realtime add table public.notifications;

-- 4. Аюулгүй байдал: бүтээгдэхүүн/захиалгыг зөвхөн админ удирдана
--    (өмнө нь нэвтэрсэн ямар ч хэрэглэгч удирдаж чадах эмзэг байдалтай байсан)
drop policy if exists "Admins insert products" on public.products;
drop policy if exists "Admins delete products" on public.products;
drop policy if exists "Only admins insert products" on public.products;
drop policy if exists "Only admins update products" on public.products;
drop policy if exists "Only admins delete products" on public.products;
create policy "Only admins insert products"
  on public.products for insert to authenticated
  with check (exists(select 1 from public.admins a where a.user_id = auth.uid()));
create policy "Only admins update products"
  on public.products for update to authenticated
  using (exists(select 1 from public.admins a where a.user_id = auth.uid()));
create policy "Only admins delete products"
  on public.products for delete to authenticated
  using (exists(select 1 from public.admins a where a.user_id = auth.uid()));

drop policy if exists "Admins read orders" on public.orders;
drop policy if exists "Admins update orders" on public.orders;
drop policy if exists "Only admins read orders" on public.orders;
drop policy if exists "Only admins update orders" on public.orders;
create policy "Only admins read orders"
  on public.orders for select to authenticated
  using (exists(select 1 from public.admins a where a.user_id = auth.uid()));
create policy "Only admins update orders"
  on public.orders for update to authenticated
  using (exists(select 1 from public.admins a where a.user_id = auth.uid()));

-- 5. ⚠️ ЭНД өөрийн админ имэйлээ бичээд ажиллуулна:
insert into public.admins(user_id)
select id from auth.users where email = 'ТАНЫ_АДМИН_ИМЭЙЛ@ЭНД.БИЧНЭ'
on conflict do nothing;
