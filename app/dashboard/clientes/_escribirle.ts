/**
 * "Escribirle" a un cliente que se está yendo (#76): el mensaje sugerido y
 * los enlaces que lo abren ya escrito en WhatsApp (`wa.me`) o en el correo
 * (`mailto:`). Lo manda la persona del negocio desde su teléfono o su correo:
 * no hay API ni costo. Puro, para probarlo sin pantalla.
 */

interface ParaElMensaje {
  nombre: string
  nombreNegocio: string
  ultimoServicio: string | null
}

/** El primer nombre, para un saludo que no suene a planilla. */
function primerNombre(nombre: string): string {
  return nombre.trim().split(/\s+/)[0] ?? ""
}

/** El mensaje sugerido. La persona lo puede cambiar antes de mandarlo. */
export function mensajeSugerido({ nombre, nombreNegocio, ultimoServicio }: ParaElMensaje): string {
  const saludo = primerNombre(nombre) ? `¡Hola, ${primerNombre(nombre)}!` : "¡Hola!"
  const desde = nombreNegocio.trim() ? ` Te escribimos de ${nombreNegocio.trim()}.` : ""
  const propuesta = ultimoServicio
    ? `¿Te reservamos una hora para tu próximo ${ultimoServicio.toLowerCase()}?`
    : "¿Te reservamos una hora?"
  return `${saludo}${desde} Hace un tiempo que no te vemos y queríamos saber cómo estás. ${propuesta}`
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
