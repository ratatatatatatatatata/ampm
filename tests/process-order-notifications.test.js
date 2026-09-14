import assert from 'node:assert/strict';
import test from 'node:test';
import { createProcessOrderNotificationsHandler } from '../api/process-order-notifications.js';
import { createNotificationStore } from '../server/order-notification-store.ts';

function setup(overrides = {}) {
  const env = {
    CRON_SECRET: 'cron-test', RESEND_API_KEY: 'provider-test', AMPM_EMAIL_ENABLED: 'true',
    AMPM_NOTIFICATION_FROM: 'AM/PM <orders@example.com>', AMPM_NOTIFICATION_TO: 'admin@example.com',
    VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_service_role: 'server-role-test',
    ...overrides,
  };
  let accessed = false;
  let claim = async () => [];
  const handler = createProcessOrderNotificationsHandler({
    env: (name) => env[name],
    createStore(url, key) {
      accessed = true;
      assert.equal(url, env.VITE_SUPABASE_URL);
      assert.equal(key, env.VITE_SUPABASE_service_role);
      return { claim: () => claim() };
    },
    fetchImpl: async () => { throw new Error('Unexpected provider call'); },
  });
  return {
    accessed: () => accessed,
    setClaim: (value) => { claim = value; },
    async run({ method = 'GET', auth = 'Bearer cron-test' } = {}) {
      const response = {
        code: 200, headers: {}, body: null,
        setHeader(name, value) { this.headers[name] = value; },
        status(code) { this.code = code; return this; },
        json(body) { this.body = body; return this; },
      };
      await handler({ method, headers: { authorization: auth } }, response);
      return response;
    },
  };
}

test('unauthorized requests cannot access the database or email provider', async () => {
  const context = setup();
  for (const auth of ['', 'Bearer incorrect', ['Bearer cron-test']]) {
    const response = await context.run({ auth });
    assert.equal(response.code, 401);
    assert.equal(response.headers['Cache-Control'], 'no-store');
  }
  assert.equal(context.accessed(), false);
});

test('POST is not accepted by the scheduled endpoint', async () => {
  const context = setup();
  const response = await context.run({ method: 'POST' });
  assert.equal(response.code, 405);
  assert.equal(response.headers.Allow, 'GET');
  assert.equal(context.accessed(), false);
});

test('paused delivery requires cron authentication but no provider configuration or database calls', async () => {
  for (const enabled of ['', 'false', 'TRUE', undefined]) {
    const context = setup({ AMPM_EMAIL_ENABLED: enabled, RESEND_API_KEY: '', VITE_SUPABASE_service_role: '' });
    const response = await context.run();
    assert.equal(response.code, 200);
    assert.deepEqual(response.body, { ok: true, paused: true, claimed: 0, accepted: 0, failed: 0 });
    assert.equal(context.accessed(), false);
    assert.equal((await context.run({ auth: 'Bearer incorrect' })).code, 401);
  }
});

test('missing runtime secrets fail before accessing the database', async () => {
  for (const key of ['CRON_SECRET', 'RESEND_API_KEY', 'AMPM_NOTIFICATION_TO', 'AMPM_NOTIFICATION_FROM', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_service_role']) {
    const context = setup({ [key]: '' });
    assert.equal((await context.run()).code, 503);
    assert.equal(context.accessed(), false);
  }
});

test('authorized cron maps existing server variables and returns aggregate counts', async () => {
  const context = setup();
  const response = await context.run();
  assert.equal(response.code, 200);
  assert.equal(context.accessed(), true);
  assert.deepEqual(response.body, { ok: true, claimed: 0, accepted: 0, failed: 0, retry_scheduled: false });
});

test('database errors do not expose secret or customer details', async () => {
  const context = setup();
  context.setClaim(async () => { throw new Error('secret and customer data'); });
  const response = await context.run();
  assert.equal(response.code, 500);
  assert.deepEqual(response.body, { error: 'queue_claim_failed' });
});

test('Supabase adapter claims one row with the server credential and persists immutable payloads', async () => {
  const calls = [];
  const orderId = '11111111-1111-4111-8111-111111111111';
  const payload = { from: 'orders@example.com', to: ['admin@example.com'], subject: 'Test', html: '<p>Test</p>', text: 'Test' };
  const store = createNotificationStore('https://example.supabase.co', 'server-role-test', async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const body = request.method === 'GET' ? null : await request.json();
    assert.equal(request.headers.get('apikey'), 'server-role-test');
    assert.equal(request.headers.get('Authorization'), 'Bearer server-role-test');
    calls.push({ url, body, headers: request.headers });
    if (url.pathname.endsWith('/rpc/ampm_claim_order_notifications')) return Response.json([{ claimed_order_id: orderId }]);
    if (url.pathname.endsWith('/ampm_order_notifications')) return Response.json({ order_snapshot: {}, attempts: 1 });
    if (request.method === 'POST') return new Response(null, { status: 201 });
    if (request.method === 'PATCH') return Response.json({ recipient: 'admin@example.com' });
    return Response.json([{ recipient: 'admin@example.com', email_payload: payload }]);
  });
  assert.deepEqual(await store.claim(), [orderId]);
  assert.deepEqual(calls[0].body, { p_limit: 1 });
  await store.queue(orderId);
  await store.initialize(orderId, [payload]);
  assert.deepEqual(calls[2].body, [{ order_id: orderId, recipient: 'admin@example.com', email_payload: payload }]);
  assert.ok(calls[2].headers.get('Prefer').includes('resolution=ignore-duplicates'));
  assert.equal(calls[2].url.searchParams.get('on_conflict'), 'order_id,recipient');
  assert.equal((await store.deliveries(orderId))[0].email_payload.text, 'Test');
  await store.updateDelivery(orderId, 'admin@example.com', { status: 'sending', first_attempt_at: '2026-09-14T00:00:00Z' });
  assert.equal(calls[4].url.searchParams.get('order_id'), `eq.${orderId}`);
  assert.equal(calls[4].url.searchParams.get('recipient'), 'eq.admin@example.com');
  await store.updateQueue(orderId, { status: 'sent' });
});

test('Supabase adapter throws a fixed error when persistence fails', async () => {
  const store = createNotificationStore('https://example.supabase.co', 'server-role-test', async () => Response.json({ message: 'private database detail' }, { status: 400 }));
  await assert.rejects(store.claim(), { message: 'queue_claim_failed' });
  await assert.rejects(store.updateDelivery('test', 'admin@example.com', { status: 'accepted' }), { message: 'delivery_update_failed' });
});
