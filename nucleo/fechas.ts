/**
 * Cálculos de fechas que la agenda necesita. Van acá y no dentro de la vista
 * porque no tienen nada de pantalla: son reglas que se pueden probar solas, y
 * equivocarse en una semana o en un fin de mes se paga con citas que no
 * aparecen.
 */

/** Lo que se está mirando de una vez: un día, una semana o un mes. */
export type UnidadDeTiempo = "dia" | "semana" | "mes"

/** `2026-03-08`, el formato que esperan los endpoints de citas. */
export function comoTexto(fecha: Date): string {
  const año = fecha.getFullYear()
  const mes = String(fecha.getMonth() + 1).padStart(2, "0")
  const dia = String(fecha.getDate()).padStart(2, "0")
  return `${año}-${mes}-${dia}`
}

/**
 * Los siete días de la semana que contiene a `fecha`, de domingo a sábado.
 *
 * Usa `comoTexto` y no `toISOString()` a propósito: `toISOString` convierte a
 * UTC, así que para alguien en un huso al oeste de Greenwich un lunes a las
 * 21:00 se manda al servidor como martes, y la semana entera queda corrida un
 * día.
 */
export function diasDeLaSemanaDe(fecha: Date): Date[] {
  const domingo = new Date(fecha)
  domingo.setDate(domingo.getDate() - domingo.getDay())
  return Array.from({ length: 7 }, (_, i) => {
    const dia = new Date(domingo)
    dia.setDate(domingo.getDate() + i)
    return dia
  })
}

/** Primer y último día del mes que contiene a `fecha`. */
export function limitesDelMesDe(fecha: Date): { desde: Date; hasta: Date } {
  return {
    desde: new Date(fecha.getFullYear(), fecha.getMonth(), 1),
    hasta: new Date(fecha.getFullYear(), fecha.getMonth() + 1, 0),
  }
}

/** Mueve la fecha según lo que se esté mirando: un día, una semana o un mes. */
export function correr(fecha: Date, unidad: UnidadDeTiempo, pasos: number): Date {
  const movida = new Date(fecha)
  if (unidad === "dia") movida.setDate(movida.getDate() + pasos)
  else if (unidad === "semana") movida.setDate(movida.getDate() + pasos * 7)
  else movida.setMonth(movida.getMonth() + pasos)
  return movida
}
