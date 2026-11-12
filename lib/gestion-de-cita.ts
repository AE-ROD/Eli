import type { Prisma } from "@prisma/client"
import {
  diasConHorarioDelProfesional,
  filasDeQuienesAtienden,
  haceLosServicios,
  leerProfesionalesQueAtienden,
  type ProfesionalQueAtiende,
} from "@/lib/agenda-publica"
import { al, el, este } from "@/lib/concordancia"
import type { FilaDeHorarioSemanal } from "@/lib/horario-de-atencion"
import { SIN_ATENCION_VIVA } from "@/lib/mover-cita"
import { hastaElMomentoDe, palabrasDeLaReserva } from "@/lib/palabras-de-la-reserva"
import { SELECCION_DE_LA_SEDE_DE_LA_CITA, lugarDeLaSede, type LugarDeLaReserva } from "@/lib/sede-de-la-reserva"
import { whereDelHorarioDeLaSede } from "@/lib/sedes"
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
 * - Al reagendar también se puede cambiar de profesional (ver abajo, "Con
 *   quién"): sólo entre quienes la reserva pública ofrece para ESOS servicios
 *   en la sede de la cita. Cambiar sólo de profesional cuenta como reagendar:
 *   mismo plazo, mismos candados.
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

// ─── Con quién: cambiar de profesional al reagendar ──────────────────────────
//
// Quien tiene el enlace puede, además de mover el día y la hora, pasar su cita a
// OTRO profesional del negocio, igual que al reservar ("Cualquiera" incluido).
// Lo que se ofrece y lo que se acepta es una sola regla (`profesionalesQueSePuedenElegir`):
//
// - Atiende en la reserva pública (`leerProfesionalesQueAtienden`: el rol que
//   atiende, del negocio del `slug`; el encargado no, ni nadie de otro negocio).
// - Hace TODOS los servicios de la cita (`haceLosServicios`, la regla de
//   `MemberService` de la reserva).
// - Atiende en la sede de la cita (`whereDelHorarioDeLaSede`, la misma lectura
//   de horario con que la disponibilidad ofrece horas): tiene algún día con
//   horario ahí, el propio o el general de esa sede.
//
// El servidor revalida todo en cada pedido: lo que llega del navegador es sólo
// una elección (`leerProfesionalDelPedido`), nunca una verdad.

/**
 * Con quién queda la cita al reagendar:
 * - `mismo`: no se mandó `profesionalId`. Quien la atiende hoy (`cita.memberId`);
 *   si no tiene a nadie asignado, cualquiera, como siempre.
 * - `cualquiera`: `profesionalId` vacío o `null`. Se asigna con el criterio de la
 *   reserva (`asignarCandidatoLibre`: el que tenga menos citas ese día).
 * - `uno`: un id, que `resolverProfesionalDelEnlace` revalida.
 */
export type EleccionDeProfesional = { tipo: "mismo" } | { tipo: "cualquiera" } | { tipo: "uno"; id: string }

/** Un id (`cuid()`, 25 caracteres): el tope corta un texto arbitrario antes de la base. */
export const LARGO_MAXIMO_DE_ID_DE_PROFESIONAL = 64

/** El 400 de un `profesionalId` que no es un texto razonable. */
export const MENSAJE_PROFESIONAL_NO_VALIDO = "El profesional no es válido"

/**
 * Lo que mandó el navegador como `profesionalId`, sin creerle: no mandarlo
 * (`undefined`) es `mismo`; `null` o vacío (o de puros espacios) es `cualquiera`;
 * un texto de hasta 64 caracteres es ese id, sin espacios en las puntas; y
 * cualquier otra cosa (un número, un objeto, un texto enorme) es `null`: un 400.
 * Nunca lanza. Que el id sea de alguien que se puede elegir lo decide
 * `resolverProfesionalDelEnlace`, no esto.
 */
export function leerProfesionalDelPedido(valor: unknown): EleccionDeProfesional | null {
  if (valor === undefined) return { tipo: "mismo" }
  if (valor === null) return { tipo: "cualquiera" }
  if (typeof valor !== "string") return null
  const id = valor.trim()
  if (id.length > LARGO_MAXIMO_DE_ID_DE_PROFESIONAL) return null
  return id === "" ? { tipo: "cualquiera" } : { tipo: "uno", id }
}

/** Quien puede tomar la cita, con los días en que atiende en la sede de la cita. */
export type ProfesionalElegible = ProfesionalQueAtiende & { diasConAtencion: number[] }

/**
 * De los profesionales que atienden, los que se pueden elegir: hacen todos los
 * servicios de la cita y tienen algún día con horario en la sede de la cita.
 * `filas` son las filas de horario de ESA sede (o las vigentes, si la cita no
 * tiene sede) ya acotadas a quienes atienden (`filasDeQuienesAtienden`). Pura.
 */
export function profesionalesQueSePuedenElegir(
  profesionales: readonly ProfesionalQueAtiende[],
  serviceIds: string[],
  filas: FilaDeHorarioSemanal[]
): ProfesionalElegible[] {
  return profesionales
    .filter((profesional) => haceLosServicios(profesional, serviceIds))
    .map((profesional) => ({ ...profesional, diasConAtencion: diasConHorarioDelProfesional(filas, profesional.id) }))
    .filter((profesional) => profesional.diasConAtencion.length > 0)
}

/**
 * Los profesionales que se pueden elegir para esta cita (`profesionalesQueSePuedenElegir`),
 * leídos del negocio de la cita y con el horario de su sede. El horario se lee
 * igual que `candidatosDeLaReserva`, para que lo que se ofrece acá y las horas
 * que ofrece la disponibilidad no den distinto.
 */
export async function leerProfesionalesParaCambiar(
  db: Pick<Prisma.TransactionClient, "businessMember" | "workSchedule">,
  cita: Pick<CitaDelEnlace, "businessId" | "sedeId">,
  serviceIds: string[]
): Promise<ProfesionalElegible[]> {
  const [profesionales, filas] = await Promise.all([
    leerProfesionalesQueAtienden(db, cita.businessId),
    db.workSchedule.findMany({
      where: { ...whereDelHorarioDeLaSede(cita.sedeId), businessId: cita.businessId, active: true },
      select: { memberId: true, dayOfWeek: true, startTime: true, endTime: true },
      orderBy: { startTime: "asc" },
    }),
  ])
  return profesionalesQueSePuedenElegir(profesionales, serviceIds, filasDeQuienesAtienden(filas, profesionales))
}

/**
 * Si la pantalla tiene algo que preguntar: con dos o más profesionales que se
 * pueden elegir, sí. Con uno solo no hay a quién elegir, salvo que quien
 * atiende la cita hoy ya no se pueda elegir (dejó de hacer el servicio o de
 * atender en la sede): entonces el único que queda es la salida. Una cita sin
 * profesional asignado con un solo profesional posible tampoco pregunta nada:
 * "cualquiera" ya es él.
 */
export function hayQueElegirProfesional(elegibles: readonly Pick<ProfesionalElegible, "id">[], memberIdActual: string | null): boolean {
  if (elegibles.length >= 2) return true
  return elegibles.length === 1 && memberIdActual !== null && elegibles[0].id !== memberIdActual
}

/** Un profesional de la lista que ve quien tiene el enlace: sólo lo que ya publica la reserva, nada del correo, el teléfono, el rol ni la comisión. */
export interface ProfesionalParaElegir {
  id: string
  nombre: string
  especialidad: string | null
  fotoUrl: string | null
  /** Los días de la semana (0 domingo a 6 sábado) en que atiende en la sede de la cita. */
  diasConAtencion: number[]
  /** Sólo en quien atiende la cita hoy. */
  actual?: true
}

/**
 * La lista del enlace: vacía si no hay nada que elegir (`hayQueElegirProfesional`)
 * y, si no, los profesionales que se pueden elegir, con `actual` en quien atiende
 * la cita hoy (si es uno de ellos).
 */
export function profesionalesParaMostrar(
  elegibles: readonly ProfesionalElegible[],
  memberIdActual: string | null
): ProfesionalParaElegir[] {
  if (!hayQueElegirProfesional(elegibles, memberIdActual)) return []
  return elegibles.map((profesional) => ({
    id: profesional.id,
    nombre: profesional.nombre,
    especialidad: profesional.especialidad,
    fotoUrl: profesional.fotoUrl,
    diasConAtencion: profesional.diasConAtencion,
    ...(profesional.id === memberIdActual && { actual: true as const }),
  }))
}

/** A quién se le pide la agenda: `profesionalId` null es "cualquiera de los que pueden" (o el carril único de un negocio sin equipo). */
export type ProfesionalDelCambio = { tipo: "ok"; profesionalId: string | null } | { tipo: "no-disponible" }

/**
 * Traduce la elección del pedido a lo que se le pide a la agenda
 * (`candidatosDeLaReserva`): `mismo` es quien atiende hoy, `cualquiera` es
 * nadie en particular, y un id se revalida contra los profesionales que se
 * pueden elegir para ESTA cita (negocio del `slug`, servicios y sede). Un id que
 * no existe, es de otro negocio, no atiende, no hace los servicios o no atiende
 * en la sede da el mismo `no-disponible`, sin decir cuál de esas cosas pasó.
 */
export async function resolverProfesionalDelEnlace(
  db: Pick<Prisma.TransactionClient, "businessMember" | "workSchedule">,
  cita: Pick<CitaDelEnlace, "businessId" | "sedeId" | "memberId">,
  serviceIds: string[],
  eleccion: EleccionDeProfesional
): Promise<ProfesionalDelCambio> {
  if (eleccion.tipo === "mismo") return { tipo: "ok", profesionalId: cita.memberId }
  if (eleccion.tipo === "cualquiera") return { tipo: "ok", profesionalId: null }
  const elegibles = await leerProfesionalesParaCambiar(db, cita, serviceIds)
  return elegibles.some((profesional) => profesional.id === eleccion.id)
    ? { tipo: "ok", profesionalId: eleccion.id }
    : { tipo: "no-disponible" }
}
