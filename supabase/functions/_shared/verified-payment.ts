// Never trust callback contents or paid_amount without the actual paid rows.
export function verifiedPayment(result: unknown, expected: number): { amount: number; ids: string[] } | null {
  if (!result || typeof result !== 'object' || !Number.isSafeInteger(expected) || expected <= 0) return null
  const rows = (result as { rows?: unknown }).rows
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > 100) return null
  const seen = new Set<string>()
  let amount = 0
  for (const row of rows) {
    if (!row || typeof row !== 'object') return null
    if (row.payment_status !== 'PAID') continue
    const value = Number(row.payment_amount)
    if (row.payment_currency !== 'MNT' || !Number.isFinite(value) || value <= 0 ||
        typeof row.payment_id !== 'string' || !row.payment_id || seen.has(row.payment_id)) return null
    seen.add(row.payment_id)
    amount += value
  }
  return amount === expected && seen.size > 0 ? { amount, ids: [...seen] } : null
}
