import type { Prisma } from "@prisma/client"
import type { Session } from "next-auth"

/**
 * Quién puede hacer qué. Única fuente de verdad: ningún endpoint compara roles
 * por su cuenta. Ver arquitectura_docs/reglas/01-arquitectura.md.
 *
 * Jerarquía: owner (dueño) > admin (encargado) > worker (profesional).
 * El encargado gestiona la operación; el dinero es sólo del dueño.
 */

export type Rol = "owner" | "admin" | "worker"

export interface Actor {
  rol: Rol
  businessId: string
  /** El dueño no es miembro del equipo, así que no tiene memberId. */
  memberId: string | null
}

/** Miembro sobre el que se decide algo. Trae su negocio para poder validarlo. */
export interface Miembro {
  id: string
  businessId: string
}

const ROLES: readonly string[] = ["owner", "admin", "worker"]

/**
 * Traduce la sesión a un actor. Valida en runtime y no sólo por tipos: un token
 * viejo o mal formado no debe producir un actor.
 */
export function actorDeSesion(session: Pick<Session, "user"> | null | undefined): Actor | null {
  const { role, businessId, memberId } = (session?.user ?? {}) as Record<string, unknown>

  if (typeof role !== "string" || !ROLES.includes(role)) return null
  if (typeof businessId !== "string" || !businessId) return null

  return {
    rol: role as Rol,
    businessId,
    memberId: typeof memberId === "string" && memberId ? memberId : null,
  }
}

// ─── Quién es ────────────────────────────────────────────────────────────────

export const esDueño = (actor: Actor | null): boolean => actor?.rol === "owner"

/** Dueño y encargado: los que gestionan el negocio. */
export const gestionaElNegocio = (actor: Actor | null): boolean =>
  actor?.rol === "owner" || actor?.rol === "admin"

/** El recurso es del mismo negocio que el actor. Base del aislamiento. */
export const mismoNegocio = (actor: Actor | null, businessId: string | null | undefined): boolean =>
  !!actor && !!businessId && actor.businessId === businessId

// ─── Qué puede hacer ─────────────────────────────────────────────────────────

export const puedeGestionarEquipo = gestionaElNegocio
export const puedeVerTodaLaAgenda = gestionaElNegocio
export const puedeGestionarServicios = gestionaElNegocio

/** Facturación del negocio: el profesional ve lo suyo, no el total. */
export const puedeVerIngresosDelNegocio = gestionaElNegocio

/** Dinero. El encargado gestiona la operación pero no define cuánto cobra cada uno. */
export const puedeEditarComisiones = esDueño

/**
 * A quién se asigna una cita. El profesional no elige: termina siempre
 * asignado a sí mismo, mande lo que mande. Dueño y encargado gestionan el
 * negocio, así que se respeta lo pedido, incluido `null` ("sin asignar").
 *
 * Pide un `Actor` y no `Actor | null` a propósito: sin sesión no hay cita, y
 * el endpoint ya cortó con 401 antes de llegar acá.
 */
export function memberIdParaCita(actor: Actor, memberIdPedido: string | null): string | null {
  return actor.rol === "worker" ? actor.memberId : memberIdPedido
}

/** Nadie se cambia el rol a sí mismo: evita autoascensos y quedarse sin acceso. */
export const puedeCambiarRolDe = (actor: Actor | null, miembro: Miembro): boolean =>
  puedeGestionarEquipo(actor) &&
  mismoNegocio(actor, miembro.businessId) &&
  actor?.memberId !== miembro.id

/** El profesional ve su liquidación; dueño y encargado, la de cualquiera. */
export const puedeVerLiquidacionDe = (actor: Actor | null, miembro: Miembro): boolean =>
  mismoNegocio(actor, miembro.businessId) &&
  (gestionaElNegocio(actor) || actor?.memberId === miembro.id)

/**
 * Horarios son operación, no dinero: dueño y encargado editan el de cualquiera.
 * `miembro` en null es el horario general del negocio.
 */
export const puedeEditarHorarioDe = (actor: Actor | null, miembro: Miembro | null): boolean => {
  if (!actor) return false
  if (miembro && !mismoNegocio(actor, miembro.businessId)) return false
  if (gestionaElNegocio(actor)) return true
  return !!actor.memberId && actor.memberId === miembro?.id
}

// ─── Filtros para consultas ──────────────────────────────────────────────────

/**
 * No matchea nada. Va dentro de `AND` porque el llamador combina el filtro con
 * spread (`{ ...filtro, id }`): cualquier clave suelta que use puede pisarla y
 * la negación desaparece sin que nadie lo note.
 */
const NADA = { AND: [{ id: { in: [] as string[] } }] }

/**
 * Filtro de agenda para el `where` de Prisma. **Siempre acota al negocio del
 * actor**: si devolviera sólo el miembro, un endpoint que lo usara tal cual
 * traería las citas de todos los negocios.
 *
 * No se exporta: es la primitiva cuyo spread causó la fuga dos veces (F-001
 * con `id`, F-002 con `AND`). La única forma de armar un `where` con esto es
 * a través de `whereDeAgenda`, que la combina de forma segura.
 */
function filtroDeAgenda(actor: Actor | null): Prisma.AppointmentWhereInput {
  if (!actor) return NADA
  if (puedeVerTodaLaAgenda(actor)) return { businessId: actor.businessId }
  if (!actor.memberId) return { businessId: actor.businessId, ...NADA }
  return { businessId: actor.businessId, memberId: actor.memberId }
}

/**
 * Los clientes son del negocio, no del profesional: todo rol ve los mismos.
 * No se exporta por el mismo motivo que `filtroDeAgenda`: sólo se usa a
 * través de `whereDeClientes`.
 */
function filtroDeClientes(actor: Actor | null): Prisma.PatientWhereInput {
  if (!actor) return NADA
  return { businessId: actor.businessId }
}

/**
 * Combina el filtro de agenda con condiciones adicionales del endpoint
 * (`patientId`, rango de fechas, etc.) sin que puedan pisarlo.
 *
 * `{ ...filtroDeAgenda(actor), ...extra }` es inseguro: si `extra` trae una
 * clave que el filtro también usa (pasó con `id` en F-001 y con `AND` en
 * F-002), el spread la sobrescribe y la negación desaparece en silencio.
 * Envolver ambos en `AND` hace que combinarlos nunca pueda anular el filtro,
 * sin depender de que el llamador se acuerde de no repetir una clave.
 */
export function whereDeAgenda(
  actor: Actor | null,
  extra: Prisma.AppointmentWhereInput = {}
): Prisma.AppointmentWhereInput {
  return { AND: [filtroDeAgenda(actor), extra] }
}

/** Igual que `whereDeAgenda`, para consultas de clientes. */
export function whereDeClientes(
  actor: Actor | null,
  extra: Prisma.PatientWhereInput = {}
): Prisma.PatientWhereInput {
  return { AND: [filtroDeClientes(actor), extra] }
}
