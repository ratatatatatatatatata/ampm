# QPay verified payment notifications

The invoice is created for a stored order using catalog prices and a per-order checkout capability. QPay calls `qpay-callback` with a separate server-only per-invoice capability. The callback checks the stored invoice via the authenticated QPay merchant `payment/check` API and accepts only unique PAID rows in MNT whose sum exactly matches the invoice and order total.

Confirmation, order payment status, and notifications for every account in `admins` or `employees` are committed in one database transaction. Duplicate callbacks do not send duplicate notifications. New unpaid QPay orders do not enter the registration email outbox; confirmed orders enter the existing durable email worker with a payment-confirmed subject. Email recipients remain the configured `AMPM_NOTIFICATION_TO` addresses. In-app notifications reach all designated admin/employee accounts; they remain in the notification list after reconnecting. Browser popups require an open staff/admin panel and notification permission; this is not background Web Push.

In Admin → Хэрэглэгчид, select **Ажилтан болгох** on a registered user's account. Employees can read orders and receive notifications but cannot edit products, mark orders delivered, or grant roles. No users are automatically granted employee access.

Required existing Supabase function secrets: `QPAY_USERNAME`, `QPAY_PASSWORD`, `QPAY_INVOICE_CODE`. Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. The merchant credentials must correspond to the intended receiving account. QPay merchant PAID verification is used; there is no independent bank-statement or delayed merchant settlement reconciliation. If QPay settles to the bank later, PAID alone is not proof that that later settlement is credited.

Deployment: apply `20261001061648_qpay_payment_confirmation.sql`, deploy `qpay-callback`, `qpay-status`, `qpay-invoice` with the capability authentication settings in `supabase/config.toml`, then deploy the frontend and existing email worker. Legacy outstanding invoices created before this change still have their original homepage callback and need manual reconciliation; the migration never marks historical orders paid.

`qpay-status` reads only the application database. The frontend does not poll the QPay merchant API. Pending QR checkout is restored after reopening/reloading. Uncertain invoice creation failures are held for review to avoid creating duplicate invoice numbers.

Validation: `npm run build`, `npm test`, `npm run lint`, and `deno check` for all three Edge Functions. Synthetic tests cover wrong amounts/currency/status, duplicate payment IDs and callbacks, client permission restrictions, atomic rollback/retry, and paid email wording. A real merchant payment and receiving-account reconciliation must still be tested separately.
