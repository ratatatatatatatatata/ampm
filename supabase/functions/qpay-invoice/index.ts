// QPay нэхэмжлэх үүсгэх Edge Function
//
// Идэвхжүүлэх алхмууд:
// 1. qpay.mn дээр мерчант гэрээ байгуулж username/password/invoice_code авна
// 2. Supabase Dashboard → Edge Functions → Secrets дээр дараах 3 утгыг нэмнэ:
//      QPAY_USERNAME, QPAY_PASSWORD, QPAY_INVOICE_CODE
// 3. Терминалд: supabase functions deploy qpay-invoice --project-ref gdhitwhgblpkhcvcetfi
//
// Амжилттай хариу: { qr_image, qr_text, urls: [{name, description, logo, link}] }
// urls дотор Монголын банк бүрийн аппын deeplink ирдэг — дарахад тухайн
// банкны апп нээгдэж, төлбөр автоматаар бөглөгдсөн байдаг.

const QPAY_BASE = 'https://merchant.qpay.mn/v2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const username = Deno.env.get('QPAY_USERNAME')
    const password = Deno.env.get('QPAY_PASSWORD')
    const invoiceCode = Deno.env.get('QPAY_INVOICE_CODE')
    if (!username || !password || !invoiceCode) {
      return new Response(JSON.stringify({ error: 'QPay тохиргоо хийгдээгүй байна' }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { amount, orderId, description } = await req.json()
    if (!amount || amount <= 0) {
      return new Response(JSON.stringify({ error: 'Дүн буруу байна' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 1. Auth token авах
    const authRes = await fetch(`${QPAY_BASE}/auth/token`, {
      method: 'POST',
      headers: { Authorization: 'Basic ' + btoa(`${username}:${password}`) },
    })
    if (!authRes.ok) throw new Error('QPay auth амжилтгүй')
    const { access_token } = await authRes.json()

    // 2. Нэхэмжлэх үүсгэх
    const invRes = await fetch(`${QPAY_BASE}/invoice`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        invoice_code: invoiceCode,
        sender_invoice_no: String(orderId ?? Date.now()),
        invoice_receiver_code: 'terminal',
        invoice_description: description ?? 'AM/PM захиалга',
        amount,
        callback_url: `https://ampm.mn/?payment=${orderId ?? ''}`,
      }),
    })
    if (!invRes.ok) throw new Error('QPay нэхэмжлэх үүсгэж чадсангүй')
    const inv = await invRes.json()

    return new Response(
      JSON.stringify({ qr_image: inv.qr_image, qr_text: inv.qr_text, urls: inv.urls ?? [] }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
