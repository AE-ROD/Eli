import type { Prisma } from "@prisma/client"
import { al, el, este } from "@/lib/concordancia"
import { SIN_ATENCION_VIVA } from "@/lib/mover-cita"
import { hastaElMomentoDe, palabrasDeLaReserva } from "@/lib/palabras-de-la-reserva"
import { SELECCION_DE_LA_SEDE_DE_LA_CITA, lugarDeLaSede, type LugarDeLaReserva } from "@/lib/sede-de-la-reserva"
import { SELECCION_DE_SERVICIOS_DE_LA_CITA } from "@/lib/servicios-de-la-reserva"
import { hashDeToken } from "@/lib/tokens"
import { conMayuscula } from "@/lib/vocabulario"

/**
 * El enlace para que el cliente cancele o reagende su cita sin cuenta
 * (`/reservar/<slug>/cita/<token>`). El token se genera al confirmar
 * (`generarToken`) y la base guarda sólo su sha256 (`Appointment.manageTokenHash`).
 *
 * Reglas
 * ──────
 * - La cita se busca por el hash del token Y por el slug del negocio: un
 *   token válido con el slug de otro negocio no encuentra nada.
 * - Sólo se gestiona una cita pendiente o confirmada que todavía no empezó y
 *   cuyo cliente no llegó: con una atención viva en el Tablero, gana la
 *   llegada (PRODUCTO.md §6) y el enlace ya no la cancela ni la mueve.
 *   Token inválido, de otro negocio, cita cancelada, pasada, en otro estado o
 *   con su atención: todo es el mismo 404, sin decir cuál de esas cosas pasó.
 *   Las escrituras (`cancelar`, `reagendar`) repiten la condición
 *   (`whereDeEscrituraDelEnlace`): una llegada que entre entretanto gana.
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

/**
 * El 404 de todo enlace que no sirve: "Este enlace no es válido o la cita ya no
 * se puede cambiar". `rubro` (`Business.type`, de la base) pone la palabra de la
 * reserva: "…o la hora ya no se puede cambiar" en un salón.
 */
export function mensajeEnlaceInvalido(rubro?: string | null): string {
  return `Este enlace no es válido o ${el(palabrasDeLaReserva(rubro).cita)} ya no se puede cambiar`
}

/** El 404 con las palabras de un rubro desconocido: el texto de siempre. */
export const MENSAJE_ENLACE_INVALIDO = mensajeEnlaceInvalido(null)

export function esTokenConForma(token: string): boolean {
  return token.length >= 20 && token.length <= LARGO_MAXIMO_DE_TOKEN && /^[A-Za-z0-9_-]+$/.test(token)
}

/** Si la cita se puede ver con el enlace: estado gestionable y todavía no empezó. */
export function esGestionable(cita: { status: string; startTime: Date }, ahora: Date): boolean {
  return (ESTADOS_GESTIONABLES as readonly string[]).includes(cita.status) && cita.startTime.getTime() > ahora.getTime()
}

/** Si todavía está dentro del plazo para cancelar o reagendar. Un plazo raro en la base se lee como el de por defecto. */
export function dentroDelPlazo(inicio: Date, horasAntes: number, ahora: Date): boolean {
  return inicio.getTime() - ahora.getTime() >= plazoValido(horasAntes) * 60 * 60 * 1000
}

/** El plazo con que se decide: uno raro en la base se lee como el de por defecto. */
export function plazoValido(horasAntes: number): number {
  return Number.isInteger(horasAntes) && horasAntes >= PLAZO_MINIMO_HORAS && horasAntes <= PLAZO_MAXIMO_HORAS
    ? horasAntes
    : PLAZO_POR_DEFECTO_HORAS
}

/**
 * El plazo dicho ANTES de reservar (#83), en la mini página y en el paso de
 * confirmar: lo mismo que después aplica `dentroDelPlazo`, incluido leer un
 * plazo raro como el de por defecto. `rubro` (`Business.type`) pone la palabra
 * de la reserva: sin plazo, "Puedes cancelar o cambiar tu hora hasta el momento
 * de la cita." en un rubro desconocido y "…tu hora hasta que llegue la hora." en
 * los que la llaman "hora" ("hasta el momento de la hora" no se dice).
 */
export function plazoParaQuienReserva(horasAntes: number, rubro?: string | null): string {
  const plazo = plazoValido(horasAntes)
  if (plazo === 0) {
    const { cita, hora } = palabrasDeLaReserva(rubro)
    return `Puedes cancelar o cambiar tu ${hora.singular} ${hastaElMomentoDe(cita)}.`
  }
  return `Puedes cancelar o cambiar hasta ${plazo} ${plazo === 1 ? "hora" : "horas"} antes.`
}

/** "…Contacta al local." en un rubro desconocido, "…Contacta al salón." o "…Contacta a la clínica." en los demás. */
export function mensajeFueraDePlazo(horasAntes: number, rubro?: string | null): string {
  const { local } = palabrasDeLaReserva(rubro)
  return horasAntes === 1
    ? `Ya no se puede cambiar por acá: falta menos de 1 hora. Contacta ${al(local)}.`
    : `Ya no se puede cambiar por acá: se puede hasta ${horasAntes} horas antes. Contacta ${al(local)}.`
}

/**
 * Lo que se dice al querer cambiar una reserva cuyo servicio ya no se reserva
 * por el enlace: "Este servicio ya no se reserva por acá. Contacta al local.",
 * y con las palabras del rubro, "Este motivo… Contacta a la clínica."
 */
export function mensajeServicioYaNoSeReserva(rubro?: string | null): string {
  const { servicioDeLaReserva, local } = palabrasDeLaReserva(rubro)
  return `${conMayuscula(este(servicioDeLaReserva))} ya no se reserva por acá. Contacta ${al(local)}.`
}

/** Lo que se dice si ya no hay quién pueda tomar la reserva: "No hay horas para reagendar por acá. Contacta al local." */
export function mensajeSinHorasParaReagendar(rubro?: string | null): string {
  return `No hay horas para reagendar por acá. Contacta ${al(palabrasDeLaReserva(rubro).local)}.`
}

/** El `where` de la cita del enlace: hash del token, negocio del slug, estado gestionable y sin atención viva. */
export function whereDeCitaPorToken(slug: string, token: string): Prisma.AppointmentWhereInput {
  return {
    manageTokenHash: hashDeToken(token),
    business: { slug },
    status: { in: [...ESTADOS_GESTIONABLES] },
    AND: [SIN_ATENCION_VIVA],
  }
}

/**
 * El `where` con que el enlace escribe (cancela o reagenda): la cita tal como
 * se leyó (negocio, estado gestionable, misma hora) y todavía sin atención
 * viva. Si entretanto el local la movió, la cerró o el cliente llegó, no se
 * escribe nada y el endpoint responde el 404 del enlace.
 */
export function whereDeEscrituraDelEnlace(cita: {
  id: string
  businessId: string
  startTime: Date
}): Prisma.AppointmentWhereInput {
  return {
    id: cita.id,
    businessId: cita.businessId,
    status: { in: [...ESTADOS_GESTIONABLES] },
    startTime: cita.startTime,
    AND: [SIN_ATENCION_VIVA],
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
  // El precio de hoy: al reagendar se compara con el de la hora nueva (#89c).
  price: true,
  // Clínica dental: el sillón que le asignó la clínica. Reagendar lo conserva
  // y sólo ofrece y acepta horas en que está libre. Nunca se le muestra al
  // paciente.
  sillonId: true,
  // Plan Independiente: la sede donde se atiende (null en un negocio sin sedes y
  // en las citas de antes). Reagendar no la cambia: ofrece sólo horas de esa sede.
  // Sólo nombre, dirección y comuna: nada interno.
  sedeId: true,
  sede: { select: SELECCION_DE_LA_SEDE_DE_LA_CITA },
  customer: { select: { name: true, lastName: true } },
  member: { select: { user: { select: { name: true } } } },
  service: { select: { id: true, name: true, duration: true, active: true } },
  // Varios servicios (#89a): con filas, mandan ellas (`serviciosDeLaCita`).
  servicios: SELECCION_DE_SERVICIOS_DE_LA_CITA,
  business: {
    select: {
      id: true,
      name: true,
      slug: true,
      timezone: true,
      cancelacionHorasAntes: true,
      // El rubro: en una clínica dental, una urgencia sólo se mueve a hoy.
      type: true,
      user: { select: { email: true } },
    },
  },
} satisfies Prisma.AppointmentSelect

export type CitaDelEnlace = Prisma.AppointmentGetPayload<{ select: typeof SELECCION }>

/**
 * Dónde se atiende la cita del enlace: su sede (nombre, dirección y comuna), o
 * `null` si no tiene (un negocio sin sedes, o una cita de antes): ahí la
 * pantalla y los correos son los de siempre.
 */
export function lugarDeLaCitaDelEnlace(cita: Pick<CitaDelEnlace, "sede">): LugarDeLaReserva | null {
  return cita.sede ? lugarDeLaSede(cita.sede) : null
}

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
