import assert from 'node:assert/strict';
import test from 'node:test';
import { createOrderEmailStatusHandler } from '../api/order-email-status.js';

async function invoke({ auth = 'Bearer test-cron', method = 'GET', fetchImpl } = {}) {
  const values = { CRON_SECRET: 'test-cron', RESEND_API_KEY: 'provider-test', AMPM_RESEND_DOMAIN_ID: '00000000-0000-4000-8000-000000000001' };
  const handler = createOrderEmailStatusHandler({ env: (key) => values[key], fetchImpl });
  const response = {
    code: 200, body: null, headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
  };
  await handler({ method, headers: { authorization: auth } }, response);
  return response;
}

test('domain diagnostics require authorization and perform no anonymous lookup', async () => {
  const response = await invoke({ auth: '', fetchImpl: () => assert.fail('must not fetch') });
  assert.equal(response.code, 401);
});
test('domain diagnostics return only AMPM public DNS metadata', async () => {
  const response = await invoke({ fetchImpl: async (url, init) => {
    assert.equal(url, 'https://api.resend.com/domains/00000000-0000-4000-8000-000000000001');
    assert.equal(init.headers.Authorization, 'Bearer provider-test');
    return Response.json({ name: 'ampm.mn', status: 'not_started', private_data: 'not returned', records: [
      { name: 'resend._domainkey', type: 'TXT', value: 'public-test-key', status: 'not_started', secret: 'not returned' },
    ] });
  } });
  assert.equal(response.code, 200);
  assert.equal(response.body.enabled, false);
  assert.equal(JSON.stringify(response.body).includes('not returned'), false);
});
test('an unrelated domain cannot be returned', async () => {
  const response = await invoke({ fetchImpl: async () => Response.json({ name: 'other.example', records: [] }) });
  assert.equal(response.code, 502);
});
test('provider key restriction is reported without provider payload', async () => {
  const response = await invoke({ fetchImpl: async () => Response.json({ sensitive_detail: 'hidden' }, { status: 403 }) });
  assert.deepEqual(response.body, { error: 'domain_lookup_failed', provider_status: 403 });
});
