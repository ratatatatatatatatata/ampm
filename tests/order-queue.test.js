import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const migration = readFileSync(new URL(
  '../supabase/migrations/20260914123750_ampm_order_email_notifications.sql',
  import.meta.url,
), 'utf8');

const orderId = (number) => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;

async function insertOrder(db, number) {
  await db.query(`
    insert into public.orders
      (id, items, total, contact, address, lat, lng, status, created_at, payment_method)
    values ($1, $2::jsonb, 12000, 'synthetic@example.com', 'Synthetic address',
      47.9, 106.9, 'pending', '2026-09-14T00:00:00Z', 'qpay')
  `, [orderId(number), JSON.stringify([{ id: 'synthetic-product', quantity: 2, price: 6000 }])]);
}

async function database(t, { historicalOrder = false } = {}) {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    grant usage on schema public to public, anon, authenticated, service_role;
    alter default privileges in schema public
      grant all privileges on tables to public, anon, authenticated, service_role;
    alter default privileges
      grant execute on functions to public, anon, authenticated, service_role;
    create table public.orders (
      id uuid primary key,
      items jsonb not null,
      total integer not null,
      contact text,
      address text,
      lat double precision,
      lng double precision,
      status text not null default 'pending',
      created_at timestamptz not null default now(),
      payment_method text
    );
    revoke all on public.orders from public, anon, authenticated, service_role;
    grant insert on public.orders to anon;
  `);
  if (historicalOrder) await insertOrder(db, 1);
  await db.exec(migration);
  return db;
}

async function asRole(db, role, callback) {
  assert.ok(['anon', 'authenticated', 'service_role'].includes(role));
  await db.exec(`set role ${role}`);
  try {
    return await callback();
  } finally {
    await db.exec('reset role');
  }
}

async function claim(db, limit = 1) {
  return asRole(db, 'service_role', async () => {
    const { rows } = await db.query(
      'select claimed_order_id from public.ampm_claim_order_notifications($1)', [limit],
    );
    return rows.map((row) => row.claimed_order_id).sort();
  });
}

async function notification(db, number) {
  const { rows } = await db.query(
    'select * from public.ampm_order_notifications where order_id = $1', [orderId(number)],
  );
  return rows[0];
}

test('migration queues only new orders, including anonymous checkout, and freezes their snapshot', async (t) => {
  const db = await database(t, { historicalOrder: true });
  assert.equal((await db.query('select count(*)::integer as count from public.ampm_order_notifications')).rows[0].count, 0);

  await asRole(db, 'anon', () => insertOrder(db, 2));
  const queued = await notification(db, 2);
  const original = (await db.query('select to_jsonb(orders) as snapshot from public.orders where id = $1', [orderId(2)])).rows[0].snapshot;
  assert.deepEqual(queued.order_snapshot, original);
  assert.equal(queued.status, 'pending');
  assert.equal(queued.attempts, 0);
  assert.ok(queued.next_attempt_at);

  await db.query(`
    update public.orders set contact = 'synthetic@example.com', address = 'Changed synthetic address',
      items = '[]'::jsonb, total = 0, status = 'cancelled', payment_method = 'cash'
    where id = $1
  `, [orderId(2)]);
  assert.deepEqual((await notification(db, 2)).order_snapshot, original);
  assert.equal(await notification(db, 1), undefined);
});

test('client roles cannot read or mutate notification data or invoke either function despite broad defaults', async (t) => {
  const db = await database(t);
  await insertOrder(db, 1);
  await db.query(`
    insert into public.ampm_order_notification_deliveries (order_id, recipient, email_payload)
    values ($1, 'synthetic@example.com', '{}'::jsonb)
  `, [orderId(1)]);

  const operations = [
    ['select * from public.ampm_order_notifications', []],
    ["insert into public.ampm_order_notifications (order_id, order_snapshot) values ($1, '{}'::jsonb)", [orderId(2)]],
    ["update public.ampm_order_notifications set status = 'sent'", []],
    ['select * from public.ampm_order_notification_deliveries', []],
    ["insert into public.ampm_order_notification_deliveries (order_id, recipient, email_payload) values ($1, 'synthetic@example.com', '{}'::jsonb)", [orderId(1)]],
    ["update public.ampm_order_notification_deliveries set status = 'accepted'", []],
    ['select * from public.ampm_claim_order_notifications(1)', []],
    ['select ampm_notification_internal.queue_order()', []],
  ];
  for (const role of ['anon', 'authenticated']) {
    for (const [sql, params] of operations) {
      await assert.rejects(
        asRole(db, role, () => db.query(sql, params)),
        (error) => error.code === '42501',
        `${role} must receive permission denied for ${sql}`,
      );
    }
  }
  assert.equal((await notification(db, 1)).status, 'pending');
});

test('new tables enable row security and service role has only its required data permissions', async (t) => {
  const db = await database(t);
  const { rows } = await db.query(`
    select relname, relrowsecurity,
      has_table_privilege('service_role', oid, 'SELECT') as can_select,
      has_table_privilege('service_role', oid, 'INSERT') as can_insert,
      has_table_privilege('service_role', oid, 'UPDATE') as can_update,
      has_table_privilege('service_role', oid, 'DELETE') as can_delete,
      has_table_privilege('service_role', oid, 'TRUNCATE') as can_truncate
    from pg_class
    where oid in ('public.ampm_order_notifications'::regclass,
      'public.ampm_order_notification_deliveries'::regclass)
  `);
  assert.equal(rows.length, 2);
  for (const row of rows) {
    assert.equal(row.relrowsecurity, true, row.relname);
    assert.equal(row.can_select, true, row.relname);
    assert.equal(row.can_insert, true, row.relname);
    assert.equal(row.can_update, true, row.relname);
    assert.equal(row.can_delete, false, row.relname);
    assert.equal(row.can_truncate, false, row.relname);
  }
  await insertOrder(db, 1);
  await asRole(db, 'service_role', async () => {
    await db.query(`
      insert into public.ampm_order_notification_deliveries (order_id, recipient, email_payload)
      values ($1, 'synthetic@example.com', '{}'::jsonb)
    `, [orderId(1)]);
    await db.query("update public.ampm_order_notification_deliveries set status = 'accepted'");
    assert.equal((await db.query('select status from public.ampm_order_notification_deliveries')).rows[0].status, 'accepted');
  });
});

test('service role claims once and an unexpired lease cannot be immediately claimed again', async (t) => {
  const db = await database(t);
  await insertOrder(db, 1);
  assert.deepEqual(await claim(db), [orderId(1)]);
  const queued = await notification(db, 1);
  assert.equal(queued.status, 'sending');
  assert.equal(queued.attempts, 1);
  assert.deepEqual(await claim(db), []);
  assert.equal((await notification(db, 1)).attempts, 1);
});

test('interrupted claims are recovered after five minutes while recent leases stay held', async (t) => {
  const db = await database(t);
  await insertOrder(db, 1);
  await insertOrder(db, 2);
  await db.query(`
    update public.ampm_order_notifications set status = 'sending', attempts = 3,
      last_error = 'Synthetic interrupted attempt',
      updated_at = now() - case when order_id = $1 then interval '6 minutes' else interval '4 minutes' end
  `, [orderId(1)]);
  assert.deepEqual(await claim(db, 10), [orderId(1)]);
  const recovered = await notification(db, 1);
  assert.equal(recovered.status, 'sending');
  assert.equal(recovered.attempts, 4);
  assert.equal(recovered.last_error, null);
  assert.equal((await notification(db, 2)).attempts, 3);
  assert.deepEqual(await claim(db, 10), []);
});

test('retry claims respect due time, terminal null deadlines, sent status, and the attempt limit', async (t) => {
  const db = await database(t);
  for (let number = 1; number <= 7; number += 1) await insertOrder(db, number);
  await db.exec(`
    update public.ampm_order_notifications set status = 'failed', next_attempt_at = now() - interval '1 minute';
  `);
  await db.query("update public.ampm_order_notifications set next_attempt_at = now() + interval '1 hour' where order_id = $1", [orderId(2)]);
  await db.query('update public.ampm_order_notifications set next_attempt_at = null where order_id = $1', [orderId(3)]);
  await db.query("update public.ampm_order_notifications set status = 'pending', next_attempt_at = now() + interval '1 hour' where order_id = $1", [orderId(4)]);
  await db.query("update public.ampm_order_notifications set status = 'pending', next_attempt_at = null where order_id = $1", [orderId(5)]);
  await db.query("update public.ampm_order_notifications set status = 'sent', updated_at = now() - interval '1 hour' where order_id = $1", [orderId(6)]);
  await db.query('update public.ampm_order_notifications set attempts = 12 where order_id = $1', [orderId(7)]);

  assert.deepEqual(await claim(db, 10), [orderId(1)]);
  for (let number = 2; number <= 6; number += 1) {
    assert.equal((await notification(db, number)).attempts, 0);
  }
  assert.equal((await notification(db, 6)).status, 'sent');
  assert.equal((await notification(db, 7)).attempts, 12);

  await db.query("update public.ampm_order_notifications set next_attempt_at = now() - interval '1 minute' where order_id = $1", [orderId(2)]);
  assert.deepEqual(await claim(db, 10), [orderId(2)]);
});

test('the twelfth interrupted attempt becomes terminal after its lease expires', async (t) => {
  const db = await database(t);
  for (let number = 1; number <= 3; number += 1) await insertOrder(db, number);
  await db.exec("update public.ampm_order_notifications set status = 'sending', attempts = 12, updated_at = now() - interval '6 minutes'");
  await db.query("update public.ampm_order_notifications set last_error = 'Synthetic known failure' where order_id = $1", [orderId(2)]);
  await db.query('update public.ampm_order_notifications set updated_at = now() where order_id = $1', [orderId(3)]);

  assert.deepEqual(await claim(db, 10), []);
  const exhausted = await notification(db, 1);
  assert.equal(exhausted.status, 'failed');
  assert.equal(exhausted.attempts, 12);
  assert.equal(exhausted.next_attempt_at, null);
  assert.match(exhausted.last_error, /Retry limit reached/);
  assert.equal((await notification(db, 2)).last_error, 'Synthetic known failure');
  assert.equal((await notification(db, 2)).next_attempt_at, null);
  assert.equal((await notification(db, 3)).status, 'sending');
  assert.deepEqual(await claim(db, 10), []);
});

test('claim batch size is capped at ten and selects the oldest notifications first', async (t) => {
  const db = await database(t);
  for (let number = 1; number <= 12; number += 1) {
    await insertOrder(db, number);
    await db.query("update public.ampm_order_notifications set created_at = '2026-09-14T00:00:00Z'::timestamptz + $2 * interval '1 second' where order_id = $1", [orderId(number), number]);
  }
  assert.deepEqual(await claim(db, 100), Array.from({ length: 10 }, (_, index) => orderId(index + 1)));
  assert.deepEqual(await claim(db, 0), [orderId(11)]);
  assert.deepEqual(await claim(db, null), [orderId(12)]);
  assert.deepEqual(await claim(db, 100), []);
});
