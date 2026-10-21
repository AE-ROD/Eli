/**
 * Qué horario ve el cliente en la reserva pública. Es una regla de negocio,
 * no una consulta: entra lo que ya trajo la base y sale el horario.
 *
 * En `WorkSchedule`, `memberId = null` es el horario general del negocio (el
 * que guarda el dueño); con `memberId` es el de un miembro del equipo. Nada
 * crea el general al registrar el negocio, así que puede faltar: si el dueño
 * nunca guardó el suyo pero un profesional sí, el negocio tiene que seguir
 * aceptando reservas.
 *
 * La regla es **por día**:
 * - si ese día hay al menos una franja general, manda el general (aunque los
 *   miembros tengan otras horas);
 * - si no hay ninguna general, vale la unión de las franjas de los miembros.
 *
 * Un día puede tener varias franjas (09–13 y 15–19). Las que se pisan o se
 * tocan se fusionan, y siempre salen ordenadas por hora de inicio. Las que no
 * se pueden medir (`endTime` <= `startTime`) se descartan, igual que en
 * `lib/horario-dia.ts`.
 *
 * Quien consulta pasa sólo filas activas del negocio del slug: este módulo no
 * filtra por `businessId` ni por `active`.
 */

import { franjaValida, horaAMinutos, minutosAHora, type FranjaHorario } from "@/lib/horario-dia"

export interface FilaDeHorario extends FranjaHorario {
  memberId: string | null
}

export interface FilaDeHorarioSemanal extends FilaDeHorario {
  dayOfWeek: number
}

export interface FranjaDelDia extends FranjaHorario {
  dayOfWeek: number
}

function fusionar(franjas: FranjaHorario[]): FranjaHorario[] {
  const intervalos = franjas
    .filter(franjaValida)
    .map((franja) => ({ inicio: horaAMinutos(franja.startTime), fin: horaAMinutos(franja.endTime) }))
    .sort((a, b) => a.inicio - b.inicio || a.fin - b.fin)

  const fusionados: { inicio: number; fin: number }[] = []
  for (const actual of intervalos) {
    const ultimo = fusionados[fusionados.length - 1]
    // `<=`: 09–12 y 12–15 son una sola franja, 09–15.
    if (ultimo && actual.inicio <= ultimo.fin) {
      ultimo.fin = Math.max(ultimo.fin, actual.fin)
    } else {
      fusionados.push({ ...actual })
    }
  }

  return fusionados.map(({ inicio, fin }) => ({ startTime: minutosAHora(inicio), endTime: minutosAHora(fin) }))
}

/** Las franjas de atención de un día, a partir de las filas activas de ese día (generales y de miembros). */
export function franjasDeAtencion(filasDelDia: FilaDeHorario[]): FranjaHorario[] {
  const generales = fusionar(filasDelDia.filter((fila) => fila.memberId === null))
  if (generales.length > 0) return generales
  return fusionar(filasDelDia.filter((fila) => fila.memberId !== null))
}

/** La misma regla aplicada a cada día de la semana. No devuelve `memberId`: esto va al navegador. */
export function horarioSemanalDeAtencion(filas: FilaDeHorarioSemanal[]): FranjaDelDia[] {
  const dias = [...new Set(filas.map((fila) => fila.dayOfWeek))].sort((a, b) => a - b)
  return dias.flatMap((dayOfWeek) =>
    franjasDeAtencion(filas.filter((fila) => fila.dayOfWeek === dayOfWeek)).map((franja) => ({ dayOfWeek, ...franja }))
  )
}

/** Si el tramo [inicio, fin) en minutos del día cabe entero dentro de alguna franja. */
export function cabeEnAtencion(franjas: FranjaHorario[], inicioMin: number, finMin: number): boolean {
  if (!(inicioMin < finMin)) return false
  return franjas
    .filter(franjaValida)
    .some((franja) => horaAMinutos(franja.startTime) <= inicioMin && finMin <= horaAMinutos(franja.endTime))
}
