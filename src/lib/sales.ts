export type SalesReport = {
  order_count: number
  order_total: number
  paid_count: number
  paid_total: number
  pending_count: number
  pending_total: number
  delivered_count: number
  product_units: number
  products: { name: string; units: number; amount: number }[]
}

export function mongoliaDate(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ulaanbaatar', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now)
}

export function salesDateRange(days: number, now = new Date()) {
  const to = mongoliaDate(now)
  const first = new Date(`${to}T00:00:00Z`)
  first.setUTCDate(first.getUTCDate() - days + 1)
  return { from: first.toISOString().slice(0, 10), to }
}
