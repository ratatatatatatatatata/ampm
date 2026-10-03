import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { mongoliaDate, salesDateRange } from '../src/lib/sales.ts'

const owner = '11111111-1111-4111-8111-111111111111'
const admin = '22222222-2222-4222-8222-222222222222'
const employee = '33333333-3333-4333-8333-333333333333'
const customer = '44444444-4444-4444-8444-444444444444'
const migration = readFileSync(new URL('../supabase/migrations/20261003130649_superadmin_sales_reporting.sql', import.meta.url), 'utf8')
async function setup(t: { after: (fn: () => Promise<void>) => void }) {
  const db = new PGlite(); t.after(() => db.close())
  await db.exec(`
    create role anon; create role authenticated; create schema auth;
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create table auth.users(id uuid primary key);
    create table public.profiles(id uuid primary key);
    create table public.admins(user_id uuid primary key);
    create table public.employees(user_id uuid primary key);
    create table public.orders(id int generated always as identity, total integer, items jsonb, created_at timestamptz, status text, payment_status text);
    alter table public.admins enable row level security;
    alter table public.employees enable row level security;
    alter table public.orders enable row level security;
    grant usage on schema public,auth to anon,authenticated;
    grant select,insert,update,delete on public.admins,public.employees to authenticated;
    grant select on public.orders to authenticated;
    create policy own_admin on public.admins for select to authenticated using(user_id=auth.uid());
    create policy own_employee on public.employees for select to authenticated using(user_id=auth.uid());
    create policy staff_orders on public.orders for select to authenticated using(
      exists(select 1 from public.admins where user_id=auth.uid()) or exists(select 1 from public.employees where user_id=auth.uid()));
    insert into auth.users values('${owner}'),('${admin}'),('${employee}'),('${customer}');
    insert into public.profiles select id from auth.users;
    insert into public.admins values('${owner}'),('${admin}');
    insert into public.employees values('${employee}');
  `)
  await db.exec(readFileSync(new URL('../supabase/migrations/20261001065603_admin_user_role_management.sql', import.meta.url), 'utf8'))
  await db.exec(migration)
  await db.exec(readFileSync(new URL('../supabase/migrations/20261003133156_sales_exclude_delivery_line.sql', import.meta.url), 'utf8'))
  await db.exec(`update public.admins set role='superadmin' where user_id='${owner}'`)
  return db
}
async function login(db: PGlite, id: string) {
  await db.exec(`reset role;select set_config('request.jwt.claim.sub','${id}',false);set role authenticated`)
}
async function report(db: PGlite, from: string | null = null, to: string | null = null) {
  const value = await db.query<{ value: Record<string, unknown> }>('select public.ampm_sales_report($1::date,$2::date) as value', [from, to])
  return value.rows[0].value
}

test('migration preserves existing admin memberships and exposes protected superadmin role', async t => {
  const db = await setup(t); await login(db, admin)
  const roles = (await db.query<{ user_id: string; user_role: string }>('select * from public.ampm_list_user_roles()')).rows
  assert.equal(roles.find(row => row.user_id === owner)?.user_role, 'superadmin')
  assert.equal(roles.find(row => row.user_id === admin)?.user_role, 'admin')
  await db.query(`select public.ampm_set_user_role('${customer}','admin')`)
  // Existing normal-admin management is retained; no unrelated demotion occurs.
  assert.equal((await db.query<{ user_role: string }>(`select user_role from public.ampm_list_user_roles() where user_id='${customer}'`)).rows[0].user_role, 'admin')
})

test('no admin or superadmin may downgrade protected owners or grant superadmin through the old RPC', async t => {
  const db = await setup(t)
  for (const caller of [owner, admin]) {
    await login(db, caller)
    for (const role of ['admin', 'employee', 'customer', 'superadmin']) {
      await assert.rejects(db.query(`select public.ampm_set_user_role('${owner}','${role}')`), /Superadmin role is protected/)
    }
    await assert.rejects(db.query(`select public.ampm_set_user_role('${customer}','superadmin')`), /Invalid user role/)
    await assert.rejects(db.query(`update public.admins set role='superadmin' where user_id='${admin}'`), /permission denied/)
    await assert.rejects(db.query(`delete from public.admins where user_id='${owner}'`), /permission denied/)
  }
})

test('sales RPC denies employees, customers, NULL identity and anonymous callers', async t => {
  const db = await setup(t)
  for (const id of [employee, customer, '']) {
    await login(db, id)
    await assert.rejects(report(db), /Admin permission required/)
  }
  await db.exec('reset role;set role anon')
  await assert.rejects(report(db), /permission denied/)
})

test('both admin tiers see complete aggregates; delivered/pending never counts as confirmed payment', async t => {
  const db = await setup(t)
  await db.exec(`insert into public.orders(total,items,created_at,status,payment_status) values
    (31000,'[{"name":"Brush","qty":1,"price":25000},{"name":"Хүргэлтийн төлбөр","qty":1,"price":6000}]','2026-10-02T16:00:00Z','new','paid'),
    (56000,'[{"name":"Brush","qty":2,"price":25000},{"name":"Хүргэлтийн төлбөр","qty":1,"price":6000}]','2026-10-03T15:59:59Z','done','paid'),
    (99000,'[{"name":"Not paid","qty":3,"price":31000}]','2026-10-03T00:00:00Z','done','pending'),
    (1,'[]','2026-10-03T16:00:00Z','new','paid'),
    (1,'[]','2026-10-02T15:59:59Z','new','paid');`)
  for (const id of [owner, admin]) {
    await login(db, id)
    assert.deepEqual(await report(db, '2026-10-03', '2026-10-03'), {
      order_count: 3, order_total: 186000, paid_count: 2, paid_total: 87000,
      pending_count: 1, pending_total: 99000, delivered_count: 2, product_units: 3,
      products: [{ name: 'Brush', units: 3, amount: 75000 }],
    })
  }
})

test('database aggregation includes more than 1000 rows; invalid/empty ranges are explicit', async t => {
  const db = await setup(t)
  await db.exec(`insert into public.orders(total,items,created_at,status,payment_status)
    select 10,'[]','2026-10-03T00:00:00Z','new','paid' from generate_series(1,1005)`)
  await login(db, admin)
  assert.equal((await report(db)).order_count, 1005)
  assert.equal((await report(db)).paid_total, 10050)
  assert.equal((await report(db, '2025-01-01', '2025-01-31')).order_count, 0)
  await assert.rejects(report(db, '2026-10-04', '2026-10-03'), /Invalid date range/)
})

test('malformed product snapshots cannot crash totals or introduce unpaid product sales', async t => {
  const db = await setup(t)
  await db.exec(`insert into public.orders(total,items,created_at,status,payment_status) values
    (10,'{}',now(),'new','paid'),
    (20,'[{"qty":"bad","price":2},{"qty":0,"price":99},{"qty":1,"price":-3}]',now(),'new','paid'),
    (30,'[{"name":"Unpaid","qty":5,"price":6}]',now(),'new','pending')`)
  await login(db, owner)
  const result = await report(db)
  assert.equal(result.order_total, 60); assert.equal(result.paid_total, 30)
  assert.deepEqual(result.products, [])
})

test('date presets use Mongolia midnight and include exactly seven/thirty calendar days', () => {
  const now = new Date('2026-10-02T17:00:00Z')
  assert.equal(mongoliaDate(now), '2026-10-03')
  assert.deepEqual(salesDateRange(7, now), { from: '2026-09-27', to: '2026-10-03' })
  assert.deepEqual(salesDateRange(30, now), { from: '2026-09-04', to: '2026-10-03' })
})

test('sales endpoint remains an RLS-obeying invoker; UI excludes employees and protects owner rows', () => {
  assert.match(migration, /returns jsonb language plpgsql stable security invoker/)
  assert.doesNotMatch(migration, /disable row level security|drop policy|update public\.orders/i)
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
  assert.match(app, /!readOnly \? <SalesReport/)
  assert.match(app, /disabled=\{!rolesLoaded \|\| roleBusy !== null \|\| userRoles\[u\.id\] === 'superadmin'\}/)
  assert.match(app, /key=\{session\?\.user\.id \?\? 'local'\}/)
})
