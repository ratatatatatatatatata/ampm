import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { salesDateRange, type SalesReport as Report } from '../lib/sales'

const money = (value: number) => `${Number(value).toLocaleString('mn-MN')}₮`

export function SalesReport({ revision }: { revision: unknown }) {
  const [dates, setDates] = useState(() => salesDateRange(30))
  const [request, setRequest] = useState(() => ({ ...dates, refresh: 0 }))
  const [result, setResult] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    setLoading(true)
    setError('')
    setResult(null)
    const load = async () => {
      if (!supabase) {
        setError('Борлуулалтын бодит тайлан харахын тулд системд админ эрхээр нэвтэрнэ үү. Одоогоор зөвхөн local туршилтын горим байна.')
        setLoading(false)
        return
      }
      try {
        const { data, error: failure } = await supabase.rpc('ampm_sales_report', {
          p_from: request.from || null, p_to: request.to || null,
        }).abortSignal(controller.signal)
        if (!active) return
        if (failure || !data) {
          setError('Тайлан ачаалсангүй. Нэвтрэх эрх, сүлжээгээ шалгаад «Дахин ачаалах» дарна уу.')
        } else setResult(data as Report)
      } catch {
        if (active) setError('Тайлан ачаалсангүй. Дахин оролдоно уу.')
      } finally { if (active) setLoading(false) }
    }
    void load()
    return () => { active = false; controller.abort() }
  }, [request, revision])

  const choose = (days: number | null) => {
    const range = days === null ? { from: '', to: '' } : salesDateRange(days)
    setDates(range)
    setRequest(previous => ({ ...range, refresh: previous.refresh + 1 }))
  }
  const invalid = !!dates.from && !!dates.to && dates.from > dates.to
  return (
    <section className="rounded-3xl bg-white p-5 sm:p-8" aria-label="Борлуулалтын тайлан">
      <h2 className="text-xl font-semibold text-gray-900">Борлуулалт</h2>
      <p className="mt-2 text-sm text-gray-600">Сонгосон хугацаанд үүссэн захиалгууд. Огноог Улаанбаатарын цагаар тооцно.</p>
      <div className="my-4 flex flex-wrap gap-2" aria-label="Тайлангийн хугацаа">
        {[[1, 'Өнөөдөр'], [7, '7 хоног'], [30, '30 хоног'], [null, 'Бүх хугацаа']].map(([days, label]) => (
          <button key={label} type="button" onClick={() => choose(days as number | null)} className="rounded-full border border-gray-300 px-4 py-2 text-sm hover:bg-gray-100">{label}</button>
        ))}
      </div>
      <form className="mb-5 grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_1fr_auto]" onSubmit={event => {
        event.preventDefault()
        if (!invalid) setRequest(previous => ({ ...dates, refresh: previous.refresh + 1 }))
      }}>
        <label className="min-w-0 text-sm text-gray-700">Эхлэх огноо
          <input type="date" value={dates.from} onChange={e => setDates(previous => ({ ...previous, from: e.target.value }))} className="mt-1 block min-w-0 w-full rounded-xl border border-gray-300 p-2" />
        </label>
        <label className="min-w-0 text-sm text-gray-700">Дуусах огноо
          <input type="date" value={dates.to} onChange={e => setDates(previous => ({ ...previous, to: e.target.value }))} className="mt-1 block min-w-0 w-full rounded-xl border border-gray-300 p-2" />
        </label>
        <button type="submit" disabled={invalid} className="rounded-full bg-gray-900 px-5 py-2.5 text-sm text-white disabled:opacity-50">Харах</button>
      </form>
      {invalid && <p role="alert" className="mb-3 text-sm text-red-700">Эхлэх огноо дуусах огнооноос хойш байж болохгүй.</p>}
      <p className="mb-4 text-xs text-gray-500">Харуулж буй хугацаа: {request.from || 'Эхнээс'} — {request.to || 'Одоог хүртэл'}</p>
      {loading ? <p role="status" className="py-8 text-gray-600">Тайлан ачаалж байна…</p> : error ? (
        <div role="alert" className="rounded-2xl bg-red-50 p-4 text-sm text-red-800">
          <p>{error}</p><button type="button" onClick={() => setRequest(previous => ({ ...previous, refresh: previous.refresh + 1 }))} className="mt-3 underline underline-offset-4">Дахин ачаалах</button>
        </div>
      ) : result ? <SalesReportSummary report={result} /> : null}
    </section>
  )
}

export function SalesReportSummary({ report }: { report: Report }) {
  const cards = [
    ['Нийт захиалга', `${report.order_count}`, `Нийт дүн ${money(report.order_total)}`],
    ['Баталгаажсан төлбөр', money(report.paid_total), `${report.paid_count} захиалга`],
    ['Төлбөр баталгаажаагүй', money(report.pending_total), `${report.pending_count} захиалга`],
    ['Хүргэсэн захиалга', `${report.delivered_count}`, 'Хүргэсэн нь төлбөр төлөгдсөнийг батлахгүй'],
  ]
  return <>
    {report.order_count === 0 && <p className="mb-4 rounded-xl bg-blue-50 p-3 text-sm text-blue-900">Энэ хугацаанд захиалга алга.</p>}
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {cards.map(([label, value, note]) => <div key={label} className="min-w-0 rounded-2xl bg-gray-50 p-4">
        <p className="text-sm text-gray-600">{label}</p><p className="mt-2 break-words text-2xl font-semibold text-gray-900">{value}</p><p className="mt-1 text-xs text-gray-500">{note}</p>
      </div>)}
    </div>
    <p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
      Баталгаажсан төлбөрт зөвхөн системд «төлөгдсөн» гэж баталгаажсан захиалга орно. Шилжүүлгийн хуучин захиалга автоматаар төлөгдсөнд тооцогдохгүй. Захиалгын нийт дүнд хүргэлтийн төлбөр багтана. Энэ нь ашиг, буцаалт хассан цэвэр орлогын тайлан биш.
    </p>
    <h3 className="mt-6 font-semibold text-gray-900">Бүтээгдэхүүнээр — төлбөр баталгаажсан захиалга</h3>
    <p className="mt-1 text-xs text-gray-500">Нийт {report.product_units} ширхэг. Дүнгээр эрэмбэлсэн эхний 20 бүтээгдэхүүн; хүргэлтийн төлбөр ороогүй.</p>
    {report.products.length === 0 ? <p className="mt-4 text-sm text-gray-500">Төлбөр баталгаажсан бүтээгдэхүүн одоогоор алга.</p> : (
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Төлбөр баталгаажсан бүтээгдэхүүний тоо, дүн</caption>
          <thead><tr className="border-b text-xs text-gray-500"><th scope="col" className="py-3 pr-3">Бүтээгдэхүүн</th><th scope="col" className="p-3 text-right">Ширхэг</th><th scope="col" className="py-3 pl-3 text-right">Дүн</th></tr></thead>
          <tbody>{report.products.map(product => <tr key={product.name} className="border-b border-gray-100"><th scope="row" className="max-w-48 break-words py-3 pr-3 font-medium">{product.name}</th><td className="p-3 text-right">{product.units}</td><td className="whitespace-nowrap py-3 pl-3 text-right">{money(product.amount)}</td></tr>)}</tbody>
        </table>
      </div>
    )}
  </>
}
