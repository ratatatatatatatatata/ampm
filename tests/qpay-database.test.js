import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const id = '11111111-1111-4111-8111-111111111111';
const admin = '22222222-2222-4222-8222-222222222222';
const employee = '33333333-3333-4333-8333-333333333333';
const migrations = ['20260914123750_ampm_order_email_notifications.sql','20260928165250_ampm_order_delivery_preference.sql','20261001061648_qpay_payment_confirmation.sql'];
async function db(t) {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as 'select null::uuid';
    grant usage on schema public,auth to anon,authenticated,service_role;
    create table public.orders(id uuid primary key,items jsonb not null,total integer not null,contact text,address text,
      lat float,lng float,status text default 'new',created_at timestamptz default now(),payment_method text);
    create table public.admins(user_id uuid primary key);
    create table public.notifications(id uuid primary key default gen_random_uuid(),user_id uuid,title text,body text);
    grant insert,select,update on public.orders to anon,authenticated;
    insert into auth.users values ('${admin}'),('${employee}');
    insert into public.admins values ('${admin}');
  `);
  for (const path of migrations) await db.exec(readFileSync(new URL('../supabase/migrations/'+path,import.meta.url),'utf8'));
  await db.exec(`insert into public.employees values ('${employee}');
    insert into public.orders(id,items,total,contact,address,payment_method) values ('${id}','[]',12000,'80000000','Test','qpay');
    insert into public.ampm_qpay_invoices(order_id,invoice_id,expected_amount,callback_token,state)
      values ('${id}','invoice-1',12000,gen_random_uuid(),'ready');`);
  return db;
}
const confirm = `select public.ampm_confirm_qpay_payment('${id}','invoice-1',12000,array['payment-1']) as confirmed`;
test('payment and staff notifications are atomic and idempotent; unpaid QPay orders do not queue emails', async t => {
  const d = await db(t);
  assert.equal((await d.query('select * from public.ampm_order_notifications')).rows.length,0);
  await d.exec('set role service_role');
  assert.equal((await d.query(confirm)).rows[0].confirmed,true);
  assert.equal((await d.query(confirm)).rows[0].confirmed,false);
  await d.exec('reset role');
  const o = (await d.query('select payment_status,paid_at from public.orders')).rows[0];
  assert.equal(o.payment_status,'paid'); assert.ok(o.paid_at);
  const notifications = (await d.query('select user_id,title from public.notifications order by user_id')).rows;
  assert.deepEqual(notifications.map(n=>n.user_id),[admin,employee]);
  assert.ok(notifications.every(n=>n.title==='QPay-ээр төлбөр төлөгдлөө'));
  const queue = (await d.query('select order_snapshot from public.ampm_order_notifications')).rows;
  assert.equal(queue.length,1); assert.equal(queue[0].order_snapshot.payment_status,'paid');
});
test('wrong invoice or amount cannot confirm, and clients cannot spoof paid status or use confirmation RPC', async t => {
  const d = await db(t);
  for (const role of ['anon','authenticated']) {
    await d.exec(`set role ${role}`);
    await assert.rejects(d.query(confirm),/permission denied/);
    await assert.rejects(d.query("update public.orders set payment_status='paid'"),/server controlled/);
    await assert.rejects(d.query("update public.orders set paid_at=now()"),/server controlled/);
    await assert.rejects(d.query("update public.orders set total=1"),/server controlled/);
    await assert.rejects(d.query("insert into public.orders(id,items,total,payment_status) values (gen_random_uuid(),'[]',1,'paid')"),/server controlled/);
    await assert.rejects(d.query('select callback_token from public.ampm_qpay_invoices'),/permission denied/);
    await d.exec('reset role');
  }
  await d.exec('set role service_role');
  await assert.rejects(d.query(confirm.replace('12000','10000')),/Invalid payment confirmation/);
  await assert.rejects(d.query(confirm.replace('invoice-1','other-invoice')),/Invalid payment confirmation/);
  await d.exec('reset role');
  assert.equal((await d.query('select * from public.notifications')).rows.length,0);
});
test('notification persistence failure rolls back payment so callback retry can deliver', async t => {
  const d = await db(t);
  await d.exec("alter table public.notifications add constraint reject_test check (false); set role service_role");
  await assert.rejects(d.query(confirm));
  await d.exec('reset role');
  assert.equal((await d.query('select payment_status from public.orders')).rows[0].payment_status,'pending');
  assert.equal((await d.query('select paid_at from public.ampm_qpay_invoices')).rows[0].paid_at,null);
  assert.equal((await d.query('select * from public.ampm_order_notifications')).rows.length,0);
  await d.exec('alter table public.notifications drop constraint reject_test; set role service_role');
  assert.equal((await d.query(confirm)).rows[0].confirmed,true);
});
