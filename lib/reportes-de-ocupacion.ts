import { franjasParaElDia } from "@/lib/mover-cita"
import type { FilaDeHorarioSemanal } from "@/lib/horario-de-atencion"
import { diaDeLaSemana, instanteEn, sumarDias } from "@/lib/zona-horaria"

/**
 * Reportes para llenar horas (#72): ocupación por profesional, clientes
 * nuevos y recurrentes, inasistencia, y la comparación con el período
 * anterior de igual largo. Puro: el endpoint lee la base (siempre acotada al
 * negocio de la sesión) y esto calcula.
 *
 * Reglas:
 * - **Ocupación** = minutos de citas que ocupan (pendiente, confirmada, en
 *   progreso, completada) dentro de lo disponible, sobre lo disponible.
 *   Disponible = su horario (el propio si cargó alguno, si no el del negocio,
 *   como al agendar: `franjasParaElDia`) menos sus bloqueos y los de todo el
 *   negocio. Una cita fuera de su horario no suma (no infla más del 100 %), y
 *   dos citas que se pisan cuentan una vez. Sin horario disponible la
 *   ocupación es `null` ("sin horario"), nunca `NaN`; con horario y sin citas,
 *   0.
 * - **Clientes**: de los que pagaron una atención en el período, nuevo es
 *   quien no tenía ninguna atención cobrada antes del período; recurrente,
 *   quien sí. Las atenciones sin ficha de cliente no se clasifican.
 * - **Inasistencia** = "no vino" sobre las citas del período que ya
 *   empezaron y no se cancelaron. Sin citas así, `null`.
 * - **Comparación**: contra el período anterior del mismo largo. El cambio
 *   es `null` si lo anterior es 0 o no existe: no hay contra qué comparar.
 */

const MS_POR_MINUTO = 60_000

/** Estados con los que una cita ocupa el horario de quien atiende. */
export const ESTADOS_QUE_OCUPAN = ["pendiente", "confirmada", "en-progreso", "completada"] as const

export interface Intervalo {
  inicio: number
  fin: number
}

/** Une los intervalos que se pisan o se tocan; salen ordenados. */
export function unir(intervalos: readonly Intervalo[]): Intervalo[] {
  const ordenados = intervalos.filter((i) => i.fin > i.inicio).sort((a, b) => a.inicio - b.inicio || a.fin - b.fin)
  const unidos: Intervalo[] = []
  for (const actual of ordenados) {
    const ultimo = unidos[unidos.length - 1]
    if (ultimo && actual.inicio <= ultimo.fin) ultimo.fin = Math.max(ultimo.fin, actual.fin)
    else unidos.push({ ...actual })
  }
  return unidos
}

/** `base` menos `quitar`: lo que queda de los intervalos de `base` fuera de los de `quitar`. */
export function restar(base: readonly Intervalo[], quitar: readonly Intervalo[]): Intervalo[] {
  const huecos = unir(quitar)
  const resultado: Intervalo[] = []
  for (const tramo of unir(base)) {
    let inicio = tramo.inicio
    for (const hueco of huecos) {
      if (hueco.fin <= inicio || hueco.inicio >= tramo.fin) continue
      if (hueco.inicio > inicio) resultado.push({ inicio, fin: hueco.inicio })
      inicio = Math.max(inicio, hueco.fin)
      if (inicio >= tramo.fin) break
    }
    if (inicio < tramo.fin) resultado.push({ inicio, fin: tramo.fin })
  }
  return resultado
}

/** Cuánto de `a` cae dentro de `b`, en ms. */
export function solape(a: readonly Intervalo[], b: readonly Intervalo[]): number {
  const x = unir(a)
  const y = unir(b)
  let total = 0
  for (const i of x) {
    for (const j of y) {
      const desde = Math.max(i.inicio, j.inicio)
      const hasta = Math.min(i.fin, j.fin)
      if (hasta > desde) total += hasta - desde
    }
  }
  return total
}

const duracion = (intervalos: readonly Intervalo[]) => unir(intervalos).reduce((suma, i) => suma + i.fin - i.inicio, 0)

/** Las fechas de `desde` a `hasta`, las dos incluidas. */
export function diasDelPeriodo(desde: string, hasta: string): string[] {
  const dias: string[] = []
  for (let dia = desde; dia <= hasta; dia = sumarDias(dia, 1)) dias.push(dia)
  return dias
}

export interface CitaParaReporte {
  memberId: string | null
  status: string
  startTime: Date
  endTime: Date
}

export interface BloqueoParaReporte {
  /** `null`: de todo el negocio. */
  memberId: string | null
  startTime: Date
  endTime: Date
}

export interface Miembro {
  id: string
  nombre: string
}

export interface OcupacionDeProfesional {
  id: string
  nombre: string
  minutosDisponibles: number
  minutosOcupados: number
  /** De 0 a 1; `null` si no tuvo horario disponible. */
  ocupacion: number | null
}

export interface Ocupacion {
  porProfesional: OcupacionDeProfesional[]
  total: { minutosDisponibles: number; minutosOcupados: number; ocupacion: number | null }
}

const proporcion = (parte: number, todo: number): number | null => (todo > 0 ? parte / todo : null)

const intervalo = (tramo: { startTime: Date; endTime: Date }): Intervalo => ({
  inicio: tramo.startTime.getTime(),
  fin: tramo.endTime.getTime(),
})

/** El horario disponible de un profesional en esos días, en instantes, sin los bloqueos. */
function disponibleDe(
  memberId: string,
  dias: readonly string[],
  filas: readonly FilaDeHorarioSemanal[],
  bloqueos: readonly BloqueoParaReporte[],
  zona: string
): Intervalo[] {
  const horario: Intervalo[] = []
  for (const fecha of dias) {
    const delDia = franjasParaElDia([...filas], memberId, diaDeLaSemana(fecha))
    if (!delDia) continue
    for (const franja of delDia.franjas) {
      horario.push({
        inicio: instanteEn(fecha, franja.startTime, zona).getTime(),
        fin: instanteEn(fecha, franja.endTime, zona).getTime(),
      })
    }
  }
  const suyos = bloqueos.filter((bloqueo) => bloqueo.memberId === null || bloqueo.memberId === memberId).map(intervalo)
  return restar(horario, suyos)
}

export function calcularOcupacion(datos: {
  dias: readonly string[]
  zona: string
  miembros: readonly Miembro[]
  filas: readonly FilaDeHorarioSemanal[]
  bloqueos: readonly BloqueoParaReporte[]
  citas: readonly CitaParaReporte[]
}): Ocupacion {
  const ocupan = new Set<string>(ESTADOS_QUE_OCUPAN)
  const porProfesional = datos.miembros.map((miembro) => {
    const disponible = disponibleDe(miembro.id, datos.dias, datos.filas, datos.bloqueos, datos.zona)
    const citas = datos.citas.filter((cita) => cita.memberId === miembro.id && ocupan.has(cita.status)).map(intervalo)
    const minutosDisponibles = Math.round(duracion(disponible) / MS_POR_MINUTO)
    const minutosOcupados = Math.round(solape(citas, disponible) / MS_POR_MINUTO)
    return {
      id: miembro.id,
      nombre: miembro.nombre,
      minutosDisponibles,
      minutosOcupados,
      ocupacion: proporcion(minutosOcupados, minutosDisponibles),
    }
  })
  const minutosDisponibles = porProfesional.reduce((suma, p) => suma + p.minutosDisponibles, 0)
  const minutosOcupados = porProfesional.reduce((suma, p) => suma + p.minutosOcupados, 0)
  return {
    porProfesional,
    total: { minutosDisponibles, minutosOcupados, ocupacion: proporcion(minutosOcupados, minutosDisponibles) },
  }
}

export interface Inasistencia {
  /** Citas que ya empezaron y no se cancelaron. */
  citas: number
  noVino: number
  /** De 0 a 1; `null` sin citas. */
  tasa: number | null
}

export interface InasistenciaDelPeriodo {
  total: Inasistencia
  /** `id` en null: citas sin profesional asignado. Sólo quienes tuvieron citas. */
  porProfesional: (Inasistencia & { id: string | null; nombre: string })[]
}

export function calcularInasistencia(
  citas: readonly CitaParaReporte[],
  miembros: readonly Miembro[],
  ahora: Date
): InasistenciaDelPeriodo {
  const cuentan = citas.filter((cita) => cita.status !== "cancelada" && cita.startTime.getTime() < ahora.getTime())
  const resumir = (lista: readonly CitaParaReporte[]): Inasistencia => {
    const noVino = lista.filter((cita) => cita.status === "no-asistio").length
    return { citas: lista.length, noVino, tasa: proporcion(noVino, lista.length) }
  }
  const nombres = new Map(miembros.map((miembro) => [miembro.id, miembro.nombre]))
  const ids = [...new Set(cuentan.map((cita) => cita.memberId))]
  const porProfesional = ids
    .map((id) => ({
      id: id !== null && nombres.has(id) ? id : null,
      nombre: id === null ? "Sin asignar" : (nombres.get(id) ?? "Ya no está en el equipo"),
      ...resumir(cuentan.filter((cita) => cita.memberId === id)),
    }))
    .sort((a, b) => b.citas - a.citas || a.nombre.localeCompare(b.nombre, "es"))
  return { total: resumir(cuentan), porProfesional }
}

export interface Clientes {
  nuevos: number
  recurrentes: number
  /** Atenciones cobradas sin ficha de cliente: no se clasifican. */
  sinFicha: number
}

/**
 * `cobradas`: las atenciones cobradas del período. `conHistoria`: los
 * clientes que tenían alguna atención cobrada antes del período.
 */
export function clasificarClientes(
  cobradas: readonly { customerId: string | null }[],
  conHistoria: ReadonlySet<string>
): Clientes {
  const clientes = new Set<string>()
  let sinFicha = 0
  for (const { customerId } of cobradas) {
    if (customerId) clientes.add(customerId)
    else sinFicha++
  }
  let recurrentes = 0
  for (const id of clientes) if (conHistoria.has(id)) recurrentes++
  return { nuevos: clientes.size - recurrentes, recurrentes, sinFicha }
}

export interface Comparacion {
  actual: number | null
  anterior: number | null
  /**
   * Para cantidades, el cambio relativo (0,25 = 25 % más); para tasas, la
   * diferencia en puntos (0,05 = 5 puntos). `null` si lo anterior es 0 o no
   * existe.
   */
  cambio: number | null
}

export function comparar(actual: number | null, anterior: number | null, tipo: "cantidad" | "tasa"): Comparacion {
  if (actual === null || anterior === null || anterior === 0) return { actual, anterior, cambio: null }
  return { actual, anterior, cambio: tipo === "cantidad" ? (actual - anterior) / anterior : actual - anterior }
}
