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

/** AM/PM — гэр бүлийн дүрст тэмдэг (хэрэглэгчийн өгсөн жинхэнэ лого зураг) */
function Logo({ size = 36 }: { size?: number }) {
  return (
    <img
      src="/img/ampm-logo-mark.png"
      alt="AM/PM"
      width={size}
      height={size}
      className="rounded-full object-cover shrink-0"
      style={{ width: size, height: size }}
    />
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
  category?: string
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
  paymentMethod?: string
}

type Profile = {
  id: string
  email?: string
  name?: string
  phone?: string
  address?: string
  created_at?: string
}

type Notif = {
  id: string
  user_id: string | null
  title: string
  body: string
  read: boolean
  created_at: string
}

const SEEN_NOTIFS_KEY = 'ampm-seen-notifs'

const CART_KEY = 'ampm-cart'
const LOCAL_PRODUCTS_KEY = 'ampm-admin-products'
const LOCAL_ORDERS_KEY = 'ampm-orders'

const DELIVERY_FEE = 6000

// TODO: Жинхэнэ дансны мэдээллээ энд солино уу
const BANK_INFO = {
  bank: 'Хаан банк',
  account: '5000 000 000',
  holder: 'AM/PM',
}

type QpayData = {
  qr_image?: string
  qr_text?: string
  urls?: { name: string; description?: string; logo?: string; link: string }[]
}

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
  category: r.category ?? undefined,
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
  paymentMethod: r.payment_method ?? undefined,
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

const goldIconCls = 'w-6 h-6 text-[#d9b483]'
const qualityCards = [
  {
    no: '01',
    title: 'Тансаг цахилгаан бүрэлттэй бариул',
    desc: 'Металл бүрэлт — дэгжин, тансаг мэдрэмжийг илэрхийлнэ',
    icon: <Zap size={22} className="text-[#d9b483]" />,
  },
  {
    no: '02',
    title: 'Жижиг толгойтой, өргөн форматтай толгой',
    desc: 'Бүх талыг хамарсан, үр дүнтэй цэвэрлэгээ',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={goldIconCls}>
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
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={goldIconCls}>
        <path d="M8 20V8M12 20V5M16 20V8" />
        <path d="M8 8c0-2 1-3 1-3M12 5c0-1.5.5-2.5.5-2.5M16 8c0-2-1-3-1-3" />
      </svg>
    ),
  },
  {
    no: '04',
    title: 'Гоёмсог сойзны хайрцаг',
    desc: 'Цэвэр, эрүүл ахуйтай, авсаархан бөгөөд загварлаг',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={goldIconCls}>
        <rect x="9" y="2" width="6" height="20" rx="2" />
        <path d="M11 6h2" />
      </svg>
    ),
  },
]

const specs = [
  { label: 'Брэнд', value: 'AM/PM' },
  { label: 'Загварын дугаар', value: 'B908' },
  { label: 'Хялгасны төрөл', value: 'Зөөлөн хялгас' },
  { label: 'Утасны нэрлэсэн диаметр', value: '0.152мм' },
  { label: 'Үзүүрийн диаметр', value: '0.01мм' },
  { label: 'Хялгасны материал', value: 'KR PBT' },
  { label: 'Бариулын өнгө', value: 'Ягаан алт бүрэлт' },
  { label: 'Хэмжээ', value: '190мм × 16мм' },
]

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

/** Алтлаг гарчиг — брэндийн хар хуудсуудын хэв маяг */
function GoldHeading({ line1, line2 }: { line1: string; line2: string }) {
  return (
    <h2 className="text-center leading-tight tracking-tight">
      <span className="block font-light text-[1.6rem] sm:text-[2.2rem] text-[#e8cfa4]">{line1}</span>
      <span className="block font-semibold text-[1.6rem] sm:text-[2.2rem] text-[#d9b483]">{line2}</span>
    </h2>
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
type FitMode = 'cover' | 'contain'

function ImageAdjuster({ src, onAdjusted }: { src: string; onAdjusted: (out: string) => void }) {
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [mode, setMode] = useState<FitMode>('cover')
  const [zoom, setZoom] = useState(1)
  const [off, setOff] = useState({ x: 0, y: 0 })
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)

  const baseScale = useCallback(
    (m: FitMode) => {
      if (!img) return 1
      return m === 'cover'
        ? Math.max(ADJ_W / img.naturalWidth, ADJ_H / img.naturalHeight)
        : Math.min(ADJ_W / img.naturalWidth, ADJ_H / img.naturalHeight)
    },
    [img],
  )
  const s = baseScale(mode) * zoom

  const clampOff = useCallback(
    (x: number, y: number, zoomV = zoom, modeV = mode) => {
      if (!img) return { x: 0, y: 0 }
      const sc = baseScale(modeV) * zoomV
      // cover: чирэлт нь кадрын гадна гарахгүй; contain: зураг кадр дотроо хөдөлнө
      const maxX = Math.abs(img.naturalWidth * sc - ADJ_W) / 2
      const maxY = Math.abs(img.naturalHeight * sc - ADJ_H) / 2
      return { x: Math.min(maxX, Math.max(-maxX, x)), y: Math.min(maxY, Math.max(-maxY, y)) }
    },
    [img, baseScale, zoom, mode],
  )

  const emit = useCallback(
    (zoomV: number, offV: { x: number; y: number }, modeV: FitMode = mode) => {
      if (!img) return
      const sc = baseScale(modeV) * zoomV
      const canvas = document.createElement('canvas')
      canvas.width = 800
      canvas.height = 600
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      // PNG-ийн тунгалаг дэвсгэр хар болохоос сэргийлж цагаанаар дүүргэнэ
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, 800, 600)
      const scale800 = 800 / ADJ_W
      const left = ADJ_W / 2 - (img.naturalWidth * sc) / 2 + offV.x
      const top = ADJ_H / 2 - (img.naturalHeight * sc) / 2 + offV.y
      ctx.drawImage(
        img,
        0,
        0,
        img.naturalWidth,
        img.naturalHeight,
        left * scale800,
        top * scale800,
        img.naturalWidth * sc * scale800,
        img.naturalHeight * sc * scale800,
      )
      onAdjusted(canvas.toDataURL('image/jpeg', 0.85))
    },
    [img, baseScale, onAdjusted, mode],
  )

  useEffect(() => {
    const i = new Image()
    i.onload = () => {
      setImg(i)
      setMode('cover')
      setZoom(1)
      setOff({ x: 0, y: 0 })
    }
    i.src = src
  }, [src])

  // initial composition once the image is ready
  useEffect(() => {
    if (img) emit(1, { x: 0, y: 0 }, 'cover')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [img])

  const switchMode = (m: FitMode) => {
    setMode(m)
    setZoom(1)
    setOff({ x: 0, y: 0 })
    emit(1, { x: 0, y: 0 }, m)
  }

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
      <div className="flex gap-2 mb-3">
        <button
          type="button"
          onClick={() => switchMode('contain')}
          className={`text-[11.5px] font-medium rounded-full px-4 py-1.5 border transition-colors ${
            mode === 'contain'
              ? 'bg-blue-500 text-white border-blue-500'
              : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
          }`}
        >
          Бүтнээр багтаах
        </button>
        <button
          type="button"
          onClick={() => switchMode('cover')}
          className={`text-[11.5px] font-medium rounded-full px-4 py-1.5 border transition-colors ${
            mode === 'cover'
              ? 'bg-blue-500 text-white border-blue-500'
              : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
          }`}
        >
          Тайрч дүүргэх
        </button>
      </div>
      <div
        className="relative overflow-hidden rounded-xl bg-white border border-gray-200 cursor-grab active:cursor-grabbing touch-none select-none"
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

type GeoSuggestion = { label: string; lat?: number; lon?: number; placeId?: string }

// Google Maps API түлхүүр тавигдсан үед хайлт Google Places ашиглана,
// үгүй бол OpenStreetMap (Nominatim) дээр ажиллана.
const GOOGLE_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY as string | undefined

function AddressMap({ onPick }: { onPick: (addr: string, lat: number, lng: number) => void }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markerRef = useRef<L.CircleMarker | null>(null)
  const onPickRef = useRef(onPick)
  onPickRef.current = onPick

  const [query, setQuery] = useState('')
  const [sugs, setSugs] = useState<GeoSuggestion[]>([])
  const [searching, setSearching] = useState(false)
  const timerRef = useRef<number | undefined>(undefined)

  const placeMarker = (lat: number, lng: number) => {
    const map = mapRef.current
    if (!map) return
    if (markerRef.current) markerRef.current.setLatLng([lat, lng])
    else
      markerRef.current = L.circleMarker([lat, lng], {
        radius: 9,
        color: '#3b82f6',
        weight: 3,
        fillColor: '#3b82f6',
        fillOpacity: 0.5,
      }).addTo(map)
  }

  // Хайлтын autocomplete — Google түлхүүртэй бол Google Places, үгүй бол OSM
  const onQuery = (q: string) => {
    setQuery(q)
    window.clearTimeout(timerRef.current)
    if (q.trim().length < 3) {
      setSugs([])
      return
    }
    timerRef.current = window.setTimeout(async () => {
      setSearching(true)
      try {
        if (GOOGLE_KEY) {
          const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Goog-Api-Key': GOOGLE_KEY,
            },
            body: JSON.stringify({
              input: q,
              languageCode: 'mn',
              includedRegionCodes: ['MN'],
            }),
          })
          const j = await res.json()
          /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
          const items = (j.suggestions ?? []).map((s: any) => ({
            label: s.placePrediction?.text?.text ?? '',
            placeId: s.placePrediction?.placeId,
          }))
          setSugs(items.filter((s: GeoSuggestion) => s.label && s.placeId))
        } else {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=mn&accept-language=mn&limit=5&q=${encodeURIComponent(q)}`,
          )
          const j = await res.json()
          /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
          const items = (Array.isArray(j) ? j : []).map((s: any) => ({
            label: s.display_name as string,
            lat: Number(s.lat),
            lon: Number(s.lon),
          }))
          setSugs(items)
        }
      } catch {
        setSugs([])
      }
      setSearching(false)
    }, 450)
  }

  const pickSuggestion = async (s: GeoSuggestion) => {
    setSugs([])
    setQuery(s.label)
    let lat = s.lat
    let lng = s.lon
    if (s.placeId && GOOGLE_KEY) {
      try {
        const res = await fetch(
          `https://places.googleapis.com/v1/places/${s.placeId}?fields=location,formattedAddress`,
          { headers: { 'X-Goog-Api-Key': GOOGLE_KEY } },
        )
        const j = await res.json()
        lat = j.location?.latitude
        lng = j.location?.longitude
      } catch {
        /* details unavailable */
      }
    }
    if (lat == null || lng == null) return
    mapRef.current?.setView([lat, lng], 16)
    placeMarker(lat, lng)
    onPickRef.current(s.label, lat, lng)
  }

  useEffect(() => {
    if (!wrapRef.current || mapRef.current) return
    const map = L.map(wrapRef.current).setView([47.9184, 106.9177], 12) // Улаанбаатар
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19,
    }).addTo(map)
    mapRef.current = map

    map.on('click', async (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng
      placeMarker(lat, lng)
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
      <div className="relative mb-2 z-10">
        <label className="text-[12.5px] font-medium text-gray-700 flex items-center gap-1.5 mb-1.5">
          <MapPin size={13} /> Хаяг хайх
        </label>
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Ж: Хан-Уул, Zaisan Hill…"
          className="w-full rounded-xl bg-white px-4 py-2.5 text-[13px] text-gray-900 outline-none border border-gray-200 focus:border-blue-400 transition-colors"
        />
        {searching && (
          <Loader2 size={14} className="absolute right-3.5 top-[38px] animate-spin text-gray-400" />
        )}
        {sugs.length > 0 && (
          <ul className="absolute inset-x-0 top-full mt-1 rounded-xl bg-white border border-gray-200 shadow-lg overflow-hidden z-20">
            {sugs.map((s, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => pickSuggestion(s)}
                  className="w-full text-left px-4 py-2.5 text-[12.5px] text-gray-700 hover:bg-blue-50 flex items-start gap-2"
                >
                  <MapPin size={13} className="mt-0.5 shrink-0 text-gray-400" />
                  <span className="line-clamp-2">{s.label}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div ref={wrapRef} className="h-52 rounded-xl overflow-hidden relative z-0" />
      <p className="mt-1.5 text-[11px] text-gray-400 flex items-center gap-1">
        <MapPin size={11} /> Хайх эсвэл газрын зурган дээр дарж хаягаа сонгоно уу
      </p>
    </div>
  )
}

/* ---------------- aident.mn маягийн бүтээгдэхүүний карт ---------------- */

function ShopCard({ p, onView, onAdd }: { p: Product; onView: () => void; onAdd: () => void }) {
  return (
    <div
      onClick={onView}
      className="group relative flex cursor-pointer flex-col rounded-2xl bg-white p-3 transition-shadow hover:shadow-md"
    >
      <div className="relative mb-2.5 aspect-square overflow-hidden rounded-xl bg-gray-50">
        {p.image ? (
          <img
            src={p.image}
            alt={p.name}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <AutoVideo src="/video/ampm-hero.mp4" className="h-full w-full object-cover" />
        )}
        {p.badge && (
          <span className="absolute left-2 top-2 rounded-full bg-blue-500 px-2 py-0.5 text-[10px] font-bold text-white">
            {p.badge}
          </span>
        )}
      </div>
      <p className="line-clamp-2 text-[12.5px] leading-snug text-gray-700">{p.name}</p>
      <div className="mt-auto flex items-end justify-between pt-1.5">
        <p className="text-[14px] font-bold text-gray-900">{fmt(p.price)}</p>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onAdd()
          }}
          aria-label="Сагсанд нэмэх"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-500 text-white transition-colors hover:bg-blue-600"
        >
          <Plus size={15} />
        </button>
      </div>
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
  session,
  profile,
}: {
  open: boolean
  onClose: () => void
  cart: CartItem[]
  products: Product[]
  setQty: (id: string, qty: number) => void
  removeItem: (id: string) => void
  clearCart: () => void
  session: Session | null
  profile: Profile | null
}) {
  const [step, setStep] = useState<'cart' | 'checkout' | 'done' | 'qpay'>('cart')
  const [contact, setContact] = useState('')
  const [address, setAddress] = useState('')
  const [latLng, setLatLng] = useState<{ lat: number; lng: number } | null>(null)
  const [payMethod, setPayMethod] = useState<'transfer' | 'qpay'>('transfer')
  const [qpayData, setQpayData] = useState<QpayData | null>(null)
  const [doneNote, setDoneNote] = useState('')
  const [doneTotal, setDoneTotal] = useState(0)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) setStep('cart')
  }, [open])

  // Профайлын мэдээллээр урьдчилан бөглөнө
  useEffect(() => {
    if (step === 'checkout' && profile) {
      setContact((c) => c || profile.phone || profile.email || '')
      setAddress((a) => a || profile.address || '')
    }
  }, [step, profile])

  const lines = cart
    .map((c) => {
      const p = products.find((p) => p.id === c.id)
      return p ? { ...p, qty: c.qty } : null
    })
    .filter(Boolean) as (Product & { qty: number })[]

  const total = lines.reduce((s, l) => s + l.price * l.qty, 0)
  const grandTotal = total + (lines.length > 0 ? DELIVERY_FEE : 0)

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
      items: [
        ...lines.map((l) => ({ name: l.name, price: l.price, qty: l.qty })),
        { name: 'Хүргэлтийн төлбөр', price: DELIVERY_FEE, qty: 1 },
      ],
      total: grandTotal,
      contact: contact.trim(),
      address: address.trim(),
      lat: latLng?.lat ?? null,
      lng: latLng?.lng ?? null,
      payment_method: payMethod,
    }

    let orderId: string | null = null
    if (supabase) {
      let { data, error } = await supabase.from('orders').insert(order).select('id').single()
      // payment_method багана хараахан нэмэгдээгүй бол түүнгүйгээр хадгална
      if (error && /payment_method/i.test(error.message)) {
        const { payment_method: _omit, ...rest } = order
        void _omit
        ;({ data, error } = await supabase.from('orders').insert(rest).select('id').single())
      }
      if (error) {
        setBusy(false)
        setError('Захиалга илгээхэд алдаа гарлаа: ' + error.message)
        return
      }
      orderId = data?.id ? String(data.id) : null
    } else {
      orderId = `local-${Date.now()}`
      const local = loadJson<Order[]>(LOCAL_ORDERS_KEY, [])
      saveJson(LOCAL_ORDERS_KEY, [
        {
          ...order,
          id: orderId,
          status: 'new',
          created_at: new Date().toISOString(),
          paymentMethod: payMethod,
        },
        ...local,
      ])
    }

    setDoneTotal(grandTotal)
    clearCart()
    setContact('')
    setAddress('')
    setLatLng(null)

    if (payMethod === 'qpay' && supabase) {
      // QPay нэхэмжлэх үүсгэх (Edge Function тохируулагдсан үед)
      try {
        const { data, error } = await supabase.functions.invoke('qpay-invoice', {
          body: { amount: grandTotal, orderId, description: 'AM/PM захиалга' },
        })
        setBusy(false)
        if (error || data?.error) throw new Error(data?.error ?? error?.message)
        setQpayData(data as QpayData)
        setStep('qpay')
        return
      } catch {
        setDoneNote(
          'QPay түр ажиллахгүй байгаа тул доорх дансаар шилжүүлнэ үү. Захиалга тань бүртгэгдсэн.',
        )
        setStep('done')
        return
      }
    }

    setBusy(false)
    setDoneNote('')
    setStep('done')
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
            {step === 'cart'
              ? 'Таны сагс'
              : step === 'checkout'
                ? 'Захиалга өгөх'
                : step === 'qpay'
                  ? 'QPay төлбөр'
                  : 'Баярлалаа!'}
          </h3>
          <button onClick={onClose} aria-label="Хаах" className="text-gray-400 hover:text-gray-900">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {step === 'done' ? (
            <div className="flex flex-col items-center justify-center gap-3 py-6 text-center">
              <CheckCircle2 size={44} className="text-green-500" />
              <p className="text-[16px] font-semibold text-gray-900">Захиалга амжилттай илгээгдлээ!</p>
              {doneNote && <p className="text-[12.5px] text-amber-600 max-w-[280px]">{doneNote}</p>}
              <div className="mt-2 w-full max-w-[300px] rounded-2xl bg-white p-5 text-left">
                <p className="mb-3 text-[13px] font-semibold text-gray-900">Төлбөр шилжүүлэх данс</p>
                <div className="space-y-1.5 text-[13px] text-gray-700">
                  <p>🏦 {BANK_INFO.bank}</p>
                  <p>
                    Данс: <b>{BANK_INFO.account}</b>
                  </p>
                  <p>Хүлээн авагч: {BANK_INFO.holder}</p>
                  <p>
                    Дүн: <b className="text-blue-600">{fmt(doneTotal)}</b>
                  </p>
                </div>
                <p className="mt-3 border-t border-gray-100 pt-3 text-[11.5px] text-gray-500">
                  Гүйлгээний утга дээр өөрийн утасны дугаараа бичнэ үү. Төлбөр орж ирмэгц бид
                  холбогдож, хүргэлтийг баталгаажуулна.
                </p>
              </div>
              <button
                onClick={onClose}
                className="mt-3 rounded-full bg-blue-500 text-white text-[13px] font-medium px-7 py-2.5 hover:bg-blue-600 transition-colors"
              >
                Хаах
              </button>
            </div>
          ) : step === 'qpay' ? (
            <div className="flex flex-col items-center gap-4 py-4 text-center">
              <p className="text-[14px] font-semibold text-gray-900">
                Нийт төлөх дүн: <span className="text-blue-600">{fmt(doneTotal)}</span>
              </p>
              {qpayData?.qr_image && (
                <img
                  src={`data:image/png;base64,${qpayData.qr_image}`}
                  alt="QPay QR"
                  className="h-52 w-52 rounded-2xl bg-white p-3"
                />
              )}
              <p className="text-[12px] text-gray-500 max-w-[280px]">
                QR кодыг банкны аппаараа уншуулах эсвэл доороос банкаа сонгоход апп чинь нээгдэж
                төлбөр автоматаар бөглөгдөнө.
              </p>
              {qpayData?.urls && qpayData.urls.length > 0 && (
                <div className="grid w-full grid-cols-2 gap-2">
                  {qpayData.urls.map((u) => (
                    <a
                      key={u.name}
                      href={u.link}
                      className="flex items-center gap-2 rounded-xl bg-white px-3 py-2.5 text-left text-[12px] font-medium text-gray-800 hover:shadow-md transition-shadow"
                    >
                      {u.logo && <img src={u.logo} alt="" className="h-6 w-6 rounded" />}
                      <span className="truncate">{u.description ?? u.name}</span>
                    </a>
                  ))}
                </div>
              )}
              <button
                onClick={onClose}
                className="mt-2 rounded-full bg-blue-500 text-white text-[13px] font-medium px-7 py-2.5 hover:bg-blue-600 transition-colors"
              >
                Болсон
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
          ) : supabase && !session ? (
            /* Захиалга өгөхийн тулд нэвтрэх шаардлагатай */
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
              <Logo size={56} />
              <p className="text-[14.5px] font-semibold text-gray-900">Захиалга өгөхийн тулд нэвтэрнэ үү</p>
              <p className="text-[12.5px] text-gray-500 max-w-[260px]">
                Бүртгэлтэй бол мэдээлэл тань автоматаар бөглөгдөж, хямдрал урамшууллын мэдэгдэл авах
                боломжтой.
              </p>
              <a
                href="#login"
                onClick={onClose}
                className="rounded-full bg-blue-500 px-8 py-3 text-[14px] font-semibold text-white hover:bg-blue-600 transition-colors"
              >
                Нэвтрэх / Бүртгүүлэх
              </a>
            </div>
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

              {/* Төлбөрийн хэлбэр */}
              <div>
                <p className="mb-2 text-[12.5px] font-medium text-gray-700">Төлбөрийн хэлбэр</p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setPayMethod('transfer')}
                    className={`rounded-2xl border-2 bg-white p-4 text-left transition-colors ${
                      payMethod === 'transfer' ? 'border-blue-500' : 'border-transparent'
                    }`}
                  >
                    <span className="text-[18px]">🏦</span>
                    <p className="mt-1.5 text-[13px] font-semibold text-gray-900">Дансаар шилжүүлэх</p>
                    <p className="mt-0.5 text-[11px] text-gray-500">Банкны данс руу шилжүүлэг хийнэ</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPayMethod('qpay')}
                    className={`rounded-2xl border-2 bg-white p-4 text-left transition-colors ${
                      payMethod === 'qpay' ? 'border-blue-500' : 'border-transparent'
                    }`}
                  >
                    <span className="text-[18px]">📱</span>
                    <p className="mt-1.5 text-[13px] font-semibold text-gray-900">QPay</p>
                    <p className="mt-0.5 text-[11px] text-gray-500">Банкны аппаар шууд төлөх</p>
                  </button>
                </div>
              </div>

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
                <div className="flex justify-between text-[12.5px] text-gray-600 py-0.5">
                  <span className="flex items-center gap-1.5">
                    <Truck size={13} /> Хүргэлтийн төлбөр
                  </span>
                  <span>{fmt(DELIVERY_FEE)}</span>
                </div>
                <div className="flex justify-between text-[14px] font-bold text-gray-900 border-t border-gray-100 mt-2 pt-2">
                  <span>Нийт</span>
                  <span>{fmt(grandTotal)}</span>
                </div>
              </div>

              {error && <p className="text-[12.5px] text-red-500">{error}</p>}
            </form>
          )}
        </div>

        {step !== 'done' && step !== 'qpay' && lines.length > 0 && (
          <div className="border-t border-gray-200 px-6 py-5 bg-white">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[13px] text-gray-500">
                Нийт дүн{step === 'cart' && <span className="block text-[10.5px]">+ хүргэлт {fmt(DELIVERY_FEE)}</span>}
              </span>
              <span className="text-[18px] font-bold text-gray-900">
                {fmt(step === 'cart' ? total : grandTotal)}
              </span>
            </div>
            {step === 'cart' ? (
              <button
                onClick={() => setStep('checkout')}
                className="w-full rounded-full bg-blue-500 text-white text-[14px] font-semibold py-3 hover:bg-blue-600 transition-colors"
              >
                Захиалах
              </button>
            ) : supabase && !session ? null : (
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

/* ---------------- Нэвтрэлт / Бүртгэл ---------------- */

function LoginPage({ session }: { session: Session | null }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (session) window.location.hash = '#profile'
  }, [session])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!supabase) return
    setBusy(true)
    setError('')
    setInfo('')
    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      setBusy(false)
      if (error) setError('Имэйл эсвэл нууц үг буруу байна.')
      else window.location.hash = ''
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password })
      setBusy(false)
      if (error) {
        setError('Бүртгүүлэхэд алдаа гарлаа: ' + error.message)
      } else if (data.session) {
        await supabase
          .from('profiles')
          .upsert({ id: data.session.user.id, email, name: name.trim() || null })
        window.location.hash = ''
      } else {
        setInfo('Бүртгэл үүслээ! Имэйл хаягаа шалгаж баталгаажуулсны дараа нэвтэрнэ үү.')
      }
    }
  }

  if (!supabase) {
    return (
      <div className="min-h-screen bg-[#f0f0ee] flex items-center justify-center px-6">
        <p className="text-[13px] text-gray-500">Нэвтрэлт ажиллахын тулд Supabase тохируулга шаардлагатай.</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f0f0ee] px-6 py-10">
      <div className="mx-auto max-w-md">
        <a
          href="#"
          className="inline-flex items-center gap-2 text-[13px] font-medium text-blue-500 hover:text-blue-600 transition-colors mb-8"
        >
          <ArrowLeft size={15} /> Дэлгүүр рүү буцах
        </a>
        <div className="rounded-3xl bg-white p-7 shadow-sm">
          <div className="mb-6 flex flex-col items-center gap-2">
            <Logo size={56} />
            <h1 className="text-[17px] font-bold text-gray-900">AM/PM гишүүнчлэл</h1>
          </div>
          <div className="mb-6 grid grid-cols-2 rounded-full bg-gray-100 p-1">
            {(['login', 'signup'] as const).map((m) => (
              <button
                key={m}
                onClick={() => {
                  setMode(m)
                  setError('')
                  setInfo('')
                }}
                className={`rounded-full py-2 text-[13px] font-semibold transition-colors ${
                  mode === m ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                }`}
              >
                {m === 'login' ? 'Нэвтрэх' : 'Бүртгүүлэх'}
              </button>
            ))}
          </div>
          <form onSubmit={submit} className="flex flex-col gap-4">
            {mode === 'signup' && (
              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] font-medium text-gray-700">Нэр</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="rounded-xl bg-gray-50 px-4 py-2.5 text-[13px] outline-none border border-transparent focus:border-blue-400"
                />
              </label>
            )}
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-gray-700">Имэйл</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                className="rounded-xl bg-gray-50 px-4 py-2.5 text-[13px] outline-none border border-transparent focus:border-blue-400"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-gray-700">Нууц үг</span>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                className="rounded-xl bg-gray-50 px-4 py-2.5 text-[13px] outline-none border border-transparent focus:border-blue-400"
              />
            </label>
            {error && <p className="text-[12.5px] text-red-500">{error}</p>}
            {info && <p className="text-[12.5px] text-green-600">{info}</p>}
            <button
              type="submit"
              disabled={busy}
              className="mt-1 rounded-full bg-blue-500 py-3 text-[14px] font-semibold text-white hover:bg-blue-600 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {busy && <Loader2 size={15} className="animate-spin" />}
              {mode === 'login' ? 'Нэвтрэх' : 'Бүртгүүлэх'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

/* ---------------- Профайл ---------------- */

function ProfilePage({
  session,
  profile,
  reloadProfile,
  notifs,
  markAllRead,
  isAdmin,
}: {
  session: Session | null
  profile: Profile | null
  reloadProfile: () => Promise<void>
  notifs: Notif[]
  markAllRead: () => void
  isAdmin: boolean
}) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setName(profile?.name ?? '')
    setPhone(profile?.phone ?? '')
    setAddress(profile?.address ?? '')
  }, [profile])

  // Хуудас нээмэгц мэдэгдлүүдийг уншсан гэж тэмдэглэнэ
  useEffect(() => {
    markAllRead()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!session || !supabase) {
    return (
      <div className="min-h-screen bg-[#f0f0ee] flex flex-col items-center justify-center gap-4 px-6">
        <Logo size={56} />
        <p className="text-[14px] text-gray-600">Профайл харахын тулд нэвтэрнэ үү.</p>
        <a
          href="#login"
          className="rounded-full bg-blue-500 px-8 py-3 text-[14px] font-semibold text-white hover:bg-blue-600 transition-colors"
        >
          Нэвтрэх / Бүртгүүлэх
        </a>
      </div>
    )
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!supabase) return
    setBusy(true)
    await supabase.from('profiles').upsert({
      id: session.user.id,
      email: session.user.email,
      name: name.trim() || null,
      phone: phone.trim() || null,
      address: address.trim() || null,
    })
    await reloadProfile()
    setBusy(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div className="min-h-screen bg-[#f0f0ee] px-6 py-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 flex items-center justify-between">
          <a
            href="#"
            className="inline-flex items-center gap-2 text-[13px] font-medium text-blue-500 hover:text-blue-600 transition-colors"
          >
            <ArrowLeft size={15} /> Дэлгүүр рүү буцах
          </a>
          <button
            onClick={() => supabase?.auth.signOut().then(() => (window.location.hash = ''))}
            className="inline-flex items-center gap-2 text-[12.5px] text-gray-500 hover:text-red-500 transition-colors"
          >
            <LogOut size={14} /> Гарах
          </button>
        </div>

        <div className="mb-6 flex items-center gap-4">
          <Logo size={52} />
          <div>
            <h1 className="text-[1.3rem] font-bold text-gray-900">{profile?.name || 'Миний профайл'}</h1>
            <p className="text-[12.5px] text-gray-500">{session.user.email}</p>
          </div>
          {isAdmin && (
            <a
              href="#admin"
              className="ml-auto rounded-full bg-gray-900 px-4 py-2 text-[12px] font-semibold text-white"
            >
              Админ панель
            </a>
          )}
        </div>

        {/* Мэдээлэл засах */}
        <form onSubmit={save} className="mb-6 rounded-3xl bg-white p-6 sm:p-7">
          <h2 className="mb-4 text-[15px] font-semibold text-gray-900">Миний мэдээлэл</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-gray-700">Нэр</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="rounded-xl bg-gray-50 px-4 py-2.5 text-[13px] outline-none border border-transparent focus:border-blue-400"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-gray-700">Утас</span>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                inputMode="tel"
                className="rounded-xl bg-gray-50 px-4 py-2.5 text-[13px] outline-none border border-transparent focus:border-blue-400"
              />
            </label>
            <label className="flex flex-col gap-1.5 sm:col-span-2">
              <span className="text-[12px] font-medium text-gray-700">Гэрийн хаяг</span>
              <textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                rows={2}
                className="rounded-xl bg-gray-50 px-4 py-2.5 text-[13px] outline-none border border-transparent focus:border-blue-400 resize-none"
              />
            </label>
          </div>
          {saved && <p className="mt-3 text-[12.5px] text-green-600">Хадгалагдлаа ✓</p>}
          <button
            type="submit"
            disabled={busy}
            className="mt-5 rounded-full bg-blue-500 px-7 py-2.5 text-[13px] font-semibold text-white hover:bg-blue-600 transition-colors disabled:opacity-60 inline-flex items-center gap-2"
          >
            {busy && <Loader2 size={14} className="animate-spin" />} Хадгалах
          </button>
          <p className="mt-3 text-[11.5px] text-gray-400">
            Энэ мэдээлэл захиалга өгөхөд автоматаар бөглөгдөнө.
          </p>
        </form>

        {/* Мэдэгдлүүд */}
        <div className="rounded-3xl bg-white p-6 sm:p-7">
          <h2 className="mb-4 flex items-center gap-2 text-[15px] font-semibold text-gray-900">
            <Bell size={16} className="text-blue-500" /> Мэдэгдэл ({notifs.length})
          </h2>
          {notifs.length === 0 ? (
            <p className="text-[13px] text-gray-500">Одоогоор мэдэгдэл алга.</p>
          ) : (
            <ul className="space-y-3">
              {notifs.map((n) => (
                <li key={n.id} className="rounded-2xl bg-gray-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-[13.5px] font-semibold text-gray-900">
                      {n.user_id === null && '📢 '}
                      {n.title}
                    </p>
                    <span className="shrink-0 text-[10.5px] text-gray-400">
                      {new Date(n.created_at).toLocaleDateString('mn-MN')}
                    </span>
                  </div>
                  {n.body && <p className="mt-1 text-[12.5px] leading-relaxed text-gray-600">{n.body}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
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
  const [tab, setTab] = useState<'orders' | 'products' | 'users'>('orders')
  const [orders, setOrders] = useState<Order[]>([])
  const [ordersError, setOrdersError] = useState('')
  const [users, setUsers] = useState<Profile[]>([])
  const [usersError, setUsersError] = useState('')
  const [notifTarget, setNotifTarget] = useState<Profile | 'all' | null>(null)
  const [notifTitle, setNotifTitle] = useState('')
  const [notifBody, setNotifBody] = useState('')
  const [notifSent, setNotifSent] = useState(false)
  const [notifBusy, setNotifBusy] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  const [notifOn, setNotifOn] = useState(
    typeof Notification !== 'undefined' && Notification.permission === 'granted',
  )

  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [price, setPrice] = useState('')
  const [badge, setBadge] = useState('')
  const [category, setCategory] = useState('')
  const [imageRaw, setImageRaw] = useState<string | undefined>()
  const [image, setImage] = useState<string | undefined>()
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  const onAdjusted = useCallback((out: string) => setImage(out), [])

  const resetForm = () => {
    setEditingId(null)
    setName('')
    setDesc('')
    setPrice('')
    setBadge('')
    setCategory('')
    setImage(undefined)
    setImageRaw(undefined)
    setError('')
  }

  const startEdit = (p: Product) => {
    setEditingId(p.id)
    setName(p.name)
    setDesc(p.desc)
    setPrice(String(p.price))
    setBadge(p.badge ?? '')
    setCategory(p.category ?? '')
    setImage(p.image) // шинэ зураг сонгохгүй бол хуучин зураг хэвээр үлдэнэ
    setImageRaw(undefined)
    setError('')
    setTab('products')
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

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

  // Хэрэглэгчдийн жагсаалт
  useEffect(() => {
    if (!supabase || !session || tab !== 'users') return
    supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error)
          setUsersError(
            'Хэрэглэгчид ачаалагдсангүй — supabase/users-notifications.sql-ийг ажиллуулсан эсэхээ шалгана уу. (' +
              error.message +
              ')',
          )
        else {
          setUsersError('')
          setUsers((data ?? []) as Profile[])
        }
      })
  }, [tab, session])

  const sendNotif = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!supabase || !notifTarget || !notifTitle.trim()) return
    setNotifBusy(true)
    const { error } = await supabase.from('notifications').insert({
      user_id: notifTarget === 'all' ? null : notifTarget.id,
      title: notifTitle.trim(),
      body: notifBody.trim(),
    })
    setNotifBusy(false)
    if (!error) {
      setNotifTitle('')
      setNotifBody('')
      setNotifTarget(null)
      setNotifSent(true)
      setTimeout(() => setNotifSent(false), 3000)
    } else {
      setUsersError('Мэдэгдэл илгээхэд алдаа: ' + error.message)
    }
  }

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

    const fields: Record<string, unknown> = {
      name: name.trim(),
      descr: desc.trim() || 'AM/PM цуглуулгын бүтээгдэхүүн.',
      price: p,
      badge: badge.trim() || null,
      image: image || null,
      category: category.trim() || null,
    }

    let notice = ''
    if (usingDb && supabase) {
      const save = (f: Record<string, unknown>) =>
        editingId
          ? supabase!.from('products').update(f).eq('id', editingId)
          : supabase!.from('products').insert(f)
      let { error } = await save(fields)
      // category багана хараахан нэмэгдээгүй DB дээр ч ажиллана
      if (error && /category/i.test(error.message)) {
        const { category: _omit, ...rest } = fields
        void _omit
        ;({ error } = await save(rest))
        if (!error && category.trim()) {
          notice = 'Анхаар: ангилал хадгалагдсангүй — supabase/add-category.sql-ийг SQL Editor дээр ажиллуулна уу.'
        }
      }
      setBusy(false)
      if (error) {
        setError('Хадгалахад алдаа гарлаа: ' + error.message)
        return
      }
      await reloadProducts()
    } else {
      const product: Product = {
        id: editingId ?? `custom-${Date.now()}`,
        name: fields.name as string,
        desc: fields.descr as string,
        price: p,
        badge: (fields.badge as string | null) ?? undefined,
        image,
        category: category.trim() || undefined,
      }
      const next = editingId
        ? products.map((x) => (x.id === editingId ? product : x))
        : [...products, product]
      if (!saveJson(LOCAL_PRODUCTS_KEY, next)) {
        setBusy(false)
        setError('Хадгалах боломжгүй (зураг хэт том байж магадгүй).')
        return
      }
      await reloadProducts()
      setBusy(false)
    }

    resetForm()
    if (notice) setError(notice)
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
          <Logo size={44} />
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
          <button
            onClick={() => setTab('users')}
            className={`inline-flex items-center gap-2 text-[13px] font-medium rounded-full px-5 py-2.5 transition-colors ${
              tab === 'users' ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:text-gray-900'
            }`}
          >
            <Bell size={14} /> Хэрэглэгчид
          </button>
        </div>

        {tab === 'users' ? (
          <div className="rounded-3xl p-6 sm:p-8" style={{ backgroundColor: '#EDEDED' }}>
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-[15px] font-semibold text-gray-900">Хэрэглэгчид ({users.length})</h2>
              <button
                onClick={() => setNotifTarget('all')}
                className="inline-flex items-center gap-2 text-[12px] font-medium text-white bg-blue-500 rounded-full px-4 py-2 hover:bg-blue-600 transition-colors"
              >
                <Bell size={13} /> Бүгдэд мэдэгдэл илгээх
              </button>
            </div>
            {usersError && <p className="mb-4 text-[12.5px] text-red-500">{usersError}</p>}
            {notifSent && <p className="mb-4 text-[12.5px] text-green-600">Мэдэгдэл илгээгдлээ ✓</p>}

            {/* Мэдэгдэл илгээх маягт */}
            {notifTarget && (
              <form onSubmit={sendNotif} className="mb-6 rounded-2xl bg-white p-5">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-[13px] font-semibold text-gray-900">
                    {notifTarget === 'all'
                      ? '📢 Бүх хэрэглэгчид илгээх'
                      : `Хүлээн авагч: ${notifTarget.name || notifTarget.email || notifTarget.phone}`}
                  </p>
                  <button type="button" onClick={() => setNotifTarget(null)} className="text-gray-400 hover:text-gray-700">
                    <X size={15} />
                  </button>
                </div>
                <input
                  value={notifTitle}
                  onChange={(e) => setNotifTitle(e.target.value)}
                  placeholder="Гарчиг (Ж: 20% хямдрал эхэллээ!)"
                  className="mb-3 w-full rounded-xl bg-gray-50 px-4 py-2.5 text-[13px] outline-none border border-transparent focus:border-blue-400"
                />
                <textarea
                  value={notifBody}
                  onChange={(e) => setNotifBody(e.target.value)}
                  rows={3}
                  placeholder="Дэлгэрэнгүй мэдээлэл, урамшууллын нөхцөл…"
                  className="mb-3 w-full rounded-xl bg-gray-50 px-4 py-2.5 text-[13px] outline-none border border-transparent focus:border-blue-400 resize-none"
                />
                <button
                  type="submit"
                  disabled={notifBusy || !notifTitle.trim()}
                  className="inline-flex items-center gap-2 rounded-full bg-blue-500 px-6 py-2.5 text-[13px] font-semibold text-white hover:bg-blue-600 transition-colors disabled:opacity-50"
                >
                  {notifBusy ? <Loader2 size={14} className="animate-spin" /> : <Bell size={14} />} Илгээх
                </button>
              </form>
            )}

            {users.length === 0 && !usersError ? (
              <p className="text-[13px] text-gray-500">Одоогоор бүртгэлтэй хэрэглэгч алга.</p>
            ) : (
              <ul className="space-y-3">
                {users.map((u) => (
                  <li key={u.id} className="flex items-center gap-4 bg-white rounded-2xl p-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[14px] font-bold text-gray-600">
                      {(u.name || u.email || '?').slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-semibold text-gray-900">
                        {u.name || 'Нэргүй хэрэглэгч'}
                      </p>
                      <p className="truncate text-[12px] text-gray-500">
                        {[u.email, u.phone].filter(Boolean).join(' · ') || '—'}
                      </p>
                      {u.address && <p className="truncate text-[11.5px] text-gray-400">📍 {u.address}</p>}
                    </div>
                    <button
                      onClick={() => setNotifTarget(u)}
                      className="shrink-0 inline-flex items-center gap-1.5 text-[11.5px] font-medium text-blue-600 border border-blue-300 rounded-full px-3.5 py-1.5 hover:bg-blue-50 transition-colors"
                    >
                      <Bell size={12} /> Мэдэгдэл
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : tab === 'orders' ? (
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
                          {o.paymentMethod && (
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600">
                              {o.paymentMethod === 'qpay' ? 'QPay' : 'Шилжүүлэг'}
                            </span>
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
            <form
              ref={formRef}
              onSubmit={submitProduct}
              className="rounded-3xl p-6 sm:p-8 mb-6"
              style={{ backgroundColor: '#EDEDED' }}
            >
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-[15px] font-semibold text-gray-900 flex items-center gap-2">
                  <Plus size={16} className="text-blue-500" />{' '}
                  {editingId ? 'Бүтээгдэхүүн засварлах' : 'Шинэ бүтээгдэхүүн'}
                </h2>
                {editingId && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="text-[12px] text-gray-500 hover:text-red-500 transition-colors"
                  >
                    ✕ Засварыг болих
                  </button>
                )}
              </div>
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
                  <span className="text-[12px] font-medium text-gray-700">Ангилал (сонголтоор)</span>
                  <input
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="Ж: Сойз, Хүүхдийн, Иж бүрдэл…"
                    list="category-suggestions"
                    className="rounded-xl bg-white px-4 py-2.5 text-[13px] text-gray-900 outline-none border border-transparent focus:border-blue-400 transition-colors"
                  />
                  <datalist id="category-suggestions">
                    {[...new Set(products.map((p) => p.category).filter(Boolean))].map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[12px] font-medium text-gray-700">Badge (сонголтоор)</span>
                  <input
                    value={badge}
                    onChange={(e) => setBadge(e.target.value)}
                    placeholder="Ж: Шинэ, Онцлох"
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
              {!imageRaw && editingId && image && (
                <div className="mt-4">
                  <p className="text-[11.5px] text-gray-500 mb-1.5">Одоогийн зураг (солих бол шинэ файл сонгоно):</p>
                  <img src={image} alt="Одоогийн зураг" className="h-24 rounded-xl object-cover" />
                </div>
              )}
              {error && <p className="mt-4 text-[12.5px] text-red-500">{error}</p>}
              {saved && <p className="mt-4 text-[12.5px] text-green-600">Хадгалагдлаа ✓</p>}
              <button
                type="submit"
                disabled={busy}
                className="mt-6 inline-flex items-center gap-2 text-[13px] font-medium text-white bg-blue-500 rounded-full px-6 py-2.5 hover:bg-blue-600 transition-colors disabled:opacity-60"
              >
                {busy ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}{' '}
                {editingId ? 'Хадгалах' : 'Нэмэх'}
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
                        onClick={() => startEdit(p)}
                        className="shrink-0 text-[11.5px] font-medium text-blue-600 border border-blue-300 rounded-full px-3 py-1 hover:bg-blue-50 transition-colors"
                      >
                        Засах
                      </button>
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
  const [menuOpen, setMenuOpen] = useState(false)
  const [viewProduct, setViewProduct] = useState<Product | null>(null)
  const [activeCat, setActiveCat] = useState('all')
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(!!supabase)
  const [loadError, setLoadError] = useState('')
  const [route, setRoute] = useState(window.location.hash)
  const [session, setSession] = useState<Session | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [notifs, setNotifs] = useState<Notif[]>([])
  const [seenIds, setSeenIds] = useState<string[]>(() => loadJson<string[]>(SEEN_NOTIFS_KEY, []))
  const wide = useWideViewport()

  const unreadCount = notifs.filter((n) => (n.user_id ? !n.read : !seenIds.includes(n.id))).length

  const reloadProfile = useCallback(async () => {
    if (!supabase) return
    const { data: s } = await supabase.auth.getSession()
    const uid = s.session?.user.id
    if (!uid) return
    const { data, error } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle()
    if (!error) {
      if (data) setProfile(data as Profile)
      else {
        await supabase.from('profiles').upsert({ id: uid, email: s.session?.user.email })
        setProfile({ id: uid, email: s.session?.user.email })
      }
    }
  }, [])

  const reloadNotifs = useCallback(async () => {
    if (!supabase) return
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)
    if (!error) setNotifs((data ?? []) as Notif[])
  }, [])

  const markAllRead = useCallback(() => {
    if (!supabase || !session) return
    const uid = session.user.id
    supabase.from('notifications').update({ read: true }).eq('user_id', uid).eq('read', false)
    setNotifs((prev) => prev.map((n) => (n.user_id === uid ? { ...n, read: true } : n)))
    setSeenIds(() => {
      const next = [...new Set([...loadJson<string[]>(SEEN_NOTIFS_KEY, []), ...notifs.map((n) => n.id)])]
      saveJson(SEEN_NOTIFS_KEY, next)
      return next
    })
  }, [session, notifs])

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

  // Нэвтэрсэн хэрэглэгчийн эрх, профайл, мэдэгдэл
  useEffect(() => {
    if (!supabase || !session) {
      setIsAdmin(false)
      setProfile(null)
      setNotifs([])
      return
    }
    supabase
      .from('admins')
      .select('user_id')
      .eq('user_id', session.user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        // admins хүснэгт үүсээгүй бол хуучин горим: нэвтэрсэн хүн админ
        setIsAdmin(error ? true : !!data)
      })
    reloadProfile()
    reloadNotifs()
    const ch = supabase
      .channel('user-notifs')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, (p) => {
        setNotifs((prev) => [p.new as Notif, ...prev])
      })
      .subscribe()
    return () => {
      supabase?.removeChannel(ch)
    }
  }, [session, reloadProfile, reloadNotifs])

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

  const categories = [...new Set(products.map((p) => p.category).filter(Boolean))] as string[]
  const filtered = activeCat === 'all' ? products : products.filter((p) => p.category === activeCat)
  const featured = products.filter((p) => p.badge)

  if (route === '#login') {
    return <LoginPage session={session} />
  }

  if (route === '#profile') {
    return (
      <ProfilePage
        session={session}
        profile={profile}
        reloadProfile={reloadProfile}
        notifs={notifs}
        markAllRead={markAllRead}
        isAdmin={isAdmin}
      />
    )
  }

  if (route === '#admin') {
    if (supabase && session && !isAdmin) {
      return (
        <div className="min-h-screen bg-[#f0f0ee] flex flex-col items-center justify-center gap-4 px-6">
          <Logo size={56} />
          <p className="text-[14px] text-gray-600">Танд админ эрх байхгүй байна.</p>
          <a href="#" className="text-[13px] text-blue-500 underline underline-offset-4">
            Дэлгүүр рүү буцах
          </a>
        </div>
      )
    }
    return <AdminPanel products={products} reloadProducts={reloadProducts} session={session} />
  }

  return (
    <div className="relative min-h-screen bg-[#f0f0ee]">
      {/* ---------- Fixed navbar ---------- */}
      {/* aident.mn маягийн цагаан header бар */}
      <nav className="fixed top-0 inset-x-0 z-50 px-3 sm:px-6 pt-3">
        <div className="mx-auto flex max-w-6xl items-center gap-3 rounded-2xl bg-white px-4 py-2.5 shadow-md">
          <a href="#" className="flex items-center gap-2.5 shrink-0">
            <Logo size={40} />
            <span className="text-[14px] sm:text-[15px] font-bold text-gray-900 whitespace-nowrap">
              AM/PM шүдний сойз
            </span>
          </a>

          <div className="hidden lg:flex items-center gap-7 mx-auto">
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="text-[13.5px] font-medium text-gray-600 hover:text-gray-900 transition-colors duration-200"
              >
                {link.label}
              </a>
            ))}
          </div>

          <div className="ml-auto lg:ml-0 flex items-center gap-1.5">
            {session && (
              <a
                href="#profile"
                className="relative flex items-center justify-center rounded-full w-10 h-10 hover:bg-gray-100 transition-colors"
                aria-label="Мэдэгдэл"
              >
                <Bell size={18} className="text-gray-700" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold">
                    {unreadCount}
                  </span>
                )}
              </a>
            )}
            <a
              href={session ? '#profile' : '#login'}
              className="flex items-center justify-center rounded-full w-10 h-10 hover:bg-gray-100 transition-colors"
              aria-label={session ? 'Профайл' : 'Нэвтрэх'}
            >
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="1.7">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
              </svg>
            </a>
            <button
              onClick={() => setCartOpen(true)}
              className="relative flex items-center justify-center rounded-full w-10 h-10 hover:bg-gray-100 transition-colors"
              aria-label="Сагс"
            >
              <ShoppingBag size={19} className="text-gray-700" />
              {cartCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-blue-500 text-white text-[10px] font-semibold">
                  {cartCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setMenuOpen(true)}
              className="flex lg:hidden items-center justify-center rounded-full w-10 h-10 hover:bg-gray-100 transition-colors"
              aria-label="Цэс"
            >
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="1.8">
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            </button>
          </div>
        </div>
      </nav>

      {/* ---------- Mobile fullscreen menu ---------- */}
      {menuOpen && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-[#f0f0ee] lg:hidden">
          <div className="flex items-center justify-between px-5 py-5">
            <div className="flex items-center gap-2.5">
              <Logo size={40} />
              <span className="text-[14px] font-semibold text-gray-900">AM/PM</span>
            </div>
            <button
              onClick={() => setMenuOpen(false)}
              aria-label="Хаах"
              className="flex items-center justify-center rounded-full w-10 h-10"
              style={{ backgroundColor: '#EDEDED' }}
            >
              <X size={18} className="text-gray-700" />
            </button>
          </div>
          <nav className="flex flex-1 flex-col justify-center gap-1 px-8">
            {navLinks.map((link, i) => (
              <a
                key={link.label}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className="flex items-center justify-between py-4 border-b border-gray-200 text-[19px] font-medium text-gray-900"
              >
                {link.label}
                <span className="text-gray-300 text-[15px]">0{i + 1}</span>
              </a>
            ))}
            <button
              onClick={() => {
                setMenuOpen(false)
                setCartOpen(true)
              }}
              className="mt-8 inline-flex items-center justify-center gap-2 rounded-full bg-blue-500 text-white text-[14px] font-semibold py-3.5"
            >
              <ShoppingBag size={16} /> Сагс харах {cartCount > 0 && `(${cartCount})`}
            </button>
            <a
              href={session ? '#profile' : '#login'}
              onClick={() => setMenuOpen(false)}
              className="mt-3 inline-flex items-center justify-center gap-2 rounded-full border border-gray-300 text-gray-800 text-[14px] font-semibold py-3.5"
            >
              {session ? '👤 Миний профайл' : 'Нэвтрэх / Бүртгүүлэх'}
            </a>
          </nav>
          <p className="pb-8 text-center text-[11.5px] text-gray-400">Өглөөний цэнгэг. Оройн арчилгаа.</p>
        </div>
      )}

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
          <div className="flex-1 flex items-end justify-center sm:justify-start pb-12 sm:pb-16 lg:pb-20 px-6 sm:px-12 md:px-20 lg:px-28">
            <div className="max-w-xs text-center sm:text-left">
              <a
                href="#products"
                className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-blue-400 hover:text-blue-300 transition-colors mb-3 group"
              >
                AM/PM — шинэ цуглуулга{' '}
                <span className="inline-block transition-transform duration-200 group-hover:translate-x-0.5">→</span>
              </a>
              <h1 className="text-[1.4rem] sm:text-[1.75rem] leading-[1.2] font-medium text-white tracking-tight mb-3">
                Инээмсэглэлээ хайрладаг хүмүүст зориулсан энгийн, ухаалаг арчилгаа.
              </h1>
              <p className="text-[13px] text-gray-300 font-normal">Өдөр бүрээ цэнгэг эхлүүл. Доош гүйлгэж танилцана уу.</p>
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

      {/* ---------- Brand showcase: хар-алтлаг брэндийн хуудсууд ---------- */}
      <section id="about" className="bg-[#0b0a09] py-20 sm:py-28">
        <div className="mx-auto max-w-5xl px-6 sm:px-10 space-y-24 sm:space-y-32">
          {/* A — Ялгаатай гялбаа */}
          <Reveal>
            <GoldHeading line1="Ялгаатай гялбаа." line2="Мэдрэгдэх чанар." />
            <div className="mt-6 flex justify-center">
              <span className="rounded-full border border-[#d9b483]/60 px-5 py-2 text-[11.5px] sm:text-[12.5px] text-[#e8cfa4] text-center">
                Металл бүрэлт&nbsp;·&nbsp;Дээд зэрэглэлийн хайрцаг&nbsp;·&nbsp;Зөөлөн хялгас
              </span>
            </div>
            <div className="mt-10 overflow-hidden rounded-3xl">
              <img
                src="/img/pdf10-2.jpg"
                alt="AM/PM мөнгөлөг ба ягаан алт сойз"
                className="w-full h-[480px] sm:h-[640px] object-contain"
                loading="lazy"
              />
            </div>
          </Reveal>

          {/* B — Чанарын баталгаа */}
          <Reveal>
            <GoldHeading line1="Уран дархны сэтгэл." line2="Чанарын баталгаа." />
            <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-5">
              {qualityCards.map((c) => (
                <div
                  key={c.no}
                  className="rounded-[1.8rem] bg-gradient-to-b from-[#2e2b28] to-[#171513] p-8 sm:p-10 text-center border border-white/5"
                >
                  <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-[#d9b483]/60">
                    {c.icon}
                  </div>
                  <h3 className="mt-6 text-[15px] font-semibold text-[#d9b483] leading-snug">{c.title}</h3>
                  <p className="mt-2.5 text-[12.5px] leading-relaxed text-white/55">{c.desc}</p>
                  <span className="mt-5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#d9b483] text-[10.5px] font-bold text-[#171513]">
                    {c.no}
                  </span>
                </div>
              ))}
            </div>
          </Reveal>

          {/* C — Алтлаг панель */}
          <Reveal>
            <GoldHeading line1="Буйлыг зөөлөн хамгаалж," line2="нарийн гүн цэвэрлэгээ" />
            <p className="mt-4 text-center text-[13px] text-white/55">
              Шүд хоорондын зайг үр дүнтэй цэвэрлэхийн зэрэгцээ буйлаа хамгаална
            </p>
            <div className="relative mt-10 overflow-hidden rounded-[2rem] bg-gradient-to-b from-[#efd7ab] via-[#dcc08d] to-[#b6905f] p-6 sm:p-10">
              <div className="relative mx-auto max-w-sm">
                <img
                  src="/img/pdf09-1.jpg"
                  alt="AM/PM сойзны нарийн хялгас"
                  className="w-full rounded-2xl shadow-2xl"
                  loading="lazy"
                />
                <span className="absolute left-2 top-[16%] sm:-left-10 rounded-full bg-gradient-to-r from-[#f4e3bd] to-[#dcc08d] px-4 py-2 text-[11px] font-semibold text-[#4a3a24] shadow-lg">
                  0.152мм давхар үзүүрт утас
                </span>
                <span className="absolute right-2 bottom-[24%] sm:-right-10 rounded-full bg-gradient-to-r from-[#f4e3bd] to-[#dcc08d] px-4 py-2 text-[11px] font-semibold text-[#4a3a24] shadow-lg">
                  Тансаг бүрэлттэй бариул
                </span>
              </div>
            </div>
          </Reveal>

          {/* D — 0.01мм үзүүр */}
          <Reveal>
            <h2 className="text-center leading-tight">
              <span className="block font-bold text-[2rem] sm:text-[2.6rem] text-[#d9b483]">0.01мм*</span>
              <span className="block font-semibold text-[1.4rem] sm:text-[1.9rem] text-[#e8cfa4]">
                Үзүүрийн диаметр
              </span>
            </h2>
            <p className="mx-auto mt-4 max-w-md text-center text-[13px] leading-relaxed text-white/55">
              Шүд хоорондын завсарт гүн нэвтэрч, шүд болон буйлан дээрх өнгөрийг гүнзгий цэвэрлэнэ.
            </p>
            <div className="mx-auto mt-10 max-w-2xl">
              <div className="flex justify-between text-[11.5px] text-white/70 px-2">
                <span>Үзүүр &lt; 0.1мм ▾</span>
                <span>Диаметр &lt; 0.15мм ▾</span>
              </div>
              <svg viewBox="0 0 600 190" className="mt-2 w-full" aria-hidden>
                <path
                  d="M 20 30 C 320 22, 560 30, 570 85 C 578 145, 340 158, 20 150"
                  fill="none"
                  stroke="#f5f0e8"
                  strokeWidth="4"
                  strokeLinecap="round"
                />
                <path
                  d="M 20 42 C 300 36, 540 44, 548 85 C 554 132, 320 146, 20 138"
                  fill="none"
                  stroke="#f5f0e8"
                  strokeWidth="1.5"
                  opacity="0.5"
                />
              </svg>
              <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-2xl border border-[#d9b483]/25 bg-white/[0.03] p-5 text-center">
                  <p className="text-[12.5px] font-semibold text-[#e8cfa4]">0.01мм давхар үзүүрт утас</p>
                  <p className="mt-1.5 text-[11.5px] leading-relaxed text-white/50">
                    Шүдний завсарт гүн нэвтэрч, ширхэг бүрээрээ цэвэрлэнэ
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-center">
                  <p className="text-[12.5px] font-semibold text-white/70">Энгийн зүлгүүрийн хялгас</p>
                  <p className="mt-1.5 text-[11.5px] leading-relaxed text-white/40">
                    Буйлыг гэмтээж, өнгөрийн үлдэгдэл үлдээдэг
                  </p>
                </div>
              </div>
            </div>
          </Reveal>

          {/* E — Бүтээгдэхүүний мэдээлэл */}
          <Reveal>
            <h2 className="text-center text-[1.5rem] sm:text-[2rem] font-bold tracking-wide text-white">
              БҮТЭЭГДЭХҮҮНИЙ МЭДЭЭЛЭЛ
            </h2>
            <div className="mt-10 grid grid-cols-1 sm:grid-cols-[1fr_1.3fr] items-center gap-8 sm:gap-12">
              <div className="overflow-hidden rounded-3xl">
                <img
                  src="/img/pdf10-1.jpg"
                  alt="AM/PM ягаан алт сойз"
                  className="w-full h-[420px] sm:h-[560px] object-contain"
                  loading="lazy"
                />
              </div>
              <dl>
                {specs.map((s) => (
                  <div
                    key={s.label}
                    className="flex items-baseline justify-between gap-4 border-b border-dotted border-white/15 py-3"
                  >
                    <dt className="text-[12.5px] text-white/50">* {s.label}</dt>
                    <dd className="text-[13.5px] font-semibold text-white text-right">{s.value}</dd>
                  </div>
                ))}
                <p className="mt-4 text-[10.5px] text-white/35">
                  Бүтээгдэхүүний хэмжээг гараар хэмжсэн тул бага зэргийн зөрүү гарч болно.
                </p>
              </dl>
            </div>
          </Reveal>

          {/* F — Амьдралын хэв маяг */}
          <Reveal>
            <div className="relative mx-auto max-w-2xl overflow-hidden rounded-3xl">
              <img
                src="/img/pdf09-3.jpg"
                alt="AM/PM хэрэглэгч"
                className="w-full h-auto"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-7 sm:p-10 text-center">
                <p className="font-light text-[1.3rem] sm:text-[1.8rem] leading-snug text-[#e8cfa4]">
                  Инээмсэглэл бүрд — <span className="font-semibold text-white">AM/PM</span>
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---------- Products: aident.mn маягийн дэлгүүр ---------- */}
      <section id="products" className="mx-auto max-w-6xl px-4 sm:px-8 py-16 sm:py-24">
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
          <div className="rounded-3xl bg-white p-10 text-center">
            <Package size={30} className="mx-auto text-gray-400 mb-3" />
            <p className="text-[14px] text-gray-600">Бүтээгдэхүүн удахгүй нэмэгдэнэ.</p>
          </div>
        )}

        {/* Ангилал — зурагтай картууд */}
        {categories.length > 0 && (
          <div className="mb-14">
            <h2 className="mb-6 text-center text-[1.35rem] font-bold text-gray-900">Ангилал</h2>
            <div className="flex gap-3 overflow-x-auto pb-3">
              <button
                onClick={() => setActiveCat('all')}
                className={`w-[110px] sm:w-[130px] shrink-0 rounded-2xl bg-white p-2.5 transition-shadow hover:shadow-md ${
                  activeCat === 'all' ? 'ring-2 ring-gray-900' : ''
                }`}
              >
                <div className="mb-2 flex aspect-square items-center justify-center rounded-xl bg-gray-900">
                  <Logo size={52} />
                </div>
                <p className="text-center text-[11.5px] font-medium text-gray-700">Бүгд</p>
              </button>
              {categories.map((c) => {
                const rep = products.find((p) => p.category === c)
                return (
                  <button
                    key={c}
                    onClick={() => setActiveCat(c)}
                    className={`w-[110px] sm:w-[130px] shrink-0 rounded-2xl bg-white p-2.5 transition-shadow hover:shadow-md ${
                      activeCat === c ? 'ring-2 ring-gray-900' : ''
                    }`}
                  >
                    <div className="mb-2 aspect-square overflow-hidden rounded-xl bg-gray-50">
                      {rep?.image ? (
                        <img src={rep.image} alt={c} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <Package size={22} className="text-gray-300" />
                        </div>
                      )}
                    </div>
                    <p className="line-clamp-2 text-center text-[11.5px] font-medium leading-snug text-gray-700">
                      {c}
                    </p>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Онцлох */}
        {activeCat === 'all' && featured.length > 0 && (
          <div className="mb-14">
            <h2 className="mb-6 text-center text-[1.35rem] font-bold text-gray-900">Онцлох</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {featured.map((p) => (
                <ShopCard key={p.id} p={p} onView={() => setViewProduct(p)} onAdd={() => addToCart(p.id)} />
              ))}
            </div>
          </div>
        )}

        {/* Бүх бүтээгдэхүүн / сонгосон ангилал */}
        {products.length > 0 && (
          <div>
            <h2 className="mb-6 text-center text-[1.35rem] font-bold text-gray-900">
              {activeCat === 'all' ? 'Бүх бүтээгдэхүүн' : activeCat}
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {filtered.map((p) => (
                <ShopCard key={p.id} p={p} onView={() => setViewProduct(p)} onAdd={() => addToCart(p.id)} />
              ))}
            </div>
          </div>
        )}

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
              <Logo size={36} />
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
        session={session}
        profile={profile}
      />
    </div>
  )
}

export default App
