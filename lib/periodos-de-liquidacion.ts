import { diaDeLaSemana, esFechaCalendario, fechaYMinutosEn, rangoDelDiaEn, sumarDias } from "@/lib/zona-horaria"

/**
 * Los períodos de liquidación (#68): cada cuánto se le paga al equipo y qué
 * días cubre cada liquidación. Puro: sin base ni reloj; quien llama pasa
 * "hoy" y la configuración del negocio.
 *
 * Todo en fechas calendario "AAAA-MM-DD" del negocio (su zona): un período es
 * un rango de días con los dos extremos incluidos. Lo que cae dentro se
 * decide por instante con `finDelPeriodoEn`, que usa `rangoDelDiaEn` y por eso
 * respeta los días de 23 y 25 horas del cambio de hora.
 */

export const TIPOS_DE_PERIODO = ["semanal", "quincenal", "mensual"] as const
export type TipoDePeriodo = (typeof TIPOS_DE_PERIODO)[number]

export const NOMBRES_DE_PERIODO: Record<TipoDePeriodo, string> = {
  semanal: "Semanal",
  quincenal: "Quincenal (1 al 15 y 16 a fin de mes)",
  mensual: "Mensual",
}

/** 0 domingo … 6 sábado, como `WorkSchedule.dayOfWeek`. */
export const DIAS_DE_LA_SEMANA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"] as const

export interface ConfiguracionDePeriodo {
  periodo: TipoDePeriodo
  /** Sólo cuenta en el semanal: qué día empieza la semana. */
  inicioSemana: number
}

export interface Periodo {
  desde: string
  hasta: string
}

export const esTipoDePeriodo = (valor: unknown): valor is TipoDePeriodo =>
  typeof valor === "string" && (TIPOS_DE_PERIODO as readonly string[]).includes(valor)

export const esDiaDeLaSemana = (valor: unknown): valor is number =>
  typeof valor === "number" && Number.isInteger(valor) && valor >= 0 && valor <= 6

/**
 * La configuración guardada en el negocio, leída sin confiar en ella: un
 * valor que no se conoce cae en el default del esquema (mensual, lunes), en
 * vez de romper la liquidación. La base además lo limita con CHECK.
 */
export function configuracionDelNegocio(negocio: {
  liquidacionPeriodo: string | null | undefined
  liquidacionInicioSemana: number | null | undefined
}): ConfiguracionDePeriodo {
  return {
    periodo: esTipoDePeriodo(negocio.liquidacionPeriodo) ? negocio.liquidacionPeriodo : "mensual",
    inicioSemana: esDiaDeLaSemana(negocio.liquidacionInicioSemana) ? negocio.liquidacionInicioSemana : 1,
  }
}

function ultimoDiaDelMes(fecha: string): string {
  const [año, mes] = fecha.split("-").map(Number)
  const ultimo = new Date(Date.UTC(año, mes, 0)).getUTCDate()
  return `${fecha.slice(0, 8)}${String(ultimo).padStart(2, "0")}`
}

/**
 * El período que contiene `fecha` según la configuración:
 * - semanal: de `inicioSemana` a los seis días siguientes;
 * - quincenal: del 1 al 15, o del 16 al último día del mes (28, 29, 30 o 31);
 * - mensual: del 1 al último día del mes.
 */
export function periodoQueContiene(fecha: string, config: ConfiguracionDePeriodo): Periodo {
  if (!esFechaCalendario(fecha)) throw new RangeError(`Fecha calendario inválida: ${fecha}`)
  if (config.periodo === "semanal") {
    const atras = (diaDeLaSemana(fecha) - config.inicioSemana + 7) % 7
    const desde = sumarDias(fecha, -atras)
    return { desde, hasta: sumarDias(desde, 6) }
  }
  const primero = `${fecha.slice(0, 8)}01`
  if (config.periodo === "quincenal") {
    const dia = Number(fecha.slice(8, 10))
    return dia <= 15
      ? { desde: primero, hasta: `${fecha.slice(0, 8)}15` }
      : { desde: `${fecha.slice(0, 8)}16`, hasta: ultimoDiaDelMes(fecha) }
  }
  return { desde: primero, hasta: ultimoDiaDelMes(fecha) }
}

/**
 * Qué días cubre la próxima liquidación de alguien:
 * - si ya tiene una no anulada, desde el día siguiente a su `hasta`;
 * - si no, desde el inicio del período de lo más antiguo que tiene pendiente
 *   (o de hoy, si no tiene nada);
 * y hasta el fin del período vigente que contiene ese `desde`. Cambiar el
 * tipo de período sólo afecta lo que viene: el `desde` sale de lo ya cerrado,
 * y el `hasta`, del período nuevo (puede quedar un primer tramo corto).
 */
export function proximoPeriodo(opciones: {
  ultimaHasta: string | null
  primerPendiente: string | null
  hoy: string
  config: ConfiguracionDePeriodo
}): Periodo {
  const { ultimaHasta, primerPendiente, hoy, config } = opciones
  const desde = ultimaHasta
    ? sumarDias(ultimaHasta, 1)
    : periodoQueContiene(primerPendiente && primerPendiente < hoy ? primerPendiente : hoy, config).desde
  return { desde, hasta: periodoQueContiene(desde, config).hasta }
}

/** El primer instante después del período: lo cobrado antes de esto entra (con `paidAt < fin`). */
export function finDelPeriodoEn(hasta: string, zona: string): Date {
  return rangoDelDiaEn(hasta, zona).hasta
}

/** El primer instante del período. */
export function inicioDelPeriodoEn(desde: string, zona: string): Date {
  return rangoDelDiaEn(desde, zona).desde
}

/** El día del negocio en que cae un instante. */
export function fechaDelNegocio(instante: Date, zona: string): string {
  return fechaYMinutosEn(instante, zona).fecha
}

// ─── Columnas DATE ───────────────────────────────────────────────────────────
//
// Prisma lee y escribe un `@db.Date` como un `Date` a la medianoche UTC. Se
// convierte sólo en el borde, sin pasar por la zona del proceso.

export function fechaDeColumna(valor: Date): string {
  return valor.toISOString().slice(0, 10)
}

export function fechaParaColumna(fecha: string): Date {
  if (!esFechaCalendario(fecha)) throw new RangeError(`Fecha calendario inválida: ${fecha}`)
  return new Date(`${fecha}T00:00:00.000Z`)
}

// ─── Para leer ───────────────────────────────────────────────────────────────

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"]

/** "2026-10-01" → "1 oct 2026". */
export function fechaParaLeer(fecha: string): string {
  const [año, mes, dia] = fecha.split("-").map(Number)
  return `${dia} ${MESES[mes - 1]} ${año}`
}

/** "1 al 15 oct 2026", "28 sept al 4 oct 2026", "28 dic 2026 al 3 ene 2027". */
export function periodoParaLeer(desde: string, hasta: string): string {
  if (desde === hasta) return fechaParaLeer(desde)
  const [añoA, mesA, diaA] = desde.split("-").map(Number)
  const [añoB] = hasta.split("-").map(Number)
  if (añoA !== añoB) return `${fechaParaLeer(desde)} al ${fechaParaLeer(hasta)}`
  const inicio = desde.slice(0, 7) === hasta.slice(0, 7) ? String(diaA) : `${diaA} ${MESES[mesA - 1]}`
  return `${inicio} al ${fechaParaLeer(hasta)}`
}
