import type { Prisma } from "@prisma/client"
import { hashDeToken } from "@/lib/tokens"

/**
 * El enlace para que el cliente cancele o reagende su cita sin cuenta
 * (`/reservar/<slug>/cita/<token>`). El token se genera al confirmar
 * (`generarToken`) y la base guarda sólo su sha256 (`Appointment.manageTokenHash`).
 *
 * Reglas
 * ──────
 * - La cita se busca por el hash del token Y por el slug del negocio: un
 *   token válido con el slug de otro negocio no encuentra nada.
 * - Sólo se gestiona una cita pendiente o confirmada que todavía no empezó.
 *   Token inválido, de otro negocio, cita cancelada, pasada o en otro estado:
 *   todo es el mismo 404, sin decir cuál de esas cosas pasó.
 * - Cambiar (cancelar o reagendar) sólo hasta `Business.cancelacionHorasAntes`
 *   horas antes. Después, la cita se ve pero hay que contactar al local.
 */

/** Estados en que el cliente todavía puede ver y cambiar su cita. */
export const ESTADOS_GESTIONABLES = ["pendiente", "confirmada"] as const

/** El plazo que puede fijar el negocio, en horas: de 0 (hasta la hora misma) a 72. */
export const PLAZO_MINIMO_HORAS = 0
export const PLAZO_MAXIMO_HORAS = 72
export const PLAZO_POR_DEFECTO_HORAS = 24

/** Un token tiene 43 caracteres (32 bytes en base64url). Cualquier cosa muy distinta no se busca. */
const LARGO_MAXIMO_DE_TOKEN = 100

export const MENSAJE_ENLACE_INVALIDO = "Este enlace no es válido o la cita ya no se puede cambiar"

export function esTokenConForma(token: string): boolean {
  return token.length >= 20 && token.length <= LARGO_MAXIMO_DE_TOKEN && /^[A-Za-z0-9_-]+$/.test(token)
}

/** Si la cita se puede ver con el enlace: estado gestionable y todavía no empezó. */
export function esGestionable(cita: { status: string; startTime: Date }, ahora: Date): boolean {
  return (ESTADOS_GESTIONABLES as readonly string[]).includes(cita.status) && cita.startTime.getTime() > ahora.getTime()
}

/** Si todavía está dentro del plazo para cancelar o reagendar. Un plazo raro en la base se lee como el de por defecto. */
export function dentroDelPlazo(inicio: Date, horasAntes: number, ahora: Date): boolean {
  const plazo =
    Number.isInteger(horasAntes) && horasAntes >= PLAZO_MINIMO_HORAS && horasAntes <= PLAZO_MAXIMO_HORAS
      ? horasAntes
      : PLAZO_POR_DEFECTO_HORAS
  return inicio.getTime() - ahora.getTime() >= plazo * 60 * 60 * 1000
}

export function mensajeFueraDePlazo(horasAntes: number): string {
  return horasAntes === 1
    ? "Ya no se puede cambiar por acá: falta menos de 1 hora. Contacta al local."
    : `Ya no se puede cambiar por acá: se puede hasta ${horasAntes} horas antes. Contacta al local.`
}

/** El `where` de la cita del enlace: hash del token, negocio del slug y estado gestionable. */
export function whereDeCitaPorToken(slug: string, token: string): Prisma.AppointmentWhereInput {
  return {
    manageTokenHash: hashDeToken(token),
    business: { slug },
    status: { in: [...ESTADOS_GESTIONABLES] },
  }
}

const SELECCION = {
  id: true,
  businessId: true,
  memberId: true,
  serviceId: true,
  title: true,
  status: true,
  startTime: true,
  endTime: true,
  customer: { select: { name: true, lastName: true } },
  // El correo, para avisarle si el cliente cancela o reagenda. Nunca viaja al cliente.
  member: { select: { user: { select: { name: true, email: true } } } },
  service: { select: { id: true, name: true, duration: true, active: true } },
  business: {
    select: { id: true, name: true, slug: true, timezone: true, cancelacionHorasAntes: true, user: { select: { email: true } } },
  },
} satisfies Prisma.AppointmentSelect

export type CitaDelEnlace = Prisma.AppointmentGetPayload<{ select: typeof SELECCION }>

/**
 * La cita del enlace, o `null` (el 404) si el token no tiene forma de token,
 * no existe, es de otro negocio, o la cita ya no es gestionable.
 */
export async function leerCitaDelEnlace(
  db: Pick<Prisma.TransactionClient, "appointment">,
  slug: string,
  token: string,
  ahora: Date
): Promise<CitaDelEnlace | null> {
  if (!esTokenConForma(token)) return null
  const cita = await db.appointment.findFirst({ where: whereDeCitaPorToken(slug, token), select: SELECCION })
  if (!cita || !esGestionable(cita, ahora)) return null
  return cita
}

/** La clave del límite por token: su hash, para no guardar el token en claro en Upstash. */
export function claveDeLimite(token: string): string {
  return `token:${hashDeToken(token)}`
}
