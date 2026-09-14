import { createOrderNotificationHandler } from '../server/order-notifications.ts';
import { createNotificationStore } from '../server/order-notification-store.ts';

export function createProcessOrderNotificationsHandler({
  env = (name) => process.env[name],
  fetchImpl = (input, init) => globalThis.fetch(input, init),
  createStore = (url, key) => createNotificationStore(url, key, fetchImpl),
} = {}) {
  const worker = createOrderNotificationHandler({
    env: (name) => {
      // This legacy variable is read only by the server; never add it to client imports.
      if (name === 'SUPABASE_SERVICE_ROLE_KEY') return env('VITE_SUPABASE_service_role');
      if (name === 'SUPABASE_URL') return env('VITE_SUPABASE_URL');
      return env(name);
    },
    createStore, fetch: fetchImpl,
  });
  return async function handler(request, response) {
    response.setHeader('Cache-Control', 'no-store');
    if (request.method !== 'GET') {
      response.setHeader('Allow', 'GET');
      return response.status(405).json({ ok: false, error: 'method_not_allowed' });
    }
    try {
      const authorization = request.headers.authorization;
      const result = await worker(new Request('https://ampm.mn/api/process-order-notifications', {
        method: 'GET',
        headers: typeof authorization === 'string' ? { Authorization: authorization } : {},
      }));
      return response.status(result.status).json(await result.json());
    } catch {
      return response.status(500).json({ ok: false, error: 'notification_worker_failed' });
    }
  };
}

export default createProcessOrderNotificationsHandler();
