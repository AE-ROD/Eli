import type { Prisma } from "@prisma/client"
import { MONTO_MAXIMO, tieneCentavosExactos } from "@/lib/atenciones"
import { puedeRegistrarAdelanto, puedeRegistrarAjuste, type Actor } from "@/lib/permisos"
import { fechaDeColumna } from "@/lib/periodos-de-liquidacion"

/**
 * Adelantos, vales y ajustes de un profesional (`MovimientoDeLiquidacion`):
 * lo que entra en su próxima liquidación además de comisiones y propinas.
 * Adelantos y vales descuentan y los registran dueña y encargado; los
 * ajustes llevan signo y motivo, y son sólo de la dueña. No se borran: se
 * anulan, y sólo mientras no estén en una liquidación.
 */

export const TIPOS_DE_MOVIMIENTO = ["adelanto", "vale", "ajuste"] as const
export type TipoDeMovimiento = (typeof TIPOS_DE_MOVIMIENTO)[number]

export const NOMBRES_DE_MOVIMIENTO: Record<TipoDeMovimiento, string> = {
  adelanto: "Adelanto",
  vale: "Vale",
  ajuste: "Ajuste",
}

export const esTipoDeMovimiento = (valor: unknown): valor is TipoDeMovimiento =>
  typeof valor === "string" && (TIPOS_DE_MOVIMIENTO as readonly string[]).includes(valor)

/** Quién registra o anula cada tipo. Falla cerrado ante un tipo desconocido. */
export function puedeManejarMovimiento(actor: Actor | null, tipo: string): boolean {
  if (tipo === "adelanto" || tipo === "vale") return puedeRegistrarAdelanto(actor)
  if (tipo === "ajuste") return puedeRegistrarAjuste(actor)
  return false
}

/**
 * Por qué el monto (en unidades, como lo escribe la pantalla) no sirve para
 * ese tipo, o `null`. Adelanto y vale: mayor que cero. Ajuste: distinto de
 * cero, con signo. Siempre con centavos exactos y bajo el tope.
 */
export function errorDeMonto(tipo: TipoDeMovimiento, monto: number): string | null {
  if (!tieneCentavosExactos(monto)) return "Escribe el monto con hasta dos decimales."
  if (Math.abs(monto) > MONTO_MAXIMO) return "El monto es demasiado grande."
  if (tipo === "ajuste") return monto === 0 ? "Un ajuste no puede ser de $0." : null
  return monto > 0 ? null : "El monto tiene que ser mayor que $0."
}

export const SELECCION_DE_MOVIMIENTO = {
  id: true,
  memberId: true,
  memberName: true,
  tipo: true,
  montoCents: true,
  fecha: true,
  motivo: true,
  visitId: true,
  liquidacionId: true,
  anuladoAt: true,
  anuladoPorNombre: true,
  createdByName: true,
  createdAt: true,
} satisfies Prisma.MovimientoDeLiquidacionSelect

type FilaDeMovimiento = Prisma.MovimientoDeLiquidacionGetPayload<{ select: typeof SELECCION_DE_MOVIMIENTO }>

export interface MovimientoParaMostrar {
  id: string
  memberId: string
  miembro: string
  tipo: TipoDeMovimiento
  montoCents: number
  fecha: string
  motivo: string | null
  visitId: string | null
  liquidacionId: string | null
  anuladoAt: string | null
  anuladoPorNombre: string | null
  registradoPor: string
  createdAt: string
}

export function formatearMovimiento(fila: FilaDeMovimiento): MovimientoParaMostrar {
  return {
    id: fila.id,
    memberId: fila.memberId,
    miembro: fila.memberName,
    tipo: fila.tipo as TipoDeMovimiento,
    montoCents: fila.montoCents,
    fecha: fechaDeColumna(fila.fecha),
    motivo: fila.motivo,
    visitId: fila.visitId,
    liquidacionId: fila.liquidacionId,
    anuladoAt: fila.anuladoAt?.toISOString() ?? null,
    anuladoPorNombre: fila.anuladoPorNombre,
    registradoPor: fila.createdByName,
    createdAt: fila.createdAt.toISOString(),
  }
}
