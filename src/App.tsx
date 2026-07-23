import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
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
  Trash2,
  ArrowLeft,
  ImagePlus,
  LogIn,
  LogOut,
  Loader2,
  Database,
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

/* ---------------- data ---------------- */

type Product = {
  id: string
  name: string
  desc: string
  price: number
  badge?: string
  image?: string
}

const DEFAULT_PRODUCTS: Product[] = [
  {
    id: 'duo',
    name: 'AM/PM хос иж бүрдэл',
    desc: 'Өглөө, оройн хосолсон арчилгааны иж бүрдэл.',
    price: 139000,
    badge: 'Эрэлттэй',
  },
  { id: 'am', name: 'AM сойз', desc: 'Өглөөний цэнгэг мэдрэмжид зориулсан сойз.', price: 69000 },
  { id: 'pm', name: 'PM сойз', desc: 'Оройн тайван арчилгаанд зориулсан сойз.', price: 69000 },
]

const STORAGE_KEY = 'ampm-admin-products'

const loadLocalProducts = (): Product[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const saveLocalProducts = (list: Product[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
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

const fmt = (n: number) => `${n.toLocaleString('mn-MN')}₮`

const navLinks = [
  { label: 'Түүх', href: '#story' },
  { label: 'Бүтээгдэхүүн', href: '#products' },
  { label: 'Тусламж', href: '#faq' },
  { label: 'Дэмжлэг', href: '#footer' },
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

/* infographic callouts — mirrors the AM/PM poster artwork */
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

/* ---------------- Admin panel ---------------- */

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
    <form
      onSubmit={submit}
      className="rounded-3xl p-6 sm:p-8 max-w-md mx-auto"
      style={{ backgroundColor: '#EDEDED' }}
    >
      <h2 className="text-[15px] font-semibold text-gray-900 mb-1 flex items-center gap-2">
        <LogIn size={16} className="text-blue-500" /> Админ нэвтрэлт
      </h2>
      <p className="text-[12px] text-gray-500 mb-5">
        Supabase Authentication дээр үүсгэсэн админ бүртгэлээрээ нэвтэрнэ.
      </p>
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
  custom,
  setCustom,
  reload,
  session,
}: {
  custom: Product[]
  setCustom: (p: Product[]) => void
  reload: () => Promise<void>
  session: Session | null
}) {
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [price, setPrice] = useState('')
  const [badge, setBadge] = useState('')
  const [image, setImage] = useState<string | undefined>()
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)

  const usingDb = !!supabase

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setImage(String(reader.result))
    reader.readAsDataURL(file)
  }

  const submit = async (e: React.FormEvent) => {
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
      await reload()
    } else {
      const product: Product = {
        id: `custom-${Date.now()}`,
        name: name.trim(),
        desc: desc.trim() || 'AM/PM цуглуулгын бүтээгдэхүүн.',
        price: p,
        badge: badge.trim() || undefined,
        image,
      }
      const next = [...custom, product]
      if (!saveLocalProducts(next)) {
        setBusy(false)
        setError('Хадгалах боломжгүй (зураг хэт том байж магадгүй).')
        return
      }
      setCustom(next)
      setBusy(false)
    }

    setName('')
    setDesc('')
    setPrice('')
    setBadge('')
    setImage(undefined)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const removeProduct = async (id: string) => {
    if (usingDb && supabase) {
      const { error } = await supabase.from('products').delete().eq('id', id)
      if (!error) await reload()
    } else {
      const next = custom.filter((p) => p.id !== id)
      saveLocalProducts(next)
      setCustom(next)
    }
  }

  // DB configured but not signed in → show login
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

  return (
    <div className="min-h-screen bg-[#f0f0ee] px-6 sm:px-12 md:px-20 lg:px-28 py-10">
      <div className="max-w-3xl mx-auto">
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
          <div
            className="flex items-center justify-center rounded-full w-11 h-11"
            style={{ backgroundColor: '#EDEDED' }}
          >
            <Logo />
          </div>
          <div>
            <h1 className="text-[1.4rem] font-medium text-gray-900 tracking-tight">Админ панель</h1>
            <p className="text-[12.5px] text-gray-500">
              {session?.user?.email ? `Нэвтэрсэн: ${session.user.email}` : 'Бүтээгдэхүүн нэмэх, устгах'}
            </p>
          </div>
        </div>

        <div
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 mb-8 text-[12px] ${
            usingDb ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
          }`}
        >
          <Database size={14} className="shrink-0" />
          {usingDb
            ? 'Supabase өгөгдлийн сантай холбогдсон — өөрчлөлт бүх зочдод харагдана.'
            : 'Supabase тохируулаагүй тул түр localStorage ашиглаж байна (зөвхөн энэ browser дээр хадгалагдана). .env файлд VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY-г тохируулна уу.'}
        </div>

        {/* add form */}
        <form
          onSubmit={submit}
          className="rounded-3xl p-6 sm:p-8 mb-8"
          style={{ backgroundColor: '#EDEDED' }}
        >
          <h2 className="text-[15px] font-semibold text-gray-900 mb-5 flex items-center gap-2">
            <Plus size={16} className="text-blue-500" /> Шинэ бүтээгдэхүүн
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-gray-700">Нэр *</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ж: AM/PM аяллын иж бүрдэл"
                className="rounded-xl bg-white px-4 py-2.5 text-[13px] text-gray-900 outline-none border border-transparent focus:border-blue-400 transition-colors"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-gray-700">Үнэ (₮) *</span>
              <input
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="89000"
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
                <span className="truncate">{image ? 'Зураг сонгогдсон ✓' : 'Файл сонгох…'}</span>
                <input type="file" accept="image/*" onChange={onFile} className="absolute inset-0 opacity-0 cursor-pointer" />
              </span>
            </label>
          </div>
          {image && (
            <img src={image} alt="Урьдчилан харах" className="mt-4 h-24 rounded-xl object-cover" />
          )}
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

        {/* custom product list */}
        <div className="rounded-3xl p-6 sm:p-8" style={{ backgroundColor: '#EDEDED' }}>
          <h2 className="text-[15px] font-semibold text-gray-900 mb-5">
            Нэмсэн бүтээгдэхүүн ({custom.length})
          </h2>
          {custom.length === 0 ? (
            <p className="text-[13px] text-gray-500">
              Одоогоор нэмсэн бүтээгдэхүүн алга. Дээрх маягтаар нэмээрэй — дэлгүүрийн хэсэгт шууд
              харагдана.
            </p>
          ) : (
            <ul className="space-y-3">
              {custom.map((p) => (
                <li key={p.id} className="flex items-center gap-4 bg-white rounded-2xl p-3">
                  <div className="w-14 h-14 rounded-xl overflow-hidden bg-gray-100 shrink-0">
                    {p.image ? (
                      <img src={p.image} alt={p.name} className="w-full h-full object-cover" />
                    ) : (
                      <video
                        src="/video/ampm-hero.mp4"
                        muted
                        playsInline
                        className="w-full h-full object-cover"
                      />
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
  const [cart, setCart] = useState(0)
  const [custom, setCustom] = useState<Product[]>([])
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

  const reload = useCallback(async () => {
    if (!supabase) {
      setCustom(loadLocalProducts())
      return
    }
    setLoadError('')
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('created_at', { ascending: true })
    if (error) {
      setLoadError('Бүтээгдэхүүн ачаалахад алдаа гарлаа. Дахин оролдоно уу.')
    } else {
      setCustom((data ?? []).map(mapRow))
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  // Supabase auth session (admin)
  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])

  if (route === '#admin') {
    return <AdminPanel custom={custom} setCustom={setCustom} reload={reload} session={session} />
  }

  const products = [...DEFAULT_PRODUCTS, ...custom]

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
        <div
          className="relative flex items-center justify-center rounded-full w-10 h-10 sm:w-11 sm:h-11 shrink-0 shadow-sm"
          style={{ backgroundColor: '#EDEDED' }}
          aria-label="Сагс"
        >
          <ShoppingBag size={17} className="text-gray-700" />
          {cart > 0 && (
            <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-blue-500 text-white text-[10px] font-semibold">
              {cart}
            </span>
          )}
        </div>
      </nav>

      {/* ---------- Fullscreen video hero ---------- */}
      <header className="relative min-h-screen overflow-hidden bg-black">
        {wide ? (
          <>
            {/* landscape: blurred fill behind + full brush sharp in the center */}
            <video
              className="absolute inset-0 w-full h-full object-cover blur-2xl scale-110 brightness-[0.45]"
              src="/video/ampm-hero.mp4"
              autoPlay
              muted
              loop
              playsInline
              aria-hidden
            />
            <video
              className="absolute inset-0 w-full h-full object-contain"
              src="/video/ampm-hero.mp4"
              autoPlay
              muted
              loop
              playsInline
            />
            {/* vignette: melts the sharp/blurred boundary together */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  'radial-gradient(ellipse 60% 70% at 50% 45%, transparent 45%, rgba(0,0,0,0.5) 100%)',
              }}
              aria-hidden
            />
          </>
        ) : (
          /* portrait: the 9:16 video fills the screen natively */
          <video
            className="absolute inset-0 w-full h-full object-cover"
            src="/video/ampm-hero.mp4"
            autoPlay
            muted
            loop
            playsInline
          />
        )}
        <div className="relative z-10 flex flex-col min-h-screen">
          <div className="flex-1 flex items-end pb-10 sm:pb-16 lg:pb-20 px-6 sm:px-12 md:px-20 lg:px-28">
            <div className="max-w-xs">
              <a
                href="#products"
                className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-blue-500 hover:text-blue-600 transition-colors mb-3 group"
              >
                AM/PM — шинэ цуглуулга{' '}
                <span className="inline-block transition-transform duration-200 group-hover:translate-x-0.5">
                  →
                </span>
              </a>
              <h1 className="text-[1.5rem] sm:text-[1.75rem] leading-[1.15] font-medium text-white tracking-tight mb-3">
                Инээмсэглэлээ хайрладаг хүмүүст зориулсан энгийн, ухаалаг арчилгаа.
              </h1>
              <p className="text-[13px] text-gray-400 font-normal">
                Өдөр бүрээ цэнгэг эхлүүл. Доош гүйлгэж танилцана уу.
              </p>
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
          <p className="text-[11.5px] font-medium text-blue-500 uppercase tracking-widest mb-3">
            Яагаад AM/PM гэж?
          </p>
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
      <section id="story" className="py-10 sm:py-16 px-6 sm:px-12 md:px-20 lg:px-28">
        <Reveal className="max-w-xl mb-10">
          <p className="text-[11.5px] font-medium text-blue-500 uppercase tracking-widest mb-3">
            Дизайны түүх
          </p>
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
            <p className="text-[11.5px] font-medium text-blue-500 uppercase tracking-widest mb-3">
              Дэлгүүр
            </p>
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
            <button onClick={() => reload()} className="underline underline-offset-2 shrink-0">
              Дахин ачаалах
            </button>
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
                <div className="relative aspect-[4/3] overflow-hidden">
                  {p.image ? (
                    <img
                      src={p.image}
                      alt={p.name}
                      className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <video
                      className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      src="/video/ampm-hero.mp4"
                      muted
                      loop
                      playsInline
                      autoPlay
                    />
                  )}
                </div>
                <div className="p-6 flex flex-col flex-1">
                  <h3 className="text-[15px] font-medium text-gray-900 mb-1.5">{p.name}</h3>
                  <p className="text-[12.5px] text-gray-500 mb-4">{p.desc}</p>
                  <div className="mt-auto flex items-center justify-between">
                    <span className="text-[15px] font-semibold text-gray-900">{fmt(p.price)}</span>
                    <button
                      onClick={() => setCart((c) => c + 1)}
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
      <section id="faq" className="py-20 sm:py-28 px-6 sm:px-12 md:px-20 lg:px-28">
        <Reveal className="max-w-xl mb-12">
          <p className="text-[11.5px] font-medium text-blue-500 uppercase tracking-widest mb-3">
            Сэтгэгдэл
          </p>
          <h2 className="text-[1.5rem] sm:text-[2rem] leading-[1.15] font-medium text-gray-900 tracking-tight">
            Хэрэглэгчид юу гэж хэлдэг вэ?
          </h2>
        </Reveal>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {reviews.map((r, i) => (
            <Reveal key={r.name} delay={i * 120}>
              <div
                className="rounded-2xl p-6 h-full flex flex-col"
                style={{ backgroundColor: '#EDEDED' }}
              >
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

      {/* ---------- Footer ---------- */}
      <footer id="footer" className="py-14 px-6 sm:px-12 md:px-20 lg:px-28">
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
              Өглөөний цэнгэг. Оройн арчилгаа. · info@ampm.mn · +976 7000-0000
            </p>
            <div className="flex items-center gap-4">
              <a
                href="#admin"
                className="text-[11.5px] text-gray-400 hover:text-blue-500 transition-colors"
              >
                Админ
              </a>
              <p className="text-[11.5px] text-gray-400">© 2026 AM/PM</p>
            </div>
          </div>
        </Reveal>
      </footer>
    </div>
  )
}

export default App
