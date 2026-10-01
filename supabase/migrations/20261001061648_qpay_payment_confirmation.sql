begin;
alter table public.orders
  add column checkout_token uuid not null default gen_random_uuid(),
  add column payment_status text not null default 'pending' check (payment_status in ('pending','paid')),
  add column paid_at timestamptz;

create table public.employees (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.employees enable row level security;
revoke all on public.employees from public, anon, authenticated;
grant select, insert, delete on public.employees to authenticated;
grant all on public.employees to service_role;
create policy "Employee membership read" on public.employees for select to authenticated
  using (user_id = (select auth.uid()) or exists (select 1 from public.admins where user_id = (select auth.uid())));
create policy "Admins add employees" on public.employees for insert to authenticated
  with check (exists (select 1 from public.admins where user_id = (select auth.uid())));
create policy "Admins remove employees" on public.employees for delete to authenticated
  using (exists (select 1 from public.admins where user_id = (select auth.uid())));
create policy "Employees read orders" on public.orders for select to authenticated
  using (exists (select 1 from public.employees where user_id = (select auth.uid())));

create table public.ampm_qpay_invoices (
  order_id uuid primary key references public.orders(id),
  invoice_id text unique,
  expected_amount integer not null check (expected_amount > 0),
  callback_token uuid not null unique,
  state text not null default 'creating' check (state in ('creating','ready')),
  invoice_data jsonb,
  payment_ids text[],
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.ampm_qpay_invoices enable row level security;
revoke all on public.ampm_qpay_invoices from public, anon, authenticated;
grant select, insert, update on public.ampm_qpay_invoices to service_role;

-- Client inserts cannot claim payment; staff/admin edits cannot fabricate it either.
create function ampm_notification_internal.protect_payment()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if current_user in ('service_role','postgres') then return new; end if;
  if tg_op = 'INSERT' then
    if new.payment_status <> 'pending' or new.paid_at is not null then
      raise exception 'Payment confirmation is server controlled';
    end if;
  elsif new.payment_status is distinct from old.payment_status
     or new.paid_at is distinct from old.paid_at
     or new.checkout_token is distinct from old.checkout_token
     or (old.payment_method = 'qpay' and (
       new.total is distinct from old.total or new.items is distinct from old.items
       or new.payment_method is distinct from old.payment_method)) then
    raise exception 'Payment details are server controlled';
  end if;
  return new;
end;
$$;
revoke all on function ampm_notification_internal.protect_payment() from public, anon, authenticated;
create trigger ampm_protect_payment before insert or update on public.orders
  for each row execute function ampm_notification_internal.protect_payment();

-- Only the service backend, after authenticated QPay verification, can confirm.
-- Row locking makes payment update + durable recipient notifications atomic.
create function public.ampm_confirm_qpay_payment(
  p_order_id uuid, p_invoice_id text, p_amount integer, p_payment_ids text[]
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  invoice public.ampm_qpay_invoices;
  o public.orders;
  confirmed_at timestamptz := now();
begin
  select * into invoice from public.ampm_qpay_invoices where order_id = p_order_id for update;
  if not found or invoice.invoice_id is distinct from p_invoice_id
     or invoice.state <> 'ready' or invoice.expected_amount <> p_amount
     or coalesce(cardinality(p_payment_ids),0) = 0 then raise exception 'Invalid payment confirmation'; end if;
  if invoice.paid_at is not null then return false; end if;
  select * into o from public.orders where id = p_order_id for update;
  if not found or o.payment_method <> 'qpay' or o.total <> p_amount then raise exception 'Order mismatch'; end if;
  update public.ampm_qpay_invoices set paid_at = confirmed_at, payment_ids = p_payment_ids where order_id = p_order_id;
  update public.orders set payment_status = 'paid', paid_at = confirmed_at where id = p_order_id;
  insert into public.notifications(user_id,title,body)
  select user_id, 'QPay-ээр төлбөр төлөгдлөө',
    'Захиалга #' || left(o.id::text,8) || ' · ' || o.contact || ' · ' || o.total::text || ' ₮ · ' ||
    to_char(confirmed_at at time zone 'Asia/Ulaanbaatar','YYYY-MM-DD HH24:MI')
  from (select user_id from public.admins union select user_id from public.employees) recipients;
  return true;
end;
$$;
revoke all on function public.ampm_confirm_qpay_payment(uuid,text,integer,text[]) from public, anon, authenticated;
grant execute on function public.ampm_confirm_qpay_payment(uuid,text,integer,text[]) to service_role;
grant select, update on public.orders to service_role;
grant select on public.admins to service_role;
grant insert on public.notifications to service_role;

-- New QPay orders enter the email outbox only when payment is verified.
create or replace function ampm_notification_internal.queue_order()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.payment_method = 'qpay' and new.payment_status <> 'paid' then return new; end if;
  insert into public.ampm_order_notifications(order_id,order_snapshot)
  values (new.id, jsonb_build_object(
    'id', new.id, 'contact', new.contact, 'address', new.address,
    'lat', new.lat, 'lng', new.lng, 'items', new.items,
    'total', new.total, 'payment_method', new.payment_method,
    'payment_status', new.payment_status, 'paid_at', new.paid_at,
    'status', new.status, 'created_at', new.created_at,
    'delivery_preference', new.delivery_preference
  )) on conflict (order_id) do nothing;
  return new;
end;
$$;
create trigger ampm_queue_paid_order_email after update of payment_status on public.orders
  for each row when (old.payment_status is distinct from new.payment_status and new.payment_status = 'paid')
  execute function ampm_notification_internal.queue_order();
commit;
