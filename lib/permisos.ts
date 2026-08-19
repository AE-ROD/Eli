import type { Session } from "next-auth"

/**
 * Fuente única de verdad de autorización. Ningún endpoint compara roles por su
 * cuenta: todos preguntan acá. Ver arquitectura_docs/reglas/01-arquitectura.md.
 *
 * Jerarquía: owner (dueño) > admin (encargado) > worker (profesional).
 * El dueño no es BusinessMember, así que su memberId siempre es null — toda
 * regla que dependa de memberId lo contempla explícitamente.
 */

export type Role = "owner" | "admin" | "worker"

export interface Actor {
  role: Role
  businessId: string
  memberId: string | null
}

/** Filtro que no matchea ningún registro. Se usa para fallar cerrado. */
const SIN_RESULTADOS = { id: { in: [] as string[] } }

const ROLES_VALIDOS: readonly Role[] = ["owner", "admin", "worker"]

function esRolValido(valor: unknown): valor is Role {
  return typeof valor === "string" && (ROLES_VALIDOS as readonly string[]).includes(valor)
}

/**
 * Resuelve el actor de la sesión. Valida en tiempo de ejecución (no sólo de
 * tipos) porque el token puede ser viejo o estar mal formado: sin rol
 * reconocible o sin businessId, no hay actor — falla cerrado devolviendo null.
 */
export function actorDeSesion(session: Pick<Session, "user"> | null | undefined): Actor | null {
  const user = session?.user
  if (!user) return null

  const { role, businessId, memberId } = user as {
    role?: unknown
    businessId?: unknown
    memberId?: unknown
  }

  if (!esRolValido(role)) return null
  if (typeof businessId !== "string" || businessId.length === 0) return null

  return {
    role,
    businessId,
    memberId: typeof memberId === "string" && memberId.length > 0 ? memberId : null,
  }
}

/** El negocio de un recurso coincide con el del actor. Base del aislamiento. */
export function perteneceAlNegocio(actor: Actor | null, businessId: string | null | undefined): boolean {
  if (!actor || !businessId) return false
  return actor.businessId === businessId
}

/** Equipo, agenda y horarios son operación: dueño y encargado los gestionan. */
export function puedeGestionarEquipo(actor: Actor | null): boolean {
  return actor?.role === "owner" || actor?.role === "admin"
}

/**
 * Cambiar el rol de un miembro es parte de gestionar el equipo, pero nadie
 * puede cambiarse el rol a sí mismo (ni siquiera el dueño, aunque su
 * memberId null hace la comparación imposible en la práctica).
 */
export function puedeCambiarRolDe(actor: Actor | null, memberIdObjetivo: string): boolean {
  if (!actor || !puedeGestionarEquipo(actor)) return false
  if (actor.memberId !== null && actor.memberId === memberIdObjetivo) return false
  return true
}

/** Sólo el dueño toca dinero: el encargado gestiona operación, no comisiones. */
export function puedeEditarComisiones(actor: Actor | null): boolean {
  return actor?.role === "owner"
}

/** Facturación del negocio: dueño y encargado. El profesional no la ve. */
export function puedeVerIngresosDelNegocio(actor: Actor | null): boolean {
  return actor?.role === "owner" || actor?.role === "admin"
}

/**
 * Dueño y encargado ven la liquidación de cualquiera. El profesional sólo la
 * propia — y sin memberId en sesión no ve ninguna (falla cerrado).
 */
export function puedeVerLiquidacionDe(actor: Actor | null, memberIdObjetivo: string): boolean {
  if (!actor) return false
  if (actor.role === "owner" || actor.role === "admin") return true
  return actor.memberId !== null && actor.memberId === memberIdObjetivo
}

/** Agenda completa del negocio: dueño y encargado. El profesional sólo la suya. */
export function puedeVerTodaLaAgenda(actor: Actor | null): boolean {
  return actor?.role === "owner" || actor?.role === "admin"
}

/**
 * Horarios son operación, no dinero (docs/PRODUCTO.md §5): dueño y encargado
 * editan el horario de cualquier miembro, o el general del negocio
 * (memberIdObjetivo null). El profesional sólo el propio.
 *
 * Generaliza la idea de resolverMemberId() de
 * app/api/configuracion/horarios/route.ts, pero no la copia: ese endpoint es
 * hoy owner-only y quedó desactualizado respecto a esta regla — migrarlo
 * (fuera de esta ficha) va a cambiar su comportamiento para el encargado.
 */
export function puedeEditarHorarioDe(actor: Actor | null, memberIdObjetivo: string | null): boolean {
  if (!actor) return false
  if (actor.role === "owner" || actor.role === "admin") return true
  return actor.memberId !== null && actor.memberId === memberIdObjetivo
}

/**
 * Filtro para esparcir en un `where` de Prisma sobre la agenda del negocio.
 * `{}` para quien ve todo; acotado por memberId para el profesional.
 * Si el profesional no tiene memberId en sesión, no ve nada: nunca `{}`.
 */
export function filtroDeAgenda(actor: Actor | null): Record<string, unknown> {
  if (!actor) return SIN_RESULTADOS
  if (actor.role === "owner" || actor.role === "admin") return {}
  if (!actor.memberId) return SIN_RESULTADOS
  return { memberId: actor.memberId }
}
