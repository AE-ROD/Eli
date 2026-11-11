/**
 * Lo puro de "¿Salir sin guardar?" en la ficha clínica: qué clic en un
 * enlace se lleva a otra página (y hay que preguntar antes) y cómo se nombra
 * lo que se perdería. Sin pantalla, para probarlo solo.
 */

/** Lo que importa de un clic: el botón, las teclas y el enlace que se tocó (si se tocó uno). */
export interface ClicEnLaPagina {
  defaultPrevented: boolean
  button: number
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
  target: EventTarget | null
}

interface EnlaceTocado {
  href: string
  target: string
  hasAttribute: (nombre: string) => boolean
}

/** El enlace más cercano a lo que se tocó, si hay uno con `href`. */
function enlaceDe(objetivo: EventTarget | null): EnlaceTocado | null {
  const elemento = objetivo as { closest?: (selector: string) => unknown } | null
  const enlace = typeof elemento?.closest === "function" ? elemento.closest("a[href]") : null
  return (enlace as EnlaceTocado | null) ?? null
}

/**
 * A qué ruta de este sitio llevaría el clic, si saca de la página actual
 * dentro de la misma pestaña; si no, `null` y el clic sigue como siempre:
 * otro botón o una tecla (abrir en otra pestaña), `target="_blank"`, una
 * descarga, otro sitio (`mailto:`, WhatsApp: no se sale de la ficha, o lo
 * cubre el aviso del navegador) o la misma página (un ancla).
 */
export function destinoInterno(clic: ClicEnLaPagina, ubicacion: { href: string; origin: string; pathname: string; search: string }): string | null {
  if (clic.defaultPrevented || clic.button !== 0 || clic.metaKey || clic.ctrlKey || clic.shiftKey || clic.altKey) return null
  const enlace = enlaceDe(clic.target)
  if (!enlace) return null
  if (enlace.target && enlace.target !== "_self") return null
  if (enlace.hasAttribute("download")) return null
  let url: URL
  try {
    url = new URL(enlace.href, ubicacion.href)
  } catch {
    return null
  }
  if (url.origin !== ubicacion.origin) return null
  if (url.pathname === ubicacion.pathname && url.search === ubicacion.search) return null
  return `${url.pathname}${url.search}${url.hash}`
}

/** "el odontograma", "el odontograma y los antecedentes", "a, b y c". */
export function listaDePendientes(partes: string[]): string {
  if (partes.length <= 1) return partes[0] ?? "la ficha"
  return `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`
}
