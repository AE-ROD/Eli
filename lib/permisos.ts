import type { Prisma } from "@prisma/client"
import type { Session } from "next-auth"
import { esEstadoActivo } from "@/lib/atenciones"

/**
 * Quién puede hacer qué. Única fuente de verdad: ningún endpoint compara roles
 * por su cuenta.
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

// ─── Tablero de atenciones (docs/PRODUCTO.md, sección 7) ─────────────────────

/** Todas las atenciones con todas sus líneas, pagos y totales. El profesional ve lo suyo. */
export const puedeVerTodoElTablero = gestionaElNegocio

/** Anotar una línea a nombre de otro miembro o del dueño. El profesional sólo a su nombre. */
export const puedeAsignarLineasAOtros = gestionaElNegocio

/**
 * La caja del día. Es dinero, pero no reparto: el dueño decidió que el
 * encargado cobre (PRODUCTO.md, sección 3.4). Lo que no hace es anular lo cobrado.
 */
export const puedeCobrar = gestionaElNegocio

/**
 * Anotar a alguien que llegó sin reserva. El profesional también, pero la
 * atención queda a su nombre: sin `memberId` no hay a quién asignarla, y
 * crearía una atención que ni él podría ver.
 */
export const puedeAnotarSinReserva = (actor: Actor | null): boolean =>
  gestionaElNegocio(actor) || !!actor?.memberId

/**
 * El historial de lo anulado: totales y pagos de atenciones que dejaron de
 * sumar, y quién las anuló. Es facturación del negocio, así que lo ve quien
 * ve los ingresos.
 */
export const puedeVerAnuladas = puedeVerIngresosDelNegocio

/** Cita sobre la que se decide algo, ya leída. */
export interface CitaDelNegocio {
  businessId: string
  memberId: string | null
}

/**
 * Si el actor ve una cita que llegó por otro camino que una consulta de
 * agenda (la reserva de la que nació una atención). La misma regla que
 * `whereDeAgenda`: dueño y encargado, todas las del negocio; el profesional,
 * sólo las suyas. Un profesional ve la atención de la cita de un colega si
 * tiene una línea en ella, y eso no le abre la cita del colega.
 */
export const puedeVerCita = (actor: Actor | null, cita: CitaDelNegocio): boolean => {
  if (!mismoNegocio(actor, cita.businessId)) return false
  if (puedeVerTodaLaAgenda(actor)) return true
  return !!actor?.memberId && actor.memberId === cita.memberId
}

/**
 * Deshacer una llegada marcada por error: la atención en espera se borra y la
 * reserva vuelve a "Reservas de hoy". Dueño y encargado, la de cualquier
 * reserva del negocio; el profesional, sólo la de una reserva suya
 * (PRODUCTO.md, sección 7), con la misma regla que `puedeVerCita`.
 *
 * Ver la atención no alcanza: el profesional ve la de la cita de una colega
 * si tiene una línea en ella, y deshacerla borraría las líneas de la colega y
 * le cambiaría la cita.
 *
 * `cita` es la reserva de la que nació la atención, leída del negocio. Es
 * obligatoria, aunque sea `null`: quien pregunta dice de quién es la reserva
 * o que no lo sabe (la pantalla no la recibe si quien mira no ve esa cita).
 * En `null` sólo pueden dueño y encargado, a quienes eso no les cambia nada;
 * el profesional, no (falla cerrado). Un profesional sin `memberId` nunca:
 * ninguna reserva es suya.
 */
export const puedeDeshacerLlegada = (actor: Actor | null, cita: CitaDelNegocio | null): boolean =>
  cita ? puedeVerCita(actor, cita) : gestionaElNegocio(actor)

/** Atención sobre la que se decide algo. Trae su negocio para poder validarlo. */
export interface AtencionDelNegocio {
  businessId: string
  status: string
}

/**
 * Anular. Antes de cobrar, dueño y encargado: alguien se fue sin ser atendido
 * o se anotó por error. Ya cobrada, sólo el dueño: es plata que deja de sumar
 * y es la única forma de corregir un cobro.
 *
 * Falla cerrado: cualquier estado que no sea uno activo conocido se trata como
 * ya cobrado, así que un estado inesperado en la base pide al dueño.
 */
export const puedeAnular = (actor: Actor | null, atencion: AtencionDelNegocio): boolean => {
  if (!mismoNegocio(actor, atencion.businessId)) return false
  return esEstadoActivo(atencion.status) ? gestionaElNegocio(actor) : esDueño(actor)
}

/**
 * A quién queda asignada una línea. `byOwner` y no un `memberId` nulo para el
 * dueño: un `memberId` nulo es también el de alguien que dejó el equipo.
 */
export interface ProfesionalDeLinea {
  memberId: string | null
  byOwner: boolean
}

/**
 * Como `memberIdParaCita`: el profesional no elige. Sus líneas quedan a su
 * nombre, mande lo que mande, y nunca a nombre del dueño; así no puede
 * cargarle a otro lo que hizo él ni sumarse lo que hizo otro. Dueño y
 * encargado asignan a cualquier miembro o al dueño; que el miembro sea del
 * negocio lo verifica el endpoint contra la base.
 */
export function profesionalParaLinea(actor: Actor, pedido: ProfesionalDeLinea): ProfesionalDeLinea {
  if (!puedeAsignarLineasAOtros(actor)) return { memberId: actor.memberId, byOwner: false }
  if (pedido.byOwner) return { memberId: null, byOwner: true }
  return { memberId: pedido.memberId, byOwner: false }
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
function filtroDeClientes(actor: Actor | null): Prisma.CustomerWhereInput {
  if (!actor) return NADA
  return { businessId: actor.businessId }
}

/**
 * Combina el filtro de agenda con condiciones adicionales del endpoint
 * (`customerId`, rango de fechas, etc.) sin que puedan pisarlo.
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
  extra: Prisma.CustomerWhereInput = {}
): Prisma.CustomerWhereInput {
  return { AND: [filtroDeClientes(actor), extra] }
}

/**
 * Las atenciones que ve el actor. Dueño y encargado, todas las del negocio. El
 * profesional, las que tienen una línea suya o nacieron de una cita suya: la
 * segunda condición es la que le muestra a su cliente apenas llega, antes de
 * que nadie le anote un servicio. No se exporta, igual que `filtroDeAgenda`.
 */
function filtroDeAtenciones(actor: Actor | null): Prisma.VisitWhereInput {
  if (!actor) return NADA
  if (puedeVerTodoElTablero(actor)) return { businessId: actor.businessId }
  if (!actor.memberId) return { businessId: actor.businessId, ...NADA }
  return {
    businessId: actor.businessId,
    OR: [
      { services: { some: { memberId: actor.memberId } } },
      { appointment: { is: { memberId: actor.memberId } } },
    ],
  }
}

/**
 * Las líneas que el actor ve, y también las que puede reemplazar: dueño y
 * encargado, todas; el profesional, sólo las suyas. Va por la atención para
 * acotar al negocio, porque la línea no tiene `businessId` propio.
 */
function filtroDeLineas(actor: Actor | null): Prisma.VisitServiceWhereInput {
  if (!actor) return NADA
  const delNegocio = { visit: { is: { businessId: actor.businessId } } }
  if (puedeVerTodoElTablero(actor)) return delNegocio
  if (!actor.memberId) return { ...delNegocio, ...NADA }
  return { ...delNegocio, memberId: actor.memberId }
}

/**
 * Los pagos son facturación del negocio: el profesional no ve ninguno, ni
 * siquiera los de sus propias atenciones (PRODUCTO.md, secciones 7 y 8).
 */
function filtroDePagos(actor: Actor | null): Prisma.VisitPaymentWhereInput {
  if (!actor || !puedeVerIngresosDelNegocio(actor)) return NADA
  return { visit: { is: { businessId: actor.businessId } } }
}

/** Igual que `whereDeAgenda`, para consultas de atenciones. */
export function whereDeAtenciones(
  actor: Actor | null,
  extra: Prisma.VisitWhereInput = {}
): Prisma.VisitWhereInput {
  return { AND: [filtroDeAtenciones(actor), extra] }
}

/** Igual que `whereDeAgenda`, para las líneas de una atención. */
export function whereDeLineas(
  actor: Actor | null,
  extra: Prisma.VisitServiceWhereInput = {}
): Prisma.VisitServiceWhereInput {
  return { AND: [filtroDeLineas(actor), extra] }
}

/** Igual que `whereDeAgenda`, para los pagos de una atención. */
export function whereDePagos(
  actor: Actor | null,
  extra: Prisma.VisitPaymentWhereInput = {}
): Prisma.VisitPaymentWhereInput {
  return { AND: [filtroDePagos(actor), extra] }
}
