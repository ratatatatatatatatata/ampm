import { isDeliveryItem, orderItemColor, type OrderItem } from '../../shared/order-items'

/** One readable row per saved product/colour, including on narrow staff screens. */
export function OrderItems({ items }: { items: OrderItem[] }) {
  return (
    <ul aria-label="Захиалсан бүтээгдэхүүн, өнгө, тоо хэмжээ" className="mt-3 space-y-2">
      {items.map((item, index) => (
        <li key={index} className="flex min-w-0 flex-wrap items-start justify-between gap-x-4 gap-y-1 rounded-xl bg-gray-50 px-3 py-2 text-[12.5px]">
          <div className="min-w-0 flex-1 break-words">
            <p className="font-medium text-gray-900">{item.name}</p>
            {!isDeliveryItem(item) && <p className="mt-0.5 text-gray-600">Өнгө: {orderItemColor(item)}</p>}
          </div>
          <span className="shrink-0 font-semibold text-gray-900">
            {isDeliveryItem(item) ? `${(item.price * item.qty).toLocaleString('mn-MN')}₮` : `${item.qty} ширхэг`}
          </span>
        </li>
      ))}
    </ul>
  )
}
