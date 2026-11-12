/**
 * Lo que la sección «Plan» decide sin pantalla: a qué plan se pasaría, si se
 * puede, qué sedes quedan y qué precio se muestra. Las reglas de fondo son del
 * servidor (`PATCH /api/configuracion/plan` vuelve a revisarlas y responde 409
 * con el motivo): esto sólo evita ofrecer lo que se sabe que no se puede y
 * explica las consecuencias antes de confirmar.
 *
 * - **Independiente → Equipo**: siempre se puede. Equipo tiene una sola sede,
 *   la dirección del negocio: con sedes activas hay que elegir cuál queda
 *   (las demás se desactivan).
 * - **Equipo → Independiente**: sólo si no hay integrantes ni invitaciones
 *   pendientes; Independiente atiende sólo la dueña.
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
}

export interface EntradaDelCambio {
  actual: PlanId
  /** Las personas del equipo (sin la dueña). */
  integrantes: number
  /** Las invitaciones que nadie aceptó y siguen vigentes. */
  invitacionesPendientes: number
  /** Las sedes que tiene hoy el negocio (activas e inactivas). */
  sedes: readonly SedeParaElegir[]
}

export interface CambioDePlan {
  destino: PlanId
  /** Por qué no se puede, o `null`. Sólo Equipo → Independiente se bloquea. */
  bloqueo: { integrantes: number; invitaciones: number } | null
  /** Al pasar a Equipo: las sedes activas entre las que se elige la que queda. Vacío si no hace falta elegir. */
  sedesParaElegir: SedeParaElegir[]
  /** La que ya viene elegida: la única sede activa. Con varias, ninguna (se elige a propósito). */
  sedePorDefecto: string | null
  /** Cuántas sedes activas se desactivan al confirmar. */
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
    sedesQueSeDesactivan: Math.max(0, activas.length - 1),
  }
}

/** Lo que se envía al confirmar, o qué falta para poder hacerlo. */
export type CuerpoDelCambio =
  | { ok: true; plan: PlanId; sedeQueSeQueda?: string }
  | { ok: false; falta: "nada-que-hacer" | "elegir-sede" }

/**
 * El pedido para confirmar el cambio con la sede elegida (`elegida`). Un
 * cambio bloqueado no se pide. Con sedes activas hay que haber elegido una de
 * ellas: un id que no es de las que se ofrecen cuenta como no haber elegido.
 */
export function cuerpoDelCambio(cambio: CambioDePlan, elegida: string | null): CuerpoDelCambio {
  if (cambio.bloqueo) return { ok: false, falta: "nada-que-hacer" }
  if (cambio.sedesParaElegir.length === 0) return { ok: true, plan: cambio.destino }
  if (!elegida || !cambio.sedesParaElegir.some((sede) => sede.id === elegida)) return { ok: false, falta: "elegir-sede" }
  return { ok: true, plan: cambio.destino, sedeQueSeQueda: elegida }
}
