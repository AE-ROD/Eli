/**
 * Lo que la sección de horario muestra al abrirse, sin pantalla: los siete
 * días a partir de lo guardado, el ejemplo de lunes a viernes cuando no hay
 * nada, y el horario del negocio para quien del equipo no tiene uno propio.
 */

import type { HorarioDelDia } from "./_datos"

export const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"]

export const HORARIO_INICIAL: HorarioDelDia[] = DIAS.map((_, i) => ({
  dayOfWeek: i,
  startTime: "09:00",
  endTime: "18:00",
  active: i >= 1 && i <= 5, // Lun-Vie activos por defecto
}))

/**
 * Los siete días, aunque la base tenga guardados sólo algunos: los que faltan
 * se muestran como no laborables. Sin nada guardado, el horario de ejemplo
 * (lunes a viernes de 9 a 18), que es sólo una propuesta: la página pública
 * no ofrece horas hasta que se guarda, y la sección lo dice.
 */
function semanaCompleta(guardados: HorarioDelDia[]): HorarioDelDia[] {
  if (guardados.length === 0) return HORARIO_INICIAL
  return losSieteDias(guardados)
}

/** Los siete días de lo guardado, sin el `id` de la base; los que faltan, no laborables. */
function losSieteDias(guardados: HorarioDelDia[]): HorarioDelDia[] {
  return DIAS.map((_, i) => {
    const existente = guardados.find((horario) => horario.dayOfWeek === i)
    return existente
      ? { dayOfWeek: i, startTime: existente.startTime, endTime: existente.endTime, active: existente.active }
      : { dayOfWeek: i, startTime: "09:00", endTime: "18:00", active: false }
  })
}

/**
 * Lo que se muestra al abrir un horario. El general (o el de alguien sin
 * equipo) sin nada guardado: el ejemplo, con el aviso de que falta guardarlo.
 * El de una persona del equipo sin horario propio: el del negocio, que es en
 * el que atiende (`usaElDelNegocio`), sin aviso falso.
 */
export function horarioParaMostrar(
  guardados: HorarioDelDia[],
  horarioDelNegocio: HorarioDelDia[] | undefined
): { semana: HorarioDelDia[]; usaElDelNegocio: boolean } {
  if (guardados.length > 0 || !horarioDelNegocio) return { semana: semanaCompleta(guardados), usaElDelNegocio: false }
  return { semana: losSieteDias(horarioDelNegocio), usaElDelNegocio: true }
}

