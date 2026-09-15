# Order email notifications

This implementation adapts LifeDent's durable outbox, per-recipient Resend
delivery records, and minutely Vercel worker to AM/PM orders. Sending runs
directly in Vercel so its Marketplace-managed Resend key stays in that runtime.

## Behavior

- New `public.orders` inserts enqueue a snapshot in the same transaction.
- Historical orders are not queued or emailed.
- The production cron runs once per minute and processes one due order.
- The customer can close the website after the order is saved.
- The email includes the saved contact, delivery address, selected items,
  quantities, prices, order total, payment method, and order creation time.
- The saved order data, recipient list, sender, and rendered message are frozen
  before sending, so retries cannot silently change the message.
- Transient failures use bounded retries. Accepted recipients are skipped.
- An uncertain send outside the provider's safe idempotency window stops for
  manual review instead of risking duplicate delivery.
- `sent` means provider acceptance. It does not prove delivery to the inbox.

## Configuration

Configure these secrets only in the named server environments. Never add them
to frontend variables or commit their values.

| Environment | Name | Purpose |
| --- | --- | --- |
| Vercel production | `RESEND_API_KEY` | Marketplace-managed AM/PM Resend resource |
| Vercel production | `AMPM_NOTIFICATION_FROM` | Verified sender identity |
| Vercel production | `AMPM_NOTIFICATION_TO` | Approved comma-separated admin recipients |
| Vercel production | `AMPM_EMAIL_ENABLED` | Set to `true` only after sender verification |
| Vercel production | `CRON_SECRET` | Dedicated random secret for the cron route |
| Vercel production | `VITE_SUPABASE_URL` | Existing AM/PM Supabase project |
| Vercel production | `VITE_SUPABASE_service_role` | Existing secret, read only by the server adapter |

Despite its legacy name, `VITE_SUPABASE_service_role` must only be read through
`process.env` by server code. Never reference it in frontend code or
`import.meta.env`. The cron validates `Authorization: Bearer <CRON_SECRET>`
before any database or provider access. It exposes no anonymous order lookup.

The authenticated `/api/order-email-status` endpoint discovers the Resend domain
by the exact case-insensitive name `ampm.mn`. It reads domain list pages using
`limit=100` and `after`, then retrieves DNS records only when exactly one matching
domain exists. Its `domain_id` is the ID returned by Resend. A Vercel Marketplace
resource ID is not a substitute, and `AMPM_RESEND_DOMAIN_ID` is not used.
The endpoint returns no other domain names or account metadata. It requires a
Resend key with permission to read domains; a provider `403` is reported without
the provider response body. Lookups stop after eight seconds or twenty pages.
See [Resend pagination](https://resend.com/docs/api-reference/pagination) and
[domain retrieval](https://resend.com/docs/api-reference/domains/get-domain).

## Release

1. Run `npm test`, `npm run lint`, and `npm run build`.
2. Apply the additive migration after verifying no conflicting objects exist.
   It grants service-role-only access to the new notification objects and
   preserves existing order access policies.
3. Configure the required server variables with `AMPM_EMAIL_ENABLED=false`.
4. Deploy to the existing AM/PM Vercel project, preserving its previous
   deployment as a rollback target. Verify `/api/process-order-notifications`
   and `/api/order-email-status` reject unauthorized requests.
5. Use the authenticated status endpoint to inspect public DNS requirements.
   Verify the AM/PM sender domain, then set `AMPM_EMAIL_ENABLED=true` and deploy.
6. Verify a user-approved synthetic order through trigger, worker, delivery
   audit, provider event, and recipient inbox where access is available.

## Operations

Inspect `ampm_order_notifications` and `ampm_order_notification_deliveries`
through an authorized server/database connection. They are deliberately
unavailable to anonymous and authenticated browser clients.

Failed rows with `next_attempt_at` set are scheduled for retry. Failed rows
with a null retry time, or `uncertain` recipient deliveries, require manual
provider inspection. Do not reset an uncertain delivery without checking the
provider message and idempotency history first.

For recovery, prefer reverting the Vercel deployment while retaining the
queue and delivery history. Disabling the trigger/cron or deleting synthetic
rows requires the user's exact approval. Do not resend historical orders as
part of recovery.
