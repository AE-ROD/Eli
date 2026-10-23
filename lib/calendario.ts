/**
 * "Agregar al calendario" de la confirmación de una reserva: el archivo .ics
 * (iPhone, Outlook y casi todo lo demás) y el enlace de Google Calendar.
 *
 * Funciones puras: no leen el reloj ni el navegador. El instante de la cita se
 * calcula desde la fecha y la hora de pared del negocio con `instanteEn`
 * (`lib/zona-horaria.ts`), así el evento cae a la misma hora para quien
 * reservó desde otra zona, y un cambio de horario se respeta. Todo viaja en
 * UTC (`...Z`): ni el .ics ni Google necesitan saber la zona.
 */

import { instanteEn } from "@/lib/zona-horaria"

export interface CitaParaCalendario {
  /** Identificador estable de la cita: con él, bajar el .ics dos veces no duplica el evento. */
  id: string
  servicio: string
  negocio: string
  /** `YYYY-MM-DD`, en el calendario del negocio. */
  fecha: string
  /** `HH:MM`, en el reloj del negocio. */
  hora: string
  duracionMinutos: number
  /** Zona IANA del negocio. */
  zona: string
  /** La dirección del local, si el negocio la tiene. Sin ella no va LOCATION. */
  direccion?: string | null
}

const MS_POR_MINUTO = 60_000

/** Dónde empieza y termina la cita, en instantes UTC. */
export function instantesDeLaCita(cita: CitaParaCalendario): { inicio: Date; fin: Date } {
  const inicio = instanteEn(cita.fecha, cita.hora, cita.zona)
  return { inicio, fin: new Date(inicio.getTime() + cita.duracionMinutos * MS_POR_MINUTO) }
}

/** `20261015T133000Z`: el formato UTC de iCalendar y de Google Calendar. */
export function formatoUtc(instante: Date): string {
  return instante.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")
}

/** El título del evento: "Corte + barba en Barbería del Centro". */
export function tituloDelEvento(cita: CitaParaCalendario): string {
  return `${cita.servicio} en ${cita.negocio}`
}

function detallesDelEvento(cita: CitaParaCalendario): string {
  return `Tu reserva de ${cita.servicio} en ${cita.negocio}.`
}

/**
 * Escapa un valor TEXT de iCalendar (RFC 5545, 3.3.11): la barra invertida,
 * el punto y coma y la coma llevan `\`, y un salto de línea se escribe `\n`.
 */
export function escaparTexto(texto: string): string {
  return texto
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n")
}

const OCTETOS_POR_LINEA = 75
const codificador = new TextEncoder()

/**
 * Pliega una línea de contenido a 75 octetos (RFC 5545, 3.1): cada
 * continuación empieza con un espacio, que cuenta dentro de sus 75. Corta
 * entre caracteres, nunca en medio de uno de varios bytes (una tilde, una ñ).
 */
export function plegarLinea(linea: string): string {
  const partes: string[] = []
  let actual = ""
  let octetos = 0
  for (const caracter of linea) {
    const tamaño = codificador.encode(caracter).length
    const limite = partes.length === 0 ? OCTETOS_POR_LINEA : OCTETOS_POR_LINEA - 1
    if (octetos + tamaño > limite) {
      partes.push(actual)
      actual = ""
      octetos = 0
    }
    actual += caracter
    octetos += tamaño
  }
  partes.push(actual)
  return partes.join("\r\n ")
}

/**
 * El contenido del .ics de la cita: un VCALENDAR con un VEVENT, líneas
 * plegadas y terminadas en CRLF. `ahora` es el DTSTAMP (cuándo se generó).
 */
export function generarIcs(cita: CitaParaCalendario, ahora: Date): string {
  const { inicio, fin } = instantesDeLaCita(cita)
  const lineas = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Eli//Reservas//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${escaparTexto(cita.id)}@eli`,
    `DTSTAMP:${formatoUtc(ahora)}`,
    `DTSTART:${formatoUtc(inicio)}`,
    `DTEND:${formatoUtc(fin)}`,
    `SUMMARY:${escaparTexto(tituloDelEvento(cita))}`,
    `DESCRIPTION:${escaparTexto(detallesDelEvento(cita))}`,
    ...(cita.direccion ? [`LOCATION:${escaparTexto(cita.direccion)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ]
  return lineas.map(plegarLinea).join("\r\n") + "\r\n"
}

/** El enlace que abre Google Calendar con el evento ya cargado, listo para guardar. */
export function urlDeGoogleCalendar(cita: CitaParaCalendario): string {
  const { inicio, fin } = instantesDeLaCita(cita)
  const parametros = new URLSearchParams({
    action: "TEMPLATE",
    text: tituloDelEvento(cita),
    dates: `${formatoUtc(inicio)}/${formatoUtc(fin)}`,
    details: detallesDelEvento(cita),
  })
  if (cita.direccion) parametros.set("location", cita.direccion)
  return `https://calendar.google.com/calendar/render?${parametros}`
}
