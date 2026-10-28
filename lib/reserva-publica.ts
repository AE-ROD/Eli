/**
 * Las reglas de la reserva pública que no son el horario de atención: cuándo
 * se puede reservar. Puro: entra el reloj y la zona del negocio, sale la
 * respuesta. Lo usan `disponibilidad` (qué horas se ofrecen) y `confirmar`
 * (qué horas se aceptan), con la misma regla para que nunca den distinto.
 */

import { horaAMinutos } from "@/lib/horario-dia"
import { aE164Chile } from "@/lib/telefono"
import { diaDeLaSemana, diasEntre, esFechaCalendario, fechaYMinutosEn } from "@/lib/zona-horaria"

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

/**
 * Si la hora `hora` ("HH:MM") de `fecha` ya pasó en el reloj de la zona. La
 * hora en curso cuenta como pasada: a las 10:30 ya no se reserva a las 10:30.
 * Es la regla con la que `disponibilidad` siempre filtró las horas de hoy.
 */
export function yaPasoLaHora(fecha: string, hora: string, ahora: Date, zona: string): boolean {
  const hoy = fechaYMinutosEn(ahora, zona)
  const dias = diasEntre(hoy.fecha, fecha)
  if (dias !== 0) return dias < 0
  return horaAMinutos(hora) <= hoy.minutos
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
 * Qué hacer con el consentimiento de WhatsApp marcado en la reserva cuando el
 * cliente ya existía (se reutilizó por email + nombre, no por teléfono):
 *
 * - `"guardar-telefono"`: el cliente no tiene teléfono (null, o un texto
 *   vacío). Se guarda el dado (E.164) junto con el consentimiento; si ya
 *   tenía uno previo, se completa sólo el teléfono y el consentimiento queda
 *   como estaba.
 * - `"registrar"`: el teléfono guardado es el mismo que el dado (ambos en
 *   E.164). El consentimiento vale para ese número.
 * - `"nada"`: no hay teléfono en la reserva, o el guardado es otro (o uno
 *   escrito que no se puede leer como chileno). El consentimiento se dio para un número que no
 *   es el del cliente: no se registra ni se pisa su teléfono.
 *
 * `telefonoDado` viene ya en E.164 (`reservaSchema`) o null.
 */
export function consentimientoSobreClienteExistente(
  telefonoGuardado: string | null | undefined,
  telefonoDado: string | null | undefined
): "guardar-telefono" | "registrar" | "nada" {
  const dado = aE164Chile(telefonoDado)
  if (!dado) return "nada"
  // Sin teléfono es null o un texto en blanco: no hay número que pisar. Uno
  // escrito pero ilegible cae en "nada": es un dato que alguien cargó.
  if (telefonoGuardado === null || telefonoGuardado === undefined || telefonoGuardado.trim() === "") return "guardar-telefono"
  return aE164Chile(telefonoGuardado) === dado ? "registrar" : "nada"
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
