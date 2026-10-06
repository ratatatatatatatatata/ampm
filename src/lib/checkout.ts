export const PENDING_QPAY_KEY = 'ampm-pending-qpay'
export type CheckoutStep = 'cart' | 'checkout' | 'done' | 'qpay' | 'paid'
export type PendingQpay = {
  orderId: string
  checkoutToken: string
  total: number
  data: { qr_image?: string; qr_text?: string; urls?: { name: string; description?: string; logo?: string; link: string }[] }
}

export function parsePendingQpay(value: unknown): PendingQpay | null {
  if (!value || typeof value !== 'object') return null
  const p = value as Partial<PendingQpay>
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuid.test(p.orderId ?? '') || !uuid.test(p.checkoutToken ?? '') ||
    typeof p.total !== 'number' || !Number.isFinite(p.total) || p.total <= 0 ||
    !p.data || typeof p.data !== 'object' || Array.isArray(p.data)) return null
  if (p.data.urls !== undefined && (!Array.isArray(p.data.urls) ||
    p.data.urls.some(u => !u || typeof u.name !== 'string' || typeof u.link !== 'string'))) return null
  return p as PendingQpay
}

export function checkoutStepForOpen(hasCartItems: boolean, pending: PendingQpay | null): CheckoutStep {
  return !hasCartItems && pending ? 'qpay' : 'cart'
}

export function viewAfterPayment(step: CheckoutStep, responseOrderId: string, activeOrderId?: string): CheckoutStep {
  return step === 'qpay' && responseOrderId === activeOrderId ? 'paid' : step
}
