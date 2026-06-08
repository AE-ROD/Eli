# Eli — Design System

**Versión:** v2.0  
**Creado:** 2026-06-05 · **Actualizado:** 2026-06-05 (post `/design-consultation`)  
**Autor:** AE-ROD

---

## 0. Contexto del Producto

| Campo | Valor |
|---|---|
| **Producto** | Eli — sistema de reservas para PYMEs LATAM en zonas turísticas |
| **Para quién** | Negocios: barberías, consultorios, spas, estudios fitness en Cancún, Cartagena, Miami. Usuarios en booking page: turistas extranjeros que llegan por enlace directo. |
| **Espacio** | Appointment booking / health & wellness / hospitality-adjacent |
| **Tipo de proyecto** | Web app — wizard multi-paso (3 pasos), mobile-first |
| **Memorable** | "Profesional y confiable" — herramienta seria para negocios serios. El turista confía en reservar aquí. |

---

## 1. Dirección Estética

**Aesthetic:** Clean Professional — tipografía lidera, espacio en blanco estructura, cero decoración distractora.

**No es:** Minimal-brutalista (demasiado frío para turistas), Luxury/aspiracional, Playful/colorido.

**Decoration level:** Minimal — los tokens de color y la tipografía hacen todo el trabajo visual. Sin blobs, sin gradientes, sin íconos en círculos de colores.

**Coherencia del sistema:** La paleta azul-slate (trust) + tipografía clean (precision) + espacio generoso (calma) = "profesional y confiable." Todo se refuerza mutuamente.

### Riesgos de diseño (donde Eli tiene cara propia)

| ID | Riesgo | Rationale | Costo |
|---|---|---|---|
| R1 | Instrument Sans en lugar de Inter | Ningún otro LATAM booking tool lo usa. Distinguible sin ser raro. | Cambiar import next/font |
| R2 | Step indicator con text labels visibles siempre | "Servicio / Fecha y hora / Tus datos" — el turista tiene un mapa del flow desde paso 1. La mayoría de competitors solo muestran números. | Layout del step bar |
| R3 | Padding interno generoso (24-28px) vs. estándar 16px | "No tenemos prisa en venderte nada." Crea sensación de calma y confianza. | Más scroll en mobile |

---

## 2. Color Tokens (Tailwind v4 / OKLCH)

Definidos en `app/globals.css`. **No usar valores hardcoded en componentes — siempre usar el token CSS.**

### Modo claro

| Token | OKLCH | Hex aprox. | Uso |
|---|---|---|---|
| `--primary` | `oklch(0.35 0.12 250)` | `#1e3d6e` | Botones CTA, active state, step activo |
| `--primary-foreground` | `oklch(0.98 0.01 250)` | `#f7f9fd` | Texto sobre primary |
| `--primary-light` | — | `#e8eef7` | Hover states, selected service background |
| `--background` | `oklch(0.995 0 0)` | `#f7f8fb` | Fondo de página (slight cool tint) |
| `--foreground` | `oklch(0.25 0.05 250)` | `#1a2233` | Texto principal |
| `--card` | `oklch(0.99 0 0)` | `#ffffff` | Fondo de tarjetas |
| `--card-foreground` | `oklch(0.25 0.05 250)` | `#1a2233` | Texto sobre card |
| `--border` | `oklch(0.9 0.02 250)` | `#e2e6ed` | Bordes sutiles |
| `--muted` | `oklch(0.96 0.01 250)` | `#f0f2f7` | Fondos secundarios |
| `--muted-foreground` | `oklch(0.55 0.04 250)` | `#8892a2` | Texto muted (hints, subtitles, captions) |
| `--accent` | `oklch(0.94 0.03 250)` | `#e8eef7` | Hover states |
| `--destructive` | `oklch(0.5 0.2 25)` | `#c0392b` | Errores, borrado |
| `--success` | `oklch(0.5 0.15 145)` | `#1a6b3e` | Confirmaciones, checkmarks |

### Escala de hue

Hue **250** (cool blue-slate) para toda la paleta. Primary, border, y accent derivan del mismo hue — coherencia total.

### Modo oscuro

Tokens `.dark` definidos en `globals.css`. **Fuera de scope para M1–M2.** No referenciar en nuevos componentes hasta M3.

---

## 3. Tipografía — Instrument Sans

**Cambio v2.0:** Inter → **Instrument Sans**. Inter está en la "overused list" del sistema (señal de "I gave up on typography"). Instrument Sans tiene ligeramente más carácter sin ser playful. Excelente soporte multilingual (ES/EN/PT-BR con acentos correctos).

### Carga en Next.js

```tsx
// app/layout.tsx
import { Instrument_Sans } from 'next/font/google'

const font = Instrument_Sans({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
})
```

```css
/* app/globals.css */
body { font-family: var(--font-sans), system-ui, sans-serif; }
```

### Escala tipográfica

| Nivel | px | rem | Weight | Tailwind | Uso |
|---|---|---|---|---|---|
| Display | 32 | 2rem | 700 | `text-3xl font-bold` | Hero, business name grande |
| H1 | 24 | 1.5rem | 700 | `text-2xl font-bold` | Headings de página |
| H2 | 20 | 1.25rem | 600 | `text-xl font-semibold` | Secciones, step titles |
| H3 | 16 | 1rem | 600 | `text-base font-semibold` | Subencabezados |
| Body | 16 | 1rem | 400 | `text-base` | Texto de párrafo, line-height 1.6 |
| UI / Form | 15 | 0.9375rem | 400–500 | `text-[15px]` | Inputs, labels grandes |
| Small | 13 | 0.8125rem | 400–500 | `text-sm` | Labels, captions |
| Step label | 12 | 0.75rem | 600 | `text-xs font-semibold` | Step indicator, uppercase |
| Micro / Hint | 11 | 0.6875rem | 400 | `text-[11px]` | Hints, metadata, italic |

**Tabular data:** Usar `font-variant-numeric: tabular-nums` en precios y tiempos — alinea columnas correctamente.

---

## 4. Espaciado

**Base unit:** 8px. **Densidad:** Cómoda — más generosa que competidores (Calendly=16px, Acuity=14px).

| Token | px | rem | Uso |
|---|---|---|---|
| `space-1` | 4 | 0.25rem | Gap mínimo, icon inline |
| `space-2` | 8 | 0.5rem | Gap entre elementos relacionados |
| `space-3` | 12 | 0.75rem | Padding interno pequeño (badges) |
| `space-4` | 16 | 1rem | Padding estándar de sección |
| `space-6` | 24 | 1.5rem | Padding interno de cards (booking) |
| `space-7` | 28 | 1.75rem | Padding interno generoso (risk R3) |
| `space-8` | 32 | 2rem | Gap entre secciones |
| `space-10` | 40 | 2.5rem | Padding página (py-10) |
| `space-12` | 48 | 3rem | Separación mayor entre bloques |

**Regla para booking wizard:** Padding interno de cards → `p-7` (28px). No usar `p-4` (16px) — crea sensación de urgencia.

---

## 5. Border Radius

```css
--radius: 0.75rem  /* 12px */
```

| Nivel | px | Clase | Uso |
|---|---|---|---|
| `rounded-lg` | 12 | Card, Button primario, modal, phone frame |
| `rounded-md` | 8 | `rounded-md` | Button secundario/ghost, inputs, day cells del calendario |
| `rounded-sm` | 4 | `rounded-sm` | Elementos internos pequeños |
| `rounded-full` | 999 | `rounded-full` | Step dots, locale badges, time slot pills |

---

## 6. Componentes reutilizables (shadcn/ui activos)

Importar desde `@/components/ui/`. **No re-implementar** lo que ya existe.

| Componente | Import | Dónde se usa |
|---|---|---|
| `Button` | `@/components/ui/button` | CTA, form submit, nav |
| `Card`, `CardContent` | `@/components/ui/card` | Contenedor de secciones |
| `Badge` | `@/components/ui/badge` | Status, locale switcher (R2) |
| `Dialog`, `DialogContent` | `@/components/ui/dialog` | Modals (pricing, confirmación) |
| `Toast`, `useToast` | `@/components/ui/use-toast` | SLOT_TAKEN recovery (T-DR1) |
| `Input` | `@/components/ui/input` | Formularios |
| `Label` | `@/components/ui/label` | Etiquetas accesibles |
| `Separator` | `@/components/ui/separator` | Divisores visuales |

---

## 7. Animaciones (Framer Motion)

**Motion approach:** Minimal-funcional — solo transiciones que ayudan a la comprensión. Cero animaciones decorativas en el flow de booking.

El wizard usa `AnimatePresence` + `motion.div` con variantes de slide horizontal:

```tsx
const variants = {
  enter: (direction: number) => ({ x: direction > 0 ? 300 : -300, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({ x: direction > 0 ? -300 : 300, opacity: 0 }),
}
// duration: 0.25 — NUNCA > 0.4s en flujos críticos de booking
```

Para skeleton/loading: `opacity: [0.5, 1, 0.5]` con `repeat: Infinity, duration: 1.5`.

---

## 8. Iconografía

Librería: **Lucide React** (`lucide-react`). No mezclar con otras icon libraries.

| Tamaño | Clase | Uso |
|---|---|---|
| 16 | `size={16}` | Inline con texto, iconos de estado en toast |
| 20 | `size={20}` | Botones secundarios, listas |
| 24 | `size={24}` | CTAs principales, nav items |
| 48 | `size={48}` | Ilustraciones de estados vacíos/éxito |

**Iconos en uso en booking flow:** `CheckCircle2` (éxito), `Clock` (hora), `Calendar` (fecha), `ChevronLeft`/`ChevronRight` (nav), `Loader2` (spinner con `animate-spin`), `CalendarPlus` (Add to Calendar T-DR5), `MessageCircle` (WhatsApp T-DR5), `AlertTriangle` (SLOT_TAKEN toast).

---

## 9. Booking Page Layout

**Archivo:** `app/reservar/[slug]/page.tsx`

```
max-w-lg mx-auto px-4 py-10
```

Contenedor intencionalmente estrecho (`max-w-lg` = 512px) para mantener foco. Mobile-first: 390px (iPhone SE).

### Estructura de capas

```
<html lang={locale}>        ← app/layout.tsx (T-DR2)
  <body>
    [booking page]
      <header>              ← logo + locale switcher (T-DR3)
      <step-indicator>      ← "Servicio / Fecha y hora / Tus datos" (R2 - labels siempre visibles)
      <main>
        <FormularioReserva> ← wizard 3 pasos con AnimatePresence
          Paso 1: SelectorServicio
          Paso 2: SelectorFechaHora
          Paso 3: FormularioDatos + submit
        </FormularioReserva>
      </main>
    [/booking page]
  </body>
</html>
```

---

## 10. Wizard Steps (Booking Flow)

| Paso | Componente | Contenido | Estado a pasar |
|---|---|---|---|
| 1 | `SelectorServicio` | Lista de servicios del negocio | `servicioId`, `duracion` |
| 2 | `SelectorFechaHora` | Calendario + grid de slots | `fecha`, `hora` |
| 3 | `FormularioDatos` (inline) | Nombre, apellido, email, teléfono | — → submit |

**Transición:** slide horizontal (positiva 1→2→3, negativa al retroceder).

**SLOT_TAKEN recovery (T-DR1):** API devuelve SLOT_TAKEN → reset `paso` a 2, limpiar `hora`, mostrar shadcn Toast con string i18n'd. **Nunca mostrar string raw del API al usuario.**

---

## 11. Step Indicator (Risk R2)

El indicador siempre muestra los 3 steps con **texto visible** — no solo números o puntos.

```tsx
<nav aria-label="Booking progress">
  <ol role="list" style={{ display: 'flex' }}>
    {steps.map((step, i) => (
      <li key={step.id} aria-current={paso === i + 1 ? 'step' : undefined}>
        <div className={/* dot styles */}>
          {paso > i + 1 ? <Check size={12} /> : i + 1}
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-wide">
          {step.label}  {/* "Servicio" | "Fecha y hora" | "Tus datos" */}
        </span>
      </li>
    ))}
  </ol>
</nav>
```

**Labels i18n'd:** `t('step.service')`, `t('step.datetime')`, `t('step.details')`.

---

## 12. Locale Switcher (T-DR3)

**Ubicación:** header de la booking page, alineado a la derecha.

```tsx
<div className="flex gap-1.5">
  {(['es', 'en', 'pt'] as const).map(l => (
    <Badge
      key={l}
      variant={locale === l ? 'default' : 'outline'}
      className="cursor-pointer uppercase text-[11px] px-2.5 py-1 rounded-full"
      onClick={() => {
        document.cookie = `eli-locale=${l}; path=/; max-age=31536000`
        router.refresh()
      }}
    >
      {l}
    </Badge>
  ))}
</div>
```

---

## 13. Patrones de Estado

### Error (NUNCA string raw del API)

```tsx
{error && (
  <p role="alert" className="text-sm text-destructive mt-2">{error}</p>
)}
```

### Loading

```tsx
<Button disabled={loading}>
  {loading && <Loader2 size={16} className="animate-spin mr-2" />}
  {loading ? t('confirming') : t('confirm')}
</Button>
```

### Success (post-booking)

CheckCircle2 en círculo verde (`bg-success/10 text-success`) + mensaje confirmación + acciones (T-DR5): Add to Calendar + WhatsApp.

### Empty (sin slots)

Mensaje centrado + icono Calendar + texto en el locale del usuario. Permitir navegar a otra fecha — **no** bloquear la UI.

### Booking summary (paso 3)

Resumen de la reserva seleccionada sobre el formulario de datos. Fondo `bg-primary/10` border `border-primary/20`. Muestra: servicio, fecha (formateada con `Intl.DateTimeFormat`), hora.

---

## 14. Accesibilidad (A11y)

Reglas obligatorias para todos los nuevos componentes en el booking flow:

- `aria-current="step"` en el step indicador activo (T-DR6)
- `aria-disabled="true"` en fechas/slots no disponibles — **nunca solo** `disabled` (T-DR6)
- `aria-label` descriptivo en botones icon-only
- `role="alert"` en mensajes de error (screen readers)
- `htmlFor` en todos los `<Label>` vinculados a su `<Input>`
- No depender solo de color para comunicar estado (siempre icono o texto también)
- Contraste mínimo 4.5:1 para texto sobre fondo

---

## 15. Localización de Fechas

**Regla:** nunca arrays hardcodeados de strings. Siempre `Intl.DateTimeFormat`.

```tsx
// Nombre del mes
const monthName = new Intl.DateTimeFormat(locale, { month: 'long' }).format(date)

// Nombre corto del día (header del calendario)
const dayName = new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(date)

// Fecha completa (summary card paso 3)
const fullDate = new Intl.DateTimeFormat(locale, {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
}).format(date)
```

`locale` se pasa desde el Server Component vía `x-locale` header (T2).

---

## 16. Service Names

Los nombres de servicios se renderizan desde la base de datos tal como están — **no se traducen**.

Cuando `locale !== 'es'`, mostrar hint italic bajo el nombre:

```tsx
{locale !== 'es' && (
  <p className="text-[11px] text-muted-foreground italic mt-0.5">
    {t('serviceNameHint')}
  </p>
)}
```

`t('serviceNameHint')` → "Service name as provided by the business" (EN) / "Nome do serviço conforme fornecido pelo negócio" (PT-BR).

---

## 17. NOT in scope (DESIGN.md)

| Área | Estado |
|---|---|
| Dashboard UI (`/dashboard/**`) | Design system separado en progreso |
| Landing page (`/`) | Contexto de marketing propio |
| Auth flows (`/login`, `/registro`) | Flows de negocio separados |
| Email templates (`lib/email.ts`) | HTML en string, no Tailwind |
| Mobile app | Fuera de scope Eli v2 |

---

## 18. Decisions Log

| Fecha | Decisión | Rationale |
|---|---|---|
| 2026-06-05 | DESIGN.md v1.0 creado | Derivado del código existente post `/plan-design-review` |
| 2026-06-05 | Instrument Sans ← Inter (R1) | Inter en overused list. Instrument Sans: profesional con carácter, multilingual. |
| 2026-06-05 | Step labels siempre visibles (R2) | Turista tiene mapa completo del flow. Competitors solo muestran números. |
| 2026-06-05 | Padding generoso 24-28px (R3) | Calma y confianza vs. urgencia. "No tenemos prisa." |
| 2026-06-05 | Memorable: "Profesional y confiable" | North star para todas las decisiones de diseño. |
| 2026-06-05 | Azul-slate hue 250 (SAFE) | Trust universal en la categoría. Mantener. |
| 2026-06-05 | Decoration level: Minimal (SAFE) | Wizard de formulario, no landing page. Foco > decoración. |
