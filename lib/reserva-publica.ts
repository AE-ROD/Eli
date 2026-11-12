/**
 * Las reglas de la reserva pública que no son el horario de atención: cuándo
 * se puede reservar. Puro: entra el reloj y la zona del negocio, sale la
 * respuesta. Lo usan `disponibilidad` (qué horas se ofrecen) y `confirmar`
 * (qué horas se aceptan), con la misma regla para que nunca den distinto.
 */

import { al, concordar, el, pronombreDe } from "@/lib/concordancia"
import { horaAMinutos } from "@/lib/horario-dia"
import { palabrasDeLaReserva } from "@/lib/palabras-de-la-reserva"
import { RUBRO_DENTAL } from "@/lib/rubros"
import { aE164Chile } from "@/lib/telefono"
import { diaDeLaSemana, diasEntre, esFechaCalendario, fechaYMinutosEn, instanteEn } from "@/lib/zona-horaria"

/**
 * Hasta cuántos días después de hoy (en el reloj del negocio) se puede
 * reservar, hoy incluido como día 0. Sin tope, una sola persona podía llenar
 * la agenda de años futuros.
 */
export const DIAS_MAXIMOS_DE_ANTICIPACION = 90

export const MENSAJE_HORA_PASADA = "Ese horario ya pasó. Elige otra hora."
export const MENSAJE_FECHA_PASADA = "Esa fecha ya pasó. Elige otro día."
export const MENSAJE_FECHA_MUY_LEJANA = `Se puede reservar hasta ${DIAS_MAXIMOS_DE_ANTICIPACION} días por adelantado. Elige una fecha más cercana.`

/** Por qué una fecha no se puede reservar, o `null` si se puede. */
export type FechaNoReservable = "pasada" | "muy-lejana"

/**
 * Si el día `fecha` cae fuera de lo reservable: antes de hoy o a más de
 * `DIAS_MAXIMOS_DE_ANTICIPACION` días de hoy, con "hoy" en el reloj de la
 * zona. La fecha tiene que venir validada (`esFechaCalendario`).
 */
export function fechaNoReservable(fecha: string, ahora: Date, zona: string): FechaNoReservable | null {
  const dias = diasEntre(fechaYMinutosEn(ahora, zona).fecha, fecha)
  if (dias < 0) return "pasada"
  if (dias > DIAS_MAXIMOS_DE_ANTICIPACION) return "muy-lejana"
  return null
}

/**
 * Si el calendario de la página pública ofrece el día `fecha`: que el negocio
 * atienda ese día de la semana (`diasConAtencion`, 0 domingo a 6 sábado) y
 * que no sea ni pasado ni más allá de `DIAS_MAXIMOS_DE_ANTICIPACION`, con
 * "hoy" en el reloj del negocio y no en el del navegador. Es la regla de
 * `fechaNoReservable`, la misma con la que `confirmar` rechaza: el calendario
 * no ofrece un día que después se rechazaría. No lanza: una fecha inválida
 * no se ofrece.
 */
export function esDiaReservable(fecha: string, diasConAtencion: readonly number[], ahora: Date, zona: string): boolean {
  if (!esFechaCalendario(fecha)) return false
  return fechaNoReservable(fecha, ahora, zona) === null && diasConAtencion.includes(diaDeLaSemana(fecha))
}

/** Quien atiende, como lo conoce el calendario de la reserva: qué servicios hace (null = todos) y qué días trabaja. */
export interface ProfesionalDelCalendario {
  id: string
  servicioIds: string[] | null
  diasConAtencion: number[]
}

/**
 * Los días de la semana (0 domingo a 6 sábado) que el calendario de la
 * reserva deja elegir, con los mismos candidatos que usa la disponibilidad
 * (N3): el profesional elegido, o "cualquiera" de los que hacen todos los
 * servicios elegidos, cada uno con sus días (`diasConHorarioDelProfesional`).
 * Así no se ofrece un día que después responde "No hay atención ese día".
 *
 * Sin equipo (`null`: todavía no se leyó o no se pudo; o lista vacía: el
 * negocio no tiene profesionales) valen los días del horario publicado, que
 * en un negocio sin profesionales es el del negocio y en uno con ellos es
 * la unión de los suyos.
 */
export function diasDelCalendarioDeReserva(consulta: {
  diasPublicados: readonly number[]
  equipo: readonly ProfesionalDelCalendario[] | null
  servicioIds: readonly string[]
  profesionalId: string | null
}): number[] {
  const { diasPublicados, equipo, servicioIds, profesionalId } = consulta
  if (!equipo || equipo.length === 0) return [...new Set(diasPublicados)].sort((a, b) => a - b)
  const quienes = equipo.filter(
    (profesional) =>
      (!profesionalId || profesional.id === profesionalId) &&
      servicioIds.every((servicioId) => profesional.servicioIds === null || profesional.servicioIds.includes(servicioId))
  )
  return [...new Set(quienes.flatMap((profesional) => profesional.diasConAtencion))].sort((a, b) => a - b)
}

/**
 * Si el día ya elegido (`fecha`, "AAAA-MM-DD") quedó fuera de los días con
 * atención (`diasDelCalendarioDeReserva`) después de cambiar de profesional
 * o de servicios: entonces la reserva lo limpia, con su hora, y avisa. Sin
 * día elegido, o con uno que no es una fecha, no hay nada que limpiar.
 */
export function elDiaElegidoQuedoSinAtencion(fecha: string, diasConAtencion: readonly number[]): boolean {
  return esFechaCalendario(fecha) && !diasConAtencion.includes(diaDeLaSemana(fecha))
}

/** El aviso al limpiar el día elegido (`elDiaElegidoQuedoSinAtencion`). */
export const AVISO_DIA_SIN_ATENCION = "El día que habías elegido no tiene atención para esta reserva. Elige otro."

/**
 * Si la hora `hora` ("HH:MM") de `fecha` ya pasó en el reloj de la zona. La
 * hora en curso cuenta como pasada: a las 10:30 ya no se reserva a las 10:30.
 * Es la regla con la que `disponibilidad` siempre filtró las horas de hoy.
 *
 * Hoy se compara el instante en que se guardaría la cita (`instanteEn`), no
 * la hora de pared: la noche en que el reloj retrocede (Santiago, de las
 * 24:00 a las 23:00), las 23:30 ocurren dos veces y la cita se guarda en la
 * primera. Pasada esa primera, ya no se ofrece aunque el reloj vuelva a
 * marcar las 23:10.
 */
export function yaPasoLaHora(fecha: string, hora: string, ahora: Date, zona: string): boolean {
  const hoy = fechaYMinutosEn(ahora, zona)
  const dias = diasEntre(hoy.fecha, fecha)
  if (dias !== 0) return dias < 0
  try {
    return instanteEn(fecha, hora, zona).getTime() <= ahora.getTime()
  } catch {
    // Una hora que no se puede leer: la regla de siempre, con la hora de pared.
    return horaAMinutos(hora) <= hoy.minutos
  }
}

/**
 * Si una hora elegida ya cae dentro del plazo para cancelar o cambiar
 * (`plazoHoras`, ya validado con `plazoValido`): quien reserva con menos
 * anticipación que el plazo no podrá cancelarla ni cambiarla por el enlace
 * (QA#8). Es la regla de `dentroDelPlazo` (`lib/gestion-de-cita.ts`) al revés:
 * falta MENOS que el plazo. Vive acá porque `gestion-de-cita` no entra al
 * navegador. No lanza: una fecha u hora inválidas dan `false`.
 */
export function quedaSinCambiosPorElEnlace(fecha: string, hora: string, zona: string, plazoHoras: number, ahora: Date): boolean {
  if (!esFechaCalendario(fecha) || !/^\d{2}:\d{2}$/.test(hora)) return false
  try {
    return instanteEn(fecha, hora, zona).getTime() - ahora.getTime() < plazoHoras * 60 * 60 * 1000
  } catch {
    return false
  }
}

/**
 * "hora" y "horas" del plazo: son horas del reloj, no la reserva, y no cambian
 * con el rubro.
 */
const horasDelPlazo = (plazoHoras: number) => `${plazoHoras} ${plazoHoras === 1 ? "hora" : "horas"}`

/**
 * Lo que se dice antes de confirmar cuando la hora ya está dentro del plazo
 * (QA#8). `rubro` (`Business.type`) pone las palabras del negocio: "Tu hora es
 * en menos de 24 horas: una vez confirmada, no podrás cancelarla ni cambiarla
 * por el enlace. Si lo necesitas, tendrás que contactar al salón." Sin rubro, el
 * texto de siempre ("al local").
 */
export function avisoSinCambiosPorElEnlace(plazoHoras: number, rubro?: string | null): string {
  const { hora, local } = palabrasDeLaReserva(rubro)
  const confirmada = concordar("confirmado", hora)
  const lo = pronombreDe(hora)
  return `Tu ${hora.singular} es en menos de ${horasDelPlazo(plazoHoras)}: una vez ${confirmada}, no podrás cancelar${lo} ni cambiar${lo} por el enlace. Si lo necesitas, tendrás que contactar ${al(local)}.`
}

/** Lo mismo, en la pantalla de reserva confirmada: en vez de "Gestiona tu cita acá". */
export function avisoSinCambiosDespuesDeReservar(plazoHoras: number, rubro?: string | null): string {
  const { hora, local } = palabrasDeLaReserva(rubro)
  return `Tu ${hora.singular} es en menos de ${horasDelPlazo(plazoHoras)}, así que no se puede cancelar ni cambiar por el enlace. Si lo necesitas, contacta directamente ${al(local)}.`
}

// ─── Clínica dental: primera vez y urgencia ──────────────────────────────────
//
// Sólo en una clínica dental (`esRubroDental(Business.type)`). En cualquier
// otro rubro la reserva es la de siempre: `primeraVez` se ignora y ningún
// servicio es urgencia, aunque la columna diga otra cosa. La duración y si es
// urgencia los decide el servidor (disponibilidad, confirmar y el enlace para
// reagendar), con estas mismas funciones; la página sólo las muestra.

/** Los minutos que suma la primera vez en la clínica: para abrir la ficha. */
export const MINUTOS_DE_PRIMERA_VEZ = 15

/**
 * Lo que dice la reserva junto a "¿Es tu primera consulta en la clínica?": "En
 * la primera consulta sumamos 15 minutos para abrir tu ficha." La palabra
 * sale del rubro (`primeraVez`); sólo la ve quien reserva en una clínica dental.
 */
export function textoDePrimeraVez(rubro: string | null | undefined): string {
  const { primeraVez } = palabrasDeLaReserva(rubro)
  return `En ${el(primeraVez)} sumamos ${MINUTOS_DE_PRIMERA_VEZ} minutos para abrir tu ficha.`
}

/**
 * Cuánto dura la reserva entera: la suma de los servicios
 * (`resumenDeLaReserva`) y, en una clínica dental y si es la primera vez del
 * paciente, `MINUTOS_DE_PRIMERA_VEZ` más. Con la misma cuenta se ofrecen las
 * horas y se aceptan: una hora en que caben 45 minutos puede no tener 60.
 */
export function duracionDeLaReserva(
  duracionDeLosServicios: number,
  { clinicaDental, primeraVez }: { clinicaDental: boolean; primeraVez: boolean }
): number {
  return duracionDeLosServicios + (clinicaDental && primeraVez ? MINUTOS_DE_PRIMERA_VEZ : 0)
}

/** Si la reserva es una urgencia: en una clínica dental, alguno de los servicios elegidos está marcado como urgencia. */
export function esReservaDeUrgencia(clinicaDental: boolean, servicios: readonly { esUrgencia?: boolean | null }[]): boolean {
  return clinicaDental && servicios.some((servicio) => servicio.esUrgencia === true)
}

/** Si `fecha` ("AAAA-MM-DD") es hoy en el reloj de la zona. Una urgencia sólo se reserva para hoy. */
export function esHoyEn(fecha: string, ahora: Date, zona: string): boolean {
  return fechaYMinutosEn(ahora, zona).fecha === fecha
}

/**
 * El 400 de `confirmar` (y del enlace para reagendar) con una urgencia para
 * otro día: "…elige una hora de hoy. Para otro día, elige otro motivo." La
 * palabra de lo que se elige sale del rubro.
 */
export function mensajeDeUrgenciaSoloHoy(rubro: string | null | undefined): string {
  const { servicioDeLaReserva } = palabrasDeLaReserva(rubro)
  return `Las urgencias se atienden el mismo día: elige una hora de hoy. Para otro día, elige ${concordar("otro", servicioDeLaReserva)} ${servicioDeLaReserva.singular}.`
}

/** Cuando hoy no queda ninguna hora para una urgencia: "…Llama a la clínica para que te orienten." */
export function mensajeDeUrgenciaSinHoras(rubro: string | null | undefined): string {
  const { negocio } = palabrasDeLaReserva(rubro)
  return `Hoy ya no quedan horas de urgencia para reservar por acá. Llama ${al(negocio)} para que te orienten.`
}

/*
 * La urgencia es sólo de la clínica dental: las respuestas de la API (que no
 * leen el rubro para decir esto, porque ya saben que es una clínica) usan las
 * palabras de la clínica.
 */
export const MENSAJE_URGENCIA_SOLO_HOY = mensajeDeUrgenciaSoloHoy(RUBRO_DENTAL)
export const MENSAJE_URGENCIA_SIN_HORAS = mensajeDeUrgenciaSinHoras(RUBRO_DENTAL)

/**
 * El aviso de la reserva de una clínica con un servicio de urgencia activo, con
 * su nombre: "Elige «Urgencia dental» como motivo y te mostramos horas de hoy."
 * Sin rubro, el de la clínica: es el único que lo muestra.
 */
export function avisoDeUrgencia(
  nombreDelServicio: string,
  rubro: string | null | undefined = RUBRO_DENTAL
): { destacado: string; resto: string } {
  const { servicioDeLaReserva } = palabrasDeLaReserva(rubro)
  return {
    destacado: "¿Tienes dolor fuerte?",
    resto: `Elige «${nombreDelServicio}» como ${servicioDeLaReserva.singular} y te mostramos horas de hoy.`,
  }
}

// ─── Topes anti-abuso ────────────────────────────────────────────────────────
//
// La página pública no pide cuenta: cualquiera puede reservar, y el límite
// por IP (`lib/rate-limit.ts`) se esquiva rotando IPs. Estos topes cuentan en
// la base, por negocio.
//
// Qué es una reserva pública: una cita con `source: "reserva-publica"`, que
// sólo `confirmar` escribe; el panel (`app/api/citas`) deja el default
// "panel". Antes se la reconocía por tener `serviceId`, y eso se rompía si el
// panel guardaba el servicio o si se borraba el servicio (queda en null).

/**
 * De dónde viene una cita (`Appointment.source`): la crea el equipo en el
 * panel o el cliente en la página pública. La base los limita a estos dos
 * con una CHECK (migración `origen_de_las_citas`).
 */
export const ORIGENES_DE_CITA = ["panel", "reserva-publica"] as const
export type OrigenDeCita = (typeof ORIGENES_DE_CITA)[number]

/** Cuántas reservas futuras no canceladas puede tener un mismo email o teléfono en un negocio. */
export const MAX_RESERVAS_FUTURAS_POR_CONTACTO = 3

/**
 * Cuántas reservas públicas no canceladas puede recibir un negocio en 24
 * horas. Las canceladas no cuentan: si contaran, quien llegara al tope con
 * reservas falsas dejaba al negocio sin reserva en línea por 24 horas aunque
 * la dueña las cancelara.
 */
export const MAX_RESERVAS_PUBLICAS_POR_DIA = 50

export const MENSAJE_TOPE_POR_CONTACTO = `Ya tienes ${MAX_RESERVAS_FUTURAS_POR_CONTACTO} reservas pendientes en este negocio. Para pedir otra, contáctalo directamente.`
export const MENSAJE_TOPE_POR_NEGOCIO =
  "Este negocio recibió demasiadas reservas en línea en las últimas horas. Intenta más tarde o contáctalo directamente."

/** El origen con que `confirmar` crea las citas. */
export const ORIGEN_RESERVA_PUBLICA: OrigenDeCita = "reserva-publica"

/** El filtro de cita que identifica una reserva pública (ver arriba). */
export const WHERE_RESERVA_PUBLICA = { source: ORIGEN_RESERVA_PUBLICA }

/** El email para comparar: sin espacios alrededor y en minúsculas. Vacío → `null`. */
export function normalizarEmail(email: string | null | undefined): string | null {
  const limpio = email?.trim().toLowerCase()
  return limpio ? limpio : null
}

/** Mínimo de dígitos para que un teléfono identifique a alguien: con menos, "123" sería de muchos. */
const DIGITOS_MINIMOS_DE_TELEFONO = 8

/** El teléfono para comparar: sólo sus dígitos. Con menos de 8, `null`: no identifica a nadie. */
export function normalizarTelefono(telefono: string | null | undefined): string | null {
  const digitos = (telefono ?? "").replace(/\D/g, "")
  return digitos.length >= DIGITOS_MINIMOS_DE_TELEFONO ? digitos : null
}

/**
 * Un nombre para comparar: sin tildes ni diéresis, en minúsculas y con un
 * solo espacio entre palabras. "  LUCÍA  Pérez" y "lucia perez" son iguales.
 */
export function normalizarNombre(nombre: string | null | undefined): string {
  return (nombre ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
}

/**
 * Si la reserva es de un cliente que el negocio ya tiene: el mismo email
 * (normalizado) Y el mismo nombre completo (normalizado). Antes bastaba el
 * email o la cédula, y una reserva con datos ajenos quedaba colgada del
 * historial de otra persona (M6). La cédula no participa: sola nunca vincula.
 */
export function esElMismoCliente(
  cliente: { name: string; lastName: string | null; email: string | null },
  reserva: { nombre: string; apellido: string; email?: string | null }
): boolean {
  const email = normalizarEmail(reserva.email)
  if (!email || normalizarEmail(cliente.email) !== email) return false
  return normalizarNombre(`${cliente.name} ${cliente.lastName ?? ""}`) === normalizarNombre(`${reserva.nombre} ${reserva.apellido}`)
}

/**
 * La nota interna que deja en la cita una reserva pública de un cliente que
 * ya existía (reutilizado por email + nombre), o `null` si no hay nada que
 * avisar.
 *
 * La reserva pública nunca escribe el teléfono ni el consentimiento de
 * WhatsApp de un cliente existente: quien conoce el email y el nombre de otra
 * persona podía dejar su propio número en la ficha y recibir los
 * recordatorios de sus citas. Lo dado queda en la cita, visible para el
 * local, que lo confirma a mano en la ficha del cliente (#109, #115):
 *
 * - un teléfono distinto del guardado (o el cliente no tenía uno, o el
 *   guardado no se puede leer como chileno): se anota el número.
 * - el pedido de recordatorios por WhatsApp: se anota, sea o no el mismo
 *   número.
 *
 * Sin teléfono en la reserva no hay nada que anotar: el consentimiento es
 * para un número. `telefonoDado` viene ya en E.164 (`reservaSchema`) o null.
 */
export function notaDeContactoPorConfirmar(
  telefonoGuardado: string | null | undefined,
  telefonoDado: string | null | undefined,
  pidioWhatsapp: boolean
): string | null {
  const dado = aE164Chile(telefonoDado)
  if (!dado) return null
  const esElGuardado = aE164Chile(telefonoGuardado) === dado
  if (esElGuardado && !pidioWhatsapp) return null
  const partes: string[] = []
  if (!esElGuardado) {
    partes.push(`Teléfono dado al reservar: ${dado}. No se guardó en la ficha del cliente.`)
  }
  if (pidioWhatsapp) {
    partes.push("Pidió recordatorios por WhatsApp. El consentimiento no se registró.")
  }
  partes.push("Confírmalo con el cliente y actualiza su ficha.")
  return partes.join(" ")
}

export interface Contacto {
  email: string | null | undefined
  telefono: string | null | undefined
}

/**
 * Si el cliente guardado tiene el mismo email o el mismo teléfono que el
 * contacto, normalizados. Dos teléfonos son el mismo si son iguales o si uno
 * es el otro con el código de país adelante ("56912345678" y "912345678").
 */
export function compartenContacto(cliente: { email: string | null; phone: string | null }, contacto: Contacto): boolean {
  const email = normalizarEmail(contacto.email)
  if (email && normalizarEmail(cliente.email) === email) return true
  const telefono = normalizarTelefono(contacto.telefono)
  const delCliente = normalizarTelefono(cliente.phone)
  if (!telefono || !delCliente) return false
  return telefono.endsWith(delCliente) || delCliente.endsWith(telefono)
}
