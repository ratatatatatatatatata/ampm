import { createHash, timingSafeEqual } from 'node:crypto';

export function createOrderEmailStatusHandler({ env = (name) => process.env[name], fetchImpl = (...args) => fetch(...args) } = {}) {
  return async function handler(request, response) {
    response.setHeader('Cache-Control', 'no-store');
    if (request.method !== 'GET') {
      response.setHeader('Allow', 'GET');
      return response.status(405).json({ error: 'method_not_allowed' });
    }
    const expected = env('CRON_SECRET');
    const presented = request.headers.authorization;
    const digest = (value) => createHash('sha256').update(value).digest();
    if (!expected || typeof presented !== 'string' ||
        !timingSafeEqual(digest(`Bearer ${expected}`), digest(presented))) {
      return response.status(401).json({ error: 'unauthorized' });
    }
    const apiKey = env('RESEND_API_KEY');
    const domainId = env('AMPM_RESEND_DOMAIN_ID');
    if (!apiKey || !domainId || !/^[a-f0-9-]{36}$/i.test(domainId)) {
      return response.status(503).json({ error: 'email_provider_not_configured' });
    }
    try {
      const result = await fetchImpl(`https://api.resend.com/domains/${domainId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(8000),
      });
      const data = await result.json();
      if (!result.ok) return response.status(502).json({ error: 'domain_lookup_failed', provider_status: result.status });
      if (data.name !== 'ampm.mn' || !Array.isArray(data.records)) {
        return response.status(502).json({ error: 'unexpected_domain_response' });
      }
      return response.status(200).json({
        name: data.name,
        status: data.status,
        enabled: env('AMPM_EMAIL_ENABLED') === 'true',
        records: data.records.map(({ record, name, type, value, priority, ttl, status }) =>
          ({ record, name, type, value, priority, ttl, status })),
      });
    } catch {
      return response.status(502).json({ error: 'domain_lookup_failed' });
    }
  };
}

export default createOrderEmailStatusHandler();
