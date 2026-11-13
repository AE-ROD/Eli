/**
 * La vista Día de la clínica dental como grilla: una columna por sillón o por
 * odontólogo, filas de 15 minutos con el rótulo cada media hora, y cada cita
 * como un bloque que empieza en su hora y mide lo que dura. Es cálculo puro,
 * en minutos desde la medianoche del negocio (`zona`, #99), como
 * `_disposicion.ts`; la pantalla es `_componentes/grilla-del-dia.tsx`.
 *
 * Qué columnas hay
 * ────────────────
 * - **Por sillón**: los sillones activos, en su orden; uno desactivado sólo si
 *   ese día tiene citas (las conserva al desactivarse). Al final, "Sin sillón",
 *   si hay citas sin sillón (las reservas públicas no lo asignan).
 * - **Por odontólogo**: el equipo que atiende, en su orden (lo lee quien
 *   asigna; al odontólogo la agenda le muestra sólo lo suyo, y su columna sale
 *   de sus citas). Quien tiene citas y no está en la lista, también. Al final,
 *   "Sin odontólogo", si hay citas sin asignar (las de la dueña, que no es
 *   miembro, van así).
 *
 * Nunca hay cero columnas: sin sillones ni citas queda la de "Sin sillón" (o
 * "Sin odontólogo") vacía, para que la grilla diga que el día está libre.
 */

import { conMayuscula } from "@/lib/vocabulario"
import { columnasDeSolape, type LugarEnLaColumna, type TramoEnMinutos } from "./_disposicion"

/** Cada fila de la grilla: 15 minutos. */
export const MINUTOS_POR_FILA = 15
/**
 * El alto de una fila en px. Una cita de 30 minutos mide 60 (dos filas menos
 * la separación): lo justo para sus tres renglones, el rango, el paciente y
 * el estado con el motivo.
 */
export const ALTO_DE_FILA = 32
/** Lo que se le resta a cada bloque para que dos seguidos no se toquen. */
export const SEPARACION = 4
/** Lo mínimo que mide un bloque: una cita de 5 minutos se tiene que poder leer y tocar. */
export const ALTO_MINIMO = ALTO_DE_FILA - SEPARACION

/**
 * Lo que ocupa a la vista el bloque más corto, en minutos: con eso se decide
 * si dos citas se pisan en pantalla aunque no se pisen en el tiempo.
 */
export const DURACION_VISUAL_MINIMA = Math.ceil(((ALTO_MINIMO + SEPARACION) / ALTO_DE_FILA) * MINUTOS_POR_FILA)

export type VerPor = "sillon" | "odontologo"

/** La columna de las citas sin sillón (vista por sillón). */
export const SIN_SILLON = "sin-sillon"
/** La columna de las citas sin odontólogo (vista por odontólogo). */
export const SIN_ODONTOLOGO = "sin-odontologo"

export interface FilaDeLaGrilla {
  /** Minutos desde la medianoche en que empieza la fila. */
  minuto: number
  /** "09:00", "09:30": sólo en las filas de hora y media hora; en las demás, `null`. */
  rotulo: string | null
}

const dosCifras = (n: number) => String(n).padStart(2, "0")

/** "09:30": la hora de un minuto del día. */
export function horaDelMinuto(minuto: number): string {
  return `${dosCifras(Math.floor(minuto / 60))}:${dosCifras(minuto % 60)}`
}

/** Las filas de [desde, hasta) en horas, de 15 en 15 minutos, con el rótulo cada media hora. */
export function filasDeLaGrilla(desde: number, hasta: number): FilaDeLaGrilla[] {
  const filas: FilaDeLaGrilla[] = []
  for (let minuto = desde * 60; minuto < hasta * 60; minuto += MINUTOS_POR_FILA) {
    filas.push({ minuto, rotulo: minuto % 30 === 0 ? horaDelMinuto(minuto) : null })
  }
  return filas
}

/** El alto de la grilla entera, en px, para [desde, hasta) en horas. */
export function altoDeLaGrilla(desde: number, hasta: number): number {
  return Math.max(hasta - desde, 0) * (60 / MINUTOS_POR_FILA) * ALTO_DE_FILA
}

/**
 * Dónde va un bloque en la grilla: `arriba` (px desde el comienzo de la
 * grilla) y `alto` (px). Lo que cae fuera de [desde, hasta) en horas se
 * recorta; si nada cae adentro, `null`. Nunca más bajo que `ALTO_MINIMO`; si
 * con ese mínimo se saldría por abajo (una cita de 19:55 a 20:00), sube lo
 * justo para quedar adentro.
 */
export function posicionDelBloque(
  tramo: TramoEnMinutos,
  desde: number,
  hasta: number
): { arriba: number; alto: number } | null {
  const comienzo = desde * 60
  const final = hasta * 60
  // Una cita mal cargada, que termina antes de empezar, ocupa su hora de inicio.
  const finReal = Math.max(tramo.finMin, tramo.inicioMin)
  if (tramo.inicioMin >= final || finReal < comienzo) return null
  // Termina justo cuando empieza la grilla: no cae adentro.
  if (finReal === comienzo && finReal > tramo.inicioMin) return null

  const pxPorMinuto = ALTO_DE_FILA / MINUTOS_POR_FILA
  const inicio = Math.max(tramo.inicioMin, comienzo)
  const fin = Math.min(finReal, final)
  const alto = Math.max((fin - inicio) * pxPorMinuto - SEPARACION, ALTO_MINIMO)
  const arriba = Math.min((inicio - comienzo) * pxPorMinuto, Math.max(altoDeLaGrilla(desde, hasta) - alto, 0))
  return { arriba, alto }
}

/**
 * Dónde va la línea de la hora actual (px desde el comienzo de la grilla), o
 * `null` si no se dibuja: no es hoy (`minutoDeAhora` null) o la hora cae fuera
 * de las horas que se muestran.
 */
export function lineaDeAhora(minutoDeAhora: number | null, desde: number, hasta: number): number | null {
  if (minutoDeAhora === null || !Number.isFinite(minutoDeAhora)) return null
  if (minutoDeAhora < desde * 60 || minutoDeAhora > hasta * 60) return null
  return (minutoDeAhora - desde * 60) * (ALTO_DE_FILA / MINUTOS_POR_FILA)
}

export interface ColumnaDeLaGrilla {
  /** El id del sillón o del miembro, o `SIN_SILLON` / `SIN_ODONTOLOGO`. */
  id: string
  nombre: string
  /** Un sillón desactivado que conserva citas de ese día. */
  inactiva?: boolean
}

/** Lo mínimo de un sillón para armar las columnas. */
export interface SillonParaLaGrilla {
  id: string
  nombre: string
  orden: number
  activo: boolean
}

/** Lo mínimo de una cita para repartirla en columnas. */
export interface CitaParaLaGrilla {
  sillonId?: string | null
  sillon?: { id: string; nombre: string } | null
  memberId?: string | null
  member?: { id: string; user: { name: string | null } | null } | null
}

/** La columna de una cita en la vista por sillón. */
export function columnaPorSillon(cita: CitaParaLaGrilla): string {
  return cita.sillonId || SIN_SILLON
}

/** La columna de una cita en la vista por odontólogo. */
export function columnaPorOdontologo(cita: CitaParaLaGrilla): string {
  return cita.memberId || SIN_ODONTOLOGO
}

/** Las columnas de la vista por sillón (ver la cabecera del módulo). */
export function columnasPorSillon(
  sillones: readonly SillonParaLaGrilla[],
  citas: readonly CitaParaLaGrilla[]
): ColumnaDeLaGrilla[] {
  const conCitas = new Set(citas.map(columnaPorSillon))
  const ordenados = [...sillones].sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, "es"))
  const columnas: ColumnaDeLaGrilla[] = ordenados
    .filter((sillon) => sillon.activo || conCitas.has(sillon.id))
    .map((sillon) => ({ id: sillon.id, nombre: sillon.nombre, ...(!sillon.activo && { inactiva: true }) }))

  // Un sillón que no vino en la lista (no cargó, o se leyó antes de crearlo): con el nombre que trae la cita.
  for (const cita of citas) {
    const id = cita.sillonId
    if (id && !columnas.some((columna) => columna.id === id)) {
      columnas.push({ id, nombre: cita.sillon?.nombre?.trim() || "Sillón" })
    }
  }

  if (conCitas.has(SIN_SILLON) || columnas.length === 0) columnas.push({ id: SIN_SILLON, nombre: "Sin sillón" })
  return columnas
}

/**
 * Las columnas de la vista por odontólogo (ver la cabecera del módulo).
 * `palabraProfesional` es la del rubro, en minúscula (`palabras.profesional
 * .singular`): nombra la columna de quien no tiene nombre y la de las citas sin
 * asignar. La grilla es de la clínica dental, así que por defecto es
 * "odontólogo".
 */
export function columnasPorOdontologo(
  equipo: readonly { id: string; nombre: string }[],
  citas: readonly CitaParaLaGrilla[],
  palabraProfesional = "odontólogo"
): ColumnaDeLaGrilla[] {
  const columnas: ColumnaDeLaGrilla[] = equipo.map((miembro) => ({ id: miembro.id, nombre: miembro.nombre }))
  for (const cita of citas) {
    const id = cita.memberId
    if (id && !columnas.some((columna) => columna.id === id)) {
      columnas.push({ id, nombre: cita.member?.user?.name?.trim() || conMayuscula(palabraProfesional) })
    }
  }
  if (citas.some((cita) => !cita.memberId) || columnas.length === 0) {
    columnas.push({ id: SIN_ODONTOLOGO, nombre: `Sin ${palabraProfesional}` })
  }
  return columnas
}

/** Las columnas de la vista que se eligió. */
export function columnasDeLaGrilla(
  verPor: VerPor,
  sillones: readonly SillonParaLaGrilla[],
  equipo: readonly { id: string; nombre: string }[],
  citas: readonly CitaParaLaGrilla[],
  palabraProfesional = "odontólogo"
): ColumnaDeLaGrilla[] {
  return verPor === "sillon" ? columnasPorSillon(sillones, citas) : columnasPorOdontologo(equipo, citas, palabraProfesional)
}

/**
 * Las citas de cada columna, en el orden de la hora en que empiezan. Una cita
 * cuya columna no está (no debería pasar: las columnas salen de las citas) no
 * se pierde en silencio: va a la última.
 */
export function citasPorColumna<T extends CitaParaLaGrilla>(
  citas: readonly T[],
  columnas: readonly ColumnaDeLaGrilla[],
  verPor: VerPor,
  inicioMinDe: (cita: T) => number
): Map<string, T[]> {
  const porColumna = new Map<string, T[]>(columnas.map((columna) => [columna.id, []]))
  const ultima = columnas[columnas.length - 1]?.id
  const columnaDe = verPor === "sillon" ? columnaPorSillon : columnaPorOdontologo
  for (const cita of [...citas].sort((a, b) => inicioMinDe(a) - inicioMinDe(b))) {
    const id = porColumna.has(columnaDe(cita)) ? columnaDe(cita) : ultima
    if (id !== undefined) porColumna.get(id)?.push(cita)
  }
  return porColumna
}

/**
 * Dónde va cada cita dentro de su columna: las que se pisan (también a la
 * vista, por el alto mínimo) van lado a lado (`columnasDeSolape`).
 */
export function lugaresEnLaColumna(tramos: (TramoEnMinutos & { id: string })[]): Map<string, LugarEnLaColumna> {
  return columnasDeSolape(tramos, DURACION_VISUAL_MINIMA)
}

/**
 * En qué columnas se dibuja la franja de un bloqueo. Uno de todo el negocio
 * (`memberId` null), en todas. Uno de un odontólogo, en la suya en la vista
 * por odontólogo; en la vista por sillón en ninguna (un bloqueo no es de un
 * sillón): se lee en la lista de bloqueos del día, encima de la grilla.
 */
export function columnasDelBloqueo(
  bloqueo: { memberId: string | null },
  verPor: VerPor,
  columnas: readonly ColumnaDeLaGrilla[]
): string[] {
  if (!bloqueo.memberId) return columnas.map((columna) => columna.id)
  if (verPor === "odontologo" && columnas.some((columna) => columna.id === bloqueo.memberId)) return [bloqueo.memberId]
  return []
}
