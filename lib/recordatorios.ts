/**
 * Qué cita recibe el recordatorio "tu cita es mañana" y con qué fecha y hora.
 * Puro: sin base ni correo; el cron (`app/api/cron/recordatorios`) lee, decide
 * acá y envía.
 *
 * "Mañana" es el día siguiente en el reloj del negocio (`Business.timezone`),
 * no en el del servidor: en Vercel (UTC) a las 22:00 de Santiago ya es el día
 * siguiente, y una cita de las 10:00 de pasado mañana caía en "mañana".
 *
 * El cron corre una vez al día (vercel.json; el plan Hobby no permite más).
 * Cada cita se avisa una sola vez: `Appointment.reminderSentAt` es el candado
 * (se marca antes de enviar y se libera si el envío falla). Así una corrida
 * repetida, manual o del mismo día, no duplica nada.
 */

import { minutosAHora } from "@/lib/horario-dia"
import { fechaYMinutosEn, sumarDias, zonaDelNegocio } from "@/lib/zona-horaria"

/**
 * Estados que no reciben recordatorio: la cita ya no va a ocurrir (cancelada,
 * no vino) o ya ocurrió (completada).
 */
export const ESTADOS_SIN_RECORDATORIO = ["cancelada", "completada", "no-asistio"] as const

/**
 * Cuánto hacia adelante se buscan candidatas. "Mañana" en cualquier zona
 * empieza después de ahora y termina, a lo sumo, 48 horas después (más una
 * de un cambio de hora); 50 cubre todo sin traer de más. El filtro fino es
 * `esDeMañana`.
 */
const HORIZONTE_MS = 50 * 60 * 60 * 1000

/** El rango de `startTime` en el que buscar citas para recordar. */
export function ventanaDeBusqueda(ahora: Date): { desde: Date; hasta: Date } {
  return { desde: ahora, hasta: new Date(ahora.getTime() + HORIZONTE_MS) }
}

/** Si la cita empieza el día siguiente a "hoy", ambos en el reloj del negocio. */
export function esDeMañana(inicio: Date, ahora: Date, zonaGuardada: string | null | undefined): boolean {
  const zona = zonaDelNegocio(zonaGuardada)
  const hoy = fechaYMinutosEn(ahora, zona).fecha
  return fechaYMinutosEn(inicio, zona).fecha === sumarDias(hoy, 1)
}

/** La fecha ("AAAA-MM-DD") y la hora ("HH:MM") de la cita, como las lee el negocio. */
export function fechaYHoraEnElNegocio(
  inicio: Date,
  zonaGuardada: string | null | undefined
): { fecha: string; hora: string } {
  const { fecha, minutos } = fechaYMinutosEn(inicio, zonaDelNegocio(zonaGuardada))
  return { fecha, hora: minutosAHora(minutos) }
}
