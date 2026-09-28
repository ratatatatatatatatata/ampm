# AM/PM delivery-request email update — 2026-09-29

## Scope

Keep the existing transactional order outbox and per-recipient retry worker.
Add an optional requested delivery day/time to checkout, the order record,
new notification snapshots, admin order cards, and the notification email.
The request is not a guaranteed appointment. Empty requests are displayed as
“Заагаагүй — утсаар тохиролцоно”. Order creation is not proof of payment.

Keep the user-approved recipient list in the server configuration, not in this
public repository. Only process previously pending notifications when the
user has explicitly approved them. Do not enqueue other historical orders.

## Rollout gate

1. Verify the AM/PM Vercel project and Resend account/domain. Do not assume
   that a historical report about environment variables is still current.
2. Retain rollback deployment `dpl_3mURxnJjigwZFBzCU7aD3ygcAbt1`, source
   `3c9031c230faade2d9be2627ddf7ca8d8c5faba3`, and existing environment entries.
3. Check no competing `delivery_preference` column/migration exists, then
   apply `20260928165250_ampm_order_delivery_preference.sql` **before** the
   frontend release. It is additive and preserves old orders, snapshots,
   notification history, RLS policies and existing function grants.
4. Verify the sender using the exact DNS records returned by Resend. Preserve
   existing DNS records; do not guess the DNS vendor or replace mail routing.
5. Confirm the approved recipient list, server-only credentials, and cron
   configuration. Enable sending only after the sender is verified.
6. Preview/build verification, merge and production deploy, then confirm the
   custom domain serves the intended commit and unauthenticated notification
   endpoints return 401. A build alone does not verify email delivery.
7. Let the worker process only the approved pending notifications. Inspect
   per-recipient delivery rows and Resend message events. Distinguish
   provider acceptance, recipient-mail-server delivery, and inbox visibility.
8. Confirm cron continues invoking the worker. It processes one due order
   per minute; a backlog can increase the time until a new email is sent.

## Recovery

The previous app is compatible with the additional nullable database column.
Prefer restoring the previous deployment while retaining the column, trigger,
queue and per-recipient history. Never delete/reset delivery history or replay
uncertain sends. No credential rotation or environment removal is required.
Any destructive recovery operation requires exact user approval.

## Verification

- Worker tests: both recipients receive separate frozen payloads; escaping,
  legacy/null preference, invalid/overlong preference, authenticated cron,
  pause behavior, retry limits and idempotency are exercised.
- PGlite tests: old snapshots are unchanged, new preferences are captured,
  constraints reject invalid input, existing access controls remain enforced.
- Browser: local-only synthetic product; checkout at 390 × 844 displays the
  optional field and full explanatory text without horizontal overflow.
  No production order or payment is created by this browser check.
- Lockfile-only patches: PostCSS 8.5.22 → 8.5.28 and nanoid 3.3.16 → 3.3.19.
  References: [PostCSS advisory](https://github.com/postcss/postcss/security/advisories/GHSA-fxqj-rqcc-2cmp),
  [nanoid advisory](https://github.com/advisories/GHSA-2v37-7h3g-55p8).

This document is a release procedure, not a claim that production sending has
been activated. Provider login/configuration and delivery evidence are separate
release gates.
