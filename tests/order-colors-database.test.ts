import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { AMPM_VARIANTS, snapshotOrderItems } from '../shared/order-items.ts'

const migration = readFileSync(new URL('../supabase/migrations/20261007094846_ampm_required_order_colors.sql', import.meta.url), 'utf8')
const lines = AMPM_VARIANTS.map((v, index) => ({ id: v.productId, name: 'AM/PM', price: 25000, qty: index + 2 }))

test('database enforces variant/colour/quantity for direct API roles without rewriting history', async t => {
  const db = new PGlite()
  t.after(() => db.close())
  await db.exec(`
    create role anon; create role authenticated;
    create schema ampm_notification_internal;
    create table public.orders(id uuid primary key default gen_random_uuid(), items jsonb not null, status text default 'new');
    grant usage on schema public to anon, authenticated;
    grant insert, select, update on public.orders to anon, authenticated;
    insert into public.orders(items) values ('[{"name":"AM/PM","price":25000,"qty":1}]');
  `)
  const before = (await db.query<{ id: string; items: unknown }>('select * from public.orders')).rows
  await db.exec(migration)
  assert.deepEqual((await db.query('select * from public.orders')).rows, before)
  const insert = (items: unknown) => db.query<{ items: unknown }>('insert into public.orders(items) values ($1) returning items', [JSON.stringify(items)])

  for (const role of ['anon', 'authenticated']) {
    await t.test(`${role}: two known IDs retain separate colour/quantity despite identical names`, async () => {
      await db.exec(`set role ${role}`)
      const items = snapshotOrderItems(lines, 6000)
      assert.deepEqual((await insert(items)).rows[0].items, items)
      await db.exec('reset role')
    })
    await t.test(`${role}: previous release without color_code is compatible`, async () => {
      await db.exec(`set role ${role}`)
      const previousItems = snapshotOrderItems(lines, 6000).map(({ color_code: _code, ...item }) => item)
      assert.deepEqual((await insert(previousItems)).rows[0].items, previousItems)
      await db.exec('reset role')
    })
    await db.exec(`set role ${role}`)
    const valid = snapshotOrderItems(lines, 6000)
    const delivery = valid.at(-1)!
    const invalidCases = [
      ['legacy missing product ID', [{ name: 'AM/PM', price: 25000, qty: 1 }, delivery]],
      ['unknown product ID', [{ ...valid[0], product_id: 'unknown' }, delivery]],
      ['missing colour', [{ ...valid[0], color: undefined }, delivery]],
      ['null colour', [{ ...valid[0], color: null }, delivery]],
      ['wrong colour', [{ ...valid[0], color: 'Ягаан алт' }, delivery]],
      ['wrong colour code', [{ ...valid[0], color_code: 'rose_gold' }, delivery]],
      ['missing kind', [{ ...valid[0], kind: undefined }, delivery]],
      ['zero quantity', [{ ...valid[0], qty: 0 }, delivery]],
      ['fractional quantity', [{ ...valid[0], qty: 1.5 }, delivery]],
      ['huge quantity', [{ ...valid[0], qty: 1001 }, delivery]],
      ['string quantity', [{ ...valid[0], qty: '2' }, delivery]],
      ['null quantity', [{ ...valid[0], qty: null }, delivery]],
      ['empty cart', []],
      ['only delivery', [delivery, delivery]],
      ['duplicate delivery', [valid[0], delivery, delivery]],
      ['product disguised as delivery', [{ ...valid[0], kind: 'delivery' }, delivery]],
      ['non-array items', {}],
      ['null item', [null, delivery]],
    ] as const
    for (const [label, items] of invalidCases) {
      await t.test(`${role}: rejects ${label} before persisting`, async () => {
        const beforeCount = (await db.query<{ count: number }>('select count(*) as count from public.orders')).rows[0].count
        await assert.rejects(insert(items), (error: { code?: string }) => error.code === '23514')
        assert.equal((await db.query<{ count: number }>('select count(*) as count from public.orders')).rows[0].count, beforeCount)
      })
    }
    await db.exec('reset role')
  }
  // Staff fulfilment changes to old rows remain possible; the old items remain intact.
  await db.query("update public.orders set status='delivered' where id=$1", [before[0].id])
  const old = (await db.query<{ items: unknown; status: string }>('select items,status from public.orders where id=$1', [before[0].id])).rows[0]
  assert.deepEqual(old.items, before[0].items)
  assert.equal(old.status, 'delivered')
  const fn = (await db.query<{ prosecdef: boolean; proconfig: string[] }>("select prosecdef,proconfig from pg_proc where proname='require_order_colors'")).rows[0]
  assert.equal(fn.prosecdef, false)
  assert.ok(fn.proconfig.includes('search_path=""'))
})
