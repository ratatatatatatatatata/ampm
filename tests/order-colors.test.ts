import test from 'node:test'
import assert from 'node:assert/strict'
import { AMPM_VARIANTS, catalogColor, productColor, isDeliveryItem, orderItemColor, snapshotOrderItems } from '../shared/order-items.ts'
import { emailPayload } from '../server/order-notifications.ts'

const lines = [
  { id: AMPM_VARIANTS[0].productId, name: 'AM/PM Silver', price: 25000, qty: 2 },
  { id: AMPM_VARIANTS[1].productId, name: 'AM/PM Rose Gold', price: 25000, qty: 3 },
]

test('checkout snapshots each colour and its quantity separately with an audit product ID', () => {
  const items = snapshotOrderItems(lines, 6000)
  assert.deepEqual(items.map(i => [i.product_id, i.color, i.qty]), [
    [lines[0].id, 'Мөнгөлөг', 2], [lines[1].id, 'Ягаан алт', 3], [undefined, undefined, 1],
  ])
  assert.equal(items.reduce((total, item) => total + item.qty * item.price, 0), 131000)
  assert.equal(isDeliveryItem(items[2]), true)
  assert.equal(orderItemColor(items[2]), '—')
})

test('saved colour survives future catalogue edits and takes precedence over names', () => {
  const product = { ...lines[0] }
  const items = snapshotOrderItems([product], 6000)
  product.name = 'AM/PM Rose Gold'
  assert.equal(items[0].name, 'AM/PM Silver')
  assert.equal(orderItemColor(items[0]), 'Мөнгөлөг')
  assert.equal(orderItemColor({ ...items[0], name: 'AM/PM Rose Gold' }), 'Мөнгөлөг')
})

test('historic generic AM/PM without a recorded variant cannot be assigned a guessed colour', () => {
  for (const name of ['AM/PM', 'Unknown', 'AM/PM Silver and Rose Gold']) {
    assert.equal(catalogColor(name), null)
    assert.equal(orderItemColor({ ...lines[0], name, product_id: 'unknown' }), 'Өнгийг захиалагчаас лавлана')
  }
  assert.equal(orderItemColor({ ...lines[1] }), 'Ягаан алт')
  assert.equal(orderItemColor({ name: 'Хүргэлтийн төлбөр', qty: 1, price: 6000 }), '—')
})

test('verified product codes identify both colours even when both names are only AM/PM', () => {
  const sameNames = lines.map(line => ({ ...line, name: 'AM/PM' }))
  const items = snapshotOrderItems(sameNames, 6000)
  assert.deepEqual(items.slice(0, 2).map(i => [i.color_code, i.color, i.qty]), [
    ['silver', 'Мөнгөлөг', 2], ['rose_gold', 'Ягаан алт', 3],
  ])
  for (const [index, line] of sameNames.entries()) {
    assert.equal(productColor(line.id), AMPM_VARIANTS[index].label)
    assert.equal(orderItemColor({ ...line, product_id: line.id }), AMPM_VARIANTS[index].label)
  }
})

test('checkout refuses missing/unknown product IDs even with a recognised name', () => {
  for (const id of ['', 'unknown', 'silver-test']) {
    assert.throws(() => snapshotOrderItems([{ ...lines[0], id }], 6000), /өнгө/)
  }
  assert.throws(() => snapshotOrderItems([], 6000), /өнгө, тоог/)
})

test('checkout refuses invalid or fractional quantities before saving or paying', () => {
  for (const qty of [0, -1, 1.5, 1001, Infinity, NaN]) {
    assert.throws(() => snapshotOrderItems([{ ...lines[0], qty }], 6000), /бүхэл тоо/)
  }
})

test('both email formats show colour and units, and escape untrusted stored colours', () => {
  const order = {
    id: 'synthetic-order', contact: 'synthetic@example.com', address: 'Synthetic address',
    lat: null, lng: null, payment_method: 'transfer', status: 'new',
    created_at: '2026-10-07T00:00:00Z', total: 131000, items: snapshotOrderItems(lines, 6000),
  }
  const mail = emailPayload(order, 'AM/PM <orders@example.com>', 'staff@example.com')
  assert.match(mail.text, /AM\/PM Silver \| Өнгө: Мөнгөлөг \| 2 ширхэг/)
  assert.match(mail.text, /AM\/PM Rose Gold \| Өнгө: Ягаан алт \| 3 ширхэг/)
  assert.match(mail.html, /Өнгө: Мөнгөлөг/)
  assert.match(mail.html, /2 ширхэг/)
  assert.match(mail.html, /Өнгө: Ягаан алт/)
  assert.match(mail.html, /3 ширхэг/)
  assert.match(mail.text, /131,000/)
  assert.equal(mail.text.includes('Хүргэлтийн төлбөр | Өнгө:'), false)
  order.items[0].color = '<img src=x onerror=alert(1)>'
  const escaped = emailPayload(order, 'AM/PM <orders@example.com>', 'staff@example.com')
  assert.equal(escaped.html.includes('<img'), false)
  assert.match(escaped.html, /&lt;img/)
})
