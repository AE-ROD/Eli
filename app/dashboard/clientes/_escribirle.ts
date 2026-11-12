/**
 * "Escribirle" a un cliente que se está yendo (#76): el mensaje sugerido y
 * los enlaces que lo abren ya escrito en WhatsApp (`wa.me`) o en el correo
 * (`mailto:`). Lo manda la persona del negocio desde su teléfono o su correo:
 * no hay API ni costo. Puro, para probarlo sin pantalla.
 */

import { vocabularioDe, type PalabrasDelRubro } from "@/lib/vocabulario"

/** Las palabras de un rubro sin palabras propias: con ellas el mensaje es el de siempre. */
const PALABRAS_NEUTRAS = vocabularioDe(null).palabras

interface ParaElMensaje {
  nombre: string
  nombreNegocio: string
  ultimoServicio: string | null
  /**
   * Las palabras del rubro (`vocabularioDe(rubro).palabras`). Un rubro con
   * palabras propias propone "tu próxima visita: limpieza dental"; sin ellas,
   * o con las neutras, queda el texto de siempre.
   */
  palabras?: Pick<PalabrasDelRubro, "negocio">
}

/** El primer nombre, para un saludo que no suene a planilla. */
function primerNombre(nombre: string): string {
  return nombre.trim().split(/\s+/)[0] ?? ""
}

/**
 * El mensaje sugerido. La persona lo puede cambiar antes de mandarlo.
 *
 * El nombre del servicio lo escribe el negocio y no tiene género conocido
 * ("Corte", "Limpieza dental"): "tu próximo limpieza dental" salía mal. En un
 * rubro con palabras propias la propuesta no concuerda con el nombre ("tu
 * próxima visita: limpieza dental"); en uno sin ellas se conserva el texto de
 * siempre.
 */
export function mensajeSugerido({ nombre, nombreNegocio, ultimoServicio, palabras = PALABRAS_NEUTRAS }: ParaElMensaje): string {
  const saludo = primerNombre(nombre) ? `¡Hola, ${primerNombre(nombre)}!` : "¡Hola!"
  const desde = nombreNegocio.trim() ? ` Te escribimos de ${nombreNegocio.trim()}.` : ""
  const conPalabrasPropias = palabras.negocio.singular !== PALABRAS_NEUTRAS.negocio.singular
  const delServicio = ultimoServicio?.toLowerCase()
  const propuesta = delServicio
    ? conPalabrasPropias
      ? `¿Te reservamos una hora para tu próxima visita: ${delServicio}?`
      : `¿Te reservamos una hora para tu próximo ${delServicio}?`
    : "¿Te reservamos una hora?"
  return `${saludo}${desde} Hace un tiempo que no te vemos y queríamos saber cómo estás. ${propuesta}`
}

/**
 * El saludo con que se abre un mensaje desde la ficha del cliente ("Enviar
 * mensaje"): sólo el saludo y de dónde se escribe; lo demás lo escribe quien
 * lo manda.
 */
export function saludoSugerido({ nombre, nombreNegocio }: Omit<ParaElMensaje, "ultimoServicio">): string {
  const saludo = primerNombre(nombre) ? `¡Hola, ${primerNombre(nombre)}!` : "¡Hola!"
  return nombreNegocio.trim() ? `${saludo} Te escribimos de ${nombreNegocio.trim()}.` : saludo
}

/** Asunto del correo que se abre desde la ficha: el nombre del negocio. */
export function asuntoDelSaludo(nombreNegocio: string): string {
  return nombreNegocio.trim() || "Hola"
}

/** Asunto del correo. */
export function asuntoSugerido(nombreNegocio: string): string {
  return nombreNegocio.trim() ? `Te extrañamos en ${nombreNegocio.trim()}` : "Te extrañamos"
}

/**
 * `https://wa.me/<número>?text=…`. `wa.me` pide el número internacional sólo
 * con dígitos (sin "+", espacios ni guiones). El teléfono se guarda en E.164;
 * si no tiene la forma esperada, no hay enlace (mejor nada que un chat con
 * otro número).
 */
export function enlaceDeWhatsapp(telefono: string | null, mensaje: string): string | null {
  if (!telefono || !/^\+[1-9]\d{7,14}$/.test(telefono)) return null
  return `https://wa.me/${telefono.slice(1)}?text=${encodeURIComponent(mensaje)}`
}

/** `mailto:` con asunto y mensaje. Sin un correo con forma de correo, no hay enlace. */
export function enlaceDeCorreo(email: string | null, asunto: string, mensaje: string): string | null {
  if (!email || !/^[^\s@?&#]+@[^\s@?&#]+$/.test(email)) return null
  return `mailto:${email}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(mensaje)}`
}

/** "3 días", "1 día". */
export function dias(n: number): string {
  return n === 1 ? "1 día" : `${n} días`
}

/** "2026-11-11" → "11 de noviembre". Sin zona: es una fecha calendario. */
export function fechaParaLeer(fecha: string): string {
  const [año, mes, dia] = fecha.split("-").map(Number)
  return new Date(Date.UTC(año, mes - 1, dia)).toLocaleDateString("es-CL", { day: "numeric", month: "long", timeZone: "UTC" })
}
