import { createClient } from 'npm:@supabase/supabase-js@2.110.8'
import { cors, json, qpay, uuid } from '../_shared/qpay.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' })
  try {
    const { orderId, checkoutToken } = await req.json()
    if (!uuid.test(orderId ?? '') || !uuid.test(checkoutToken ?? '')) return json(400, { error: 'invalid_order' })
    const url = Deno.env.get('SUPABASE_URL')!
    const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    // Guest checkout is authorized by an unguessable capability created with the order.
    const { data: order, error } = await db.from('orders').select('id,total,items,payment_method,payment_status')
      .eq('id', orderId).eq('checkout_token', checkoutToken).maybeSingle()
    if (error) throw new Error('database_failed')
    if (!order || order.payment_method !== 'qpay') return json(404, { error: 'order_not_found' })
    if (order.payment_status === 'paid') return json(409, { error: 'already_paid' })
    const invoiceCode = Deno.env.get('QPAY_INVOICE_CODE')
    if (!invoiceCode || !Deno.env.get('QPAY_USERNAME') || !Deno.env.get('QPAY_PASSWORD')) return json(503, { error: 'QPay тохиргоо хийгдээгүй байна' })
    // Derive the invoice amount from catalog prices, never from the request body.
    const { data: products, error: productsError } = await db.from('products').select('name,price')
    if (productsError) throw new Error('database_failed')
    let total = 0
    let delivery = 0
    if (!Array.isArray(order.items) || order.items.length < 2 || order.items.length > 200) return json(400, { error: 'invalid_items' })
    for (const item of order.items) {
      if (!Number.isSafeInteger(item.qty) || item.qty < 1 || item.qty > 1000) return json(400, { error: 'invalid_items' })
      if (item.name === 'Хүргэлтийн төлбөр') {
        if (item.price !== 6000 || item.qty !== 1 || delivery++) return json(400, { error: 'invalid_delivery' })
      } else if (!products?.some(p => p.name === item.name && p.price === item.price)) return json(400, { error: 'catalog_price_changed' })
      total += item.price * item.qty
    }
    if (delivery !== 1 || total !== order.total || !Number.isSafeInteger(total)) return json(400, { error: 'invalid_total' })
    const { data: existing, error: existingError } = await db.from('ampm_qpay_invoices').select('state,invoice_data').eq('order_id', orderId).maybeSingle()
    if (existingError) throw new Error('database_failed')
    if (existing) return existing.state === 'ready' ? json(200, existing.invoice_data) : json(409, { error: 'invoice_creation_requires_review' })
    const callbackToken = crypto.randomUUID()
    const { error: claimError } = await db.from('ampm_qpay_invoices').insert({ order_id: orderId, expected_amount: total, callback_token: callbackToken })
    if (claimError) return json(409, { error: 'invoice_creation_in_progress' })
    const invoice = await qpay('invoice', {
      invoice_code: invoiceCode, sender_invoice_no: orderId, invoice_receiver_code: 'terminal',
      invoice_description: `AM/PM захиалга #${orderId.slice(0, 8)}`, amount: total,
      callback_url: `${url}/functions/v1/qpay-callback?orderId=${orderId}&token=${callbackToken}`,
    })
    if (typeof invoice.invoice_id !== 'string' || !invoice.invoice_id) throw new Error('invalid_invoice_response')
    const data = { invoice_id: invoice.invoice_id, qr_image: invoice.qr_image, qr_text: invoice.qr_text, urls: invoice.urls ?? [] }
    const { error: saveError } = await db.from('ampm_qpay_invoices').update({ invoice_id: invoice.invoice_id, invoice_data: data, state: 'ready' }).eq('order_id', orderId)
    if (saveError) throw new Error('database_failed')
    return json(200, data)
  } catch {
    return json(502, { error: 'QPay нэхэмжлэх үүсгэхэд алдаа гарлаа. Дахин захиалга үүсгэхээс өмнө бидэнтэй холбогдоно уу.' })
  }
})
