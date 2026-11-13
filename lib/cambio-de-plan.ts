import { nombreDePlan, type PlanId } from "@/lib/planes"
import { enumerar, textoDeHoras } from "@/lib/reglas-de-sedes"

/**
 * Cambiar el plan del negocio (`PATCH /api/configuracion/plan`), sin base:
 * entra lo que el endpoint leyó DENTRO de la transacción (el plan de la base,
 * las sedes con sus horas por delante, los integrantes y las invitaciones
 * pendientes) y sale qué hacer o el rechazo con su mensaje.
 *
 * Reglas
 * ──────
 * - Mismo plan: no se hace nada.
 * - Independiente → Equipo: siempre se puede, pero el plan Equipo tiene una
 *   sola sede, la dirección del negocio. Con sedes activas hay que decir cuál
 *   se queda (`sedeQueSeQueda`): su dirección y comuna pasan al negocio, su
 *   horario pasa a ser el horario general, y todas las sedes se desactivan
 *   (el trigger `negocios_cambio_de_plan` exige cero sedes ACTIVAS). Si otra
 *   sede tiene horas por delante, no: primero se mueven o se cancelan.
 * - Equipo → Independiente: sólo si nadie más atiende, o sea sin integrantes en
 *   `miembros_negocio` ni invitaciones pendientes (también las vencidas que
 *   nadie aceptó: el trigger las cuenta).
 *
 * Qué pasa con las horas de la sede que se queda (decisión): las que están por
 * delante (pendientes o confirmadas) y las inscripciones activas de la lista
 * de espera dejan de apuntar a una sede (`sedeId` NULL), porque en el plan
 * Equipo el lugar es el del negocio y un negocio sin sedes activas no deja
 * nada vivo atado a una desactivada (la lista de espera no la volvería a
 * encontrar nunca). La dirección no cambia: es la misma que se copió al
 * negocio. Las horas pasadas, y las canceladas, conservan su sede: la sede no
 * se borra (se desactiva), así que nada apunta a una sede que no existe.
 * Cuando el negocio vuelva a Independiente, "convertir" les vuelve a poner
 * sede a las que sigan por delante.
 */

export interface SedeParaCambiarDePlan {
  id: string
  nombre: string
  activo: boolean
  /** Horas pendientes o confirmadas por delante en esa sede. */
  horasFuturas: number
}

export interface DatosDelCambioDePlan {
  /** El plan que tiene la BASE, no el del token. */
  planActual: PlanId
  planPedido: PlanId
  /** La sede que se queda al pasar a Equipo, como llegó del navegador. */
  sedeQueSeQueda?: string | null
  /** Todas las sedes del negocio, activas e inactivas. */
  sedes: readonly SedeParaCambiarDePlan[]
  /** Filas de `miembros_negocio` del negocio. */
  integrantes: number
  /** Invitaciones sin aceptar (`acceptedAt` NULL), también vencidas. */
  invitacionesPendientes: number
}

export type DecisionDeCambioDePlan =
  | { tipo: "sin-cambios" }
  /**
   * Pasar a Equipo. `sedeQueSeQueda` es null si no había sedes activas. Todas
   * las activas se desactivan (`sedesADesactivar`, la que se queda incluida).
   */
  | { tipo: "a-equipo"; sedeQueSeQueda: string | null; sedesADesactivar: string[] }
  | { tipo: "a-independiente" }
  | { tipo: "rechazado"; status: 400 | 409; error: string; extra?: Record<string, unknown> }

export const MENSAJE_FALTA_LA_SEDE_QUE_SE_QUEDA =
  "Elige la sede que se queda: el plan Equipo tiene una sola, la dirección de tu negocio"
export const MENSAJE_SEDE_QUE_SE_QUEDA_NO_VALE = "La sede que se queda tiene que ser una de tus sedes activas"

const rechazar = (status: 400 | 409, error: string, extra?: Record<string, unknown>): DecisionDeCambioDePlan => ({
  tipo: "rechazado",
  status,
  error,
  ...(extra ? { extra } : {}),
})

export function decidirCambioDePlan(datos: DatosDelCambioDePlan): DecisionDeCambioDePlan {
  if (datos.planPedido === datos.planActual) return { tipo: "sin-cambios" }

  if (datos.planPedido === "equipo") {
    const activas = datos.sedes.filter((sede) => sede.activo === true)
    if (activas.length === 0) return { tipo: "a-equipo", sedeQueSeQueda: null, sedesADesactivar: [] }

    const pedida = datos.sedeQueSeQueda
    if (pedida === undefined || pedida === null || pedida === "") {
      return rechazar(400, MENSAJE_FALTA_LA_SEDE_QUE_SE_QUEDA)
    }
    const quedaEnLaPuerta = activas.find((sede) => sede.id === pedida)
    if (!quedaEnLaPuerta) return rechazar(400, MENSAJE_SEDE_QUE_SE_QUEDA_NO_VALE)

    const conHoras = activas.filter((sede) => sede.id !== quedaEnLaPuerta.id && sede.horasFuturas > 0)
    if (conHoras.length > 0) {
      const total = conHoras.reduce((suma, sede) => suma + sede.horasFuturas, 0)
      const donde = enumerar(conHoras.map((sede) => `${sede.nombre} (${sede.horasFuturas})`))
      return rechazar(
        409,
        `Otras sedes tienen ${textoDeHoras(total)} por delante: ${donde}. Muévelas a ${quedaEnLaPuerta.nombre} o cancélalas antes de pasar al plan ${nombreDePlan("equipo")}`,
        { horasFuturas: total }
      )
    }
    return { tipo: "a-equipo", sedeQueSeQueda: quedaEnLaPuerta.id, sedesADesactivar: activas.map((sede) => sede.id) }
  }

  // Equipo → Independiente.
  if (datos.integrantes > 0) {
    return rechazar(
      409,
      `Tu equipo tiene ${datos.integrantes === 1 ? "un integrante" : `${datos.integrantes} integrantes`}. El plan ${nombreDePlan("independiente")} es para trabajar solo: quítalos del equipo antes de cambiar`,
      { integrantes: datos.integrantes }
    )
  }
  if (datos.invitacionesPendientes > 0) {
    return rechazar(
      409,
      `Tienes ${datos.invitacionesPendientes === 1 ? "una invitación pendiente" : `${datos.invitacionesPendientes} invitaciones pendientes`}. Cancélala${datos.invitacionesPendientes === 1 ? "" : "s"} en Equipo antes de pasar al plan ${nombreDePlan("independiente")}`,
      { invitacionesPendientes: datos.invitacionesPendientes }
    )
  }
  return { tipo: "a-independiente" }
}
