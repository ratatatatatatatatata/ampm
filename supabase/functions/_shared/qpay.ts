export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
export function json(status: number, data: unknown) {
  return new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
}
export const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
let cached: { token: string; expires: number } | undefined
let authenticating: Promise<string> | undefined
export async function qpay(path: string, body?: unknown): Promise<any> {
  async function token() {
    if (cached && cached.expires > Date.now()) return cached.token
    if (authenticating) return authenticating
    authenticating = (async () => {
      const username = Deno.env.get('QPAY_USERNAME')
      const password = Deno.env.get('QPAY_PASSWORD')
      if (!username || !password) throw new Error('qpay_not_configured')
      const response = await fetch('https://merchant.qpay.mn/v2/auth/token', {
        method: 'POST', headers: { Authorization: 'Basic ' + btoa(`${username}:${password}`) },
        signal: AbortSignal.timeout(15000),
      })
      if (!response.ok) throw new Error('qpay_auth_failed')
      const data = await response.json()
      if (typeof data.access_token !== 'string') throw new Error('qpay_auth_failed')
      // QPay returns an epoch expiry. Default conservatively when omitted.
      const expires = Number(data.expires_in)
      cached = { token: data.access_token, expires: expires > 1e9 ? expires * 1000 - 60000 : Date.now() + 60000 }
      return cached.token
    })()
    try { return await authenticating } finally { authenticating = undefined }
  }
  const response = await fetch(`https://merchant.qpay.mn/v2/${path}`, {
    method: 'POST', headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
  })
  if (!response.ok) { if (response.status === 401) cached = undefined; throw new Error(`qpay_http_${response.status}`) }
  return response.json()
}
