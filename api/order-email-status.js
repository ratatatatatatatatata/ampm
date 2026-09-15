import { createHash, timingSafeEqual } from 'node:crypto';

const domainName = 'ampm.mn';
const domainIdPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const isTargetDomain = (name) => typeof name === 'string' && name.toLowerCase() === domainName;

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
    if (!apiKey) {
      return response.status(503).json({ error: 'email_provider_not_configured' });
    }
    try {
      const options = {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(8000),
      };
      const matches = [];
      const cursors = new Set();
      let cursor;
      let complete = false;
      for (let page = 0; page < 20; page += 1) {
        const url = new URL('https://api.resend.com/domains');
        url.searchParams.set('limit', '100');
        if (cursor) url.searchParams.set('after', cursor);
        const result = await fetchImpl(url.href, options);
        if (!result.ok) return response.status(502).json({ error: 'domain_lookup_failed', provider_status: result.status });
        const data = await result.json();
        if (!Array.isArray(data?.data) || typeof data.has_more !== 'boolean') {
          return response.status(502).json({ error: 'unexpected_domain_response' });
        }
        for (const domain of data.data) {
          if (!isTargetDomain(domain?.name)) continue;
          if (typeof domain.id !== 'string' || !domainIdPattern.test(domain.id)) {
            return response.status(502).json({ error: 'unexpected_domain_response' });
          }
          matches.push(domain.id);
        }
        if (matches.length > 1) return response.status(409).json({ error: 'ampm_domain_ambiguous' });
        if (!data.has_more) { complete = true; break; }
        cursor = data.data.at(-1)?.id;
        if (typeof cursor !== 'string' || !domainIdPattern.test(cursor) || cursors.has(cursor)) {
          return response.status(502).json({ error: 'domain_lookup_incomplete' });
        }
        cursors.add(cursor);
      }
      if (!complete) return response.status(502).json({ error: 'domain_lookup_incomplete' });
      if (matches.length === 0) return response.status(404).json({ error: 'ampm_domain_not_found' });
      const domainId = matches[0];
      const result = await fetchImpl(`https://api.resend.com/domains/${domainId}`, options);
      if (!result.ok) return response.status(502).json({ error: 'domain_lookup_failed', provider_status: result.status });
      const data = await result.json();
      if (!isTargetDomain(data?.name) || data.id !== domainId || typeof data.status !== 'string' ||
          !Array.isArray(data.records) || data.records.some((item) => !item || typeof item !== 'object' ||
            ['record', 'name', 'type', 'value', 'status'].some((field) => item[field] !== undefined && typeof item[field] !== 'string') ||
            ['priority', 'ttl'].some((field) => item[field] !== undefined && item[field] !== null &&
              typeof item[field] !== 'string' && typeof item[field] !== 'number'))) {
        return response.status(502).json({ error: 'unexpected_domain_response' });
      }
      return response.status(200).json({
        domain_id: domainId,
        name: domainName,
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
