# AM/PM — Тансаг шүдний сойзны дэлгүүр

Vite + React + TypeScript + Tailwind CSS дээр бүтээсэн нэг хуудсын дэлгүүр.
Бүтэн дэлгэцийн бүтээгдэхүүний бичлэг, scroll танилцуулга, Supabase-тэй холбогдсон
админ панельтэй (`/#admin`).

## Ажиллуулах

```bash
npm install
npm run dev      # http://localhost:3200
npm run build    # production build → dist/
```

Supabase тохируулаагүй үед админ панель localStorage дээр ажиллана (зөвхөн тухайн
browser дээр хадгалагдана) — сайт эвдрэхгүй.

## 1. Supabase тохируулах (өгөгдлийн сан + админ нэвтрэлт)

1. [supabase.com](https://supabase.com) дээр нэвтэрч шинэ project үүсгэнэ.
2. **SQL Editor** нээгээд [`supabase/schema.sql`](supabase/schema.sql) файлын агуулгыг
   бүтнээр нь хуулж ажиллуулна (products хүснэгт + эрхийн бодлогууд үүснэ).
3. **Authentication → Users → Add user** дээр админы имэйл/нууц үг үүсгэнэ
   ("Auto confirm user" сонголтыг идэвхжүүлэх).
4. **Project Settings → API** хэсгээс `Project URL` болон `anon public` key-г хуулна.
5. Локал хөгжүүлэлтэд: `.env.example`-ийг `.env` болгон хуулаад утгуудыг тавина:

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

Дараа нь `npm run dev` — админ панель Supabase горимд шилжинэ: нэвтрэлт шаардана,
нэмсэн бүтээгдэхүүн бүх зочдод харагдана.

## 2. GitHub дээр байршуулах

```bash
# GitHub CLI суулгаагүй бол: winget install GitHub.cli ; дараа нь gh auth login
gh repo create ampm-hero --private --source . --push
```

эсвэл гараар: github.com дээр хоосон repo үүсгээд

```bash
git remote add origin https://github.com/<таны-нэр>/ampm-hero.git
git push -u origin main
```

(Local git repo аль хэдийн үүссэн, эхний commit хийгдсэн.)

## 3. Vercel дээр deploy хийх

1. [vercel.com](https://vercel.com) → **Add New → Project** → GitHub repo-гоо import хийнэ.
   Vite framework-ийг автоматаар танина — build тохиргоо өөрчлөх шаардлагагүй.
2. **Environment Variables** хэсэгт нэмнэ:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. **Deploy** — дууссаны дараа `https://ampm-hero.vercel.app` маягийн хаяг гарна.
4. Админ панель: `https://<таны-domain>/#admin`

## Бүтэц

```
src/
  App.tsx            — бүх хуудас, админ панель, сагс
  lib/supabase.ts    — Supabase client (env байхгүй бол null → localStorage fallback)
supabase/schema.sql  — өгөгдлийн сангийн бүтэц + RLS бодлогууд
public/video/        — бүтээгдэхүүний бичлэг
public/img/          — постер зураг
```

## Аюулгүй байдлын тэмдэглэл

- `anon` key нь public тул code-д орсон нь зөв; бичих эрх нь RLS-ээр зөвхөн
  нэвтэрсэн хэрэглэгчид хязгаарлагдсан.
- `.env` файл `.gitignore`-д орсон — нууц утгууд git-д орохгүй.
