import { createClient } from 'npm:@supabase/supabase-js@2.110.8'
import { json, qpay, uuid } from '../_shared/qpay.ts'
import { verifiedPayment } from '../_shared/verified-payment.ts'

Deno.serve(async (req) => {
  if (req.method !== 'GET' && req.method !== 'POST') return json(405, { error: 'method_not_allowed' })
  try {
    const url = new URL(req.url)
    const orderId = url.searchParams.get('orderId')
    const token = url.searchParams.get('token')
    if (!uuid.test(orderId ?? '') || !uuid.test(token ?? '')) return json(401, { error: 'unauthorized' })
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    // This per-invoice callback capability is never returned to the browser.
    const { data: invoice, error } = await db.from('ampm_qpay_invoices')
      .select('invoice_id,expected_amount,paid_at,state').eq('order_id', orderId).eq('callback_token', token).maybeSingle()
    if (error) throw new Error('database_failed')
    if (!invoice) return json(401, { error: 'unauthorized' })
    if (invoice.paid_at) return json(200, { ok: true })
    if (invoice.state !== 'ready' || !invoice.invoice_id) return json(503, { error: 'invoice_not_ready' })
    // Ignore callback claims: confirm against the merchant API for OUR stored invoice.
    const result = await qpay('payment/check', {
      object_type: 'INVOICE', object_id: invoice.invoice_id,
      offset: { page_number: 1, page_limit: 100 },
    })
    const payment = verifiedPayment(result, invoice.expected_amount)
    if (!payment) return json(409, { error: 'payment_not_fully_confirmed' })
    const { error: confirmError } = await db.rpc('ampm_confirm_qpay_payment', {
      p_order_id: orderId, p_invoice_id: invoice.invoice_id, p_amount: payment.amount, p_payment_ids: payment.ids,
    })
    if (confirmError) throw new Error('confirmation_failed')
    return json(200, { ok: true })
  } catch {
    return json(503, { error: 'payment_verification_failed' })
  }
})
