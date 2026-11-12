/**
 * Lo que la sección «Plan» decide sin pantalla: a qué plan se pasaría, si se
 * puede, qué sedes quedan y qué precio se muestra. Las reglas de fondo son del
 * servidor (`PATCH /api/configuracion/plan` vuelve a revisarlas y responde 409
 * con el motivo): esto sólo evita ofrecer lo que se sabe que no se puede y
 * explica las consecuencias antes de confirmar.
 *
 * - **Independiente → Equipo**: se puede. Equipo tiene una sola sede, la
 *   dirección del negocio: con sedes activas hay que elegir cuál pasa a ser esa
 *   dirección y ese horario, y todas las sedes quedan desactivadas (no se
 *   borran). Si otra sede tiene horas agendadas por delante, no se puede hasta
 *   que se muevan o se cancelen.
 * - **Equipo → Independiente**: sólo si no hay integrantes ni invitaciones sin
 *   aceptar; Independiente atiende sólo la dueña.
 *
 * Los precios salen de `lib/precios.ts`; los planes, de `lib/planes.ts`.
 */

import { type PlanId } from "@/lib/planes"
import {
  formatearPesos,
  PERSONAS_INCLUIDAS_EQUIPO,
  PRECIO_EQUIPO,
  PRECIO_INDEPENDIENTE,
  PRECIO_PERSONA_ADICIONAL,
} from "@/lib/precios"
import { ordenarSedes } from "@/lib/sedes"

/** El plan al que se pasaría desde `actual`: hay dos, así que es el otro. */
export function otroPlan(actual: PlanId): PlanId {
  return actual === "independiente" ? "equipo" : "independiente"
}

export interface PrecioDelPlan {
  /** En pesos, con IVA. */
  monto: number
  /** «$9.990/mes». */
  texto: string
  /** Lo que acompaña al precio: el IVA y, en Equipo, lo que incluye. */
  nota: string
}

/** El precio de un plan (sin adicionales), como lo muestran la landing y el modal de precios. */
export function precioDelPlan(plan: PlanId): PrecioDelPlan {
  if (plan === "independiente") {
    return { monto: PRECIO_INDEPENDIENTE, texto: `${formatearPesos(PRECIO_INDEPENDIENTE)}/mes`, nota: "IVA incluido" }
  }
  return {
    monto: PRECIO_EQUIPO,
    texto: `${formatearPesos(PRECIO_EQUIPO)}/mes`,
    nota: `IVA incluido · ${PERSONAS_INCLUIDAS_EQUIPO} personas que atienden · +${formatearPesos(PRECIO_PERSONA_ADICIONAL)}/mes por cada persona más`,
  }
}

/** De una sede, lo que hace falta para elegir cuál queda al pasar a Equipo. */
export interface SedeParaElegir {
  id: string
  nombre: string
  direccion: string
  comuna: string
  orden: number
  activo: boolean
  /** Las horas agendadas que tiene por delante. */
  horasFuturas: number
}

export interface EntradaDelCambio {
  actual: PlanId
  /** Las personas del equipo (sin la dueña). */
  integrantes: number
  /** Las invitaciones que nadie aceptó (también las vencidas: el servidor las cuenta). */
  invitacionesPendientes: number
  /** Las sedes que tiene hoy el negocio (activas e inactivas). */
  sedes: readonly SedeParaElegir[]
}

export interface CambioDePlan {
  destino: PlanId
  /** Por qué no se puede, o `null`. Sólo Equipo → Independiente se bloquea. */
  bloqueo: { integrantes: number; invitaciones: number } | null
  /** Al pasar a Equipo: las sedes activas entre las que se elige la que pasa a ser el negocio. Vacío si no hace falta elegir. */
  sedesParaElegir: SedeParaElegir[]
  /** La que ya viene elegida: la única sede activa. Con varias, ninguna (se elige a propósito). */
  sedePorDefecto: string | null
  /** Cuántas sedes activas se desactivan al confirmar: todas, también la que pasa a ser el negocio. */
  sedesQueSeDesactivan: number
}

/** Qué pasa si se cambia al otro plan, y si hay algo que impide o que pedir. */
export function evaluarCambioDePlan(entrada: EntradaDelCambio): CambioDePlan {
  const destino = otroPlan(entrada.actual)

  if (destino === "independiente") {
    const hayEquipo = entrada.integrantes > 0 || entrada.invitacionesPendientes > 0
    return {
      destino,
      bloqueo: hayEquipo ? { integrantes: entrada.integrantes, invitaciones: entrada.invitacionesPendientes } : null,
      sedesParaElegir: [],
      sedePorDefecto: null,
      sedesQueSeDesactivan: 0,
    }
  }

  const activas = ordenarSedes(entrada.sedes.filter((sede) => sede.activo))
  return {
    destino,
    bloqueo: null,
    sedesParaElegir: activas,
    sedePorDefecto: activas.length === 1 ? activas[0].id : null,
    sedesQueSeDesactivan: activas.length,
  }
}

/**
 * Las otras sedes que todavía tienen horas agendadas por delante: con ellas el
 * servidor rechaza el paso a Equipo (409), porque esas horas se quedarían sin
 * sede. Las de la sede elegida no cuentan: siguen, ahora en el negocio. Sin
 * una sede elegida (o con una que no se ofrece), ninguna.
 */
export function sedesConHorasQueImpiden(cambio: CambioDePlan, elegida: string | null): SedeParaElegir[] {
  if (!elegida || !cambio.sedesParaElegir.some((sede) => sede.id === elegida)) return []
  return cambio.sedesParaElegir.filter((sede) => sede.id !== elegida && sede.horasFuturas > 0)
}

/** Lo que se envía al confirmar, o qué falta para poder hacerlo. */
export type CuerpoDelCambio =
  | { ok: true; plan: PlanId; sedeQueSeQueda?: string }
  | { ok: false; falta: "nada-que-hacer" | "elegir-sede" }
  | { ok: false; falta: "horas-por-delante"; sedes: SedeParaElegir[] }

/**
 * El pedido para confirmar el cambio con la sede elegida (`elegida`). Un
 * cambio bloqueado no se pide. Con sedes activas hay que haber elegido una de
 * ellas (un id que no es de las que se ofrecen cuenta como no haber elegido) y
 * ninguna de las otras puede tener horas por delante.
 */
export function cuerpoDelCambio(cambio: CambioDePlan, elegida: string | null): CuerpoDelCambio {
  if (cambio.bloqueo) return { ok: false, falta: "nada-que-hacer" }
  if (cambio.sedesParaElegir.length === 0) return { ok: true, plan: cambio.destino }
  if (!elegida || !cambio.sedesParaElegir.some((sede) => sede.id === elegida)) return { ok: false, falta: "elegir-sede" }
  const impiden = sedesConHorasQueImpiden(cambio, elegida)
  if (impiden.length > 0) return { ok: false, falta: "horas-por-delante", sedes: impiden }
  return { ok: true, plan: cambio.destino, sedeQueSeQueda: elegida }
}
