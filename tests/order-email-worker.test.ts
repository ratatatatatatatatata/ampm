import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrderNotificationHandler, type Delivery, type EmailPayload, type NotificationStore } from '../server/order-notifications.ts';

const orderId = '11111111-1111-4111-8111-111111111111';
const fixture = {
  id: orderId, contact: '80000000', address: 'Synthetic test address <script>alert(1)</script>',
  lat: 47.9, lng: 106.9, items: [{ name: 'Sample <img src=x onerror=alert(1)>', price: 2000, qty: 2 }, { name: 'Delivery', price: 3000, qty: 1 }],
  total: 7000, payment_method: 'transfer', status: 'new', created_at: '2026-09-14T01:00:00.000Z',
};

function setup() {
  let time = Date.parse('2026-09-14T02:00:00.000Z');
  const env: Record<string, string> = {
    AMPM_EMAIL_ENABLED: 'true',
    CRON_SECRET: 'test-cron-secret', SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-key', RESEND_API_KEY: 'test-provider-key',
    AMPM_NOTIFICATION_FROM: 'AM/PM <orders@example.com>', AMPM_NOTIFICATION_TO: 'admin@example.com',
  };
  const queue: Record<string, unknown> = { order_snapshot: structuredClone(fixture), attempts: 0, status: 'pending' };
  const deliveries: Delivery[] = [];
  const requests: { payload: EmailPayload; key: string }[] = [];
  let claims = 0;
  let acceptanceAuditFailures = 0;
  let queueAuditFailures = 0;
  let provider: (payload: EmailPayload) => Promise<Response> = async () => new Response(JSON.stringify({ id: 'provider-message-1' }), { status: 200 });
  const store: NotificationStore = {
    async claim() {
      claims += 1;
      if (queue.status === 'sent' || (queue.status === 'failed' && queue.next_attempt_at === null)) return [];
      queue.attempts = Number(queue.attempts) + 1;
      queue.status = 'sending';
      return [orderId];
    },
    async queue() { return { order_snapshot: structuredClone(queue.order_snapshot), attempts: Number(queue.attempts) }; },
    async deliveries() { return structuredClone(deliveries); },
    async initialize(_id, payloads) {
      for (const payload of payloads) deliveries.push({
        recipient: payload.to[0], email_payload: structuredClone(payload), status: 'pending', attempts: 0,
        provider_message_id: null, first_attempt_at: null,
      });
    },
    async updateDelivery(_id, recipient, values) {
      if (values.status === 'accepted' && acceptanceAuditFailures-- > 0) throw new Error('Synthetic audit failure');
      const delivery = deliveries.find((item) => item.recipient === recipient);
      assert.ok(delivery);
      Object.assign(delivery, values);
    },
    async updateQueue(_id, values) {
      if (values.status === 'sent' && queueAuditFailures-- > 0) throw new Error('Synthetic queue audit failure');
      Object.assign(queue, values);
    },
  };
  const handler = createOrderNotificationHandler({
    env: (name) => env[name], createStore: () => store, now: () => time,
    fetch: async (_url, options) => {
      const payload = JSON.parse(String(options?.body)) as EmailPayload;
      assert.equal(deliveries.find((delivery) => delivery.recipient === payload.to[0])?.status, 'sending');
      assert.ok(deliveries.find((delivery) => delivery.recipient === payload.to[0])?.first_attempt_at);
      requests.push({ payload, key: new Headers(options?.headers).get('Idempotency-Key') ?? '' });
      return provider(payload);
    },
  });
  return {
    env, queue, deliveries, requests, handler,
    run: () => handler(new Request('https://example.test', { method: 'GET', headers: { Authorization: 'Bearer test-cron-secret' } })),
    setProvider: (value: typeof provider) => { provider = value; },
    advance: (milliseconds: number) => { time += milliseconds; },
    failAcceptanceAudit: () => { acceptanceAuditFailures = 1; },
    failQueueAudit: () => { queueAuditFailures = 1; },
    claimCount: () => claims,
  };
}

test('rejects unauthenticated requests and non-cron methods before accessing the queue', async () => {
  const context = setup();
  for (const method of ['POST', 'OPTIONS']) {
    const response = await context.handler(new Request('https://example.test', { method }));
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
  }
  const unauthorizedHeaders: HeadersInit[] = [{}, { Authorization: 'Bearer incorrect' }, { Authorization: 'Bearer test-service-key' }];
  for (const headers of unauthorizedHeaders) {
    const response = await context.handler(new Request('https://example.test', { method: 'GET', headers }));
    assert.equal(response.status, 401);
  }
  assert.equal(context.claimCount(), 0);
  assert.equal(context.requests.length, 0);
});

test('fails closed for missing or invalid email configuration without claiming orders', async () => {
  for (const [name, value] of [['CRON_SECRET', ''], ['AMPM_NOTIFICATION_TO', ''], ['AMPM_NOTIFICATION_TO', 'bad-address'], ['AMPM_NOTIFICATION_TO', 'admin@example.com,'], ['AMPM_NOTIFICATION_FROM', 'bad\r\nBcc:other@example.com'], ['RESEND_API_KEY', '']]) {
    const context = setup();
    context.env[name] = value;
    assert.equal((await context.run()).status, 503);
    assert.equal(context.claimCount(), 0);
  }
});

test('sends all order fields with escaped HTML after durable payload and attempt persistence', async () => {
  const context = setup();
  const response = await context.run();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, claimed: 1, accepted: 1, failed: 0, retry_scheduled: false });
  assert.equal(context.queue.status, 'sent');
  assert.equal(context.deliveries[0].status, 'accepted');
  assert.equal(context.deliveries[0].provider_message_id, 'provider-message-1');
  const { payload, key } = context.requests[0];
  assert.deepEqual(payload.to, ['admin@example.com']);
  assert.ok(key.startsWith(`ampm-order-${orderId}-`));
  assert.equal(key.includes('admin@example.com'), false);
  assert.ok(payload.html.includes('&lt;script&gt;'));
  assert.ok(payload.html.includes('&lt;img'));
  assert.equal(payload.html.includes('<script>'), false);
  for (const content of ['80000000', '7,000 ₮', 'Банкны шилжүүлэг', '47.9,106.9', '#admin', 'төлбөр төлөгдсөнийг батлахгүй']) assert.ok(payload.text.includes(content));
  await context.run();
  assert.equal(context.requests.length, 1);
});

test('provider failure retries only unaccepted recipients with the original payload and key', async () => {
  const context = setup();
  context.env.AMPM_NOTIFICATION_TO = 'admin@example.com,second@example.com';
  context.setProvider(async (payload) => payload.to[0] === 'second@example.com' ? new Response(JSON.stringify({ message: 'Sensitive provider content' }), { status: 429 }) : new Response(JSON.stringify({ id: 'accepted-first' }), { status: 200 }));
  const failed = await context.run();
  assert.equal(failed.status, 502);
  assert.equal(context.queue.status, 'failed');
  assert.ok(context.queue.next_attempt_at);
  assert.equal(context.deliveries[0].status, 'accepted');
  assert.equal(JSON.stringify(context.queue).includes('Sensitive provider content'), false);
  assert.equal(JSON.stringify(context.deliveries).includes('Sensitive provider content'), false);
  const original = structuredClone(context.requests[1]);
  context.env.AMPM_NOTIFICATION_FROM = 'Changed <changed@example.com>';
  context.env.AMPM_NOTIFICATION_TO = 'new-admin@example.com';
  context.queue.order_snapshot = { ...fixture, contact: 'Changed customer', total: 123456 };
  context.setProvider(async () => new Response(JSON.stringify({ id: 'accepted-second' }), { status: 200 }));
  assert.equal((await context.run()).status, 200);
  assert.equal(context.requests.length, 3);
  assert.deepEqual(context.requests[2], original);
  assert.equal(context.queue.status, 'sent');
});

test('provider network errors contain no exception details and retry within the idempotency window', async () => {
  const context = setup();
  context.setProvider(async () => { throw new Error('Customer data and secret should not escape'); });
  const response = await context.run();
  assert.equal(response.status, 502);
  assert.equal(context.deliveries[0].status, 'failed');
  assert.equal(JSON.stringify(context.deliveries).includes('Customer data and secret'), false);
  assert.equal((await response.text()).includes('secret'), false);
  context.setProvider(async () => new Response(JSON.stringify({ id: 'accepted-retry' }), { status: 200 }));
  assert.equal((await context.run()).status, 200);
  assert.deepEqual(context.requests[0], context.requests[1]);
});

test('success without provider message ID requires manual review and never resends', async () => {
  const context = setup();
  context.setProvider(async () => new Response('{}', { status: 200 }));
  assert.equal((await context.run()).status, 502);
  assert.equal(context.deliveries[0].status, 'uncertain');
  assert.equal(context.queue.next_attempt_at, null);
  await context.run();
  assert.equal(context.requests.length, 1);
});

test('failed acceptance audit retries the same request and stops after 23 hours', async () => {
  const context = setup();
  context.failAcceptanceAudit();
  assert.equal((await context.run()).status, 502);
  assert.equal(context.deliveries[0].status, 'sending');
  assert.ok(context.deliveries[0].first_attempt_at);
  context.advance(23 * 60 * 60 * 1000);
  assert.equal((await context.run()).status, 502);
  assert.equal(context.requests.length, 1);
  assert.equal(context.deliveries[0].status, 'uncertain');
  assert.equal(context.queue.next_attempt_at, null);
});

test('failed acceptance audit can safely recover inside 23 hours with identical request', async () => {
  const context = setup();
  context.failAcceptanceAudit();
  await context.run();
  context.advance(5 * 60 * 1000);
  assert.equal((await context.run()).status, 200);
  assert.deepEqual(context.requests[0], context.requests[1]);
});

test('accepted delivery is never resent when only the queue completion audit failed', async () => {
  const context = setup();
  context.failQueueAudit();
  assert.equal((await context.run()).status, 502);
  assert.equal(context.deliveries[0].status, 'accepted');
  context.advance(25 * 60 * 60 * 1000);
  assert.equal((await context.run()).status, 200);
  assert.equal(context.requests.length, 1);
});

test('invalid snapshot stops permanently without a provider request', async () => {
  const context = setup();
  context.queue.order_snapshot = { ...fixture, items: [{ name: 'Invalid', price: -1, qty: 1 }] };
  assert.equal((await context.run()).status, 502);
  assert.equal(context.queue.next_attempt_at, null);
  assert.equal(context.requests.length, 0);
});

test('queue retry budget stops after the twelfth failed claim', async () => {
  const context = setup();
  context.queue.attempts = 11;
  context.setProvider(async () => new Response('{}', { status: 503 }));
  const response = await context.run();
  assert.equal(response.status, 502);
  assert.equal((await response.json()).retry_scheduled, false);
  assert.equal(context.queue.next_attempt_at, null);
});
