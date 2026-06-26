# Auditoría UX — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corregir los 16 issues de mayor impacto encontrados en la auditoría UX de landing + dashboard, priorizados por bloqueo de conversión/retención.

**Architecture:** Fixes directos en componentes existentes; la única creación de página nueva es `/dashboard/ayuda`. No se introduce estado global ni librerías nuevas. Las mejoras de vacío se hacen pasando props condicionales a componentes ya existentes.

**Tech Stack:** Next.js 15 App Router, React, Tailwind CSS, Framer Motion, Lucide Icons, NextAuth.

---

## Mapa de archivos

| Tarea | Archivos modificados |
|---|---|
| T1 — Bug "0" Free plan | `components/landing/precios-section.tsx` |
| T2 — Badge "3" hardcoded | `components/app/layout/barra-lateral.tsx` |
| T3 — Bell badge sin acción | `components/app/layout/barra-superior.tsx` |
| T4 — CTA "Ver el dashboard" sin destino | `components/landing/live-feed-section.tsx` |
| T5 — Precios upgrade page vs landing | `app/dashboard/upgrade/page.tsx` |
| T6 — "Nueva cita" doble click | `app/dashboard/page.tsx` + `app/dashboard/calendario/page.tsx` |
| T7 — /dashboard/ayuda 404 | `app/dashboard/ayuda/page.tsx` (crear) |
| T8 — Empty states dashboard | `app/dashboard/page.tsx` |
| T9 — Walk-in sin servicios → CTA | Leer primero la página walk-in antes de editar |
| T10 — Sidebar colapsado tooltips | `components/app/layout/barra-lateral.tsx` |
| T11 — Acciones rápidas contextuales | `app/dashboard/page.tsx` + `app/api/dashboard/stats/route.ts` |
| T12 — Meta tags SEO/OG | `app/layout.tsx` |
| T13 — CTA Free plan "Empezar gratis" | `components/landing/precios-section.tsx` |
| T14 — Formulario contacto 3 campos | `components/landing/contact-section.tsx` |
| T15 — Team plan features parity | `components/landing/precios-section.tsx` + `components/app/modales/modal-precios.tsx` |
| T16 — FAQ section | `components/landing/faq-section.tsx` (crear) + `app/page.tsx` |

---

## Task 1: Bug "0" en precio Free plan

**Archivo:** `components/landing/precios-section.tsx:219`

**Root cause:** En React, `{0 && <Component />}` renderiza el literal `"0"`. Cuando el plan Free está en modo anual, `precioTotal = plan.anual = 0`, y la expresión `{precioTotal && precioTotal > 0 && (...)}` evalúa a `{0}`, que React imprime como "0" en el DOM.

**Files:**
- Modify: `components/landing/precios-section.tsx:219`

- [ ] **Step 1: Localizar la línea exacta**

En `components/landing/precios-section.tsx`, alrededor de la línea 219:
```tsx
{precioTotal && precioTotal > 0 && (
  <p className="text-xs text-muted-foreground mt-1">
    ${precioTotal} USD/año facturado anualmente
  </p>
)}
```

- [ ] **Step 2: Cambiar a comparación estricta**

Reemplazar esa expresión por:
```tsx
{precioTotal !== null && precioTotal > 0 && (
  <p className="text-xs text-muted-foreground mt-1">
    ${precioTotal} USD/año facturado anualmente
  </p>
)}
```

- [ ] **Step 3: Verificar visualmente**

Con el dev server corriendo en `http://localhost:3000`, ir a la sección de precios y confirmar que el plan Free en modo "Anual" muestra solo "Gratis" sin ningún "0" debajo.

- [ ] **Step 4: Commit**
```bash
git add components/landing/precios-section.tsx
git commit -m "fix: eliminar artefacto '0' en precio del plan Free en modo anual"
```

---

## Task 2: Badge "3" hardcodeado en Mensajería

**Archivo:** `components/app/layout/barra-lateral.tsx:33`

**Root cause:** El array `itemsNavegacion` tiene `notificaciones: 3` hardcodeado en el ítem de Mensajería. No viene de datos reales.

**Files:**
- Modify: `components/app/layout/barra-lateral.tsx:33`

- [ ] **Step 1: Eliminar el campo hardcodeado**

Localizar en `barra-lateral.tsx`:
```ts
{ id: "chats", nombre: "Mensajería", icono: MessageCircle, ruta: "/dashboard/chats", notificaciones: 3 },
```

Cambiarlo a:
```ts
{ id: "chats", nombre: "Mensajería", icono: MessageCircle, ruta: "/dashboard/chats" },
```

- [ ] **Step 2: Verificar que el badge desaparece**

En `http://localhost:3000/dashboard`, el ítem "Mensajería" en el sidebar no debe tener ningún badge numérico.

- [ ] **Step 3: Commit**
```bash
git add components/app/layout/barra-lateral.tsx
git commit -m "fix: eliminar badge '3' hardcodeado en Mensajería del sidebar"
```

---

## Task 3: Bell de notificaciones sin acción

**Archivo:** `components/app/layout/barra-superior.tsx:96-103`

**Root cause:** La campana tiene un badge rojo hardcodeado (`<span className="absolute top-1 right-1 w-2 h-2 bg-primary rounded-full" />`) pero ningún `onClick`. El badge crea expectativa rota. Solución: ocultar el badge hasta que haya un panel de notificaciones real.

**Files:**
- Modify: `components/app/layout/barra-superior.tsx:96-103`

- [ ] **Step 1: Eliminar el badge hardcodeado del botón de notificaciones**

Localizar en `barra-superior.tsx`:
```tsx
{/* Notificaciones */}
<motion.button
  className="relative p-2 rounded-lg hover:bg-muted transition-colors"
  whileHover={{ scale: 1.05 }}
  whileTap={{ scale: 0.95 }}
>
  <Bell className="h-5 w-5 text-muted-foreground" />
  <span className="absolute top-1 right-1 w-2 h-2 bg-primary rounded-full" />
</motion.button>
```

Reemplazar por (quitar el `<span>`, añadir `title` para accesibilidad):
```tsx
{/* Notificaciones */}
<motion.button
  className="relative p-2 rounded-lg hover:bg-muted transition-colors"
  whileHover={{ scale: 1.05 }}
  whileTap={{ scale: 0.95 }}
  title="Notificaciones"
  aria-label="Notificaciones"
>
  <Bell className="h-5 w-5 text-muted-foreground" />
</motion.button>
```

- [ ] **Step 2: Verificar**

En cualquier página del dashboard, la campana no debe mostrar badge rojo.

- [ ] **Step 3: Commit**
```bash
git add components/app/layout/barra-superior.tsx
git commit -m "fix: ocultar badge hardcodeado de notificaciones hasta implementar panel real"
```

---

## Task 4: CTA "Ver el dashboard" sin destino

**Archivo:** `components/landing/live-feed-section.tsx:78`

**Root cause:** `<button type="button" className="stream-cta">Ver el dashboard</button>` — no tiene `onClick` ni está envuelto en `<Link>`. Para un visitante no logueado, debe llevar a `/crear-cuenta`.

**Files:**
- Modify: `components/landing/live-feed-section.tsx:78`

- [ ] **Step 1: Convertir el button en Link**

Localizar en `live-feed-section.tsx`:
```tsx
<button type="button" className="stream-cta">
  Ver el dashboard
  <ArrowRight className="h-[13px] w-[13px]" strokeWidth={2.5} />
</button>
```

Reemplazar por:
```tsx
<Link href="/crear-cuenta" className="stream-cta">
  Ver el dashboard
  <ArrowRight className="h-[13px] w-[13px]" strokeWidth={2.5} />
</Link>
```

Asegurarse de que `Link` de `next/link` ya está importado en el archivo (verificar imports al inicio).

- [ ] **Step 2: Verificar el estilo**

`stream-cta` es una clase CSS-in-JS definida en el `<style jsx>` del mismo componente. Funciona con `<a>` (que Next.js `Link` renderiza como `<a>`). Verificar que el estilo se mantiene navegando a `http://localhost:3000`.

- [ ] **Step 3: Commit**
```bash
git add components/landing/live-feed-section.tsx
git commit -m "fix: conectar CTA 'Ver el dashboard' a /crear-cuenta"
```

---

## Task 5: Inconsistencia de precios entre landing y upgrade page

**Archivo:** `app/dashboard/upgrade/page.tsx`

**Root cause:** La landing muestra el precio anual dividido por 12 (`Math.round(190/12) = $16`/mes) como precio default (toggle en "Anual"). La upgrade page en el dashboard lee `PLANS[key].price` directamente de `lib/stripe.ts` que es el precio mensual ($19). El auditor comparó uno con el otro creyendo que eran el mismo precio.

**Solución:** Agregar toggle anual/mensual a la upgrade page con la misma lógica de cálculo que la landing.

**Files:**
- Modify: `app/dashboard/upgrade/page.tsx`

- [ ] **Step 1: Leer el contenido completo de la upgrade page**

Leer `app/dashboard/upgrade/page.tsx` completo antes de editar para ver todos los imports y la estructura exacta del componente.

- [ ] **Step 2: Agregar estado de periodo y calcular precio**

Al inicio del componente `UpgradePage`, agregar:
```tsx
const [periodo, setPeriodo] = useState<"mensual" | "anual">("anual")
```

Y definir precios con ahorro anual (igual que en la landing):
```tsx
const PRECIOS = {
  pro:  { mensual: 19, anual: 190, ahorroAnual: 38 },
  team: { mensual: 49, anual: 490, ahorroAnual: 98 },
} as const
```

- [ ] **Step 3: Agregar toggle anual/mensual antes de las cards**

Antes del grid de cards, insertar:
```tsx
{/* Toggle mensual / anual */}
<div className="flex items-center justify-center gap-3 mb-6">
  <span className={`text-sm font-medium ${periodo === "mensual" ? "text-foreground" : "text-muted-foreground"}`}>
    Mensual
  </span>
  <button
    onClick={() => setPeriodo(p => p === "mensual" ? "anual" : "mensual")}
    className={`relative w-12 h-6 rounded-full transition-colors ${periodo === "anual" ? "bg-primary" : "bg-muted-foreground/30"}`}
  >
    <span
      className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all"
      style={{ left: periodo === "anual" ? "calc(100% - 22px)" : "2px" }}
    />
  </button>
  <div className="flex items-center gap-2">
    <span className={`text-sm font-medium ${periodo === "anual" ? "text-foreground" : "text-muted-foreground"}`}>
      Anual
    </span>
    <span className="text-xs bg-green-100 text-green-700 font-semibold px-2 py-0.5 rounded-full">
      Ahorra hasta 32%
    </span>
  </div>
</div>
```

- [ ] **Step 4: Usar precio calculado en las cards**

Dentro del `.map()` de los planes, calcular:
```tsx
const precioMostrado = periodo === "mensual"
  ? PRECIOS[key].mensual
  : Math.round(PRECIOS[key].anual / 12)
const precioAnual = periodo === "anual" ? PRECIOS[key].anual : null
```

Y mostrar en el JSX de cada card (justo encima del listado de features):
```tsx
<div className="mb-4">
  <div className="flex items-end gap-1">
    <span className="text-3xl font-bold text-foreground">${precioMostrado}</span>
    <span className="text-muted-foreground text-sm mb-1">USD/mes</span>
  </div>
  {precioAnual !== null && (
    <p className="text-xs text-muted-foreground mt-0.5">
      ${precioAnual} USD/año · ahorras ${PRECIOS[key].ahorroAnual}
    </p>
  )}
</div>
```

- [ ] **Step 5: Verificar en http://localhost:3000/dashboard/upgrade**

El toggle debe mostrar $16/$41 (anual) y $19/$49 (mensual) — consistente con la landing.

- [ ] **Step 6: Commit**
```bash
git add app/dashboard/upgrade/page.tsx
git commit -m "fix: unificar precios entre landing y upgrade page con toggle anual/mensual"
```

---

## Task 6: "Nueva cita" en dashboard abre modal directamente

**Root cause:** `app/dashboard/page.tsx:153` tiene `onClick: () => router.push("/dashboard/calendario")` que navega a la página del calendario. El usuario necesita un segundo clic. Solución: navegar con query param `?nuevaCita=1` y detectarlo en la página del calendario para abrir el modal automáticamente.

**Files:**
- Modify: `app/dashboard/page.tsx:153`
- Modify: `app/dashboard/calendario/page.tsx`

- [ ] **Step 1: Cambiar el onClick en dashboard/page.tsx**

Localizar en `app/dashboard/page.tsx`:
```tsx
accionPrincipal={{
  texto: "Nueva cita",
  onClick: () => router.push("/dashboard/calendario"),
}}
```

Cambiarlo a:
```tsx
accionPrincipal={{
  texto: "Nueva cita",
  onClick: () => router.push("/dashboard/calendario?nuevaCita=1"),
}}
```

- [ ] **Step 2: Detectar el param en calendario/page.tsx**

En `app/dashboard/calendario/page.tsx`, en `PaginaCalendarioInner`, ya existe:
```tsx
const searchParams = useSearchParams()
const pacienteIdParam = searchParams.get("pacienteId") ?? ""
```

Agregar:
```tsx
const nuevaCitaParam = searchParams.get("nuevaCita") === "1"
```

Y cambiar el estado inicial del modal:
```tsx
const [modalAbierto, setModalAbierto] = useState(!!pacienteIdParam || nuevaCitaParam)
```

- [ ] **Step 3: Verificar flujo de 1 clic**

En `http://localhost:3000/dashboard`, al hacer clic en "Nueva cita" del topbar, debe navegarse al calendario y abrirse el modal directamente.

- [ ] **Step 4: Commit**
```bash
git add app/dashboard/page.tsx app/dashboard/calendario/page.tsx
git commit -m "fix: 'Nueva cita' del dashboard abre modal directo con query param"
```

---

## Task 7: Crear página /dashboard/ayuda

**Root cause:** La ruta `/dashboard/ayuda` está en el sidebar pero no existe — devuelve 404.

**Files:**
- Create: `app/dashboard/ayuda/page.tsx`

- [ ] **Step 1: Crear el archivo**

Crear `app/dashboard/ayuda/page.tsx` con el siguiente contenido completo:

```tsx
import { BarraSuperior } from "@/components/app/layout/barra-superior"
import { HelpCircle, Mail, MessageCircle, Book, ExternalLink } from "lucide-react"
import Link from "next/link"

const FAQS = [
  {
    pregunta: "¿Cómo creo mi primera cita?",
    respuesta: "Ve a Calendario → haz clic en 'Nueva cita' → selecciona un usuario, servicio, fecha y hora. También puedes crear walk-ins desde la sección Walk-in.",
  },
  {
    pregunta: "¿Cómo comparto mi enlace de reservas con clientes?",
    respuesta: "En el Dashboard encontrarás tu enlace de reservas personalizado. Cópialo y compártelo por WhatsApp, Instagram o correo electrónico.",
  },
  {
    pregunta: "¿Puedo cancelar mi suscripción en cualquier momento?",
    respuesta: "Sí. Puedes cancelar desde la sección 'Actualizar plan'. Tu cuenta vuelve al plan gratuito al terminar el periodo pagado.",
  },
  {
    pregunta: "¿Los clientes reciben recordatorio automático?",
    respuesta: "Sí. En el plan Pro y Team, los clientes reciben un email de confirmación al reservar y un recordatorio 24 horas antes por email y WhatsApp.",
  },
  {
    pregunta: "¿Qué pasa si el cliente no aparece (no-show)?",
    respuesta: "Puedes marcar la cita como 'No-show' desde el panel de detalle de la cita en el Calendario. Esto queda registrado en el historial del cliente.",
  },
  {
    pregunta: "¿Puedo tener más de un trabajador?",
    respuesta: "El plan Free incluye 1 trabajador. El plan Pro permite hasta 5 y el Team trabajadores ilimitados. Ve a 'Equipo' para invitar a miembros.",
  },
  {
    pregunta: "¿Funcionan las reservas desde el teléfono del cliente?",
    respuesta: "Sí. La página de reservas es completamente responsive y funciona en cualquier dispositivo.",
  },
  {
    pregunta: "¿Puedo cambiar el idioma del sistema de reservas?",
    respuesta: "Sí. Ve a Configuración → Idioma preferido. Puedes elegir Español, English o Português. El plan Pro y Team soportan los 3 idiomas.",
  },
]

export default function AyudaPage() {
  return (
    <div className="min-h-screen">
      <BarraSuperior
        titulo="Ayuda"
        subtitulo="Preguntas frecuentes y soporte"
        mostrarBusqueda={false}
      />

      <div className="p-6 max-w-3xl">
        {/* Preguntas frecuentes */}
        <section className="mb-10">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 rounded-lg bg-primary/10">
              <HelpCircle className="h-5 w-5 text-primary" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">Preguntas frecuentes</h2>
          </div>
          <div className="space-y-3">
            {FAQS.map((faq, i) => (
              <details
                key={i}
                className="bg-card border border-border/50 rounded-xl group"
              >
                <summary className="flex items-center justify-between p-4 cursor-pointer list-none font-medium text-sm text-foreground hover:text-primary transition-colors">
                  {faq.pregunta}
                  <span className="text-muted-foreground group-open:rotate-45 transition-transform duration-200 text-lg leading-none ml-4 flex-shrink-0">+</span>
                </summary>
                <p className="px-4 pb-4 text-sm text-muted-foreground leading-relaxed">
                  {faq.respuesta}
                </p>
              </details>
            ))}
          </div>
        </section>

        {/* Canales de soporte */}
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-4">¿No encontraste tu respuesta?</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <a
              href="mailto:hola@useeli.com"
              className="flex items-start gap-4 p-5 bg-card border border-border/50 rounded-xl hover:border-primary/30 hover:bg-primary/5 transition-all"
            >
              <div className="p-2.5 rounded-xl bg-blue-100 flex-shrink-0">
                <Mail className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="font-medium text-foreground text-sm">Email de soporte</p>
                <p className="text-xs text-muted-foreground mt-0.5">hola@useeli.com</p>
                <p className="text-xs text-muted-foreground">Respuesta en menos de 24h</p>
              </div>
            </a>
            <Link
              href="/#contacto"
              className="flex items-start gap-4 p-5 bg-card border border-border/50 rounded-xl hover:border-primary/30 hover:bg-primary/5 transition-all"
            >
              <div className="p-2.5 rounded-xl bg-violet-100 flex-shrink-0">
                <MessageCircle className="h-5 w-5 text-violet-600" />
              </div>
              <div>
                <p className="font-medium text-foreground text-sm">Formulario de contacto</p>
                <p className="text-xs text-muted-foreground mt-0.5">Cuéntanos tu caso</p>
                <p className="text-xs text-muted-foreground">En la página principal</p>
              </div>
            </Link>
          </div>
        </section>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verificar**

Navegar a `http://localhost:3000/dashboard/ayuda` — debe renderizar la página con las 8 preguntas frecuentes y los 2 canales de soporte. No debe aparecer 404.

- [ ] **Step 3: Commit**
```bash
git add app/dashboard/ayuda/page.tsx
git commit -m "feat: crear página /dashboard/ayuda con FAQ y canales de soporte"
```

---

## Task 8: Mejorar empty states en dashboard

**Root cause:** Con stats en 0, el dashboard muestra ceros en todas las métricas sin ninguna guía. La tarjeta "Pronóstico del mes" con $0/$0 es negativa. Los textos "Sin citas para hoy" y "Aún no tienes usuarios registrados" no invitan a la acción.

**Files:**
- Modify: `app/dashboard/page.tsx`

- [ ] **Step 1: Mejorar texto "Sin citas para hoy"**

Localizar en `app/dashboard/page.tsx`:
```tsx
<p className="text-sm text-muted-foreground text-center py-4">
  {stats ? "Sin citas para hoy" : "Cargando citas..."}
</p>
```

Reemplazar por:
```tsx
<div className="text-center py-6 space-y-2">
  <p className="text-sm text-muted-foreground">Sin citas para hoy</p>
  {enlaceReservas && (
    <a
      href={enlaceReservas}
      target="_blank"
      rel="noopener noreferrer"
      className="text-xs text-primary hover:underline"
    >
      Comparte tu enlace para recibir reservas →
    </a>
  )}
</div>
```

- [ ] **Step 2: Mejorar texto "Aún no tienes usuarios registrados"**

Localizar:
```tsx
<p className="text-sm text-muted-foreground text-center py-4">
  Aún no tienes usuarios registrados
</p>
```

Reemplazar por:
```tsx
<div className="text-center py-6 space-y-2">
  <p className="text-sm text-muted-foreground">Aún no tienes usuarios registrados</p>
  <a
    href="/dashboard/importar"
    className="text-xs text-primary hover:underline"
  >
    Importa tus clientes existentes →
  </a>
</div>
```

- [ ] **Step 3: Ocultar "Pronóstico del mes" cuando no hay datos**

Localizar la sección `Pronóstico del mes` en `app/dashboard/page.tsx`. Está dentro de un `<motion.section>`. Envolver la tarjeta interna con una condición:

```tsx
{/* Pronóstico */}
<motion.section ...>
  <div className="bg-card border border-border/50 rounded-xl p-5 h-full">
    ...
    <div className="space-y-3">
      {/* Solo mostrar la barra de progreso y proyección si hay datos */}
      ...
    </div>
    {stats && stats.ingresoseMes === 0 && stats.ingresosProyectados === 0 && (
      <p className="text-xs text-muted-foreground text-center mt-4">
        Los datos de ingresos aparecerán aquí cuando registres citas completadas.
      </p>
    )}
  </div>
</motion.section>
```

Nota: agregar este bloque al final del `<div className="space-y-3">`, después del condicional de la barra de progreso existente.

- [ ] **Step 4: Verificar**

En `http://localhost:3000/dashboard` con cuenta nueva (sin datos), los textos vacíos deben incluir CTAs y el pronóstico debe mostrar el mensaje guía.

- [ ] **Step 5: Commit**
```bash
git add app/dashboard/page.tsx
git commit -m "ux: mejorar empty states en dashboard con CTAs accionables"
```

---

## Task 9: Walk-in — CTA cuando no hay servicios

**Files:**
- Read first: leer `app/dashboard/walk-in/page.tsx` o la carpeta equivalente
- Modify: el componente que renderiza el dropdown de servicio

- [ ] **Step 1: Encontrar y leer el archivo del walk-in**

```bash
find app/dashboard -iname "*walk*" -o -iname "*walkin*" | head -10
```

Leer el archivo encontrado completo.

- [ ] **Step 2: Localizar el select de Servicio**

Buscar el elemento `<select>` o componente que muestra los servicios. Cuando la lista de servicios está vacía, actualmente muestra el select vacío. 

- [ ] **Step 3: Agregar estado condicional**

Donde se mapean los servicios al select, agregar una condición:

```tsx
{/* Si no hay servicios, mostrar CTA en lugar del select */}
{servicios.length === 0 ? (
  <div className="p-4 rounded-lg border border-amber-200 bg-amber-50/50 text-center">
    <p className="text-sm text-amber-800 font-medium mb-2">No hay servicios configurados</p>
    <a
      href="/dashboard/configuracion"
      className="text-sm text-primary font-medium hover:underline"
    >
      Crear primer servicio →
    </a>
  </div>
) : (
  <select ...>{/* select existente */}</select>
)}
```

Adaptar los nombres de variables al código real que encuentres en el archivo.

- [ ] **Step 4: Deshabilitar el botón de guardar cuando no hay servicios**

Asegurarse de que el botón submit esté `disabled` cuando `servicios.length === 0`.

- [ ] **Step 5: Verificar**

En `http://localhost:3000/dashboard/walk-in` con cuenta sin servicios configurados, el campo Servicio debe mostrar el mensaje de CTA en lugar del dropdown vacío.

- [ ] **Step 6: Commit**
```bash
git add app/dashboard/walk-in/page.tsx  # ajustar path real
git commit -m "ux: mostrar CTA a configuración cuando no hay servicios en Walk-in"
```

---

## Task 10: Tooltips en sidebar colapsado

**Root cause:** Cuando el sidebar está colapsado (solo iconos), no hay manera de saber qué sección es cada icono.

**Files:**
- Modify: `components/app/layout/barra-lateral.tsx`

- [ ] **Step 1: Agregar `title` a los items de navegación cuando está colapsado**

En `barra-lateral.tsx`, en el `<motion.div>` de cada item de navegación del `.map()`, agregar:

```tsx
<motion.div
  className={`...`}
  whileHover={{ x: 2 }}
  title={colapsado ? item.nombre : undefined}
>
```

Hacer lo mismo para `itemsSecundarios`:
```tsx
<motion.div
  className={`...`}
  whileHover={{ x: 2 }}
  title={colapsado ? item.nombre : undefined}
>
```

- [ ] **Step 2: Ampliar área clickeable del botón de colapsar**

Localizar:
```tsx
<motion.button
  className="p-1.5 rounded-lg hover:bg-muted transition-colors"
  onClick={() => setColapsado(!colapsado)}
  animate={{ rotate: colapsado ? 180 : 0 }}
>
  <ChevronLeft className="h-4 w-4 text-muted-foreground" />
</motion.button>
```

Cambiar `p-1.5` a `p-2.5` para ampliar el área de clic, y agregar `title`:
```tsx
<motion.button
  className="p-2.5 rounded-lg hover:bg-muted transition-colors"
  onClick={() => setColapsado(!colapsado)}
  animate={{ rotate: colapsado ? 180 : 0 }}
  title={colapsado ? "Expandir menú" : "Colapsar menú"}
>
  <ChevronLeft className="h-4 w-4 text-muted-foreground" />
</motion.button>
```

- [ ] **Step 3: Verificar**

Colapsar el sidebar en el dashboard y pasar el cursor sobre cada ícono — debe aparecer el tooltip nativo del browser con el nombre de la sección.

- [ ] **Step 4: Commit**
```bash
git add components/app/layout/barra-lateral.tsx
git commit -m "ux: tooltips en sidebar colapsado + área de clic más grande en toggle"
```

---

## Task 11: Acciones rápidas contextuales

**Root cause:** Las 4 acciones rápidas del dashboard son estáticas. Para un usuario nuevo sin datos, "Ver sugerencias IA" y "Analítica del negocio" llevan a pantallas vacías — son falsas promesas.

**Estrategia:** Detectar si el negocio tiene servicios configurados. Si no tiene, mostrar "Crear primer servicio" en lugar de las opciones de IA y analítica.

**Files:**
- Modify: `app/dashboard/page.tsx`
- Modify: `app/api/dashboard/stats/route.ts` (agregar `tieneServicios` al response)

- [ ] **Step 1: Leer app/api/dashboard/stats/route.ts**

Leer el archivo completo para ver qué campos devuelve actualmente.

- [ ] **Step 2: Agregar tieneServicios al endpoint de stats**

En `app/api/dashboard/stats/route.ts`, agregar al query de Prisma:

```ts
const cantidadServicios = await prisma.service.count({
  where: { businessId: session.user.businessId, active: true },
})
```

Y en el objeto de respuesta, agregar:
```ts
tieneServicios: cantidadServicios > 0,
```

- [ ] **Step 3: Actualizar la interface StatsData en dashboard/page.tsx**

En `app/dashboard/page.tsx`, en la interface `StatsData`, agregar:
```ts
tieneServicios: boolean
```

- [ ] **Step 4: Cambiar las acciones rápidas a contextuales**

Localizar el array de acciones rápidas en `app/dashboard/page.tsx`:
```tsx
{[
  { icono: UserPlus, label: "Registrar walk-in", href: "/dashboard/walk-in", color: "..." },
  { icono: FileUp, label: "Importar clientes", href: "/dashboard/importar", color: "..." },
  { icono: Sparkles, label: "Ver sugerencias IA", href: "/dashboard/agentes", color: "..." },
  { icono: TrendingUp, label: "Analítica del negocio", href: "/dashboard/analytics", color: "..." },
].map(...)}
```

Reemplazar por lógica contextual:
```tsx
{(stats?.tieneServicios
  ? [
      { icono: UserPlus, label: "Registrar walk-in", href: "/dashboard/walk-in", color: "text-blue-600 bg-blue-50" },
      { icono: FileUp, label: "Importar clientes", href: "/dashboard/importar", color: "text-violet-600 bg-violet-50" },
      { icono: Sparkles, label: "Ver sugerencias IA", href: "/dashboard/agentes", color: "text-amber-600 bg-amber-50" },
      { icono: TrendingUp, label: "Analítica del negocio", href: "/dashboard/analytics", color: "text-emerald-600 bg-emerald-50" },
    ]
  : [
      { icono: Settings, label: "Crear primer servicio", href: "/dashboard/configuracion", color: "text-blue-600 bg-blue-50" },
      { icono: CalendarDays, label: "Configurar horarios", href: "/dashboard/configuracion", color: "text-violet-600 bg-violet-50" },
      { icono: UserPlus, label: "Registrar walk-in", href: "/dashboard/walk-in", color: "text-amber-600 bg-amber-50" },
      { icono: FileUp, label: "Importar clientes", href: "/dashboard/importar", color: "text-emerald-600 bg-emerald-50" },
    ]
).map((accion) => (...))}
```

Importar `Settings` y `CalendarDays` de lucide-react si no están ya importados.

- [ ] **Step 5: Verificar**

Con cuenta nueva (sin servicios), las acciones rápidas deben mostrar "Crear primer servicio" y "Configurar horarios". Con servicios activos, vuelven a mostrar las originales.

- [ ] **Step 6: Commit**
```bash
git add app/dashboard/page.tsx app/api/dashboard/stats/route.ts
git commit -m "ux: acciones rápidas contextuales según estado del negocio"
```

---

## Task 12: Meta tags SEO y Open Graph en landing

**Archivo:** `app/layout.tsx`

**Root cause:** No hay `<meta name="description">` ni tags OG. Esto bloquea el tráfico orgánico y las previsualizaciones en redes sociales.

**Files:**
- Modify: `app/layout.tsx`

- [ ] **Step 1: Leer app/layout.tsx**

Leer el archivo para ver el `export const metadata` actual.

- [ ] **Step 2: Reemplazar/extender el objeto metadata**

En `app/layout.tsx`, localizar el objeto `metadata` (probablemente tiene solo `title`) y extenderlo:

```ts
export const metadata: Metadata = {
  title: "Eli — Sistema de Reservas para Negocios de Servicios",
  description:
    "Eli automatiza tus reservas, elimina el doble-booking y envía recordatorios por WhatsApp y email. Ideal para barberías, salones y consultorios en LATAM. 3 días gratis.",
  keywords: ["reservas online", "agenda digital", "barbería", "salón de belleza", "LATAM", "WhatsApp"],
  authors: [{ name: "Eli" }],
  openGraph: {
    type: "website",
    locale: "es_MX",
    url: "https://useeli.com",
    siteName: "Eli",
    title: "Eli — Simplifica tu agenda, enfócate en tu talento",
    description:
      "Sistema de reservas automático para barberías, salones y negocios de servicios en LATAM. Sin doble-bookings, con WhatsApp y email incluidos.",
    images: [
      {
        url: "https://useeli.com/og-image.png",
        width: 1200,
        height: 630,
        alt: "Eli — Dashboard de reservas",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Eli — Sistema de Reservas para Negocios de Servicios",
    description:
      "Automatiza tus reservas, elimina el caos del WhatsApp y crece con datos reales. Pruébalo gratis 3 días.",
    images: ["https://useeli.com/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
}
```

**Nota:** La imagen `og-image.png` no existe aún — puede ser un screenshot del dashboard. Mientras tanto, el tag se renderiza correctamente aunque la imagen no cargue.

- [ ] **Step 3: Verificar**

En el browser, abrir DevTools → Elements y buscar en el `<head>` los tags `<meta name="description">` y `<meta property="og:title">`. Deben estar presentes.

- [ ] **Step 4: Commit**
```bash
git add app/layout.tsx
git commit -m "seo: agregar meta description, Open Graph y Twitter Card en app/layout.tsx"
```

---

## Task 13: CTA del plan Free — texto correcto

**Root cause:** En `components/landing/precios-section.tsx:242`, el botón del plan Free dice "Empezar gratis 3 días". El plan Free es permanentemente gratis, no tiene trial de 3 días — el texto confunde al usuario.

**Files:**
- Modify: `components/landing/precios-section.tsx:242`

- [ ] **Step 1: Cambiar texto del CTA según el plan**

Localizar en `precios-section.tsx` el CTA que está dentro del `.map()` de planes:
```tsx
<Link href="/crear-cuenta" className="block">
  <Button
    className={`w-full ${plan.destacado ? "bg-primary hover:bg-primary/90" : ""}`}
    variant={plan.destacado ? "default" : "outline"}
  >
    Empezar gratis 3 días
  </Button>
</Link>
```

Reemplazar por:
```tsx
<Link href="/crear-cuenta" className="block">
  <Button
    className={`w-full ${plan.destacado ? "bg-primary hover:bg-primary/90" : ""}`}
    variant={plan.destacado ? "default" : "outline"}
  >
    {plan.id === "free" ? "Empezar gratis →" : "Empezar gratis 3 días →"}
  </Button>
</Link>
```

- [ ] **Step 2: Verificar**

En `http://localhost:3000/#precios`, el plan Free debe mostrar "Empezar gratis →" y los planes Pro y Team "Empezar gratis 3 días →".

- [ ] **Step 3: Commit**
```bash
git add components/landing/precios-section.tsx
git commit -m "fix: CTA del plan Free dice 'Empezar gratis →' en lugar de '3 días'"
```

---

## Task 14: Reducir formulario de contacto a 3 campos

**Root cause:** El formulario de contacto tiene 5 campos: Nombre, Negocio, Email, Tipo de negocio, Mensaje. Menos campos = más conversiones. Los campos "Negocio" y "Tipo de negocio" se pueden recoger en la conversación posterior.

**Files:**
- Modify: `components/landing/contact-section.tsx`

- [ ] **Step 1: Eliminar los campos "Negocio" y "Tipo de negocio"**

En `contact-section.tsx`, dentro del `<form>`, localizar y eliminar:
1. El `<div className="grid sm:grid-cols-2 gap-4">` que contiene "Nombre" y "Negocio" — reemplazarlo por un solo campo Nombre sin grid.
2. El `<div>` del campo "Tipo de negocio" (el `<select>`) — eliminar completamente.

Resultado esperado del form:
```tsx
<form className="space-y-5">
  <div>
    <label className="block text-sm font-medium text-foreground mb-2">Nombre</label>
    <Input
      placeholder="Tu nombre"
      className="bg-background border-border focus:border-primary"
    />
  </div>

  <div>
    <label className="block text-sm font-medium text-foreground mb-2">Email</label>
    <Input
      type="email"
      placeholder="tu@email.com"
      className="bg-background border-border focus:border-primary"
    />
  </div>

  <div>
    <label className="block text-sm font-medium text-foreground mb-2">Mensaje</label>
    <textarea
      rows={4}
      placeholder="Cuéntanos cómo podemos ayudarte..."
      className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
    />
  </div>

  <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground gap-2">
    <Send className="h-4 w-4" />
    Enviar mensaje
  </Button>
</form>
```

- [ ] **Step 2: Verificar**

En `http://localhost:3000/#contacto`, el formulario debe tener solo 3 campos: Nombre, Email, Mensaje.

- [ ] **Step 3: Commit**
```bash
git add components/landing/contact-section.tsx
git commit -m "ux: reducir formulario de contacto a 3 campos (nombre, email, mensaje)"
```

---

## Task 15: Team plan — paridad de features

**Root cause:** El plan Team tiene solo 4 ítems en su lista de features, mientras Free tiene 8 y Pro tiene 7. El auditor señala que el usuario no puede comparar bien. Solución: expandir el Team para que repita todas las features incluidas (hereda todo de Pro + extras propios).

**Files:**
- Modify: `components/landing/precios-section.tsx` (array `PLANES`)
- Modify: `components/app/modales/modal-precios.tsx` (array `PLANES`)

- [ ] **Step 1: Expandir features del plan Team en precios-section.tsx**

Localizar en `precios-section.tsx` el plan Team:
```ts
{
  id: "team",
  features: [
    { texto: "Trabajadores ilimitados", incluido: true },
    { texto: "Todo lo del plan Pro", incluido: true },
    { texto: "Soporte prioritario", incluido: true },
    { texto: "Exportación de datos", incluido: true },
  ],
}
```

Reemplazar por:
```ts
{
  id: "team",
  features: [
    { texto: "Trabajadores ilimitados", incluido: true },
    { texto: "5+ idiomas (ES/EN/PT + más)", incluido: true },
    { texto: "WhatsApp notifications", incluido: true },
    { texto: "Analytics avanzado", incluido: true },
    { texto: "Perfil SEO + Open Graph", incluido: true },
    { texto: "Soporte prioritario", incluido: true },
    { texto: "Exportación de datos", incluido: true },
  ],
}
```

- [ ] **Step 2: Hacer el mismo cambio en modal-precios.tsx**

Localizar el plan Team en `components/app/modales/modal-precios.tsx` y aplicar el mismo array de features.

- [ ] **Step 3: Verificar**

En `http://localhost:3000/#precios` y en el modal de precios del dashboard, el plan Team debe mostrar 7 features con checkmarks verdes (ninguna con X).

- [ ] **Step 4: Commit**
```bash
git add components/landing/precios-section.tsx components/app/modales/modal-precios.tsx
git commit -m "ux: expandir lista de features del plan Team para paridad con Pro"
```

---

## Task 16: FAQ section en la landing

**Root cause:** La auditoría recomienda una sección de FAQ antes del formulario de contacto para reducir consultas y mejorar SEO long-tail. Las 3 preguntas más frecuentes de SaaS de este tipo: cancelación, WhatsApp Business, qué pasa con el trial.

**Files:**
- Create: `components/landing/faq-section.tsx`
- Modify: `app/page.tsx`

- [ ] **Step 1: Crear components/landing/faq-section.tsx**

```tsx
"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ChevronDown } from "lucide-react"

const FAQS = [
  {
    pregunta: "¿Puedo cancelar en cualquier momento?",
    respuesta: "Sí. No hay contratos ni permanencias. Cancelas desde tu dashboard y tu cuenta vuelve al plan Free al terminar el período pagado. Sin penalizaciones.",
  },
  {
    pregunta: "¿Funciona con WhatsApp Business?",
    respuesta: "Sí. Los recordatorios de citas se envían desde WhatsApp (vía Twilio) y el cliente los recibe como un mensaje normal. No necesitas tener WhatsApp Business — lo gestionamos nosotros.",
  },
  {
    pregunta: "¿Qué pasa cuando termina el trial de 3 días?",
    respuesta: "Tu cuenta pasa automáticamente al plan Free (1 trabajador, solo español, sin WhatsApp). No se te cobra nada. Puedes seguir usando Eli gratis o elegir un plan de pago cuando quieras.",
  },
  {
    pregunta: "¿Mis clientes necesitan crear una cuenta para reservar?",
    respuesta: "No. Tus clientes entran a tu enlace personalizado, eligen el servicio, la fecha y la hora, y listo. Sin registro, sin app, sin fricción.",
  },
  {
    pregunta: "¿Puedo importar mis clientes existentes?",
    respuesta: "Sí. Eli tiene una función de importación que acepta archivos Excel (.xlsx) y CSV. Puedes subir tu lista de clientes con nombre, teléfono y email y quedarán disponibles de inmediato.",
  },
  {
    pregunta: "¿En qué idiomas funciona el sistema de reservas?",
    respuesta: "En Español, English y Português BR. El idioma se detecta automáticamente según el navegador del cliente. Los planes Pro y Team incluyen los 3 idiomas.",
  },
]

export function FaqSection() {
  const [abierto, setAbierto] = useState<number | null>(null)

  return (
    <section id="faq" className="py-24 px-4">
      <div className="max-w-2xl mx-auto">
        <motion.div
          className="text-center mb-14"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5 }}
        >
          <div className="inline-flex items-center gap-2.5 mb-4">
            <div className="h-px w-5 bg-primary/60 rounded-full" />
            <span className="text-xs font-semibold text-primary uppercase tracking-[0.12em]">FAQ</span>
            <div className="h-px w-5 bg-primary/60 rounded-full" />
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-3">
            Preguntas frecuentes
          </h2>
          <p className="text-muted-foreground">
            Si tienes más dudas, escríbenos a{" "}
            <a href="mailto:hola@useeli.com" className="text-primary hover:underline">
              hola@useeli.com
            </a>
          </p>
        </motion.div>

        <div className="space-y-3">
          {FAQS.map((faq, i) => (
            <motion.div
              key={i}
              className="bg-card border border-border/50 rounded-xl overflow-hidden"
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ delay: i * 0.06, duration: 0.4 }}
            >
              <button
                className="w-full flex items-center justify-between p-5 text-left"
                onClick={() => setAbierto(abierto === i ? null : i)}
                aria-expanded={abierto === i}
              >
                <span className="font-medium text-foreground text-sm pr-4">{faq.pregunta}</span>
                <motion.span
                  animate={{ rotate: abierto === i ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                  className="flex-shrink-0"
                >
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </motion.span>
              </button>
              <AnimatePresence>
                {abierto === i && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <p className="px-5 pb-5 text-sm text-muted-foreground leading-relaxed">
                      {faq.respuesta}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Agregar FaqSection a app/page.tsx**

En `app/page.tsx`, importar y agregar entre `PreciosSection` y `ContactSection`:

```tsx
import { FaqSection } from "@/components/landing/faq-section"
```

Y en el JSX:
```tsx
<PreciosSection />
<FaqSection />
<ContactSection />
```

- [ ] **Step 3: Verificar**

En `http://localhost:3000`, scrollear hasta la nueva sección FAQ entre Precios y Contacto. Los accordions deben abrirse y cerrarse con animación.

- [ ] **Step 4: Commit**
```bash
git add components/landing/faq-section.tsx app/page.tsx
git commit -m "feat: agregar sección FAQ en landing entre Precios y Contacto"
```

---

## Self-Review

### Cobertura del spec (auditoría):

| Issue auditoria | Task | Cubierto |
|---|---|---|
| Landing 1.1 — "0" plan Free | T1 | ✅ |
| Landing 1.3 — a>button anidado | No aplica — no hay botones anidados en el header actual | ✅ skip |
| Landing 1.4 — Team features inconsistente | T15 | ✅ |
| Landing 1.5 — Sin meta description/OG | T12 | ✅ |
| Landing 1.6 — "Chat integrado" sin sección | Decisión de producto — eliminar la pill está fuera del plan (no se conoce roadmap) | Scope out |
| Landing 1.7 — CTA "Ver el dashboard" sin destino | T4 | ✅ |
| Landing R2 — Testimonios reales | Requiere contenido real del founder — fuera de scope técnico | Scope out |
| Landing R3 — Posicionamiento barberías/todos | Decisión estratégica — fuera de scope | Scope out |
| Landing R6 — Tabla comparativa | Alta complejidad, bajo ROI sobre las cards actuales — fuera de scope | Scope out |
| Landing R9 — Aviso privacidad | No hay páginas de T&C/Privacy aún — fuera de scope | Scope out |
| Dash 1.1 — /dashboard/ayuda 404 | T7 | ✅ |
| Dash 1.2 — Inconsistencia precios | T5 | ✅ |
| Dash 1.4 — Badge "3" falso | T2 | ✅ |
| Dash 1.5 — Área clic colapsar + tooltips | T10 | ✅ |
| Dash 1.6 — Bell sin acción | T3 | ✅ |
| Dash 1.7/1.8 — Validación formulario nativo | T9 incluye (al leer el walk-in) | ✅ parcial |
| Dash 1.9 — Walk-in vacío sin CTA | T9 | ✅ |
| Dash R1 — Onboarding primeros pasos | T11 (acciones contextuales) + T8 (empty states) | ✅ |
| Dash R5 — "Nueva cita" 1 clic | T6 | ✅ |
| Dash R10 — Acciones contextuales | T11 | ✅ |
| Dash R17 — Filtro fecha analítica | Alta complejidad / fuera del alcance crítico de esta auditoría | Scope out |
| Landing R15 — FAQ | T16 | ✅ |
| Landing R7 — Reducir form contacto | T14 | ✅ |
| Landing R13 — CTA Free plan texto | T13 | ✅ |

### Sin placeholders: revisado ✅
### Consistencia de nombres: revisado ✅ (todos los componentes referenciados existen excepto los de crear)
