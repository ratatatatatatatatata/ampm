import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Session, RealtimeChannel } from '@supabase/supabase-js'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
  Sparkles,
  Feather,
  Gem,
  Package,
  ShoppingBag,
  Star,
  Truck,
  ShieldCheck,
  RotateCcw,
  Zap,
  Plus,
  Minus,
  Trash2,
  ArrowLeft,
  ImagePlus,
  LogIn,
  LogOut,
  Loader2,
  Database,
  X,
  MapPin,
  Phone,
  Bell,
  BellRing,
  CheckCircle2,
  ClipboardList,
} from 'lucide-react'
import { supabase } from './lib/supabase'

function Logo() {
  return (
    <svg width="18" height="18" viewBox="0 0 256 256" fill="none">
      <path
        fill="rgb(84, 84, 84)"
        d="M 160 88 L 194 34 L 216 0 L 256 0 L 256 40 L 221.5 93.5 L 200 128 L 256 128 L 256 256 L 96 256 L 96 168 L 64.246 220 L 40 256 L 0 256 L 0 216 L 34 162 L 56 128 L 0 128 L 0 0 L 160 0 Z"
      />
    </svg>
  )
}

/** Scroll-reveal wrapper: fades + slides content in once it enters the viewport. */
function Reveal({
  children,
  className = '',
  delay = 0,
}: {
  children: ReactNode
  className?: string
  delay?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true)
          io.disconnect()
        }
      },
      { threshold: 0.15 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out will-change-transform ${
        shown ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
      } ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  )
}

/* ---------------- types & helpers ---------------- */

type Product = {
  id: string
  name: string
  desc: string
  price: number
  badge?: string
  image?: string
}

type CartItem = { id: string; qty: number }

type OrderItem = { name: string; price: number; qty: number }

type Order = {
  id: string
  items: OrderItem[]
  total: number
  contact: string
  address: string
  status: string
  created_at: string
}

const CART_KEY = 'ampm-cart'
const LOCAL_PRODUCTS_KEY = 'ampm-admin-products'
const LOCAL_ORDERS_KEY = 'ampm-orders'

const loadJson = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    return (parsed as T) ?? fallback
  } catch {
    return fallback
  }
}

const saveJson = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
const mapRow = (r: any): Product => ({
  id: String(r.id),
  name: r.name,
  desc: r.descr,
  price: r.price,
  badge: r.badge ?? undefined,
  image: r.image ?? undefined,
})

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
const mapOrder = (r: any): Order => ({
  id: String(r.id),
  items: Array.isArray(r.items) ? r.items : [],
  total: r.total,
  contact: r.contact,
  address: r.address,
  status: r.status ?? 'new',
  created_at: r.created_at ?? new Date().toISOString(),
})

const fmt = (n: number) => `${n.toLocaleString('mn-MN')}₮`

const isValidContact = (v: string) =>
  /^[0-9+\-\s]{8,}$/.test(v.trim()) || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim())

const navLinks = [
  { label: 'Бүтээгдэхүүн', href: '#products' },
  { label: 'Бидний тухай', href: '#about' },
  { label: 'Зөвлөгөө', href: '#tips' },
  { label: 'Холбоо барих', href: '#contact' },
]

const tips = [
  {
    title: 'Өдөрт 2 удаа',
    desc: 'Өглөө сэрээд болон унтахын өмнө 2 минутын турш угаана.',
  },
  {
    title: '45 градусын өнцгөөр',
    desc: 'Сойзоо буйлны шугам руу 45° налуулж, зөөлөн дугуй хөдөлгөөнөөр угаана.',
  },
  {
    title: 'Хэлээ мартуузай',
    desc: 'Хэлний гадаргууг зөөлөн цэвэрлэснээр амны үнэр арилна.',
  },
  {
    title: '3 сар тутамд солино',
    desc: 'Хялгас нь салбайсан сойз үр дүнгүй — улирал бүр шинэчлээрэй.',
  },
]

const features = [
  {
    icon: Sparkles,
    title: 'Гүн цэвэрлэгээ',
    desc: 'Жижиг толгойтой, өргөн форматтай сойзны толгой — бүх талыг хамарсан цэвэрлэгээ.',
  },
  {
    icon: Feather,
    title: 'Зөөлөн арчилгаа',
    desc: 'KR PBT нарийн хялгас — буйланд зөөлөн, өнгөрт хатуу.',
  },
  {
    icon: Gem,
    title: 'Премиум материал',
    desc: 'Цахилгаан бүрэлттэй металлик бариул, тансаг өнгөлгөө.',
  },
  {
    icon: Package,
    title: 'Гоёмсог сав баглаа',
    desc: 'Цэвэр, эрүүл ахуйтай, авсаархан бөгөөд загварлаг хайрцаг.',
  },
]

const calloutIconCls = 'w-5 h-5 text-[#e8b49e]'
const callouts = {
  left: [
    {
      no: '01',
      title: 'Жижиг толгойтой, өргөн форматтай толгой',
      desc: 'Бүх талыг хамарсан, үр дүнтэй цэвэрлэгээ',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={calloutIconCls}>
          <rect x="8" y="3" width="8" height="12" rx="4" />
          <path d="M10 6v6M12 5v8M14 6v6M12 15v6" />
        </svg>
      ),
    },
    {
      no: '03',
      title: 'KR PBT сойзны хялгас',
      desc: 'Гаднаа зөөлөн, дотроо бат — шүдийг цэвэрлэж, буйлыг хамгаална',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={calloutIconCls}>
          <path d="M8 20V8M12 20V5M16 20V8" />
          <path d="M8 8c0-2 1-3 1-3M12 5c0-1.5.5-2.5.5-2.5M16 8c0-2-1-3-1-3" />
        </svg>
      ),
    },
  ],
  right: [
    {
      no: '02',
      title: 'Тансаг цахилгаан бүрэлттэй бариул',
      desc: 'Металл бүрэлт — дэгжин, тансаг мэдрэмжийг илэрхийлнэ',
      icon: <Zap size={19} className="text-[#e8b49e]" />,
    },
    {
      no: '04',
      title: 'Гоёмсог сойзны хайрцаг',
      desc: 'Цэвэр, эрүүл ахуйтай, авсаархан бөгөөд загварлаг',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={calloutIconCls}>
          <rect x="9" y="2" width="6" height="20" rx="2" />
          <path d="M11 6h2" />
        </svg>
      ),
    },
  ],
}

const reviews = [
  {
    name: 'Сарнай М.',
    text: 'Сойз нь үнэхээр премиум мэдрэмж төрүүлдэг. Шүд минь урьд өмнө байгаагүй цэвэрхэн болсон!',
  },
  {
    name: 'Батбаяр Т.',
    text: 'Бариул нь гарт маш эвтэйхэн, хялгас нь буйлыг огт гэмтээдэггүй.',
  },
  {
    name: 'Номин Э.',
    text: 'Бэлэг болгон авсан — сав баглаа нь хүртэл тансаг. Заавал санал болгоно!',
  },
]

function Callout({
  c,
  align,
}: {
  c: { no: string; title: string; desc: string; icon: ReactNode }
  align: 'left' | 'right'
}) {
  return (
    <div className={`flex flex-col gap-2 ${align === 'left' ? 'items-start text-left' : 'items-end text-right'}`}>
      <div className="w-11 h-11 rounded-full border border-[#e8b49e]/30 bg-white/5 flex items-center justify-center">
        {c.icon}
      </div>
      <h4 className="text-[13px] font-semibold text-white leading-snug max-w-[200px]">{c.title}</h4>
      <p className="text-[11px] text-white/50 leading-relaxed max-w-[200px]">{c.desc}</p>
      <span className="text-[10px] text-[#e8b49e]/70 border border-[#e8b49e]/30 rounded-full w-6 h-6 flex items-center justify-center">
        {c.no}
      </span>
    </div>
  )
}

/* ---------------- Auto-playing video ---------------- */

/**
 * Video that reliably autoplays on phones: forces the muted property before
 * play (React attribute quirk), retries on load/visibility, and falls back to
 * the first touch anywhere on the page (covers iOS Low Power Mode).
 */
function AutoVideo({
  src,
  className = '',
  ariaHidden = false,
}: {
  src: string
  className?: string
  ariaHidden?: boolean
}) {
  const ref = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const v = ref.current
    if (!v) return
    v.muted = true
    v.defaultMuted = true
    const tryPlay = () => {
      if (v.paused) v.play().catch(() => {})
    }
    tryPlay()
    v.addEventListener('loadeddata', tryPlay)
    v.addEventListener('canplay', tryPlay)
    const onVis = () => {
      if (!document.hidden) tryPlay()
    }
    document.addEventListener('visibilitychange', onVis)
    const kick = () => tryPlay()
    window.addEventListener('touchstart', kick, { once: true, passive: true })
    window.addEventListener('click', kick, { once: true })
    return () => {
      v.removeEventListener('loadeddata', tryPlay)
      v.removeEventListener('canplay', tryPlay)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('touchstart', kick)
      window.removeEventListener('click', kick)
    }
  }, [])

  return (
    <video
      ref={ref}
      src={src}
      className={className}
      autoPlay
      muted
      loop
      playsInline
      preload="auto"
      aria-hidden={ariaHidden || undefined}
    />
  )
}

/* ---------------- Admin image adjuster ---------------- */

const ADJ_W = 320
const ADJ_H = 240

/**
 * Lets the admin compose how a product photo will appear on the 4:3 card:
 * drag to reposition, slider to zoom. The composed crop is rendered to an
 * 800x600 canvas and saved, so the shop shows exactly what was framed here.
 */
function ImageAdjuster({ src, onAdjusted }: { src: string; onAdjusted: (out: string) => void }) {
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [zoom, setZoom] = useState(1)
  const [off, setOff] = useState({ x: 0, y: 0 })
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)

  const coverScale = img ? Math.max(ADJ_W / img.naturalWidth, ADJ_H / img.naturalHeight) : 1
  const s = coverScale * zoom

  const clampOff = useCallback(
    (x: number, y: number, zoomV = zoom) => {
      if (!img) return { x: 0, y: 0 }
      const sc = coverScale * zoomV
      const maxX = Math.max(0, (img.naturalWidth * sc - ADJ_W) / 2)
      const maxY = Math.max(0, (img.naturalHeight * sc - ADJ_H) / 2)
      return { x: Math.min(maxX, Math.max(-maxX, x)), y: Math.min(maxY, Math.max(-maxY, y)) }
    },
    [img, coverScale, zoom],
  )

  const emit = useCallback(
    (zoomV: number, offV: { x: number; y: number }) => {
      if (!img) return
      const sc = coverScale * zoomV
      const canvas = document.createElement('canvas')
      canvas.width = 800
      canvas.height = 600
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const left = ADJ_W / 2 - (img.naturalWidth * sc) / 2 + offV.x
      const top = ADJ_H / 2 - (img.naturalHeight * sc) / 2 + offV.y
      ctx.drawImage(img, -left / sc, -top / sc, ADJ_W / sc, ADJ_H / sc, 0, 0, 800, 600)
      onAdjusted(canvas.toDataURL('image/jpeg', 0.85))
    },
    [img, coverScale, onAdjusted],
  )

  useEffect(() => {
    const i = new Image()
    i.onload = () => {
      setImg(i)
      setZoom(1)
      setOff({ x: 0, y: 0 })
    }
    i.src = src
  }, [src])

  // initial composition once the image is ready
  useEffect(() => {
    if (img) emit(1, { x: 0, y: 0 })
  }, [img, emit])

  const onPointerDown = (e: React.PointerEvent) => {
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    dragRef.current = { x: e.clientX, y: e.clientY, ox: off.x, oy: off.y }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return
    const d = dragRef.current
    setOff(clampOff(d.ox + (e.clientX - d.x), d.oy + (e.clientY - d.y)))
  }
  const onPointerUp = () => {
    if (!dragRef.current) return
    dragRef.current = null
    emit(zoom, off)
  }

  const onZoom = (z: number) => {
    const next = clampOff(off.x, off.y, z)
    setZoom(z)
    setOff(next)
    emit(z, next)
  }

  if (!img) return null

  return (
    <div className="mt-4">
      <p className="text-[12px] font-medium text-gray-700 mb-2">
        Картан дээр хэрхэн харагдахыг тохируулна уу — зургийг чирж байрлуулж, доорх гулсагчаар томруулна
      </p>
      <div
        className="relative overflow-hidden rounded-xl bg-gray-200 cursor-grab active:cursor-grabbing touch-none select-none"
        style={{ width: ADJ_W, height: ADJ_H }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <img
          src={src}
          alt=""
          draggable={false}
          className="absolute max-w-none pointer-events-none"
          style={{
            width: img.naturalWidth * s,
            height: img.naturalHeight * s,
            left: ADJ_W / 2 - (img.naturalWidth * s) / 2 + off.x,
            top: ADJ_H / 2 - (img.naturalHeight * s) / 2 + off.y,
          }}
        />
        <div className="absolute inset-0 ring-2 ring-inset ring-blue-400/60 rounded-xl pointer-events-none" />
      </div>
      <div className="mt-3 flex items-center gap-3" style={{ width: ADJ_W }}>
        <span className="text-[11px] text-gray-500">Томруулах</span>
        <input
          type="range"
          min={1}
          max={3}
          step={0.05}
          value={zoom}
          onChange={(e) => onZoom(Number(e.target.value))}
          className="flex-1 accent-blue-500"
        />
        <span className="text-[11px] text-gray-500 w-8">{zoom.toFixed(1)}×</span>
      </div>
    </div>
  )
}

/* ---------------- Address map picker ---------------- */

function AddressMap({ onPick }: { onPick: (addr: string, lat: number, lng: number) => void }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markerRef = useRef<L.CircleMarker | null>(null)
  const onPickRef = useRef(onPick)
  onPickRef.current = onPick

  useEffect(() => {
    if (!wrapRef.current || mapRef.current) return
    const map = L.map(wrapRef.current).setView([47.9184, 106.9177], 12) // Улаанбаатар
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19,
    }).addTo(map)

    map.on('click', async (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng
      if (markerRef.current) markerRef.current.setLatLng(e.latlng)
      else
        markerRef.current = L.circleMarker(e.latlng, {
          radius: 9,
          color: '#3b82f6',
          weight: 3,
          fillColor: '#3b82f6',
          fillOpacity: 0.5,
        }).addTo(map)

      let addr = `Байршил: ${lat.toFixed(5)}, ${lng.toFixed(5)}`
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=mn`,
        )
        const j = await res.json()
        if (j?.display_name) addr = j.display_name
      } catch {
        /* reverse geocode unavailable — keep coordinates */
      }
      onPickRef.current(addr, lat, lng)
    })

    mapRef.current = map
    // The drawer animates in — recalc size once it settles.
    setTimeout(() => map.invalidateSize(), 350)
    return () => {
      map.remove()
      mapRef.current = null
      markerRef.current = null
    }
  }, [])

  return (
    <div>
      <div ref={wrapRef} className="h-52 rounded-xl overflow-hidden relative z-0" />
      <p className="mt-1.5 text-[11px] text-gray-400 flex items-center gap-1">
        <MapPin size={11} /> Газрын зурган дээр дарж хаягаа сонгоно уу
      </p>
    </div>
  )
}

/* ---------------- Cart drawer + checkout ---------------- */

function CartDrawer({
  open,
  onClose,
  cart,
  products,
  setQty,
  removeItem,
  clearCart,
}: {
  open: boolean
  onClose: () => void
  cart: CartItem[]
  products: Product[]
  setQty: (id: string, qty: number) => void
  removeItem: (id: string) => void
  clearCart: () => void
}) {
  const [step, setStep] = useState<'cart' | 'checkout' | 'done'>('cart')
  const [contact, setContact] = useState('')
  const [address, setAddress] = useState('')
  const [latLng, setLatLng] = useState<{ lat: number; lng: number } | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) setStep('cart')
  }, [open])

  const lines = cart
    .map((c) => {
      const p = products.find((p) => p.id === c.id)
      return p ? { ...p, qty: c.qty } : null
    })
    .filter(Boolean) as (Product & { qty: number })[]

  const total = lines.reduce((s, l) => s + l.price * l.qty, 0)

  const onMapPick = useCallback((addr: string, lat: number, lng: number) => {
    setAddress(addr)
    setLatLng({ lat, lng })
  }, [])

  const submitOrder = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isValidContact(contact)) {
      setError('Утасны дугаар (8-аас доошгүй орон) эсвэл имэйл хаягаа зөв оруулна уу.')
      return
    }
    if (!address.trim()) {
      setError('Хүргэлтийн хаягаа оруулна уу (газрын зургаас сонгох эсвэл бичих).')
      return
    }
    setError('')
    setBusy(true)

    const order = {
      items: lines.map((l) => ({ name: l.name, price: l.price, qty: l.qty })),
      total,
      contact: contact.trim(),
      address: address.trim(),
      lat: latLng?.lat ?? null,
      lng: latLng?.lng ?? null,
    }

    if (supabase) {
      const { error } = await supabase.from('orders').insert(order)
      setBusy(false)
      if (error) {
        setError('Захиалга илгээхэд алдаа гарлаа: ' + error.message)
        return
      }
    } else {
      const local = loadJson<Order[]>(LOCAL_ORDERS_KEY, [])
      saveJson(LOCAL_ORDERS_KEY, [
        { ...order, id: `local-${Date.now()}`, status: 'new', created_at: new Date().toISOString() },
        ...local,
      ])
      setBusy(false)
    }

    clearCart()
    setStep('done')
    setContact('')
    setAddress('')
    setLatLng(null)
  }

  if (!open) return null

  return (
    <>
      <div className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <aside className="fixed right-0 top-0 z-[90] h-dvh w-full max-w-md bg-[#f7f7f5] shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-200">
          <h3 className="text-[16px] font-semibold text-gray-900 flex items-center gap-2">
            {step === 'checkout' && (
              <button onClick={() => setStep('cart')} aria-label="Буцах" className="text-gray-500 hover:text-gray-900">
                <ArrowLeft size={17} />
              </button>
            )}
            {step === 'cart' ? 'Таны сагс' : step === 'checkout' ? 'Захиалга өгөх' : 'Баярлалаа!'}
          </h3>
          <button onClick={onClose} aria-label="Хаах" className="text-gray-400 hover:text-gray-900">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {step === 'done' ? (
            <div className="h-full flex flex-col items-center justify-center text-center gap-3">
              <CheckCircle2 size={44} className="text-green-500" />
              <p className="text-[16px] font-semibold text-gray-900">Захиалга амжилттай илгээгдлээ!</p>
              <p className="text-[13px] text-gray-500 max-w-[260px]">
                Бид таны өгсөн холбоо барих мэдээллээр эргэн холбогдож, хүргэлтийг баталгаажуулна.
              </p>
              <button
                onClick={onClose}
                className="mt-3 rounded-full bg-blue-500 text-white text-[13px] font-medium px-7 py-2.5 hover:bg-blue-600 transition-colors"
              >
                Хаах
              </button>
            </div>
          ) : step === 'cart' ? (
            lines.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center gap-3">
                <ShoppingBag size={38} className="text-gray-300" />
                <p className="text-[13.5px] text-gray-500">Таны сагс хоосон байна.</p>
                <button onClick={onClose} className="text-[13px] text-blue-500 underline underline-offset-4">
                  Бүтээгдэхүүн үзэх
                </button>
              </div>
            ) : (
              <ul className="space-y-3">
                {lines.map((l) => (
                  <li key={l.id} className="flex items-center gap-4 bg-white rounded-2xl p-3">
                    <div className="w-16 h-16 rounded-xl overflow-hidden bg-gray-100 shrink-0">
                      {l.image ? (
                        <img src={l.image} alt={l.name} className="w-full h-full object-cover" />
                      ) : (
                        <video src="/video/ampm-hero.mp4" muted playsInline className="w-full h-full object-cover" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13.5px] font-medium text-gray-900 truncate">{l.name}</p>
                      <p className="text-[12.5px] text-gray-500">{fmt(l.price)}</p>
                      <div className="mt-1.5 flex items-center gap-2.5">
                        <button
                          onClick={() => setQty(l.id, l.qty - 1)}
                          aria-label="Хасах"
                          className="w-6.5 h-6.5 rounded-full border border-gray-300 flex items-center justify-center text-gray-500 hover:border-blue-400 hover:text-blue-500"
                        >
                          <Minus size={12} />
                        </button>
                        <span className="text-[13px] font-semibold text-gray-900 w-5 text-center">{l.qty}</span>
                        <button
                          onClick={() => setQty(l.id, l.qty + 1)}
                          aria-label="Нэмэх"
                          className="w-6.5 h-6.5 rounded-full border border-gray-300 flex items-center justify-center text-gray-500 hover:border-blue-400 hover:text-blue-500"
                        >
                          <Plus size={12} />
                        </button>
                      </div>
                    </div>
                    <button
                      onClick={() => removeItem(l.id)}
                      aria-label="Устгах"
                      className="text-gray-300 hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : (
            /* -------- checkout form -------- */
            <form id="checkout-form" onSubmit={submitOrder} className="space-y-5">
              <div>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[12.5px] font-medium text-gray-700 flex items-center gap-1.5">
                    <Phone size={13} /> Утасны дугаар эсвэл имэйл *
                  </span>
                  <input
                    value={contact}
                    onChange={(e) => setContact(e.target.value)}
                    placeholder="99123456 эсвэл tanii@mail.com"
                    className="rounded-xl bg-white px-4 py-2.5 text-[13px] text-gray-900 outline-none border border-gray-200 focus:border-blue-400 transition-colors"
                  />
                </label>
              </div>

              <AddressMap onPick={onMapPick} />

              <label className="flex flex-col gap-1.5">
                <span className="text-[12.5px] font-medium text-gray-700">Гэрийн хаяг *</span>
                <textarea
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  rows={3}
                  placeholder="Дүүрэг, хороо, байр, орц, тоот…"
                  className="rounded-xl bg-white px-4 py-2.5 text-[13px] text-gray-900 outline-none border border-gray-200 focus:border-blue-400 transition-colors resize-none"
                />
              </label>

              <div className="bg-white rounded-2xl p-4">
                <p className="text-[12px] font-semibold text-gray-700 mb-2">Захиалга</p>
                {lines.map((l) => (
                  <div key={l.id} className="flex justify-between text-[12.5px] text-gray-600 py-0.5">
                    <span>
                      {l.name} × {l.qty}
                    </span>
                    <span>{fmt(l.price * l.qty)}</span>
                  </div>
                ))}
                <div className="flex justify-between text-[14px] font-bold text-gray-900 border-t border-gray-100 mt-2 pt-2">
                  <span>Нийт</span>
                  <span>{fmt(total)}</span>
                </div>
              </div>

              {error && <p className="text-[12.5px] text-red-500">{error}</p>}
            </form>
          )}
        </div>

        {step !== 'done' && lines.length > 0 && (
          <div className="border-t border-gray-200 px-6 py-5 bg-white">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[13px] text-gray-500">Нийт дүн</span>
              <span className="text-[18px] font-bold text-gray-900">{fmt(total)}</span>
            </div>
            {step === 'cart' ? (
              <button
                onClick={() => setStep('checkout')}
                className="w-full rounded-full bg-blue-500 text-white text-[14px] font-semibold py-3 hover:bg-blue-600 transition-colors"
              >
                Захиалах
              </button>
            ) : (
              <button
                type="submit"
                form="checkout-form"
                disabled={busy}
                className="w-full rounded-full bg-blue-500 text-white text-[14px] font-semibold py-3 hover:bg-blue-600 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {busy && <Loader2 size={15} className="animate-spin" />} Захиалга баталгаажуулах
              </button>
            )}
          </div>
        )}
      </aside>
    </>
  )
}

/* ---------------- Admin ---------------- */

function AdminLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!supabase) return
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (error) setError('Нэвтрэх нэр эсвэл нууц үг буруу байна.')
  }

  return (
    <form onSubmit={submit} className="rounded-3xl p-6 sm:p-8 max-w-md mx-auto" style={{ backgroundColor: '#EDEDED' }}>
      <h2 className="text-[15px] font-semibold text-gray-900 mb-1 flex items-center gap-2">
        <LogIn size={16} className="text-blue-500" /> Админ нэвтрэлт
      </h2>
      <p className="text-[12px] text-gray-500 mb-5">Supabase Authentication дээр үүсгэсэн админ бүртгэлээрээ нэвтэрнэ.</p>
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-gray-700">Имэйл</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            className="rounded-xl bg-white px-4 py-2.5 text-[13px] text-gray-900 outline-none border border-transparent focus:border-blue-400 transition-colors"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-gray-700">Нууц үг</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            className="rounded-xl bg-white px-4 py-2.5 text-[13px] text-gray-900 outline-none border border-transparent focus:border-blue-400 transition-colors"
          />
        </label>
      </div>
      {error && <p className="mt-4 text-[12.5px] text-red-500">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="mt-6 inline-flex items-center gap-2 text-[13px] font-medium text-white bg-blue-500 rounded-full px-6 py-2.5 hover:bg-blue-600 transition-colors disabled:opacity-60"
      >
        {busy ? <Loader2 size={15} className="animate-spin" /> : <LogIn size={15} />} Нэвтрэх
      </button>
    </form>
  )
}

function AdminPanel({
  products,
  reloadProducts,
  session,
}: {
  products: Product[]
  reloadProducts: () => Promise<void>
  session: Session | null
}) {
  const [tab, setTab] = useState<'orders' | 'products'>('orders')
  const [orders, setOrders] = useState<Order[]>([])
  const [ordersError, setOrdersError] = useState('')
  const [flash, setFlash] = useState<string | null>(null)
  const [notifOn, setNotifOn] = useState(
    typeof Notification !== 'undefined' && Notification.permission === 'granted',
  )

  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [price, setPrice] = useState('')
  const [badge, setBadge] = useState('')
  const [imageRaw, setImageRaw] = useState<string | undefined>()
  const [image, setImage] = useState<string | undefined>()
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)

  const onAdjusted = useCallback((out: string) => setImage(out), [])

  const usingDb = !!supabase

  const loadOrders = useCallback(async () => {
    if (!supabase) {
      setOrders(loadJson<Order[]>(LOCAL_ORDERS_KEY, []))
      return
    }
    const { data, error } = await supabase.from('orders').select('*').order('created_at', { ascending: false })
    if (error) setOrdersError('Захиалга ачаалахад алдаа гарлаа: ' + error.message)
    else {
      setOrdersError('')
      setOrders((data ?? []).map(mapOrder))
    }
  }, [])

  useEffect(() => {
    if (usingDb && !session) return
    loadOrders()
  }, [loadOrders, usingDb, session])

  // Realtime: шинэ захиалга ирэхэд шууд мэдэгдэнэ
  useEffect(() => {
    if (!supabase || !session) return
    const ch: RealtimeChannel = supabase
      .channel('orders-notify')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, (payload) => {
        const o = mapOrder(payload.new)
        setOrders((prev) => [o, ...prev])
        setFlash(`Шинэ захиалга: ${o.contact} — ${fmt(o.total)}`)
        setTimeout(() => setFlash(null), 6000)
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification('AM/PM — Шинэ захиалга! 🛒', {
            body: `${o.contact} · ${fmt(o.total)}\n${o.address.slice(0, 80)}`,
          })
        }
      })
      .subscribe()
    return () => {
      supabase?.removeChannel(ch)
    }
  }, [session])

  const enableNotif = async () => {
    if (typeof Notification === 'undefined') return
    const p = await Notification.requestPermission()
    setNotifOn(p === 'granted')
  }

  const setOrderStatus = async (id: string, status: string) => {
    if (supabase) {
      const { error } = await supabase.from('orders').update({ status }).eq('id', id)
      if (!error) setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)))
    } else {
      const next = orders.map((o) => (o.id === id ? { ...o, status } : o))
      setOrders(next)
      saveJson(LOCAL_ORDERS_KEY, next)
    }
  }

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setImageRaw(String(reader.result))
    reader.readAsDataURL(file)
  }

  const submitProduct = async (e: React.FormEvent) => {
    e.preventDefault()
    const p = Number(price)
    if (!name.trim() || !price.trim() || Number.isNaN(p) || p <= 0) {
      setError('Нэр болон зөв үнэ оруулна уу.')
      return
    }
    setError('')
    setBusy(true)

    if (usingDb && supabase) {
      const { error } = await supabase.from('products').insert({
        name: name.trim(),
        descr: desc.trim() || 'AM/PM цуглуулгын бүтээгдэхүүн.',
        price: p,
        badge: badge.trim() || null,
        image: image || null,
      })
      setBusy(false)
      if (error) {
        setError('Хадгалахад алдаа гарлаа: ' + error.message)
        return
      }
      await reloadProducts()
    } else {
      const product: Product = {
        id: `custom-${Date.now()}`,
        name: name.trim(),
        desc: desc.trim() || 'AM/PM цуглуулгын бүтээгдэхүүн.',
        price: p,
        badge: badge.trim() || undefined,
        image,
      }
      const next = [...products, product]
      if (!saveJson(LOCAL_PRODUCTS_KEY, next)) {
        setBusy(false)
        setError('Хадгалах боломжгүй (зураг хэт том байж магадгүй).')
        return
      }
      await reloadProducts()
      setBusy(false)
    }

    setName('')
    setDesc('')
    setPrice('')
    setBadge('')
    setImage(undefined)
    setImageRaw(undefined)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const removeProduct = async (id: string) => {
    if (usingDb && supabase) {
      const { error } = await supabase.from('products').delete().eq('id', id)
      if (!error) await reloadProducts()
    } else {
      saveJson(
        LOCAL_PRODUCTS_KEY,
        products.filter((p) => p.id !== id),
      )
      await reloadProducts()
    }
  }

  if (usingDb && !session) {
    return (
      <div className="min-h-screen bg-[#f0f0ee] px-6 sm:px-12 py-10">
        <div className="max-w-3xl mx-auto">
          <a
            href="#"
            className="inline-flex items-center gap-2 text-[13px] font-medium text-blue-500 hover:text-blue-600 transition-colors mb-8"
          >
            <ArrowLeft size={15} /> Дэлгүүр рүү буцах
          </a>
          <AdminLogin />
        </div>
      </div>
    )
  }

  const newCount = orders.filter((o) => o.status === 'new').length

  return (
    <div className="min-h-screen bg-[#f0f0ee] px-6 sm:px-12 md:px-20 lg:px-28 py-10">
      {/* realtime flash */}
      {flash && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] bg-gray-900 text-white text-[13px] px-5 py-3 rounded-full shadow-xl flex items-center gap-2">
          <BellRing size={15} className="text-amber-300" /> {flash}
        </div>
      )}

      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <a
            href="#"
            className="inline-flex items-center gap-2 text-[13px] font-medium text-blue-500 hover:text-blue-600 transition-colors"
          >
            <ArrowLeft size={15} /> Дэлгүүр рүү буцах
          </a>
          {usingDb && supabase && (
            <button
              onClick={() => supabase?.auth.signOut()}
              className="inline-flex items-center gap-2 text-[12.5px] text-gray-500 hover:text-red-500 transition-colors"
            >
              <LogOut size={14} /> Гарах
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center justify-center rounded-full w-11 h-11" style={{ backgroundColor: '#EDEDED' }}>
            <Logo />
          </div>
          <div>
            <h1 className="text-[1.4rem] font-medium text-gray-900 tracking-tight">Админ панель</h1>
            <p className="text-[12.5px] text-gray-500">
              {session?.user?.email ? `Нэвтэрсэн: ${session.user.email}` : 'Захиалга ба бүтээгдэхүүн'}
            </p>
          </div>
        </div>

        <div
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 mb-6 text-[12px] ${
            usingDb ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
          }`}
        >
          <Database size={14} className="shrink-0" />
          {usingDb
            ? 'Supabase холбогдсон — захиалга бүр энд realtime ирнэ.'
            : 'Supabase тохируулаагүй тул localStorage горимд ажиллаж байна.'}
        </div>

        {/* notification permission */}
        {usingDb && !notifOn && (
          <button
            onClick={enableNotif}
            className="mb-6 inline-flex items-center gap-2 text-[12.5px] font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-full px-4 py-2 hover:bg-blue-100 transition-colors"
          >
            <Bell size={14} /> Browser мэдэгдэл идэвхжүүлэх (шинэ захиалга ирэхэд дуугарна)
          </button>
        )}

        {/* tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setTab('orders')}
            className={`inline-flex items-center gap-2 text-[13px] font-medium rounded-full px-5 py-2.5 transition-colors ${
              tab === 'orders' ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:text-gray-900'
            }`}
          >
            <ClipboardList size={14} /> Захиалга
            {newCount > 0 && (
              <span className="bg-blue-500 text-white text-[10.5px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center">
                {newCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab('products')}
            className={`inline-flex items-center gap-2 text-[13px] font-medium rounded-full px-5 py-2.5 transition-colors ${
              tab === 'products' ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:text-gray-900'
            }`}
          >
            <Package size={14} /> Бүтээгдэхүүн ({products.length})
          </button>
        </div>

        {tab === 'orders' ? (
          <div className="rounded-3xl p-6 sm:p-8" style={{ backgroundColor: '#EDEDED' }}>
            {ordersError && <p className="text-[12.5px] text-red-500 mb-4">{ordersError}</p>}
            {orders.length === 0 ? (
              <p className="text-[13px] text-gray-500">Одоогоор захиалга алга.</p>
            ) : (
              <ul className="space-y-3">
                {orders.map((o) => (
                  <li key={o.id} className="bg-white rounded-2xl p-4">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <p className="text-[13.5px] font-semibold text-gray-900 flex items-center gap-2">
                          {/^[0-9+\-\s]+$/.test(o.contact) ? (
                            <a href={`tel:${o.contact.replace(/\s/g, '')}`} className="text-blue-600 hover:underline">
                              📞 {o.contact}
                            </a>
                          ) : (
                            <a href={`mailto:${o.contact}`} className="text-blue-600 hover:underline">
                              ✉ {o.contact}
                            </a>
                          )}
                          {o.status === 'new' ? (
                            <span className="bg-blue-500 text-white text-[10px] font-bold rounded-full px-2 py-0.5">ШИНЭ</span>
                          ) : (
                            <span className="bg-green-100 text-green-700 text-[10px] font-bold rounded-full px-2 py-0.5">
                              ХҮРГЭСЭН
                            </span>
                          )}
                        </p>
                        <p className="mt-1 text-[12px] text-gray-500 flex items-start gap-1">
                          <MapPin size={12} className="mt-0.5 shrink-0" /> {o.address}
                        </p>
                        <p className="mt-1.5 text-[12px] text-gray-600">
                          {o.items.map((i) => `${i.name} ×${i.qty}`).join(' · ')}
                        </p>
                        <p className="mt-0.5 text-[11px] text-gray-400">
                          {new Date(o.created_at).toLocaleString('mn-MN')}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <span className="text-[15px] font-bold text-gray-900">{fmt(o.total)}</span>
                        {o.status === 'new' ? (
                          <button
                            onClick={() => setOrderStatus(o.id, 'done')}
                            className="text-[11.5px] font-medium text-green-600 border border-green-300 rounded-full px-3 py-1 hover:bg-green-50"
                          >
                            Хүргэсэн гэж тэмдэглэх
                          </button>
                        ) : (
                          <button
                            onClick={() => setOrderStatus(o.id, 'new')}
                            className="text-[11.5px] text-gray-400 hover:text-gray-600"
                          >
                            Буцаах
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <>
            <form onSubmit={submitProduct} className="rounded-3xl p-6 sm:p-8 mb-6" style={{ backgroundColor: '#EDEDED' }}>
              <h2 className="text-[15px] font-semibold text-gray-900 mb-5 flex items-center gap-2">
                <Plus size={16} className="text-blue-500" /> Шинэ бүтээгдэхүүн
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="flex flex-col gap-1.5">
                  <span className="text-[12px] font-medium text-gray-700">Нэр *</span>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ж: AM/PM хос иж бүрдэл"
                    className="rounded-xl bg-white px-4 py-2.5 text-[13px] text-gray-900 outline-none border border-transparent focus:border-blue-400 transition-colors"
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[12px] font-medium text-gray-700">Үнэ (₮) *</span>
                  <input
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="139000"
                    inputMode="numeric"
                    className="rounded-xl bg-white px-4 py-2.5 text-[13px] text-gray-900 outline-none border border-transparent focus:border-blue-400 transition-colors"
                  />
                </label>
                <label className="flex flex-col gap-1.5 sm:col-span-2">
                  <span className="text-[12px] font-medium text-gray-700">Тайлбар</span>
                  <textarea
                    value={desc}
                    onChange={(e) => setDesc(e.target.value)}
                    rows={2}
                    placeholder="Богино танилцуулга…"
                    className="rounded-xl bg-white px-4 py-2.5 text-[13px] text-gray-900 outline-none border border-transparent focus:border-blue-400 transition-colors resize-none"
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[12px] font-medium text-gray-700">Badge (сонголтоор)</span>
                  <input
                    value={badge}
                    onChange={(e) => setBadge(e.target.value)}
                    placeholder="Ж: Шинэ"
                    className="rounded-xl bg-white px-4 py-2.5 text-[13px] text-gray-900 outline-none border border-transparent focus:border-blue-400 transition-colors"
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[12px] font-medium text-gray-700">Зураг (сонголтоор)</span>
                  <span className="relative rounded-xl bg-white px-4 py-2.5 text-[13px] text-gray-500 cursor-pointer border border-dashed border-gray-300 hover:border-blue-400 transition-colors flex items-center gap-2 overflow-hidden">
                    <ImagePlus size={15} className="shrink-0" />
                    <span className="truncate">{imageRaw ? 'Зураг сонгогдсон ✓' : 'Файл сонгох…'}</span>
                    <input type="file" accept="image/*" onChange={onFile} className="absolute inset-0 opacity-0 cursor-pointer" />
                  </span>
                </label>
              </div>
              {imageRaw && <ImageAdjuster src={imageRaw} onAdjusted={onAdjusted} />}
              {error && <p className="mt-4 text-[12.5px] text-red-500">{error}</p>}
              {saved && <p className="mt-4 text-[12.5px] text-green-600">Бүтээгдэхүүн нэмэгдлээ ✓</p>}
              <button
                type="submit"
                disabled={busy}
                className="mt-6 inline-flex items-center gap-2 text-[13px] font-medium text-white bg-blue-500 rounded-full px-6 py-2.5 hover:bg-blue-600 transition-colors disabled:opacity-60"
              >
                {busy ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Нэмэх
              </button>
            </form>

            <div className="rounded-3xl p-6 sm:p-8" style={{ backgroundColor: '#EDEDED' }}>
              <h2 className="text-[15px] font-semibold text-gray-900 mb-5">Бүтээгдэхүүн ({products.length})</h2>
              {products.length === 0 ? (
                <p className="text-[13px] text-gray-500">
                  Одоогоор бүтээгдэхүүн алга. Дээрх маягтаар нэмэхэд дэлгүүрт шууд харагдана.
                </p>
              ) : (
                <ul className="space-y-3">
                  {products.map((p) => (
                    <li key={p.id} className="flex items-center gap-4 bg-white rounded-2xl p-3">
                      <div className="w-14 h-14 rounded-xl overflow-hidden bg-gray-100 shrink-0">
                        {p.image ? (
                          <img src={p.image} alt={p.name} className="w-full h-full object-cover" />
                        ) : (
                          <video src="/video/ampm-hero.mp4" muted playsInline className="w-full h-full object-cover" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13.5px] font-medium text-gray-900 truncate">{p.name}</p>
                        <p className="text-[12px] text-gray-500">{fmt(p.price)}</p>
                      </div>
                      {p.badge && (
                        <span className="text-[10.5px] font-semibold text-white bg-blue-500 rounded-full px-2.5 py-1 shrink-0">
                          {p.badge}
                        </span>
                      )}
                      <button
                        onClick={() => removeProduct(p.id)}
                        aria-label="Устгах"
                        className="p-2 text-gray-400 hover:text-red-500 transition-colors shrink-0"
                      >
                        <Trash2 size={16} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/* ---------------- Main page ---------------- */

/** True on landscape-ish viewports where the portrait video would crop badly. */
function useWideViewport() {
  const [wide, setWide] = useState(() => window.matchMedia('(min-aspect-ratio: 1/1)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(min-aspect-ratio: 1/1)')
    const onChange = () => setWide(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return wide
}

function App() {
  const [cart, setCart] = useState<CartItem[]>(() => loadJson<CartItem[]>(CART_KEY, []))
  const [cartOpen, setCartOpen] = useState(false)
  const [viewProduct, setViewProduct] = useState<Product | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(!!supabase)
  const [loadError, setLoadError] = useState('')
  const [route, setRoute] = useState(window.location.hash)
  const [session, setSession] = useState<Session | null>(null)
  const wide = useWideViewport()

  useEffect(() => {
    const onHash = () => setRoute(window.location.hash)
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    saveJson(CART_KEY, cart)
  }, [cart])

  const reloadProducts = useCallback(async () => {
    if (!supabase) {
      setProducts(loadJson<Product[]>(LOCAL_PRODUCTS_KEY, []))
      setLoading(false)
      return
    }
    setLoadError('')
    const { data, error } = await supabase.from('products').select('*').order('created_at', { ascending: true })
    if (error) setLoadError('Бүтээгдэхүүн ачаалахад алдаа гарлаа. Дахин оролдоно уу.')
    else setProducts((data ?? []).map(mapRow))
    setLoading(false)
  }, [])

  useEffect(() => {
    reloadProducts()
  }, [reloadProducts])

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])

  const addToCart = (id: string) => {
    setCart((prev) => {
      const found = prev.find((c) => c.id === id)
      if (found) return prev.map((c) => (c.id === id ? { ...c, qty: c.qty + 1 } : c))
      return [...prev, { id, qty: 1 }]
    })
    setCartOpen(true)
  }

  const setQty = (id: string, qty: number) => {
    if (qty <= 0) return setCart((prev) => prev.filter((c) => c.id !== id))
    setCart((prev) => prev.map((c) => (c.id === id ? { ...c, qty } : c)))
  }

  const cartCount = cart.reduce((s, c) => s + c.qty, 0)

  if (route === '#admin') {
    return <AdminPanel products={products} reloadProducts={reloadProducts} session={session} />
  }

  return (
    <div className="relative min-h-screen bg-[#f0f0ee]">
      {/* ---------- Fixed navbar ---------- */}
      <nav className="fixed top-0 inset-x-0 z-50 flex items-center justify-center pt-4 sm:pt-6 px-4 sm:px-8 gap-2 sm:gap-3">
        <div
          className="flex items-center justify-center rounded-full w-10 h-10 sm:w-11 sm:h-11 shrink-0 shadow-sm"
          style={{ backgroundColor: '#EDEDED' }}
        >
          <Logo />
        </div>
        <div
          className="flex items-center gap-4 sm:gap-10 rounded-xl px-4 sm:px-8 py-2.5 sm:py-3 shadow-sm"
          style={{ backgroundColor: '#EDEDED' }}
        >
          {navLinks.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="text-[12px] sm:text-[14px] font-medium text-gray-700 hover:text-gray-900 transition-colors duration-200"
            >
              {link.label}
            </a>
          ))}
        </div>
        <button
          onClick={() => setCartOpen(true)}
          className="relative flex items-center justify-center rounded-full w-10 h-10 sm:w-11 sm:h-11 shrink-0 shadow-sm hover:shadow transition-shadow"
          style={{ backgroundColor: '#EDEDED' }}
          aria-label="Сагс"
        >
          <ShoppingBag size={17} className="text-gray-700" />
          {cartCount > 0 && (
            <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-blue-500 text-white text-[10px] font-semibold">
              {cartCount}
            </span>
          )}
        </button>
      </nav>

      {/* ---------- Fullscreen video hero ---------- */}
      <header className="relative min-h-screen overflow-hidden bg-black">
        {/* Хэвтээ бичлэг: өргөн дэлгэцэд шууд дүүргэнэ, босоо утсанд бүдэг
            дэвсгэр дээр бүтнээр нь голлуулна */}
        {wide ? (
          <AutoVideo
            className="absolute inset-0 w-full h-full object-cover"
            src="/video/ampm-hero.mp4"
          />
        ) : (
          <>
            <AutoVideo
              className="absolute inset-0 w-full h-full object-cover blur-2xl scale-110 brightness-[0.55]"
              src="/video/ampm-hero.mp4"
              ariaHidden
            />
            <AutoVideo
              className="absolute inset-0 w-full h-full object-contain"
              src="/video/ampm-hero.mp4"
            />
          </>
        )}
        {/* текстийн уншигдацад зориулсан доод градиент */}
        <div
          className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/60 via-black/25 to-transparent pointer-events-none"
          aria-hidden
        />
        <div className="relative z-10 flex flex-col min-h-screen">
          <div className="flex-1 flex items-end pb-10 sm:pb-16 lg:pb-20 px-6 sm:px-12 md:px-20 lg:px-28">
            <div className="max-w-xs">
              <a
                href="#products"
                className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-blue-500 hover:text-blue-600 transition-colors mb-3 group"
              >
                AM/PM — шинэ цуглуулга{' '}
                <span className="inline-block transition-transform duration-200 group-hover:translate-x-0.5">→</span>
              </a>
              <h1 className="text-[1.5rem] sm:text-[1.75rem] leading-[1.15] font-medium text-white tracking-tight mb-3">
                Инээмсэглэлээ хайрладаг хүмүүст зориулсан энгийн, ухаалаг арчилгаа.
              </h1>
              <p className="text-[13px] text-gray-400 font-normal">Өдөр бүрээ цэнгэг эхлүүл. Доош гүйлгэж танилцана уу.</p>
            </div>
          </div>
          <div className="pb-6 flex justify-center">
            <div className="w-5 h-9 rounded-full border border-white/40 flex items-start justify-center p-1">
              <span className="w-1 h-2 rounded-full bg-white/80 animate-bounce" />
            </div>
          </div>
        </div>
      </header>

      {/* ---------- Feature strip ---------- */}
      <section className="py-20 sm:py-28 px-6 sm:px-12 md:px-20 lg:px-28">
        <Reveal className="max-w-xl mb-12">
          <p className="text-[11.5px] font-medium text-blue-500 uppercase tracking-widest mb-3">Яагаад AM/PM гэж?</p>
          <h2 className="text-[1.5rem] sm:text-[2rem] leading-[1.15] font-medium text-gray-900 tracking-tight">
            Өдөр тутмын дадлаа тансаг зан үйл болгон хувиргаарай.
          </h2>
        </Reveal>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {features.map((f, i) => (
            <Reveal key={f.title} delay={i * 100}>
              <div
                className="rounded-2xl p-6 h-full hover:-translate-y-1 transition-transform duration-300"
                style={{ backgroundColor: '#EDEDED' }}
              >
                <f.icon size={22} className="text-blue-500 mb-4" />
                <h3 className="text-[14px] font-medium text-gray-900 mb-2">{f.title}</h3>
                <p className="text-[12.5px] leading-relaxed text-gray-500">{f.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------- Design story: AM/PM poster infographic ---------- */}
      <section id="about" className="py-10 sm:py-16 px-6 sm:px-12 md:px-20 lg:px-28">
        <Reveal className="max-w-xl mb-10">
          <p className="text-[11.5px] font-medium text-blue-500 uppercase tracking-widest mb-3">Бидний тухай</p>
          <h2 className="text-[1.5rem] sm:text-[2rem] leading-[1.15] font-medium text-gray-900 tracking-tight">
            Алхам бүрдээ нарийн бодолцсон.
          </h2>
        </Reveal>
        <Reveal>
          <div className="relative rounded-3xl overflow-hidden bg-[#0a0908] shadow-2xl">
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] items-center gap-8 p-8 sm:p-12">
              <div className="hidden lg:flex flex-col justify-between gap-16 py-10">
                {callouts.left.map((c) => (
                  <Callout key={c.no} c={c} align="left" />
                ))}
              </div>

              <div className="relative mx-auto w-full max-w-[300px] sm:max-w-[340px]">
                <img
                  src="/img/ampm-still.jpg"
                  alt="AM/PM хос сойз"
                  className="w-full rounded-2xl"
                  style={{
                    maskImage: 'linear-gradient(to bottom, black 80%, transparent 100%)',
                    WebkitMaskImage: 'linear-gradient(to bottom, black 80%, transparent 100%)',
                  }}
                />
              </div>

              <div className="hidden lg:flex flex-col justify-between gap-16 py-10 items-end">
                {callouts.right.map((c) => (
                  <Callout key={c.no} c={c} align="right" />
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 lg:hidden">
                {[...callouts.left, ...callouts.right]
                  .sort((a, b) => a.no.localeCompare(b.no))
                  .map((c) => (
                    <Callout key={c.no} c={c} align="left" />
                  ))}
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ---------- Products ---------- */}
      <section id="products" className="py-20 sm:py-28 px-6 sm:px-12 md:px-20 lg:px-28">
        <Reveal className="flex items-end justify-between mb-12">
          <div>
            <p className="text-[11.5px] font-medium text-blue-500 uppercase tracking-widest mb-3">Дэлгүүр</p>
            <h2 className="text-[1.5rem] sm:text-[2rem] leading-[1.15] font-medium text-gray-900 tracking-tight">
              Цуглуулгаас сонгоорой.
            </h2>
          </div>
        </Reveal>

        {loading && (
          <div className="flex items-center gap-3 text-gray-500 text-[13px] mb-8">
            <Loader2 size={16} className="animate-spin" /> Бүтээгдэхүүн ачаалж байна…
          </div>
        )}
        {loadError && (
          <div className="flex items-center justify-between gap-3 bg-red-50 text-red-600 text-[13px] rounded-2xl px-5 py-4 mb-8">
            {loadError}
            <button onClick={() => reloadProducts()} className="underline underline-offset-2 shrink-0">
              Дахин ачаалах
            </button>
          </div>
        )}
        {!loading && !loadError && products.length === 0 && (
          <div className="rounded-3xl p-10 text-center" style={{ backgroundColor: '#EDEDED' }}>
            <Package size={30} className="mx-auto text-gray-400 mb-3" />
            <p className="text-[14px] text-gray-600">Бүтээгдэхүүн удахгүй нэмэгдэнэ.</p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {products.map((p, i) => (
            <Reveal key={p.id} delay={(i % 3) * 120}>
              <div
                className="group relative rounded-3xl overflow-hidden h-full flex flex-col hover:-translate-y-1.5 hover:shadow-xl transition-all duration-300"
                style={{ backgroundColor: '#EDEDED' }}
              >
                {p.badge && (
                  <span className="absolute top-4 left-4 z-10 text-[10.5px] font-semibold text-white bg-blue-500 rounded-full px-2.5 py-1">
                    {p.badge}
                  </span>
                )}
                <button
                  onClick={() => setViewProduct(p)}
                  className="relative aspect-[4/3] overflow-hidden w-full text-left cursor-zoom-in"
                  aria-label={`${p.name} — томруулж харах`}
                >
                  {p.image ? (
                    <img
                      src={p.image}
                      alt={p.name}
                      className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <AutoVideo
                      className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      src="/video/ampm-hero.mp4"
                    />
                  )}
                </button>
                <div className="p-6 flex flex-col flex-1">
                  <h3 className="text-[15px] font-medium text-gray-900 mb-1.5">{p.name}</h3>
                  <p className="text-[12.5px] text-gray-500 mb-4">{p.desc}</p>
                  <div className="mt-auto flex items-center justify-between">
                    <span className="text-[15px] font-semibold text-gray-900">{fmt(p.price)}</span>
                    <button
                      onClick={() => addToCart(p.id)}
                      className="inline-flex items-center gap-2 text-[12.5px] font-medium text-blue-500 border border-blue-400 rounded-full px-4 py-2 hover:bg-blue-500 hover:text-white hover:border-blue-500 transition-all duration-200"
                    >
                      <ShoppingBag size={14} />
                      Сагсанд нэмэх
                    </button>
                  </div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={200} className="mt-14">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { icon: Truck, text: 'Улаанбаатарт 24 цагт хүргэнэ' },
              { icon: RotateCcw, text: '30 хоногийн буцаалтын баталгаа' },
              { icon: ShieldCheck, text: '1 жилийн премиум баталгаа' },
            ].map((t) => (
              <div
                key={t.text}
                className="flex items-center gap-3 rounded-2xl px-5 py-4"
                style={{ backgroundColor: '#EDEDED' }}
              >
                <t.icon size={18} className="text-blue-500 shrink-0" />
                <span className="text-[12.5px] text-gray-700">{t.text}</span>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      {/* ---------- Reviews ---------- */}
      <section id="reviews" className="py-20 sm:py-28 px-6 sm:px-12 md:px-20 lg:px-28">
        <Reveal className="max-w-xl mb-12">
          <p className="text-[11.5px] font-medium text-blue-500 uppercase tracking-widest mb-3">Сэтгэгдэл</p>
          <h2 className="text-[1.5rem] sm:text-[2rem] leading-[1.15] font-medium text-gray-900 tracking-tight">
            Хэрэглэгчид юу гэж хэлдэг вэ?
          </h2>
        </Reveal>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {reviews.map((r, i) => (
            <Reveal key={r.name} delay={i * 120}>
              <div className="rounded-2xl p-6 h-full flex flex-col" style={{ backgroundColor: '#EDEDED' }}>
                <div className="flex gap-0.5 mb-4">
                  {Array.from({ length: 5 }).map((_, s) => (
                    <Star key={s} size={13} className="text-blue-500 fill-blue-500" />
                  ))}
                </div>
                <p className="text-[13px] leading-relaxed text-gray-700 mb-4">“{r.text}”</p>
                <span className="mt-auto text-[12px] font-medium text-gray-900">{r.name}</span>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------- Tips ---------- */}
      <section id="tips" className="py-20 sm:py-28 px-6 sm:px-12 md:px-20 lg:px-28">
        <Reveal className="max-w-xl mb-12">
          <p className="text-[11.5px] font-medium text-blue-500 uppercase tracking-widest mb-3">Зөвлөгөө</p>
          <h2 className="text-[1.5rem] sm:text-[2rem] leading-[1.15] font-medium text-gray-900 tracking-tight">
            Эрүүл инээмсэглэлийн энгийн дүрмүүд.
          </h2>
        </Reveal>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {tips.map((t, i) => (
            <Reveal key={t.title} delay={i * 100}>
              <div className="rounded-2xl p-6 h-full" style={{ backgroundColor: '#EDEDED' }}>
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-500 text-white text-[13px] font-bold mb-4">
                  {i + 1}
                </span>
                <h3 className="text-[14px] font-medium text-gray-900 mb-2">{t.title}</h3>
                <p className="text-[12.5px] leading-relaxed text-gray-500">{t.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------- Footer ---------- */}
      <footer id="contact" className="py-14 px-6 sm:px-12 md:px-20 lg:px-28">
        <Reveal>
          <div
            className="rounded-3xl px-8 py-10 flex flex-col sm:flex-row items-center justify-between gap-6"
            style={{ backgroundColor: '#EDEDED' }}
          >
            <div className="flex items-center gap-3">
              <Logo />
              <span className="text-[13px] font-medium text-gray-900">AM/PM</span>
            </div>
            <p className="text-[12px] text-gray-500 text-center">
              Өглөөний цэнгэг. Оройн арчилгаа. · info@ampm.mn · 9968-2882
            </p>
            <div className="flex items-center gap-4">
              <a href="#admin" className="text-[11.5px] text-gray-400 hover:text-blue-500 transition-colors">
                Админ
              </a>
              <p className="text-[11.5px] text-gray-400">© 2026 AM/PM</p>
            </div>
          </div>
        </Reveal>
      </footer>

      {/* ---------- Product lightbox ---------- */}
      {viewProduct && (
        <div className="fixed inset-0 z-[85] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setViewProduct(null)} />
          <div className="relative w-full max-w-lg overflow-hidden rounded-3xl bg-[#f7f7f5] shadow-2xl">
            <button
              onClick={() => setViewProduct(null)}
              aria-label="Хаах"
              className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors"
            >
              <X size={17} />
            </button>
            <div className="aspect-[4/3] bg-black">
              {viewProduct.image ? (
                <img src={viewProduct.image} alt={viewProduct.name} className="h-full w-full object-contain" />
              ) : (
                <AutoVideo src="/video/ampm-hero.mp4" className="h-full w-full object-contain" />
              )}
            </div>
            <div className="p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-[17px] font-semibold text-gray-900">{viewProduct.name}</h3>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-gray-500">{viewProduct.desc}</p>
                </div>
                {viewProduct.badge && (
                  <span className="shrink-0 rounded-full bg-blue-500 px-2.5 py-1 text-[10.5px] font-semibold text-white">
                    {viewProduct.badge}
                  </span>
                )}
              </div>
              <div className="mt-5 flex items-center justify-between">
                <span className="text-[18px] font-bold text-gray-900">{fmt(viewProduct.price)}</span>
                <button
                  onClick={() => {
                    addToCart(viewProduct.id)
                    setViewProduct(null)
                  }}
                  className="inline-flex items-center gap-2 rounded-full bg-blue-500 px-6 py-2.5 text-[13px] font-semibold text-white hover:bg-blue-600 transition-colors"
                >
                  <ShoppingBag size={14} /> Сагсанд нэмэх
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <CartDrawer
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        cart={cart}
        products={products}
        setQty={setQty}
        removeItem={(id) => setCart((prev) => prev.filter((c) => c.id !== id))}
        clearCart={() => setCart([])}
      />
    </div>
  )
}

export default App
