import test from 'node:test';
import assert from 'node:assert/strict';
import { verifiedPayment } from '../supabase/functions/_shared/verified-payment.ts';
import { emailPayload } from '../server/order-notifications.ts';

const paid = (amount: string | number = '12000', id = 'payment-1') => ({ payment_id: id, payment_status: 'PAID', payment_currency: 'MNT', payment_amount: amount });
test('QPay confirmation requires actual paid rows, correct currency, exact amount and unique IDs', () => {
  assert.deepEqual(verifiedPayment({ rows: [paid()] }, 12000), { amount: 12000, ids: ['payment-1'] });
  assert.deepEqual(verifiedPayment({ rows: [paid(5000, 'a'), paid(7000, 'b')] }, 12000), { amount: 12000, ids: ['a', 'b'] });
  for (const response of [null, {}, { paid_amount: 12000 }, { rows: [] }, { rows: [paid(11000)] }, { rows: [paid(13000)] },
    { rows: [{ ...paid(), payment_status: 'PENDING' }] }, { rows: [{ ...paid(), payment_currency: 'USD' }] },
    { rows: [paid(6000), paid(6000)] }, { rows: [paid('NaN')] }, { rows: [{ ...paid(), payment_id: '' }] }]) {
    assert.equal(verifiedPayment(response, 12000), null);
  }
});
test('paid QPay email explicitly reports server confirmation, other orders retain registration note', () => {
  const order = { id: '11111111-1111-4111-8111-111111111111', contact: '80000000', address: 'Test', lat: null, lng: null,
    items: [{ name: 'Test', price: 12000, qty: 1 }], total: 12000, payment_method: 'qpay', status: 'new', created_at: '2026-10-01T00:00:00Z' };
  const pending = emailPayload(order, 'orders@example.com', 'admin@example.com');
  assert.match(pending.text, /төлбөр төлөгдсөнийг батлахгүй/);
  const confirmed = emailPayload({ ...order, payment_status: 'paid', paid_at: '2026-10-01T01:00:00Z' }, 'orders@example.com', 'admin@example.com');
  assert.match(confirmed.subject, /QPay төлбөр баталгаажлаа/);
  assert.match(confirmed.text, /QPay-ээр төлбөр төлөгдлөө/);
  assert.doesNotMatch(confirmed.text, /төлбөр төлөгдсөнийг батлахгүй/);
});
