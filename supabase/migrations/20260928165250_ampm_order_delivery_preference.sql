-- Additive: preserve historical orders, frozen notifications, grants and policies.
begin;

alter table public.orders add column delivery_preference text
  constraint orders_delivery_preference_length
  check (delivery_preference is null or
    (char_length(delivery_preference) <= 500 and char_length(btrim(delivery_preference)) > 0));

comment on column public.orders.delivery_preference is
  'Optional requested delivery day/time. Not a confirmed delivery appointment.';

-- CREATE OR REPLACE preserves the existing function identity and ACL.
create or replace function ampm_notification_internal.queue_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.ampm_order_notifications(order_id, order_snapshot)
  values (new.id, jsonb_build_object(
    'id', new.id, 'contact', new.contact, 'address', new.address,
    'lat', new.lat, 'lng', new.lng, 'items', new.items,
    'total', new.total, 'payment_method', new.payment_method,
    'status', new.status, 'created_at', new.created_at,
    'delivery_preference', new.delivery_preference
  ));
  return new;
end;
$$;

commit;
