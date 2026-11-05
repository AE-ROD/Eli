/**
 * Qué cita recibe el recordatorio "tu cita es mañana" y con qué fecha y hora.
 * Puro: sin base ni correo; el cron (`app/api/cron/recordatorios`) lee, decide
 * acá y envía.
 *
 * "Mañana" es el día siguiente en el reloj del negocio (`Business.timezone`),
 * no en el del servidor: en Vercel (UTC) a las 22:00 de Santiago ya es el día
 * siguiente, y una cita de las 10:00 de pasado mañana caía en "mañana".
 *
 * El cron corre una vez al día (vercel.json, a las `HORA_UTC_DEL_CRON`; el
 * plan Hobby no permite más).
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

/**
 * Los errores de Resend con los que el correo seguro NO salió: rechazó el
 * pedido antes de aceptarlo (datos, clave, permisos o cupo). Con cualquier
 * otro (`application_error`, que es también el de una red caída,
 * `internal_server_error`) o si el envío lanzó, el correo pudo haber
 * llegado aunque la respuesta sea un error (#140).
 */
const RECHAZOS_DE_RESEND: readonly string[] = [
  "validation_error",
  "missing_required_field",
  "invalid_parameter",
  "invalid_from_address",
  "invalid_attachment",
  "invalid_idempotency_key",
  "invalid_idempotent_request",
  "invalid_region",
  "missing_api_key",
  "invalid_api_key",
  "restricted_api_key",
  "invalid_access",
  "not_found",
  "method_not_allowed",
  "security_error",
  "rate_limit_exceeded",
  "daily_quota_exceeded",
  "monthly_quota_exceeded",
]

/**
 * Si un recordatorio que no se dio por enviado seguro no llegó a nadie: sin
 * clave de Resend (`null`, no se intentó) o rechazado por Resend. Sólo
 * entonces se puede borrar el enlace nuevo que llevaba: si el correo pudo
 * llegar, borrarlo dejaba un enlace que da 404 (#140).
 */
export function seguroQueNoSalio(resultado: { error: { name: string } | null } | null): boolean {
  if (resultado === null) return true
  return resultado.error !== null && RECHAZOS_DE_RESEND.includes(resultado.error.name)
}

/**
 * La hora UTC en que corre el cron de recordatorios: la de `vercel.json`
 * ("0 13 * * *"). Un test compara las dos para que no se separen.
 */
export const HORA_UTC_DEL_CRON = 13

/**
 * Si la cita que empieza en `inicio`, creada en `ahora`, va a recibir el
 * recordatorio: alguna corrida del cron posterior a `ahora` y anterior al
 * inicio (el cron sólo busca citas futuras, `ventanaDeBusqueda`) la ve como
 * "de mañana" (`esDeMañana`, la misma regla con que el cron la elige). Una
 * reserva hecha a las 22:40 para el día siguiente no la recibe: la corrida de
 * ese día ya pasó y la siguiente cae el mismo día de la cita.
 *
 * Sólo mira el reloj: que la persona haya dejado correo y que el envío no
 * falle es aparte.
 */
export function recibiraRecordatorio(inicio: Date, ahora: Date, zonaGuardada: string | null | undefined): boolean {
  const corrida = new Date(
    Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate(), HORA_UTC_DEL_CRON)
  )
  if (corrida <= ahora) corrida.setUTCDate(corrida.getUTCDate() + 1)
  for (; corrida < inicio; corrida.setUTCDate(corrida.getUTCDate() + 1)) {
    if (esDeMañana(inicio, corrida, zonaGuardada)) return true
  }
  return false
}
