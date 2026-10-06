/**
 * Todo lo que el sistema hace con fechas y horas: los cálculos de la agenda
 * (qué semana, qué mes, cuánto correr), cómo se escribe la hora de una cita y
 * cuánto dura una cita o un servicio. Van acá y no dentro de las vistas porque
 * no tienen nada de pantalla: son reglas que se pueden probar solas, y
 * equivocarse en una semana, en un fin de mes o en una hora se paga con citas
 * que no aparecen o que se leen corridas.
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

/**
 * Hora local en formato 24h (`09:05`, `21:30`) a partir de un instante ISO.
 * Es para citas, que son instantes reales; los horarios laborales ya viajan
 * como `"HH:MM"` sin fecha ni zona y no pasan por acá.
 */
export function formatearHora(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
}

/** Cuántos minutos hay entre dos instantes ISO, redondeado al minuto. */
export function duracionEnMinutos(inicio: string, fin: string): number {
  return Math.round((new Date(fin).getTime() - new Date(inicio).getTime()) / 60000)
}

/**
 * La duración de una cita tal como se muestra en la agenda y en el historial
 * de un cliente: en minutos y nunca menos de uno. Una cita mal cargada, que
 * termina cuando empieza o antes, no se lee como "0 minutos" ni como una
 * duración negativa. Para cuentas sobre el tiempo real, `duracionEnMinutos`.
 */
export function duracionParaMostrar(inicio: string, fin: string): number {
  return Math.max(1, duracionEnMinutos(inicio, fin))
}

/** Si `fecha` cae en el día de hoy, en la zona horaria del navegador. */
export function esHoy(fecha: Date): boolean {
  return fecha.toDateString() === new Date().toDateString()
}

/**
 * Cuánto dura un servicio del catálogo, escrito corto: `45 min`, `1h`,
 * `1h 30min`. Es el formato de la lista de servicios y de la página pública de
 * reservas; el tiempo libre del profesional se escribe con otro
 * (`formatoDuracion`, en `horario-dia.ts`).
 */
export function formatearDuracionDeServicio(minutos: number): string {
  if (minutos < 60) return `${minutos} min`
  const horas = Math.floor(minutos / 60)
  const resto = minutos % 60
  return resto === 0 ? `${horas}h` : `${horas}h ${resto}min`
}
