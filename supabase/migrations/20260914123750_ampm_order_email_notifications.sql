-- New orders only. Existing orders and their access policies are untouched.
create schema ampm_notification_internal;
revoke all on schema ampm_notification_internal from public, anon, authenticated;

create table public.ampm_order_notifications (
  order_id uuid primary key,
  order_snapshot jsonb not null,
  status text not null default 'pending'
    check (status in ('pending', 'sending', 'sent', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz default now(),
  provider_accepted_at timestamptz,
  provider_message_id text,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ampm_order_notification_deliveries (
  order_id uuid not null references public.ampm_order_notifications(order_id),
  recipient text not null,
  email_payload jsonb not null,
  status text not null default 'pending'
    check (status in ('pending', 'sending', 'accepted', 'failed', 'uncertain')),
  attempts integer not null default 0 check (attempts >= 0),
  provider_message_id text,
  first_attempt_at timestamptz,
  accepted_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (order_id, recipient)
);

alter table public.ampm_order_notifications enable row level security;
alter table public.ampm_order_notification_deliveries enable row level security;

-- These are newly created objects: grant no client access to order snapshots.
revoke all on public.ampm_order_notifications,
  public.ampm_order_notification_deliveries
  from public, anon, authenticated, service_role;
grant select, insert, update on public.ampm_order_notifications,
  public.ampm_order_notification_deliveries to service_role;

comment on column public.ampm_order_notifications.status is
  'sent means the email provider accepted every request, not verified inbox delivery.';

create function ampm_notification_internal.queue_order()
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
    'status', new.status, 'created_at', new.created_at
  ));
  return new;
end;
$$;
revoke all on function ampm_notification_internal.queue_order()
  from public, anon, authenticated;

create trigger ampm_queue_new_order_email
after insert on public.orders
for each row execute function ampm_notification_internal.queue_order();

create function public.ampm_claim_order_notifications(p_limit integer default 1)
returns table (claimed_order_id uuid)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.ampm_order_notifications as exhausted
  set status = 'failed', next_attempt_at = null,
      last_error = coalesce(exhausted.last_error, 'Retry limit reached after an interrupted attempt'),
      updated_at = now()
  where exhausted.status = 'sending' and exhausted.attempts >= 12
    and exhausted.updated_at <= now() - interval '5 minutes';

  return query
  with candidates as (
    select notification.order_id
    from public.ampm_order_notifications as notification
    where notification.attempts < 12
      and (
        (notification.status in ('pending', 'failed')
          and notification.next_attempt_at is not null
          and notification.next_attempt_at <= now())
        or (notification.status = 'sending'
          and notification.updated_at <= now() - interval '5 minutes')
      )
    order by notification.created_at, notification.order_id
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 1), 10))
  )
  update public.ampm_order_notifications as notification
  set status = 'sending', attempts = notification.attempts + 1,
      last_error = null, updated_at = now()
  from candidates
  where notification.order_id = candidates.order_id
  returning notification.order_id;
end;
$$;

revoke all on function public.ampm_claim_order_notifications(integer)
  from public, anon, authenticated;
grant execute on function public.ampm_claim_order_notifications(integer)
  to service_role;

create index ampm_order_notifications_retry_idx
on public.ampm_order_notifications(next_attempt_at, created_at)
where status in ('pending', 'failed', 'sending');
