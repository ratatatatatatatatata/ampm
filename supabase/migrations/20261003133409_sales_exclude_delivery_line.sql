begin;

create or replace function public.ampm_sales_report(p_from date default null,p_to date default null)
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
      -- Checkout stores the delivery fee in items; it is not a product sold.
      and coalesce(btrim(item->>'name'),'') <> 'Хүргэлтийн төлбөр'
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

commit;
