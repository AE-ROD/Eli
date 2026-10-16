import { correr, deTexto, diasDeLaSemanaDe, rangoDelDia } from "@/lib/fechas"

/**
 * Los períodos que se eligen en los reportes (docs/PRODUCTO.md, sección 8) y
 * cómo se convierte cada uno en el rango [desde, hasta) que pide el endpoint.
 * Todo en hora local: el día y el turno se calculan en la zona del
 * dispositivo de quien mira, igual que el tablero.
 */

export const PERIODOS = [
  { id: "hoy", nombre: "Hoy" },
  { id: "ayer", nombre: "Ayer" },
  { id: "semana", nombre: "Esta semana" },
  { id: "mes", nombre: "Este mes" },
  { id: "personalizado", nombre: "Personalizado" },
] as const

export type PeriodoId = (typeof PERIODOS)[number]["id"]

/** Los que se calculan solos a partir de hoy, sin que nadie elija fechas. */
export type PeriodoFijo = Exclude<PeriodoId, "personalizado">

export type RangoDePeriodo = { ok: true; desde: Date; hasta: Date } | { ok: false; error: string }

/**
 * Lo más largo que se puede pedir de una vez. El endpoint corta en 366 días
 * (un año, con margen para uno bisiesto): se avisa acá, antes de pedir, con
 * un mensaje que dice qué hacer.
 */
export const DIAS_MAXIMOS = 366

const MS_POR_DIA = 24 * 60 * 60 * 1000

/**
 * El rango de un período que se calcula solo. `hoy` lo pasa quien llama, para
 * que el cálculo no dependa del reloj y se pueda probar.
 *
 * - Semana: de domingo a sábado, la misma que muestra la agenda
 *   (`diasDeLaSemanaDe`). Que un reporte y la agenda hablen de semanas
 *   distintas sería una fuente de discusiones.
 * - Semana y mes completos, aunque todavía no terminaron: los días que faltan
 *   no tienen cobros, y así el rango no cambia a lo largo del día.
 */
export function rangoDePeriodo(periodo: PeriodoFijo, hoy: Date): { desde: Date; hasta: Date } {
  if (periodo === "hoy") return rangoDelDia(hoy)
  if (periodo === "ayer") return rangoDelDia(correr(hoy, "dia", -1))
  if (periodo === "semana") {
    const dias = diasDeLaSemanaDe(hoy)
    return { desde: rangoDelDia(dias[0]).desde, hasta: rangoDelDia(dias[6]).hasta }
  }
  return {
    desde: new Date(hoy.getFullYear(), hoy.getMonth(), 1),
    hasta: new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1),
  }
}

/**
 * Un rango elegido a mano, con los dos días incluidos: del 1 al 3 de marzo es
 * [1 de marzo 00:00, 4 de marzo 00:00). `desde` y `hasta` vienen como los da
 * un `<input type="date">` (`2026-03-01`). Si algo no cierra, el error dice
 * qué corregir: el reporte no se pide hasta que el rango es válido.
 */
export function rangoPersonalizado(desdeTexto: string, hastaTexto: string): RangoDePeriodo {
  const desde = deTexto(desdeTexto)
  const hasta = deTexto(hastaTexto)
  if (!desde || !hasta) return { ok: false, error: "Elige la fecha de inicio y la de fin." }
  if (hasta < desde) return { ok: false, error: "La fecha de fin no puede ser anterior a la de inicio." }

  const finExclusivo = rangoDelDia(hasta).hasta
  // Redondeado: un cambio de hora en el medio suma o resta una hora.
  const dias = Math.round((finExclusivo.getTime() - desde.getTime()) / MS_POR_DIA)
  if (dias > DIAS_MAXIMOS) {
    return { ok: false, error: `El período no puede pasar de ${DIAS_MAXIMOS} días: acórtalo o pídelo por partes.` }
  }

  return { ok: true, desde, hasta: finExclusivo }
}
