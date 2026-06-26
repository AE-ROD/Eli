# Eli v2 Completion Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement all remaining v2 tasks from design-doc-v2.md and TODOS.md that were not covered in the M1–M4 implementation sessions.

**Architecture:** 8 independent tasks covering UX fixes (registro redirect, whileInView, footer), dev tooling (seed.ts), pricing alignment (modal + landing), i18n improvements (dynamic html lang, business locale preference), and post-booking UX (.ics download). Tasks 1–7 are fully independent. Task 8 requires a Prisma migration.

**Tech Stack:** Next.js 15 App Router, TypeScript, Prisma ORM, Framer Motion, Tailwind CSS, shadcn/ui

---

## File Map

| Task | Files modified |
|---|---|
| T1 | `app/registro/page.tsx` (CREATE) |
| T2 | `components/landing/what-is-section.tsx`, `dashboard-preview-section.tsx`, `precios-section.tsx`, `target-section.tsx`, `how-it-works-section.tsx` |
| T3 | `prisma/seed.ts` |
| T4 | `components/landing/footer.tsx` |
| T5 | `components/landing/precios-section.tsx`, `components/app/modales/modal-precios.tsx` |
| T6 | `app/layout.tsx`, `middleware.ts` |
| T7 | `app/reservar/[slug]/_components/formularioReserva.tsx`, `lib/i18n/booking.ts` |
| T8 | `prisma/schema.prisma`, `app/api/dashboard/configuracion/idioma/route.ts` (CREATE), `app/dashboard/configuracion/_components/SeccionIdioma.tsx` (CREATE), `app/dashboard/configuracion/page.tsx`, `app/reservar/[slug]/page.tsx`, `middleware.ts` |

---

## Task 1: /registro → 301 redirect to /crear-cuenta

**Files:**
- Create: `app/registro/page.tsx`

- [ ] **Step 1: Create redirect page**

```typescript
// app/registro/page.tsx
import { redirect } from "next/navigation"

export default function PaginaRegistroLegacy() {
  redirect("/crear-cuenta")
}
```

- [ ] **Step 2: Verify behavior**

Run dev server (`npm run dev`). Navigate to `http://localhost:3000/registro`. Should redirect immediately to `/crear-cuenta`.

- [ ] **Step 3: Commit**

```bash
git add app/registro/page.tsx
git commit -m "fix: redirect /registro → /crear-cuenta (T UX fix)"
```

---

## Task 2: Fix Framer Motion whileInView — add viewport={{ once: true }}

Landing page content below the fold starts at `opacity: 0` and stays invisible until scroll, which harms SEO and accessibility. Fix: add `viewport={{ once: true }}` to every `whileInView` motion element so the animation fires once and content stays visible.

**Files:**
- Modify: `components/landing/what-is-section.tsx`
- Modify: `components/landing/dashboard-preview-section.tsx`
- Modify: `components/landing/precios-section.tsx`
- Modify: `components/landing/target-section.tsx`
- Modify: `components/landing/how-it-works-section.tsx`

- [ ] **Step 1: Fix what-is-section.tsx**

Find every `whileInView={{ opacity: 1, y: 0 }}` call in `components/landing/what-is-section.tsx`. Add `viewport={{ once: true }}` to each `<motion.*>` element that has `whileInView`. Example:

```tsx
// Before:
<motion.div
  initial={{ opacity: 0, y: 20 }}
  whileInView={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.5 }}
>

// After:
<motion.div
  initial={{ opacity: 0, y: 20 }}
  whileInView={{ opacity: 1, y: 0 }}
  viewport={{ once: true }}
  transition={{ duration: 0.5 }}
>
```

Apply to ALL motion elements with `whileInView` in this file.

- [ ] **Step 2: Fix dashboard-preview-section.tsx**

Same as Step 1, apply `viewport={{ once: true }}` to every `whileInView` element in `components/landing/dashboard-preview-section.tsx`.

- [ ] **Step 3: Fix precios-section.tsx**

Same as Step 1, apply `viewport={{ once: true }}` to every `whileInView` element in `components/landing/precios-section.tsx`.

- [ ] **Step 4: Fix target-section.tsx**

Same as Step 1, apply `viewport={{ once: true }}` to every `whileInView` element in `components/landing/target-section.tsx`.

- [ ] **Step 5: Fix how-it-works-section.tsx**

Same as Step 1, apply `viewport={{ once: true }}` to every `whileInView` element in `components/landing/how-it-works-section.tsx`.

- [ ] **Step 6: Verify**

Check no `whileInView` elements are missing `viewport={{ once: true }}`:
```bash
grep -rn "whileInView" components/landing/ | grep -v "viewport"
```
Expected output: empty (no unpatched elements).

- [ ] **Step 7: Commit**

```bash
git add components/landing/
git commit -m "fix: add viewport once:true to all landing whileInView animations (SEO + a11y)"
```

---

## Task 3: Fix prisma/seed.ts TypeScript errors

The `prisma.user.create` call does not include the `business` relation, so `userRecord.business` is undefined and TypeScript doesn't know the property exists. Fix: use `include: { business: true }` directly in the create call.

**Files:**
- Modify: `prisma/seed.ts`

- [ ] **Step 1: Verify current errors**

```bash
npx tsc --noEmit prisma/seed.ts 2>&1 | head -20
```

- [ ] **Step 2: Fix user.create to include business**

In `prisma/seed.ts`, replace the `prisma.user.create` call that is followed by a separate `prisma.business.findUnique`. Merge them:

```typescript
// Before (lines ~17-32):
const userRecord = await prisma.user.create({
  data: {
    name: 'Admin Demo',
    email: 'admin@eli.com',
    password: hashedPassword,
    business: {
      create: {
        name: 'Salón de Belleza Demo',
        type: 'salon',
        slug: 'salon-de-belleza-demo',
      },
    },
  },
})
const business = await prisma.business.findUnique({ where: { userId: userRecord.id } })
const user = { ...userRecord, business }

// After:
const user = await prisma.user.create({
  data: {
    name: 'Admin Demo',
    email: 'admin@eli.com',
    password: hashedPassword,
    business: {
      create: {
        name: 'Salón de Belleza Demo',
        type: 'salon',
        slug: 'salon-de-belleza-demo',
      },
    },
  },
  include: { business: true },
})
const business = user.business!
```

Then update all downstream references from `user.business?.id` to `business.id` (they should already work since `business` is now the same reference).

- [ ] **Step 3: Verify TypeScript errors are gone**

```bash
npx tsc --noEmit 2>&1 | grep "seed.ts" | head -10
```

Expected output: empty.

- [ ] **Step 4: Commit**

```bash
git add prisma/seed.ts
git commit -m "fix: resolve prisma seed.ts TypeScript errors via include business in create"
```

---

## Task 4: Footer links cleanup — remove dead # links

Links for Integraciones, Blog, Sobre nosotros, Trabaja con nosotros, TOS, Privacy, and Cookies all point to `#`. These create SEO noise and user confusion. Remove them from the footer until real pages exist. Keep working anchor links (#que-es, #como-funciona, #precios, #contacto).

**Files:**
- Modify: `components/landing/footer.tsx`

- [ ] **Step 1: Audit current footer links**

```bash
grep -n 'href="#"' components/landing/footer.tsx
```

Note all lines with `href="#"` that are NOT anchor links to real sections.

- [ ] **Step 2: Update footer data**

In `components/landing/footer.tsx`, update the links arrays to remove all dead `#` links. Replace with only real working links:

```typescript
// Find the links data structure at the top of the file.
// Keep only links with real destinations. Remove or null-out the rest.
// Example: if the structure is { label: "Integraciones", href: "#" }, remove that object entirely.

// Producto section — keep only:
{ label: "Características", href: "#que-es" },
{ label: "Cómo funciona", href: "#como-funciona" },
{ label: "Precios", href: "#precios" },
// Remove: Integraciones (href: "#")

// Empresa section — keep only:
{ label: "Contacto", href: "#contacto" },
// Remove: Blog, Sobre nosotros, Trabaja con nosotros

// Legal section — remove entirely OR keep with a note:
// Remove: Términos de servicio, Política de privacidad, Cookies
// (These will be added back once the pages exist)
```

Also remove the three social icon links at the bottom that point to `href="#"` (Twitter/X, Instagram, LinkedIn icons), or update them to real social URLs if known. If not known, remove them.

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep "footer" | head -5
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/landing/footer.tsx
git commit -m "fix: remove dead # links from footer (Integraciones, Blog, TOS, social icons)"
```

---

## Task 5: Pricing alignment — Free/Pro/Team at $0/$19/$49

Both `components/landing/precios-section.tsx` and `components/app/modales/modal-precios.tsx` have Starter/Equipo/Pro at $12/$29/$59. The design-doc-v2.md specifies Free/Pro/Team at $0/$19/$49. Update both files to match the design doc.

**Files:**
- Modify: `components/landing/precios-section.tsx`
- Modify: `components/app/modales/modal-precios.tsx`

- [ ] **Step 1: Update precios-section.tsx data**

In `components/landing/precios-section.tsx`, find the plans array (around line 15-75) and replace it with:

```typescript
const PLANES = [
  {
    nombre: "Free",
    descripcion: "Para negocios que empiezan",
    mensual: 0,
    anual: 0,
    ahorroAnual: null,
    destacado: false,
    features: [
      { texto: "1 trabajador", incluido: true },
      { texto: "Reservas en español", incluido: true },
      { texto: "Notificaciones por email", incluido: true },
      { texto: "Página de reservas", incluido: true },
      { texto: "3 idiomas (ES/EN/PT)", incluido: false },
      { texto: "Notificaciones por WhatsApp", incluido: false },
      { texto: "Analytics", incluido: false },
      { texto: "Equipo de trabajadores", incluido: false },
    ],
  },
  {
    nombre: "Pro",
    descripcion: "Para negocios con clientela internacional",
    mensual: 19,
    anual: 190,
    ahorroAnual: 38,
    destacado: true,
    features: [
      { texto: "5 trabajadores", incluido: true },
      { texto: "3 idiomas (ES/EN/PT)", incluido: true },
      { texto: "Notificaciones por WhatsApp", incluido: true },
      { texto: "Analytics dashboard", incluido: true },
      { texto: "Perfil SEO del negocio", incluido: true },
      { texto: "Open Graph en 3 idiomas", incluido: true },
      { texto: "Email y WhatsApp", incluido: true },
      { texto: "Trabajadores ilimitados", incluido: false },
    ],
  },
  {
    nombre: "Team",
    descripcion: "Para equipos grandes",
    mensual: 49,
    anual: 490,
    ahorroAnual: 98,
    destacado: false,
    features: [
      { texto: "Trabajadores ilimitados", incluido: true },
      { texto: "Todo lo del plan Pro", incluido: true },
      { texto: "Soporte prioritario", incluido: true },
      { texto: "Exportación de datos", incluido: true },
      { texto: "3 idiomas (ES/EN/PT)", incluido: true },
      { texto: "Notificaciones por WhatsApp", incluido: true },
      { texto: "Analytics dashboard", incluido: true },
      { texto: "Acceso anticipado a nuevas features", incluido: true },
    ],
  },
]
```

For the Free plan, when rendering the price, show "$0" or "Gratis" instead of "$0/mes". Adjust the render logic:

```tsx
// In the render, where price is shown:
{precio === 0
  ? <span className="text-4xl font-bold text-foreground">Gratis</span>
  : <>
      <span className="text-sm text-muted-foreground">$</span>
      <span className="text-4xl font-bold text-foreground">{precio}</span>
      <span className="text-sm text-muted-foreground">/mes</span>
    </>
}
```

- [ ] **Step 2: Update modal-precios.tsx data**

In `components/app/modales/modal-precios.tsx`, find the plans array (around line 15-85) and replace with the same Free/Pro/Team structure. The modal is used for upgrade prompts so it should show all three plans:

```typescript
const PLANES = [
  {
    nombre: "Free",
    descripcion: "Para empezar",
    mensual: 0,
    anual: 0,
    ahorroAnual: null,
    destacado: false,
    stripePrice: null, // Free plan has no Stripe price
    features: [
      { texto: "1 trabajador", incluido: true },
      { texto: "Reservas en español", incluido: true },
      { texto: "Email de confirmación", incluido: true },
      { texto: "i18n (ES/EN/PT)", incluido: false },
      { texto: "WhatsApp notifications", incluido: false },
      { texto: "Analytics", incluido: false },
    ],
  },
  {
    nombre: "Pro",
    descripcion: "Para negocios con turistas",
    mensual: 19,
    anual: 190,
    ahorroAnual: 38,
    destacado: true,
    stripePrice: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO,
    features: [
      { texto: "5 trabajadores", incluido: true },
      { texto: "i18n (ES/EN/PT)", incluido: true },
      { texto: "WhatsApp notifications", incluido: true },
      { texto: "Analytics dashboard", incluido: true },
      { texto: "Perfil SEO", incluido: true },
      { texto: "Trabajadores ilimitados", incluido: false },
    ],
  },
  {
    nombre: "Team",
    descripcion: "Para equipos grandes",
    mensual: 49,
    anual: 490,
    ahorroAnual: 98,
    destacado: false,
    stripePrice: process.env.NEXT_PUBLIC_STRIPE_PRICE_TEAM,
    features: [
      { texto: "Trabajadores ilimitados", incluido: true },
      { texto: "Todo lo del plan Pro", incluido: true },
      { texto: "Soporte prioritario", incluido: true },
      { texto: "Exportación de datos", incluido: true },
    ],
  },
]
```

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep -E "precios|modal-precios" | head -10
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/landing/precios-section.tsx components/app/modales/modal-precios.tsx
git commit -m "fix: align pricing to design doc — Free/Pro/Team at \$0/\$19/\$49"
```

---

## Task 6: Dynamic html lang attribute in layout.tsx (T-DR2)

`app/layout.tsx` hardcodes `lang="es"` on the `<html>` element. Screen readers and SEO tools use this to determine page language. The middleware already injects `x-locale` for `/reservar/` routes. Make the root layout read this header dynamically.

**Files:**
- Modify: `app/layout.tsx`
- Modify: `middleware.ts`

- [ ] **Step 1: Update middleware to also set x-locale for non-booking routes**

Currently `x-locale` is only set for `/reservar/` routes. The root layout needs it everywhere. In `middleware.ts`, move the locale detection + header injection to apply to ALL routes (not just `/reservar/`):

```typescript
// middleware.ts — updated to inject x-locale on all routes
import { withAuth, type NextRequestWithAuth } from "next-auth/middleware"
import { NextResponse } from "next/server"

const SUPPORTED_LOCALES = ["es", "en", "pt"]

function detectLocale(req: NextRequestWithAuth): string {
  const cookie = req.cookies.get("eli-locale")?.value
  if (cookie && SUPPORTED_LOCALES.includes(cookie)) return cookie

  const acceptLang = req.headers.get("accept-language") ?? ""
  const browserLocale = acceptLang.split(",")[0]?.split("-")[0]?.toLowerCase()
  if (browserLocale && SUPPORTED_LOCALES.includes(browserLocale)) return browserLocale

  return "es"
}

export default withAuth(
  function middleware(req: NextRequestWithAuth) {
    const { pathname } = req.nextUrl
    const token = req.nextauth.token

    // Inject x-locale on all routes (used by root layout for html lang attr)
    const locale = detectLocale(req)
    const requestHeaders = new Headers(req.headers)
    requestHeaders.set("x-locale", locale)

    // Auth redirects for dashboard routes
    if (pathname.startsWith("/dashboard") && !token?.businessId) {
      return NextResponse.redirect(new URL("/completar-perfil", req.url))
    }
    if (pathname === "/completar-perfil" && token?.businessId) {
      return NextResponse.redirect(new URL("/dashboard", req.url))
    }

    return NextResponse.next({ request: { headers: requestHeaders } })
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        if (req.nextUrl.pathname.startsWith("/reservar/")) return true
        return !!token
      },
    },
    pages: {
      signIn: "/iniciar-sesion",
    },
  }
)

export const config = {
  matcher: ["/dashboard/:path*", "/completar-perfil", "/reservar/:path*"],
}
```

**Note:** The middleware `matcher` only covers dashboard, completar-perfil, and reservar routes. The public landing page (`/`) is NOT matched, so the root layout won't receive `x-locale` for the landing page. That's acceptable — the landing is Spanish-only (by design: "Dashboard del negocio: solo ES"). For the landing, `lang="es"` is correct.

To also cover `/reservar/` for the html lang, the current matcher already includes it. The key change is moving the `requestHeaders.set("x-locale", locale)` and `NextResponse.next({ request: { headers: requestHeaders } })` to apply to ALL matched routes, not just `/reservar/`.

- [ ] **Step 2: Make layout.tsx async and read x-locale**

```typescript
// app/layout.tsx
import type { Metadata } from 'next'
import { Instrument_Sans } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { Providers } from '@/components/providers'
import { headers } from 'next/headers'
import './globals.css'

const font = Instrument_Sans({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Eli - Asistente Inteligente de Reservas',
  description: 'Simplifica la gestión de tu negocio de bienestar y salud. Centraliza reservas, clientes, equipo y comunicación en una sola plataforma.',
  generator: 'v0.app',
  icons: {
    icon: '/images/eli-logo.png',
    apple: '/images/eli-logo.png',
  },
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const h = await headers()
  const locale = h.get('x-locale') ?? 'es'
  // Map locale to valid BCP 47 language tag
  const htmlLang = locale === 'pt' ? 'pt-BR' : locale === 'en' ? 'en' : 'es'

  return (
    <html lang={htmlLang} className="bg-background">
      <body className={`${font.variable} font-sans antialiased`}>
        <Providers>{children}</Providers>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
```

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep -E "layout.tsx|middleware" | head -10
```

Expected: no errors.

- [ ] **Step 4: Build check**

```bash
npm run build 2>&1 | tail -10
```

Expected: build passes with no errors.

- [ ] **Step 5: Commit**

```bash
git add app/layout.tsx middleware.ts
git commit -m "fix: dynamic html lang attr from x-locale header (T-DR2)"
```

---

## Task 7: .ics download in post-confirm screen (T-DR5)

Post-confirmation currently links to Google Calendar (requires OAuth/Google account). The design doc specified a client-side `.ics` file download (no account needed) + a WhatsApp save button. Replace the Google Calendar URL with a proper .ics blob download.

**Files:**
- Modify: `app/reservar/[slug]/_components/formularioReserva.tsx`
- Modify: `lib/i18n/booking.ts` (add "downloadIcs" string key)

- [ ] **Step 1: Add i18n string for .ics download button**

In `lib/i18n/booking.ts`, add `downloadIcs` to all three locale objects:

```typescript
// In the BOOKING_STRINGS object, add to each locale:
// es:
downloadIcs: "Agregar al calendario (.ics)",
// en:
downloadIcs: "Add to Calendar (.ics)",
// pt:
downloadIcs: "Adicionar ao calendário (.ics)",
```

Also update the type (if there is a `BookingStringKey` type) to include `"downloadIcs"`.

- [ ] **Step 2: Add generateIcs helper in formularioReserva.tsx**

At the top of `formularioReserva.tsx` (before the component), add this helper. It takes booking data and returns an `.ics` file string:

```typescript
function generateIcsContent(opts: {
  uid: string
  summary: string
  description: string
  location: string
  startIso: string   // ISO 8601, e.g. "2026-06-15T10:00:00"
  durationMinutes: number
}): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  const toIcsDate = (iso: string) => {
    const d = new Date(iso)
    return (
      `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
      `T${pad(d.getHours())}${pad(d.getMinutes())}00`
    )
  }
  const dtStart = toIcsDate(opts.startIso)
  const end = new Date(opts.startIso)
  end.setMinutes(end.getMinutes() + opts.durationMinutes)
  const dtEnd = toIcsDate(end.toISOString().replace("Z", ""))
  const now = toIcsDate(new Date().toISOString().replace("Z", "")) + "Z"

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Eli//Eli Booking//ES",
    "BEGIN:VEVENT",
    `UID:${opts.uid}@eli.app`,
    `DTSTAMP:${now}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${opts.summary}`,
    `DESCRIPTION:${opts.description}`,
    `LOCATION:${opts.location}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n")
}

function downloadIcs(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
```

- [ ] **Step 3: Replace Google Calendar link with .ics download button**

In `formularioReserva.tsx`, find the post-confirmation view (the block that renders when `confirmado === true`). Remove the Google Calendar `<a>` link and replace with a `<button>` that calls `downloadIcs`:

```tsx
// Find the existing Google Calendar block — something like:
// <a href={buildGoogleCalendarUrl(...)} ...>Agregar al calendario</a>
// Replace with:

<button
  type="button"
  onClick={() => {
    if (!servicioSel || !slotSel) return
    const icsContent = generateIcsContent({
      uid: `booking-${Date.now()}`,
      summary: `${servicioSel.name} — ${negocio.name}`,
      description: `${t(locale, "service")}: ${servicioSel.name} | ${negocio.name}`,
      location: negocio.name,
      startIso: slotSel, // slotSel should be an ISO datetime string
      durationMinutes: servicioSel.duration,
    })
    downloadIcs(icsContent, `cita-${negocio.slug}.ics`)
  }}
  className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border hover:bg-muted/50 transition-colors text-sm font-medium"
>
  <CalendarPlus className="w-4 h-4" />
  {t(locale, "downloadIcs")}
</button>
```

Make sure `CalendarPlus` is imported from `lucide-react`. Also remove the `buildGoogleCalendarUrl` function if it's no longer used.

Keep the WhatsApp save button that already exists (`href={https://wa.me/?text=${waText}}`).

- [ ] **Step 4: Check types — ensure slotSel is an ISO string**

Verify that `slotSel` in the component state holds an ISO datetime (not just a time string). If it only holds a time like `"10:00"`, you'll need to combine it with the selected date (`fechaSel`) to construct the full ISO string:

```typescript
// If slotSel is just "HH:MM" and fechaSel is a Date object:
const startIso = fechaSel
  ? `${fechaSel.getFullYear()}-${String(fechaSel.getMonth() + 1).padStart(2, "0")}-${String(fechaSel.getDate()).padStart(2, "0")}T${slotSel}:00`
  : new Date().toISOString()
```

Adjust to match the actual state shape in the component.

- [ ] **Step 5: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep "formularioReserva" | head -10
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add app/reservar/\[slug\]/_components/formularioReserva.tsx lib/i18n/booking.ts
git commit -m "feat: replace Google Calendar link with .ics download in post-confirm (T-DR5)"
```

---

## Task 8: Business preferred locale setting

The design doc specifies that a Business can configure their preferred language in the dashboard. This locale is used as a fallback when neither cookie nor browser Accept-Language is set for the booking page. Three changes: Prisma schema + migration, dashboard UI, booking page server logic.

**Files:**
- Modify: `prisma/schema.prisma`
- Create: migration via `npx prisma migrate dev`
- Create: `app/api/dashboard/configuracion/idioma/route.ts`
- Create: `app/dashboard/configuracion/_components/SeccionIdioma.tsx`
- Modify: `app/dashboard/configuracion/page.tsx`
- Modify: `app/reservar/[slug]/page.tsx`
- Modify: `middleware.ts`

### 8a: Prisma schema + migration

- [ ] **Step 1: Add preferredLocale to Business model**

In `prisma/schema.prisma`, add one field to the `Business` model (right after `timezone`):

```prisma
model Business {
  // ... existing fields ...
  timezone         String    @default("America/Cancun")
  preferredLocale  String    @default("es")   // <-- ADD THIS LINE
  plan             String    @default("free")
  // ... rest of fields ...
}
```

- [ ] **Step 2: Run migration**

```bash
npx prisma migrate dev --name add-preferred-locale
```

Expected output: Migration created and applied. Client regenerated.

- [ ] **Step 3: Verify generated client**

```bash
npx tsc --noEmit 2>&1 | head -5
```

Expected: no errors.

### 8b: API endpoint

- [ ] **Step 4: Create API route to save preferred locale**

```typescript
// app/api/dashboard/configuracion/idioma/route.ts
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"
import { z } from "zod"

const schema = z.object({
  locale: z.enum(["es", "en", "pt"]),
})

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.businessId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid locale" }, { status: 400 })
  }

  await prisma.business.update({
    where: { id: user.businessId },
    data: { preferredLocale: parsed.data.locale },
  })

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 5: TypeScript check on the route**

```bash
npx tsc --noEmit 2>&1 | grep "idioma" | head -5
```

Expected: no errors.

### 8c: Dashboard UI component

- [ ] **Step 6: Create SeccionIdioma component**

```typescript
// app/dashboard/configuracion/_components/SeccionIdioma.tsx
"use client"

import { useState } from "react"

const LOCALES = [
  { value: "es", label: "Español", flag: "🇲🇽" },
  { value: "en", label: "English", flag: "🇺🇸" },
  { value: "pt", label: "Português (BR)", flag: "🇧🇷" },
] as const

interface SeccionIdiomaProps {
  localeInicial: string
}

export function SeccionIdioma({ localeInicial }: SeccionIdiomaProps) {
  const [locale, setLocale] = useState(localeInicial)
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)

  async function handleChange(nuevoLocale: string) {
    setLocale(nuevoLocale)
    setGuardando(true)
    setGuardado(false)
    try {
      await fetch("/api/dashboard/configuracion/idioma", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: nuevoLocale }),
      })
      setGuardado(true)
      setTimeout(() => setGuardado(false), 2000)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6 space-y-4">
      <div>
        <h3 className="font-semibold text-base text-foreground">Idioma de la página de reservas</h3>
        <p className="text-sm text-muted-foreground mt-0.5">
          Idioma predeterminado para clientes que visiten tu página sin preferencia detectada.
        </p>
      </div>
      <div className="flex gap-3 flex-wrap">
        {LOCALES.map((l) => (
          <button
            key={l.value}
            type="button"
            disabled={guardando}
            onClick={() => handleChange(l.value)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
              locale === l.value
                ? "border-primary bg-primary/5 text-foreground"
                : "border-border hover:border-primary/40 text-muted-foreground"
            }`}
          >
            <span>{l.flag}</span>
            <span>{l.label}</span>
          </button>
        ))}
      </div>
      {guardado && (
        <p className="text-sm text-success font-medium">Guardado</p>
      )}
    </div>
  )
}
```

### 8d: Add SeccionIdioma to configuracion page

- [ ] **Step 7: Fetch business data and render SeccionIdioma in configuracion page**

In `app/dashboard/configuracion/page.tsx`, fetch the business `preferredLocale` and render `<SeccionIdioma>`:

```typescript
// Add to the existing queries in PaginaConfiguracion:
const business = await prisma.business.findUnique({
  where: { id: user.businessId },
  select: { preferredLocale: true },
})

// Add SeccionIdioma import at top:
import { SeccionIdioma } from "./_components/SeccionIdioma"

// Add to the return JSX, after SeccionServicios (owners only):
{esOwner && (
  <SeccionIdioma localeInicial={business?.preferredLocale ?? "es"} />
)}
```

### 8e: Use preferredLocale in booking page

- [ ] **Step 8: Update middleware to distinguish fallback locale**

In `middleware.ts`, change `detectLocale` to return `null` when neither cookie nor Accept-Language header provides a locale (so the booking page knows it should use the business's preferredLocale):

```typescript
function detectLocale(req: NextRequestWithAuth): string | null {
  const cookie = req.cookies.get("eli-locale")?.value
  if (cookie && SUPPORTED_LOCALES.includes(cookie)) return cookie

  const acceptLang = req.headers.get("accept-language") ?? ""
  const browserLocale = acceptLang.split(",")[0]?.split("-")[0]?.toLowerCase()
  if (browserLocale && SUPPORTED_LOCALES.includes(browserLocale)) return browserLocale

  return null // no explicit preference — let business preferredLocale take over
}

// In the middleware function:
const locale = detectLocale(req)
const requestHeaders = new Headers(req.headers)
if (locale) {
  requestHeaders.set("x-locale", locale)
}
// For layout.tsx html lang: if no locale detected, default to "es"
requestHeaders.set("x-locale", locale ?? "es")
```

Wait — this creates a conflict because layout.tsx needs `x-locale` always set (for `lang` attribute), but the booking page needs to know if the locale is a real preference or a fallback. Solution: set two headers:

```typescript
requestHeaders.set("x-locale", locale ?? "es")          // for html lang (always set)
requestHeaders.set("x-locale-explicit", locale ?? "")   // "" means no explicit pref
```

Then in the booking page, use `x-locale-explicit` to decide whether to override with `business.preferredLocale`.

- [ ] **Step 9: Update booking page to read preferredLocale**

In `app/reservar/[slug]/page.tsx`, update the locale resolution:

```typescript
import { headers } from "next/headers"

// In the page component:
const h = await headers()
const explicitLocale = h.get("x-locale-explicit") || null
// Fetch business including preferredLocale:
const negocio = await prisma.business.findUnique({
  where: { slug },
  select: {
    // ... existing fields ...
    preferredLocale: true,
  },
})

// Resolve final locale: explicit (cookie/browser) > business preference > 'es'
const locale = explicitLocale ?? negocio?.preferredLocale ?? "es"
```

- [ ] **Step 10: TypeScript + build check**

```bash
npx tsc --noEmit 2>&1 | head -20
npm run build 2>&1 | tail -15
```

Expected: 0 TypeScript errors, build passes.

- [ ] **Step 11: Run tests**

```bash
npm test 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 12: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/ app/api/dashboard/configuracion/idioma/ app/dashboard/configuracion/ app/reservar/\[slug\]/page.tsx middleware.ts
git commit -m "feat: business preferred locale — schema, dashboard UI, booking page fallback"
```

---

## Final: Full build + test + context save

- [ ] **Step 1: Full TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: 0 errors.

- [ ] **Step 2: Full test suite**

```bash
npm test 2>&1 | tail -20
```

Expected: all tests pass (≥13 passing).

- [ ] **Step 3: Full build**

```bash
npm run build 2>&1 | tail -15
```

Expected: build passes.

- [ ] **Step 4: Run /context-save**

Use the `context-save` skill to save current state.
