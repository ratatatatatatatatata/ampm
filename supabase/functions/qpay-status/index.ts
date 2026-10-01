import { createClient } from 'npm:@supabase/supabase-js@2.110.8'
import { cors, json, uuid } from '../_shared/qpay.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' })
  try {
    const { orderId, checkoutToken } = await req.json()
    if (!uuid.test(orderId ?? '') || !uuid.test(checkoutToken ?? '')) return json(400, { error: 'invalid_order' })
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data, error } = await db.from('orders').select('payment_status,paid_at')
      .eq('id', orderId).eq('checkout_token', checkoutToken).maybeSingle()
    if (error) throw new Error('database_failed')
    if (!data) return json(404, { error: 'order_not_found' })
    // Reads our database only; no QPay polling, no client-driven confirmation.
    return json(200, { paid: data.payment_status === 'paid', paid_at: data.paid_at })
  } catch { return json(503, { error: 'status_unavailable' }) }
})
