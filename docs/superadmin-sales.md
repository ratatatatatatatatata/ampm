# Protected superadmins and sales reporting

## Behavior

- Existing admin memberships and regular-admin permissions are retained.
- `admins.role` defaults to `admin`; owner-approved promotions are performed separately from the public migration. No account identifiers are embedded in source.
- `superadmin` has the existing administrative capabilities, plus protection against role changes through the user-role RPC. The UI displays the protected role. The RPC cannot grant additional superadmins.
- Both admin tiers can open **Админ → Борлуулалт**. Employees and customers cannot call the reporting RPC; the database checks this independently of the UI.
- Reports aggregate all matching orders in PostgreSQL, not only the first REST page. Presets: today, seven days, thirty days, all time; custom dates are supported.
- Dates refer to order creation, with inclusive calendar dates in Asia/Ulaanbaatar.
- Paid totals include only database-confirmed `payment_status = 'paid'`. Delivery is not evidence of payment. Old bank-transfer orders remain unconfirmed until a separate payment reconciliation process confirms them.
- Order totals include delivery; product totals exclude delivery. This is not net revenue, profit, or a refund-adjusted accounting report.

## Release order and rollback

1. Run build, server/client typecheck, lint, and the full tests.
2. Verify the mobile/desktop UI and preview build.
3. Apply the additive `20261003133021_superadmin_sales_reporting.sql` migration, then `20261003133409_sales_exclude_delivery_line.sql`. Neither changes orders or memberships. The follow-up excludes the checkout's delivery-fee item from product counts/amounts, while retaining it in order/payment totals. Filenames match the provider-assigned production migration ledger; do not reapply these to that project.
4. Deploy the frontend and verify its custom domain and commit.
5. Promote only the owner-approved existing accounts through a separately authorized transaction; verify the exact roles afterwards.
6. Verify real database authorization and report aggregates using read-only transactions and existing identities. Do not submit test orders or send notifications.

Frontend rollback target is the pre-release deployment recorded in the private Control Tower report, based on main `ea48cbf6b16460a4a8294746e37d1d694e804aa9`. Prefer a forward fix retaining protected roles; do not drop the new column or remove privileges as an automatic rollback. Old UI can continue checking admin membership but does not understand the superadmin label. Restoring old role-management functions would remove the protection and requires explicit owner approval. Previous function definitions are retained in `20261001065603_admin_user_role_management.sql`.

## Automated acceptance

`tests/superadmin-sales.test.ts` verifies existing memberships, both admin tiers, owner-role protection, direct-write denial, employee/customer/NULL/anonymous denial, payment-vs-delivery separation, Ulaanbaatar date boundaries, more than 1,000 orders, malformed product snapshots, empty/invalid dates, and UI authorization contracts. Fixtures are synthetic and local to PGlite.

No new provider or dependency is required. Production customer records, credentials, and account identifiers must not be committed with release evidence.
