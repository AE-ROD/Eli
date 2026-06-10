# Landing Page — Rediseño Visual Dark/Navy

**Fecha:** 2026-06-10
**Autor:** AE-ROD + Claude (brainstorming session)
**Estado:** Aprobado, listo para plan de implementación

---

## 1. Resumen

Rediseño visual del landing page público de Eli (`app/page.tsx` y sus componentes en `components/landing/`), introduciendo una identidad oscura ("dark/navy") con glows de color, composición diagonal en el hero, y secciones de producto con más contraste y personalidad.

**Prototipo de referencia (fuente de verdad visual):**
`.superpowers/brainstorm/79282-1781021156/content/landing-v2.html`

Este archivo HTML estático contiene el HTML/CSS final aprobado para cada sección. La implementación debe traducir este prototipo a los componentes React/Next.js existentes, no reinventar el diseño.

## 2. Alcance y relación con DESIGN.md

**Esta identidad dark/navy aplica ÚNICAMENTE al landing page público** (`app/page.tsx` y `components/landing/*`).

`DESIGN.md` (v2.0, "Clean Professional") **sigue rigiendo sin cambios** para:
- Dashboard (`app/dashboard/**`)
- Booking wizard / página de reserva del cliente (`app/perfil/[slug]`, `/reservar/[slug]`)
- Cualquier otra pantalla autenticada o de producto

Es una decisión deliberada de tener una identidad de marketing más audaz separada de la identidad "calmada" del producto. No se debe migrar ninguna pantalla de producto a este estilo sin una decisión explícita aparte.

## 3. Paleta y elementos visuales compartidos

- **Fondo base:** `#07070d` → `#0a0d1a` (gradientes oscuros, navy casi negro)
- **Glows ambientales:** círculos `border-radius: 50%`, `filter: blur(80-90px)`, colores `rgba(59,130,246,0.1-0.14)` (azul) y `rgba(124,58,237,0.08-0.12)` (morado), posicionados en las esquinas de cada sección
- **Acentos de color por contexto:** azul `#3b82f6`/`#60a5fa`, morado `#8b5cf6`/`#a78bfa`, verde `#22c55e`/`#4ade80`, ámbar `#f59e0b`/`#fbbf24`, cian `#22d3ee`
- **Tipografía:** `'Instrument Sans', 'Inter', system-ui, sans-serif` (coherente con DESIGN.md R1)
- **Bordes:** `rgba(255,255,255,0.06-0.1)` sobre fondos oscuros, `border-radius` 12-18px
- **Headings de sección:** `.sec-eyebrow` (uppercase, pequeño, gris), `.sec-h2` (1.85rem, 800, blanco), `.sec-sub` (gris claro)

## 4. Hero — Composición "diagonal duo"

Reemplaza el tilt 3D anterior por dos elementos en diagonales opuestas, anclados a esquinas opuestas del `.hero-right`.

**Browser card** (dashboard preview):
- `position: absolute; top: 30px; left: -50px`, `width: 480px; height: 340px`
- `transform: rotate(-7deg)`
- Fondo `#0f1929`, `border-radius: 14px`, `border: 1px solid rgba(255,255,255,0.09)`
- `box-shadow: 0 30px 70px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)`
- Animación de entrada: `browserSlideIn` (slide horizontal + fade), `1s cubic-bezier(0.22,1,0.36,1) 0.1s both`
- Contenido: barra de navegador (3 dots + URL `app.useeli.com/dashboard`), 4 KPIs, mini gráfico de barras, lista de próximas citas

**Phone (booking page preview)**:
- `.phone-wrap`: `position: absolute; right: 0; bottom: 0; z-index: 10; width: 380px`, `transform: rotate(6deg)`
- Animación de entrada: `phoneRise` (translateY + fade), `0.95s cubic-bezier(0.22,1,0.36,1) 0.3s both`
- `.phone-shell`: fondo `#0c0c14`, `border-radius: 56px`, borde edge-to-edge `1px solid rgba(255,255,255,0.18)`, `box-shadow` con glow azul (`0 0 90px rgba(59,130,246,0.14)`)
- **Dynamic Island**: `.phone-island` — píldora negra `110px × 32px`, `border-radius: 20px`, absolute `top: 16px`, centrada, `z-index: 30`, primer hijo de `.phone-shell` (antes de `.phone-status`)
- Contenido del teléfono: status bar, header de negocio con selector de idioma (ES/EN/PT), step indicator de 3 pasos (Servicio/Fecha/Datos — ver DESIGN.md R2), lista de servicios con precios, CTA "Continuar"

**Notificaciones flotantes** (`.notif-a`, `.notif-b`):
- Cards blancas (`rgba(255,255,255,0.97)`) con sombra, posicionadas sobre el teléfono
- Contra-rotadas para mantener el texto horizontal pese a `rotate(6deg)` del teléfono padre:
  - `.notif-a`: keyframes `floatA` oscilan entre `rotate(-6.5deg)` y `rotate(-5.5deg)`
  - `.notif-b`: keyframes `floatB` fijo en `rotate(-6deg)`
- Animación de flotación infinita (`ease-in-out infinite alternate`)

## 5. "Cómo funciona" + Integraciones — Panel dividido

Reemplaza la grilla de 3 cards + franja de chips por un layout de panel dividido (2 columnas) más una franja de integraciones rediseñada.

**Sección "Cómo funciona"** (`.how-wrap`, grid `0.85fr 1.15fr`, gap 60px):

- **Columna izquierda (`.how-list`)**: lista vertical compacta de 3 pasos, cada uno (`.how-item`) con:
  - `.how-circle`: círculo 42×42px con número (1/2/3), color por paso (azul/morado/verde) vía `--accent`, `--accent-bg`, `--accent-border`
  - Título (`h3`) + descripción corta (`p`)
  - Pasos: "Crea tu negocio" / "Comparte tu enlace" / "Recibe y gestiona" (copy existente, sin cambios)

- **Columna derecha (`.how-visual`)**: mockup tipo ventana de navegador mostrando la página de reservas resultante:
  - `.how-vbar`: barra superior con 3 dots de color + pill de URL `useeli.com/reservar/barberia-elite`
  - `.how-vbody`: header con avatar + nombre del negocio (placeholders), 3 filas de servicio (`.how-vsvc`) con precio destacado en morado, botón CTA "Reservar ahora" con gradiente azul→morado
  - Fondo `#0f1929`, `box-shadow` con glow azul sutil

**Franja de integraciones** (`.integrations` → `.int-inner` → `.how-int`):
- Contenedor con borde y fondo sutil (`rgba(255,255,255,0.03)`, `border: 1px solid rgba(255,255,255,0.08)`, `border-radius: 16px`)
- Label "Funciona con:" seguido de 5 pills (`.how-pill`) con punto de color (`.how-pill-dot`) + texto:
  - Email (Resend) — azul
  - WhatsApp (Twilio) — verde
  - Stripe (pagos) — morado
  - Archivo .ics (calendario) — ámbar
  - SSL + datos seguros — cian

## 6. "Por qué Eli" y "En tiempo real" — Nuevas secciones

Estas dos secciones del prototipo (`.transition-strip` con 4 cards de valor, y `.stream-section` con feed de reservas en vivo) ya usan la paleta oscura y los acentos azul/verde/morado consistentes con el resto del rediseño y **se confirmaron visualmente sin cambios** dentro del prototipo.

Para la implementación, **son secciones nuevas en `app/page.tsx`** — no existe un componente equivalente hoy. Reemplazan a `WhatIsSection` ("Qué es Eli") y `TargetSection` ("Para quién"), que se retiran de la página (ver Sección 7).

- **"Por qué Eli"** (`.transition-strip`): franja de 4 cards con ícono + título + descripción — "Sin doble-bookings", "Turistas que no hablan español", "Recordatorios que reducen no-shows", "Equipo completo desde día 1". Copy ya definido en el prototipo.
- **"En tiempo real"** (`.stream-section`): layout 2 columnas — izquierda: eyebrow "En tiempo real", heading "Cada reserva, en tu bolsillo", lista de features con checks, botón "Ver el dashboard"; derecha: feed de "Actividad de hoy" con 4 `.booking-item` (avatar, nombre, detalle, badge de estado, timestamp) y un `.live-dot` pulsante.

## 7. Mapeo a componentes — Reemplazo completo de `app/page.tsx`

Decisión: `landing-v2.html` se convierte en la nueva estructura de `app/page.tsx`. Las secciones "Qué es Eli", "Para quién" y "Cómo funciona" (versión 4 pasos) se **retiran**; sus componentes (`WhatIsSection`, `TargetSection`) quedan sin uso y deben eliminarse de `app/page.tsx` (evaluar si se borran los archivos o se dejan sin importar, según convención del repo). Esta es una decisión de contenido deliberada del usuario, no un efecto secundario del rediseño visual.

**Nuevo orden de secciones en `app/page.tsx`:**

| Orden | Sección | Componente | Acción |
|---|---|---|---|
| 1 | Hero (diagonal duo + Dynamic Island) | `components/landing/hero-section.tsx` | Redesign visual completo (Sección 4) |
| 2 | "Por qué Eli" (transition strip, 4 cards) | nuevo: `components/landing/why-eli-section.tsx` | Crear (Sección 6) |
| 3 | "En tiempo real" (stream/feed) | nuevo: `components/landing/live-feed-section.tsx` | Crear (Sección 6) |
| 4 | "Cómo funciona" (3 pasos) + Integraciones | `components/landing/how-it-works-section.tsx` | Reescribir: pasa de 4 pasos/tema claro a 3 pasos/panel dividido + integraciones (Sección 5) |
| 5 | Precios | `components/landing/precios-section.tsx` | Restyle de paleta (ver nota abajo) — sin cambios de contenido/layout |
| 6 | Contacto | `components/landing/contact-section.tsx` | Restyle de paleta (ver nota abajo) — sin cambios de contenido/layout |
| — | Nav | `components/landing/header.tsx` | Verificar que combine bien con fondo oscuro (Sección 3); ajustar si es necesario |

**Nota sobre Precios y Contacto:** no hubo mockup dedicado para estas dos secciones en esta sesión de brainstorming. El restyle es de "menor esfuerzo": aplicar los tokens de la Sección 3 (fondo `#07070d`/`#0a0d1a`, glows, bordes `rgba(255,255,255,0.06-0.1)`, acentos azul/morado/verde) a los componentes existentes sin cambiar su estructura/layout/contenido. Si durante la implementación resulta que el layout actual no migra bien a fondo oscuro (ej. depende de `bg-muted` claro para contraste), el implementador debe pausar y solicitar una mini-iteración de mockup antes de continuar — no improvisar un nuevo layout.

El plan de implementación debe:
1. Eliminar `WhatIsSection` y `TargetSection` de `app/page.tsx` (y sus imports), y borrar los archivos `components/landing/what-is-section.tsx` y `components/landing/target-section.tsx` por completo (quedarían sin uso).
2. Portar el HTML/CSS del prototipo a JSX + Tailwind, según el patrón ya usado en `components/landing/*` (clases utilitarias, no CSS Modules nuevos).
3. Mantener todo el copy en español del prototipo (Hero, Por qué Eli, En tiempo real, Cómo funciona, Integraciones) tal cual — es contenido ya aprobado.
4. Las animaciones de entrada (`browserSlideIn`, `phoneRise`, `floatA`/`floatB`, pulse del `.live-dot`, entrada de `.booking-item`) deben implementarse con `framer-motion` (ya usado en `how-it-works-section.tsx`) o CSS keyframes, según lo que sea más simple para cada caso.
5. Quitar `SectionDivider` entre todas las secciones nuevas/rediseñadas (Hero, Por qué Eli, En tiempo real, Cómo funciona+Integraciones, Precios, Contacto): el prototipo separa secciones con sus propios fondos/bordes/gradientes (ej. `.how-section::before`), no con un divider genérico. Si tras portar el restyle de Precios/Contacto el salto visual entre secciones se ve abrupto, ajustar los fondos/bordes de esas secciones en vez de reintroducir `SectionDivider`.

## 8. Fuera de alcance

- Versión mobile/responsive (el prototipo no incluye media queries; se evaluará en una iteración posterior)
- Cambios de copy o contenido más allá de retirar "Qué es Eli" / "Para quién" (Sección 7)
- Mockup nuevo para Precios/Contacto (solo restyle de paleta; ver nota en Sección 7)
- Cambios a DESIGN.md o a pantallas de producto (dashboard, booking wizard)
- SEO, analytics, o cualquier lógica de negocio
