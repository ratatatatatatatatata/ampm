begin;

-- Additive: retain every existing admin and all existing RLS policies.
-- Owner-specific promotions are a separate, explicitly authorized operation.
alter table public.admins add column role text not null default 'admin'
  constraint admins_role_check check (role in ('admin','superadmin'));

create or replace function ampm_role_internal.list_user_roles()
returns table(user_id uuid, user_role text)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists (select 1 from public.admins a where a.user_id = auth.uid()) then
    raise exception 'Admin permission required' using errcode = '42501';
  end if;
  return query select p.id,
    case when a.user_id is not null then a.role when e.user_id is not null then 'employee' else 'customer' end
    from public.profiles p left join public.admins a on a.user_id = p.id
    left join public.employees e on e.user_id = p.id;
end;
$$;

create or replace function ampm_role_internal.set_user_role(p_user_id uuid,p_role text)
returns text language plpgsql security definer set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(731044,1);
  if auth.uid() is null or not exists (select 1 from public.admins a where a.user_id = auth.uid()) then
    raise exception 'Admin permission required' using errcode = '42501';
  end if;
  -- Neither an old client nor a direct RPC may downgrade an owner.
  -- Additional superadmins require a separate owner-approved operation.
  if exists (select 1 from public.admins a where a.user_id=p_user_id and a.role='superadmin') then
    raise exception 'Superadmin role is protected' using errcode = '42501';
  end if;
  if p_role is null or p_role not in ('admin','employee','customer') then
    raise exception 'Invalid user role' using errcode = '22023';
  end if;
  if not exists (select 1 from auth.users u where u.id = p_user_id)
     or not exists (select 1 from public.profiles p where p.id = p_user_id) then
    raise exception 'User not found' using errcode = '22023';
  end if;
  if p_role <> 'admin' and exists (select 1 from public.admins a where a.user_id = p_user_id)
     and (select count(*) from public.admins) <= 1 then
    raise exception 'Cannot remove the last administrator' using errcode = '22023';
  end if;
  if p_role = 'admin' then
    insert into public.admins(user_id) values (p_user_id) on conflict do nothing;
    delete from public.employees where user_id = p_user_id;
  elsif p_role = 'employee' then
    delete from public.admins where user_id = p_user_id;
    insert into public.employees(user_id) values (p_user_id) on conflict do nothing;
  else
    delete from public.admins where user_id = p_user_id;
    delete from public.employees where user_id = p_user_id;
  end if;
  return p_role;
end;
$$;

-- Invoker: ordinary member JWT + existing orders RLS, never service-role.
-- Aggregation runs in the database, not on a truncated first 1,000-row page.
create function public.ampm_sales_report(p_from date default null,p_to date default null)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare report jsonb;
begin
  if auth.uid() is null or not exists (select 1 from public.admins a where a.user_id=auth.uid()) then
    raise exception 'Admin permission required' using errcode = '42501';
  end if;
  if p_from is not null and p_to is not null and p_from > p_to then
    raise exception 'Invalid date range' using errcode = '22023';
  end if;
  with selected as materialized (
    select o.* from public.orders o
    where (p_from is null or o.created_at >= (p_from::timestamp at time zone 'Asia/Ulaanbaatar'))
      and (p_to is null or o.created_at < ((p_to+1)::timestamp at time zone 'Asia/Ulaanbaatar'))
  ), totals as (
    select count(*) as order_count, coalesce(sum(total),0) as order_total,
      count(*) filter(where payment_status='paid') as paid_count,
      coalesce(sum(total) filter(where payment_status='paid'),0) as paid_total,
      count(*) filter(where payment_status<>'paid' or payment_status is null) as pending_count,
      coalesce(sum(total) filter(where payment_status<>'paid' or payment_status is null),0) as pending_total,
      count(*) filter(where status='done') as delivered_count
    from selected
  ), product_lines as (
    select left(coalesce(nullif(btrim(item->>'name'),''),'Нэргүй бүтээгдэхүүн'),200) as name,
      (item->>'qty')::bigint as qty, (item->>'price')::bigint as price
    from selected s cross join lateral jsonb_array_elements(
      case when jsonb_typeof(s.items)='array' then s.items else '[]'::jsonb end
    ) item
    where s.payment_status='paid'
      and (item->>'qty') ~ '^[0-9]{1,9}$' and (item->>'price') ~ '^[0-9]{1,9}$'
  ), products as (
    select name, sum(qty) as units, sum(qty::numeric*price) as amount
    from product_lines where qty>0 group by name
    order by amount desc,name limit 20
  )
  select to_jsonb(totals) || jsonb_build_object(
    'products',coalesce((select jsonb_agg(to_jsonb(p) order by p.amount desc,p.name) from products p),'[]'::jsonb),
    'product_units',coalesce((select sum(qty) from product_lines where qty>0),0)
  ) into report from totals;
  return report;
end;
$$;
revoke all on function public.ampm_sales_report(date,date) from public,anon;
grant execute on function public.ampm_sales_report(date,date) to authenticated;
comment on function public.ampm_sales_report(date,date) is
  'Admin-only order-created-date report in Asia/Ulaanbaatar. Paid means database-confirmed payment, not delivered. Order totals include delivery; not profit or refund-adjusted accounting.';

commit;
