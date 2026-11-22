/**
 * "Recordar por WhatsApp" desde el detalle de la cita. Los recordatorios
 * automáticos salen sólo por correo; acá la persona del local abre su propio
 * WhatsApp (`wa.me`) con el mensaje ya escrito y sólo toca Enviar: no hay API
 * ni costo, igual que "Escribirle" en Clientes (de ahí sale el enlace y la
 * validación del teléfono). Puro, para probarlo sin pantalla.
 *
 * No se registra el envío: `envios_a_clientes` sólo acepta los tipos de su
 * CHECK, y "contacto-manual" es otra cosa (esconde al cliente de "Se están
 * yendo"). Registrarlo pide un tipo nuevo, o sea una migración.
 */

import { vocabularioDe, type PalabrasDelRubro } from "@/lib/vocabulario"
import { diaDeLaSemana, fechaYMinutosEn, sumarDias } from "@/lib/zona-horaria"
import { enlaceDeWhatsapp, primerNombre } from "../clientes/_escribirle"
import { horaEn } from "./_hora-del-negocio"

const PALABRAS_NEUTRAS = vocabularioDe(null).palabras

/** Escritos acá y no con `toLocaleDateString`: el mensaje no depende del idioma ni de la zona del dispositivo. */
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"]
const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
]

/** Lo que el recordatorio necesita de la cita: lo que ya viaja en la lista de la agenda. */
export interface CitaParaRecordar {
  status: string
  startTime: string
  /** Los servicios como los muestra la agenda ("Corte + Color"). */
  title: string
  customer: { name: string; phone: string | null } | null
}

interface ParaElRecordatorio {
  cita: CitaParaRecordar
  nombreNegocio: string
  /** La zona del negocio (`Business.timezone`): el día y la hora se dicen en ella, no en la del dispositivo. */
  zona: string
  ahora: Date
  /** Dónde se atiende, si la agenda lo muestra (`sedeParaMostrar`): sólo con varias sedes. */
  sede?: string | null
  /** Las palabras del rubro: "hora" o "cita", como la lee el cliente (`citaParaElCliente`). */
  palabras?: Pick<PalabrasDelRubro, "citaParaElCliente">
}

/**
 * Si la cita se puede recordar: pendiente o confirmada y todavía no empieza.
 * Una cancelada, completada o de "No vino" no se recuerda, y una que ya
 * empezó tampoco.
 */
export function sePuedeRecordar(cita: Pick<CitaParaRecordar, "status" | "startTime">, ahora: Date): boolean {
  if (cita.status !== "pendiente" && cita.status !== "confirmada") return false
  const inicio = new Date(cita.startTime).getTime()
  return Number.isFinite(inicio) && inicio > ahora.getTime()
}

/** "de hoy", "de mañana, martes 24," o "del viernes 27 de noviembre": el día de la cita visto desde hoy, en la zona del negocio. */
function cuando(inicio: Date, ahora: Date, zona: string): string {
  const fecha = fechaYMinutosEn(inicio, zona).fecha
  const hoy = fechaYMinutosEn(ahora, zona).fecha
  if (fecha === hoy) return "de hoy"
  const [, mes, dia] = fecha.split("-").map(Number)
  const diaDeSemana = DIAS[diaDeLaSemana(fecha)]
  if (fecha === sumarDias(hoy, 1)) return `de mañana, ${diaDeSemana} ${dia},`
  return `del ${diaDeSemana} ${dia} de ${MESES[mes - 1]}`
}

/**
 * El mensaje del recordatorio. La persona lo puede cambiar en WhatsApp antes
 * de mandarlo.
 *
 * "Hola Ana, te escribimos de Salón Demo para recordarte tu hora de mañana,
 * martes 24, a las 10:00 (Corte). ¡Te esperamos! Si no puedes venir, avísanos."
 */
export function mensajeDeRecordatorio({
  cita,
  nombreNegocio,
  zona,
  ahora,
  sede = null,
  palabras = PALABRAS_NEUTRAS,
}: ParaElRecordatorio): string {
  const nombre = cita.customer ? primerNombre(cita.customer.name) : ""
  const saludo = nombre ? `Hola ${nombre},` : "Hola,"
  const desde = nombreNegocio.trim() ? ` de ${nombreNegocio.trim()}` : ""
  const servicios = cita.title.trim() ? ` (${cita.title.trim()})` : ""
  const donde = sede?.trim() ? ` Dónde: ${sede.trim()}.` : ""
  const dia = cuando(new Date(cita.startTime), ahora, zona)
  const hora = horaEn(cita.startTime, zona)
  return `${saludo} te escribimos${desde} para recordarte tu ${palabras.citaParaElCliente.singular} ${dia} a las ${hora}${servicios}.${donde} ¡Te esperamos! Si no puedes venir, avísanos.`
}

/**
 * El enlace que abre WhatsApp con el recordatorio escrito, o `null` si no
 * corresponde ofrecerlo: la cita no se puede recordar, no tiene cliente o su
 * teléfono no tiene la forma internacional (+56…).
 */
export function enlaceDeRecordatorio(datos: ParaElRecordatorio): string | null {
  if (!datos.cita.customer || !sePuedeRecordar(datos.cita, datos.ahora)) return null
  return enlaceDeWhatsapp(datos.cita.customer.phone, mensajeDeRecordatorio(datos))
}
