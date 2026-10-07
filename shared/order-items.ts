/** Immutable order-line information shared by checkout, fulfilment and email. */
export type OrderItem = {
  name: string
  price: number
  qty: number
  product_id?: string
  color?: string | null
  color_code?: 'silver' | 'rose_gold'
  kind?: 'product' | 'delivery'
}

// The two colour variants verified in the live AM/PM catalogue on 2026-10-07.
// IDs, unlike editable display names, identify the selected variant.
export const AMPM_VARIANTS = [
  { productId: '75680028-c0e1-4876-ad88-0b81948da106', code: 'silver', label: 'Мөнгөлөг' },
  { productId: '74cca1c1-1d6c-4452-ac84-e3ede6c66e05', code: 'rose_gold', label: 'Ягаан алт' },
] as const

export function productColor(productId: string): string | null {
  return AMPM_VARIANTS.find(variant => variant.productId === productId)?.label ?? null
}

// Legacy snapshots can still contain an explicit colour in their saved name.
export function catalogColor(name: string): string | null {
  switch (name.trim().toLowerCase()) {
    case 'am/pm silver': return 'Мөнгөлөг'
    case 'am/pm rose gold': return 'Ягаан алт'
    default: return null
  }
}

export function isDeliveryItem(item: OrderItem): boolean {
  return item.kind === 'delivery' || (!item.kind && item.name === 'Хүргэлтийн төлбөр')
}

export function orderItemColor(item: OrderItem): string {
  if (isDeliveryItem(item)) return '—'
  if (typeof item.color === 'string' && item.color.trim()) return item.color.trim()
  const savedCode = AMPM_VARIANTS.find(variant => variant.code === item.color_code)
  return savedCode?.label ?? productColor(item.product_id ?? '') ?? catalogColor(item.name) ?? 'Өнгийг захиалагчаас лавлана'
}

export function snapshotOrderItems(
  lines: { id: string; name: string; price: number; qty: number }[],
  deliveryFee: number,
): OrderItem[] {
  if (!lines.length) throw new Error('Захиалах сойзны өнгө, тоог сонгоно уу.')
  const items = lines.map((line): OrderItem => {
    const variant = AMPM_VARIANTS.find(variant => variant.productId === line.id)
    if (!variant) throw new Error('Сойзны өнгийг таних боломжгүй байна. Хуудсаа шинэчлээд мөнгөлөг эсвэл ягаан алт өнгөө дахин сонгоно уу.')
    if (!Number.isSafeInteger(line.qty) || line.qty < 1 || line.qty > 1000) {
      throw new Error('Сойзны тоог 1–1000 хүртэл бүхэл тоогоор оруулна уу.')
    }
    return {
      product_id: line.id, name: line.name, color: variant.label, color_code: variant.code,
      price: line.price, qty: line.qty, kind: 'product',
    }
  })
  return [
    ...items,
    { name: 'Хүргэлтийн төлбөр', price: deliveryFee, qty: 1, kind: 'delivery' },
  ]
}
