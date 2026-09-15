import assert from 'node:assert/strict';
import test from 'node:test';
import { createOrderEmailStatusHandler } from '../api/order-email-status.js';

const domainId = '00000000-0000-4000-8000-000000000001';
const otherId = '00000000-0000-4000-8000-000000000002';
const list = (data, has_more = false) => Response.json({ object: 'list', has_more, data });
const detail = (overrides = {}) => Response.json({
  id: domainId, name: 'ampm.mn', status: 'not_started', private_data: 'not returned',
  records: [{ name: 'resend._domainkey', type: 'TXT', value: 'public-test-key', status: 'not_started', secret: 'not returned' }],
  ...overrides,
});

async function invoke({ auth = 'Bearer test-cron', method = 'GET', fetchImpl, env = {} } = {}) {
  const values = { CRON_SECRET: 'test-cron', RESEND_API_KEY: 'provider-test', ...env };
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
test('unsupported methods and missing provider configuration do not contact Resend', async () => {
  const fetchImpl = () => assert.fail('must not fetch');
  assert.equal((await invoke({ method: 'POST', fetchImpl })).code, 405);
  assert.equal((await invoke({ env: { RESEND_API_KEY: '' }, fetchImpl })).code, 503);
});
test('domain diagnostics return only AMPM public DNS metadata', async () => {
  const calls = [];
  const response = await invoke({ env: { AMPM_RESEND_DOMAIN_ID: otherId }, fetchImpl: async (url, init) => {
    calls.push(url);
    assert.equal(init.headers.Authorization, 'Bearer provider-test');
    assert.equal(init.method, 'GET');
    assert.ok(init.signal instanceof AbortSignal);
    if (url === 'https://api.resend.com/domains?limit=100') return list([
      { id: otherId, name: 'private-other.example', private_data: 'not returned' },
      { id: domainId, name: 'AMPM.MN' },
    ]);
    assert.equal(url, `https://api.resend.com/domains/${domainId}`);
    return detail({ name: 'AMPM.MN' });
  } });
  assert.equal(response.code, 200);
  assert.equal(calls.length, 2);
  assert.deepEqual(response.body, {
    domain_id: domainId, name: 'ampm.mn', status: 'not_started', enabled: false,
    records: [{ record: undefined, name: 'resend._domainkey', type: 'TXT', value: 'public-test-key', priority: undefined, ttl: undefined, status: 'not_started' }],
  });
  assert.equal(JSON.stringify(response.body).includes('not returned'), false);
  assert.equal(JSON.stringify(response.body).includes('private-other.example'), false);
});
test('domain detail must match both the discovered ID and exact normalized name', async () => {
  for (const overrides of [{ name: 'other.example' }, { name: 'sub.ampm.mn' }, { id: otherId }]) {
    const response = await invoke({ fetchImpl: async (url) => url.includes('?') ? list([{ id: domainId, name: 'ampm.mn' }]) : detail(overrides) });
    assert.equal(response.code, 502);
    assert.deepEqual(response.body, { error: 'unexpected_domain_response' });
  }
});
test('provider restrictions in list or detail are reported without the provider payload', async () => {
  for (const failList of [true, false]) {
    const response = await invoke({ fetchImpl: async (url) => !failList && url.includes('?') ? list([{ id: domainId, name: 'ampm.mn' }]) : Response.json({ sensitive_detail: 'hidden' }, { status: 403 }) });
    assert.equal(response.code, 502);
    assert.deepEqual(response.body, { error: 'domain_lookup_failed', provider_status: 403 });
  }
});
test('pagination uses the full page final ID and finishes the search before domain retrieval', async () => {
  const urls = [];
  const response = await invoke({ fetchImpl: async (url) => {
    urls.push(url);
    if (urls.length === 1) return list([{ id: domainId, name: 'ampm.mn' }, { id: otherId, name: 'private.example' }], true);
    if (urls.length === 2) {
      assert.equal(url, `https://api.resend.com/domains?limit=100&after=${otherId}`);
      return list([]);
    }
    assert.equal(url, `https://api.resend.com/domains/${domainId}`);
    return detail();
  } });
  assert.equal(response.code, 200);
  assert.equal(urls.length, 3);
});
test('duplicate exact domains across pages fail closed without reading any domain details', async () => {
  let calls = 0;
  const response = await invoke({ fetchImpl: async (url) => {
    calls += 1;
    assert.ok(url.includes('?limit=100'));
    return calls === 1 ? list([{ id: domainId, name: 'ampm.mn' }], true) : list([{ id: otherId, name: 'AMPM.MN' }]);
  } });
  assert.equal(calls, 2);
  assert.equal(response.code, 409);
  assert.deepEqual(response.body, { error: 'ampm_domain_ambiguous' });
});
test('no exact matching domain returns not-found without exposing similar domain names', async () => {
  const response = await invoke({ fetchImpl: async () => list([
    { id: domainId, name: 'sub.ampm.mn' }, { id: otherId, name: 'ampm.mn.other.example' },
  ]) });
  assert.equal(response.code, 404);
  assert.deepEqual(response.body, { error: 'ampm_domain_not_found' });
});
test('malformed or cyclic pagination is incomplete rather than a false not-found result', async () => {
  for (const data of [[], [{ id: otherId, name: 'private.example' }]]) {
    let calls = 0;
    const response = await invoke({ fetchImpl: async () => { calls += 1; return list(data, true); } });
    assert.equal(response.code, 502);
    assert.deepEqual(response.body, { error: 'domain_lookup_incomplete' });
    assert.ok(calls <= 2);
  }
});
test('the page limit stops unbounded scans without claiming no domain exists', async () => {
  let calls = 0;
  const response = await invoke({ fetchImpl: async () => {
    calls += 1;
    const id = `00000000-0000-4000-8000-${String(calls).padStart(12, '0')}`;
    return list([{ id, name: 'private.example' }], true);
  } });
  assert.equal(calls, 20);
  assert.equal(response.code, 502);
  assert.deepEqual(response.body, { error: 'domain_lookup_incomplete' });
});
test('network errors and malformed responses expose no private details', async () => {
  for (const fetchImpl of [async () => { throw new Error('private detail'); }, async () => new Response('private detail')]) {
    const response = await invoke({ fetchImpl });
    assert.equal(response.code, 502);
    assert.deepEqual(response.body, { error: 'domain_lookup_failed' });
  }
  const malformed = await invoke({ fetchImpl: async () => Response.json({ data: [], private_data: 'private detail' }) });
  assert.equal(malformed.code, 502);
  assert.deepEqual(malformed.body, { error: 'unexpected_domain_response' });
});
test('nested non-DNS values cannot escape through allowed DNS field names', async () => {
  const response = await invoke({ fetchImpl: async (url) => url.includes('?') ? list([{ id: domainId, name: 'ampm.mn' }]) : detail({ records: [{ name: 'resend._domainkey', type: 'TXT', value: { secret: 'private detail' } }] }) });
  assert.equal(response.code, 502);
  assert.deepEqual(response.body, { error: 'unexpected_domain_response' });
});
