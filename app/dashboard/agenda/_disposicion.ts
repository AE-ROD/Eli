/**
 * Cómo se reparten las citas en la grilla de la agenda: qué horas se dibujan,
 * qué citas van en cada hora (vista Día) y en qué columna va cada cita cuando
 * se pisan con otras (vista Semana). Es cálculo puro sobre minutos desde la
 * medianoche, en la hora del negocio (`zona`), igual que el resto de la
 * agenda (#99): nunca en la del navegador.
 */

import { comoTexto } from "@/lib/fechas"
import { horaAMinutos, type FranjaHorario } from "@/lib/horario-dia"
import { fechaYMinutosEn, rangoDelDiaEn } from "@/lib/zona-horaria"

/** El rango que se dibujaba siempre. Nunca se muestra menos. */
export const HORA_INICIO_MINIMA = 8
export const HORA_FIN_MINIMA = 20

const MINUTOS_DEL_DIA = 24 * 60

/** Un tramo del día en minutos desde la medianoche: [inicioMin, finMin). */
export interface TramoEnMinutos {
  inicioMin: number
  finMin: number
}

/**
 * Las horas en punto a dibujar, [desde, hasta): como mínimo de 8 a 20, y
 * ampliadas para que entren el horario de atención y cualquier cita. Una cita
 * que termina en punto no pide la hora siguiente; una que termina 20:15, sí.
 */
export function rangoDeHoras(tramos: TramoEnMinutos[]): { desde: number; hasta: number } {
  let desde = HORA_INICIO_MINIMA
  let hasta = HORA_FIN_MINIMA

  for (const { inicioMin, finMin } of tramos) {
    if (!Number.isFinite(inicioMin)) continue
    const inicio = Math.min(Math.max(inicioMin, 0), MINUTOS_DEL_DIA - 1)
    // Un tramo de duración cero o mal cargado ocupa igual su hora de inicio.
    const fin = Math.min(Math.max(Number.isFinite(finMin) ? finMin : inicio, inicio + 1), MINUTOS_DEL_DIA)
    desde = Math.min(desde, Math.floor(inicio / 60))
    hasta = Math.max(hasta, Math.ceil(fin / 60))
  }

  return { desde, hasta }
}

/** Las franjas de atención como tramos en minutos. Las que no se pueden medir se descartan. */
export function tramosDeFranjas(franjas: FranjaHorario[]): TramoEnMinutos[] {
  return franjas
    .map((franja) => ({ inicioMin: horaAMinutos(franja.startTime), finMin: horaAMinutos(franja.endTime) }))
    .filter((tramo) => Number.isFinite(tramo.inicioMin) && Number.isFinite(tramo.finMin) && tramo.inicioMin < tramo.finMin)
}

/**
 * Una cita como tramo del día en que empieza, en la hora del negocio. Si
 * termina otro día, el tramo llega hasta la medianoche.
 */
export function tramoDeCita(cita: { startTime: string; endTime: string }, zona: string): TramoEnMinutos {
  const inicio = new Date(cita.startTime)
  const fin = new Date(cita.endTime)
  const deInicio = fechaYMinutosEn(inicio, zona)
  const deFin = fechaYMinutosEn(fin, zona)
  const inicioMin = deInicio.minutos
  const finMin = deInicio.fecha === deFin.fecha ? deFin.minutos : fin > inicio ? MINUTOS_DEL_DIA : inicioMin
  return { inicioMin, finMin }
}

/**
 * La parte de un tramo [inicio, fin) que cae en el día `dia` del negocio, en
 * minutos desde su medianoche; `null` si no lo toca. Para los bloqueos, que
 * pueden durar varios días: cada día dibuja su pedazo. Tocar la medianoche no
 * es caer en el día (un bloqueo que termina a las 00:00 no se dibuja en el
 * día siguiente).
 */
export function tramoEnElDia(
  tramo: { startTime: string; endTime: string },
  dia: Date,
  zona: string
): TramoEnMinutos | null {
  const inicio = new Date(tramo.startTime)
  const fin = new Date(tramo.endTime)
  const { desde: comienzo, hasta: siguiente } = rangoDelDiaEn(comoTexto(dia), zona)
  if (!(fin > comienzo) || !(inicio < siguiente) || !(fin > inicio)) return null
  const inicioMin = inicio <= comienzo ? 0 : fechaYMinutosEn(inicio, zona).minutos
  const finMin = fin >= siguiente ? MINUTOS_DEL_DIA : fechaYMinutosEn(fin, zona).minutos
  return { inicioMin, finMin }
}

/**
 * Un tramo del día recortado a las horas que se dibujan, [desde, hasta) en
 * horas; `null` si queda fuera. Un bloqueo de día entero no estira la grilla
 * de 0 a 24: se recorta a lo que ya se muestra.
 */
export function recortarAHoras(tramo: TramoEnMinutos, desde: number, hasta: number): TramoEnMinutos | null {
  const inicioMin = Math.max(tramo.inicioMin, desde * 60)
  const finMin = Math.min(tramo.finMin, hasta * 60)
  return finMin > inicioMin ? { inicioMin, finMin } : null
}

/**
 * Las citas agrupadas por la hora en que empiezan, una entrada por cada hora
 * de [desde, hasta), en orden. Todas las citas de una hora, no sólo la
 * primera. Una cita fuera del rango no se pierde en silencio: el rango se arma
 * antes con `rangoDeHoras` para que entren todas.
 */
export function citasPorHora<T>(
  citas: T[],
  inicioMinDe: (cita: T) => number,
  desde: number,
  hasta: number
): { hora: number; citas: T[] }[] {
  const ordenadas = [...citas].sort((a, b) => inicioMinDe(a) - inicioMinDe(b))
  return Array.from({ length: Math.max(hasta - desde, 0) }, (_, i) => {
    const hora = desde + i
    return { hora, citas: ordenadas.filter((cita) => Math.floor(inicioMinDe(cita) / 60) === hora) }
  })
}

export interface LugarEnLaColumna {
  /** En qué columna va, desde 0. */
  columna: number
  /** Cuántas columnas tiene su grupo de solape. */
  columnas: number
}

/**
 * Columnas para dibujar lado a lado las citas que se pisan. Un grupo de solape
 * son las citas encadenadas por pisarse (A con B y B con C, aunque A y C no):
 * todo el grupo comparte el mismo ancho, y cada cita va en la primera columna
 * que ya quedó libre a su hora de inicio.
 *
 * `duracionMinima` es la duración visual mínima en minutos: una cita de cinco
 * minutos se dibuja más alta de lo que dura, y sin esto taparía a la siguiente.
 */
export function columnasDeSolape(
  tramos: (TramoEnMinutos & { id: string })[],
  duracionMinima = 0
): Map<string, LugarEnLaColumna> {
  const ordenados = tramos
    .map((tramo) => ({
      id: tramo.id,
      inicio: tramo.inicioMin,
      fin: Math.max(tramo.finMin, tramo.inicioMin + duracionMinima, tramo.inicioMin + 1),
    }))
    .sort((a, b) => a.inicio - b.inicio || b.fin - a.fin || a.id.localeCompare(b.id))

  const lugares = new Map<string, LugarEnLaColumna>()
  let grupo: string[] = []
  let finDelGrupo = -Infinity
  let finDeCadaColumna: number[] = []

  const cerrarGrupo = () => {
    for (const id of grupo) lugares.get(id)!.columnas = finDeCadaColumna.length
    grupo = []
    finDeCadaColumna = []
  }

  for (const tramo of ordenados) {
    if (tramo.inicio >= finDelGrupo) cerrarGrupo()

    let columna = finDeCadaColumna.findIndex((fin) => fin <= tramo.inicio)
    if (columna === -1) {
      columna = finDeCadaColumna.length
      finDeCadaColumna.push(tramo.fin)
    } else {
      finDeCadaColumna[columna] = tramo.fin
    }

    lugares.set(tramo.id, { columna, columnas: 1 })
    grupo.push(tramo.id)
    finDelGrupo = grupo.length === 1 ? tramo.fin : Math.max(finDelGrupo, tramo.fin)
  }
  cerrarGrupo()

  return lugares
}
