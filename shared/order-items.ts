/** Immutable order-line information shared by checkout, fulfilment and email. */
export type OrderItem = {
  name: string
  price: number
  qty: number
  product_id?: string
  color?: string | null
  kind?: 'product' | 'delivery'
}

// Exact catalogue names verified against the live AM/PM catalogue.
// Never infer old orders from a product ID whose name may have since changed.
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
  // Only old snapshots with an explicit colour in their own saved name qualify.
  return catalogColor(item.name) ?? 'Өнгө бүртгэгдээгүй'
}

export function snapshotOrderItems(
  lines: { id: string; name: string; price: number; qty: number }[],
  deliveryFee: number,
): OrderItem[] {
  return [
    ...lines.map((line): OrderItem => ({
      product_id: line.id, name: line.name, color: catalogColor(line.name),
      price: line.price, qty: line.qty, kind: 'product',
    })),
    { name: 'Хүргэлтийн төлбөр', price: deliveryFee, qty: 1, kind: 'delivery' },
  ]
}
