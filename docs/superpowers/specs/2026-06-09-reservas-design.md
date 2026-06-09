# Reservas Dashboard — Design Spec

**Fecha:** 2026-06-09
**Autor:** AE-ROD
**Estado:** Aprobado — listo para implementación

---

## Objetivo

Agregar una sección "Reservas" al sidebar del dashboard con dos tabs:
1. **Mis reservas** — lista de todas las citas con filtros, detalle de cliente, y acciones (cancelar, reagendar, nota interna)
2. **Mi página** — editor inline del mensaje de bienvenida y descripción visibles en la booking page pública del negocio

---

## Arquitectura

### Ruta
`/dashboard/reservas` — nueva página protegida por auth (solo dueño y admins).

### Archivos

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `prisma/schema.prisma` | Modificar | +2 campos a Business: `welcomeMessage`, `description` |
| `prisma/migrations/` | Auto-generar | Migration `add-booking-page-fields` |
| `components/app/layout/barra-lateral.tsx` | Modificar | +entrada "Reservas" en `itemsNavegacion` |
| `app/dashboard/reservas/page.tsx` | Crear | Server component — tabs + auth guard |
| `app/dashboard/reservas/_components/TablaReservas.tsx` | Crear | Client component — lista + filtros |
| `app/dashboard/reservas/_components/ModalDetalleReserva.tsx` | Crear | Client component — detalle, nota, cancelar, reagendar |
| `app/dashboard/reservas/_components/SeccionMiPagina.tsx` | Crear | Client component — URL share + editor inline |
| `app/api/dashboard/reservas/route.ts` | Crear | `GET` — lista de citas del negocio con filtros |
| `app/api/dashboard/reservas/[id]/route.ts` | Crear | `PATCH` — cancelar / reagendar / actualizar nota |
| `app/api/dashboard/configuracion/pagina/route.ts` | Crear | `PATCH` — actualizar welcomeMessage y description |
| `app/reservar/[slug]/page.tsx` | Modificar | Leer y mostrar welcomeMessage + description si existen |

---

## Schema

### Business model — campos nuevos

```prisma
welcomeMessage  String?   // mensaje visible al cliente, max 120 chars
description     String?   // descripción del negocio, max 280 chars
```

Migración: `npx prisma migrate dev --name add-booking-page-fields`

---

## API

### GET /api/dashboard/reservas

Query params:
- `estado`: `"todas" | "pendiente" | "confirmada" | "completada" | "cancelada"` (default: `"todas"`)
- `desde`: ISO date string (default: hoy)
- `hasta`: ISO date string (default: +30 días)

Auth: `getServerSession` → `user.businessId` desde JWT. Sin `businessId` → 401.

Respuesta:
```typescript
{
  citas: {
    id: string
    title: string
    startTime: string    // ISO
    endTime: string      // ISO
    status: string
    price: number | null
    notes: string | null
    clientComments: string | null
    patient: {
      id: string
      firstName: string
      lastName: string
      email: string | null
      phone: string | null
    } | null
    member: {
      id: string
      user: { name: string }
    } | null
  }[]
}
```

### PATCH /api/dashboard/reservas/[id]

Body (campos opcionales, solo los presentes se actualizan):
```typescript
{
  status?: "cancelada"
  startTime?: string    // ISO — para reagendar
  endTime?: string      // ISO — para reagendar
  notes?: string        // nota interna
}
```

Auth: Verifica que `appointment.businessId === user.businessId` antes de actualizar (previene IDOR).

Respuesta: `{ ok: true }` o `{ error: string }` con status code apropiado.

### PATCH /api/dashboard/configuracion/pagina

Body:
```typescript
{
  welcomeMessage?: string   // max 120 chars
  description?: string      // max 280 chars
}
```

Validación con Zod. Auth: `user.businessId` desde JWT. Actualiza Business.

---

## Componentes

### `app/dashboard/reservas/page.tsx` (Server Component)

- Carga datos del negocio (`slug`, `welcomeMessage`, `description`, `plan`)
- Determina si el usuario es owner (`user.role === "owner"`)
- No workers — solo owners y admins tienen acceso; workers → redirect `/dashboard`
- Renderiza los dos tabs con sus datos iniciales pasados como props

### `TablaReservas.tsx` (Client Component)

**Estado local:**
- `filtroEstado: string` — dropdown
- `desde: string`, `hasta: string` — date inputs
- `citaSeleccionada: Cita | null` — para abrir el modal

**Layout:**
```
[Filtros: Estado ▼] [Desde: ___] [Hasta: ___]
─────────────────────────────────────────────
Fecha/Hora | Cliente | Servicio | Trabajador | Estado | Precio | →
```

Badge de estado: colores por valor:
- `pendiente` → amarillo (`bg-yellow-100 text-yellow-800`)
- `confirmada` → verde (`bg-success/10 text-success`)
- `completada` → gris (`bg-muted text-muted-foreground`)
- `cancelada` → rojo (`bg-destructive/10 text-destructive`)

Al clickear una fila → abre `ModalDetalleReserva`.

Carga inicial: fetch a `/api/dashboard/reservas` al montar. Re-fetch al cambiar filtros (debounce 300ms en date inputs).

### `ModalDetalleReserva.tsx` (Client Component)

**Props:** `cita: Cita | null`, `onClose`, `onUpdate(citaActualizada: Cita)`

**Secciones:**
1. **Información del cliente** (read-only): nombre completo, email, teléfono, comentarios al reservar
2. **Detalle de la cita** (read-only): fecha, hora inicio/fin, servicio, trabajador asignado, precio
3. **Nota interna** (editable): `<textarea>` con valor inicial de `cita.notes`. Botón "Guardar nota" → `PATCH /api/dashboard/reservas/[id]` con `{ notes }`.
4. **Acciones** (footer del modal):
   - "Reagendar" → muestra inputs `date` + `time` inline. Al confirmar → `PATCH` con `{ startTime, endTime }` calculando endTime a partir de la duración del servicio.
   - "Cancelar cita" → `AlertDialog` de shadcn: "¿Cancelar esta cita? Se notificará al cliente por email." → `PATCH` con `{ status: "cancelada" }`.

Reagendar: `endTime = startTime + (cita.endTime - cita.startTime)`. Mantiene la duración original.

### `SeccionMiPagina.tsx` (Client Component)

**Props:** `slug: string`, `welcomeMessageInicial: string | null`, `descriptionInicial: string | null`, `servicios: { name: string, duration: number, price: number | null }[]`

**Layout:**
```
📎 Tu página de reservas
[https://useeli.com/reservar/mi-negocio] [Copiar] [Ver como cliente ↗]

─── Personaliza lo que ve el cliente ───

Mensaje de bienvenida
[textarea, max 120 chars, placeholder: "¡Bienvenido! Estamos listos para atenderte..."]
Donde aparece: encima del selector de servicio en tu booking page

Descripción del negocio
[textarea, max 280 chars, placeholder: "Somos un equipo especializado en..."]
Donde aparece: justo debajo del nombre de tu negocio

─── Servicios activos ───
• Corte de cabello — 30 min — $15
• Barba — 20 min — $10
[Editar servicios en Configuración →]
```

**Autosave:** cada campo llama a `PATCH /api/dashboard/configuracion/pagina` al `onBlur`. Muestra un checkmark "✓ Guardado" por 2s. En error → muestra "No se pudo guardar".

**Copy URL:** usa `navigator.clipboard.writeText()` + feedback "¡Copiado!" igual que el dashboard existente.

---

## Booking page — integración

En `app/reservar/[slug]/page.tsx`, agregar `welcomeMessage` y `description` al select del negocio:

```typescript
const negocio = await prisma.business.findUnique({
  where: { slug },
  select: {
    // campos existentes...
    welcomeMessage: true,
    description: true,
  }
})
```

En el componente de la booking page, mostrar si existen:
- `description`: párrafo bajo el nombre del negocio (antes del step-wizard)
- `welcomeMessage`: subtítulo en el header de la booking page

Si ambos son `null` → la página funciona exactamente igual que hoy.

---

## Sidebar

Agregar a `itemsNavegacion` en `barra-lateral.tsx`, entre "Calendario" y "Pacientes":

```typescript
{ id: "reservas", nombre: "Reservas", icono: BookOpen, ruta: "/dashboard/reservas" }
```

Importar `BookOpen` de `lucide-react`.

---

## Constraints de seguridad

- `businessId` SIEMPRE desde JWT (`session.user.businessId`), nunca desde URL params
- En `PATCH /api/dashboard/reservas/[id]`: verificar `appointment.businessId === user.businessId` antes de actualizar
- Workers y pacientes no tienen acceso — solo `role === "owner"` o `role === "admin"`
- Validación Zod en todos los endpoints: rechazar strings fuera del maxLength antes del write a DB

---

## Decisiones de diseño

| Decisión | Razón |
|---|---|
| Reagendar usa date+time libre (no slot-picker) | El dueño gestiona su propia agenda; la disponibilidad ya la sabe |
| Autosave en blur (no submit) | UX pattern del dashboard existente (SeccionIdioma) |
| `welcomeMessage` max 120 chars | Cabe en una línea en mobile sin truncar |
| `description` max 280 chars | Tweet-length — suficiente para describir el negocio |
| Booking page muestra estos campos solo si existen | Backward compatible — nadie ve blank space si no configuró nada |
| Workers → redirect (no acceso a Reservas) | Los datos de todos los clientes del negocio son sensibles |
