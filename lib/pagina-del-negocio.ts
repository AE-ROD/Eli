/**
 * Las reglas de la mini página pública de cada negocio (`/reservar/[slug]`):
 * la paleta cerrada de colores, los enlaces de contacto (WhatsApp,
 * Instagram, mapas), quién del equipo aparece, cómo se agrupan los servicios
 * y cómo se lee el horario. Sólo lógica, sin base ni pantalla: la usan la
 * página, la imagen para compartir (Open Graph), el editor de Configuración
 * y su endpoint.
 */

import { MEDIOS_DE_PAGO, type MedioDePagoId } from "@/lib/medios-de-pago"
import type { FranjaDelDia } from "@/lib/horario-de-atencion"
import { palabrasDeLaReserva } from "@/lib/palabras-de-la-reserva"
import { resumenDeHorarioPorSede, type FilaDeHorarioDeSede, type SedeDelNegocio } from "@/lib/sedes"
import { agruparPorCategoria, CATEGORIA_SIN_NOMBRE } from "@/lib/servicios-por-categoria"
import { aE164Chile } from "@/lib/telefono"

// ─── Paleta del local ────────────────────────────────────────────────────────

/**
 * Los colores que un negocio puede elegir para su página. Cerrada a
 * propósito: la marca de Eli no cambia (el dueño lo decidió), así que la
 * paleta sale de los mismos tonos del sistema de diseño (`app/globals.css`,
 * `docs/diseno/README.md`): los cinco pasteles de los módulos, la arena de
 * los bordes y el navy. Un color libre podría dejar el texto ilegible.
 *
 * `fondo` y `texto` son los valores de los tokens, para la imagen de Open
 * Graph, que no tiene Tailwind; la página usa las clases. El test comprueba
 * que coincidan con `app/globals.css` y que cada par pase AA (4,5:1).
 *
 * La clave es lo que se guarda en `Business.color`: cambiarla dejaría a los
 * negocios que la eligieron con el color por defecto.
 */
export const PALETA_DEL_LOCAL = [
  { clave: "cielo", nombre: "Cielo", fondo: "#84c1ff", texto: "#071a31" },
  { clave: "durazno", nombre: "Durazno", fondo: "#f5a85a", texto: "#071a31" },
  { clave: "lavanda", nombre: "Lavanda", fondo: "#c9b8ff", texto: "#071a31" },
  { clave: "pistacho", nombre: "Pistacho", fondo: "#cee67e", texto: "#071a31" },
  { clave: "menta", nombre: "Menta", fondo: "#8fe0d6", texto: "#071a31" },
  { clave: "arena", nombre: "Arena", fondo: "#e7e3da", texto: "#071a31" },
  { clave: "noche", nombre: "Noche", fondo: "#071a31", texto: "#fcfbf8" },
] as const

export type ColorDelLocal = (typeof PALETA_DEL_LOCAL)[number]
export type ClaveDeColor = ColorDelLocal["clave"]

export const CLAVES_DE_COLOR = PALETA_DEL_LOCAL.map((color) => color.clave) as [ClaveDeColor, ...ClaveDeColor[]]

/** El de un negocio que nunca eligió, o que tiene guardada una clave que ya no existe. */
export const COLOR_POR_DEFECTO: ClaveDeColor = "cielo"

/** Con `some` y no indexando un objeto: "constructor" no es un color. */
export function esColorDelLocal(clave: unknown): clave is ClaveDeColor {
  return typeof clave === "string" && PALETA_DEL_LOCAL.some((color) => color.clave === clave)
}

/** El color de un negocio. Lo desconocido (o nada) cae en el de por defecto, nunca rompe. */
export function colorDelNegocio(guardado: string | null | undefined): ColorDelLocal {
  const clave = esColorDelLocal(guardado) ? guardado : COLOR_POR_DEFECTO
  return PALETA_DEL_LOCAL.find((color) => color.clave === clave)!
}

/** Luminancia relativa de un "#rrggbb", como la define WCAG 2. */
function luminancia(hex: string): number {
  const canal = (desde: number) => {
    const valor = parseInt(hex.slice(desde, desde + 2), 16) / 255
    return valor <= 0.03928 ? valor / 12.92 : ((valor + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * canal(1) + 0.7152 * canal(3) + 0.0722 * canal(5)
}

/** La razón de contraste WCAG entre dos colores "#rrggbb": de 1 a 21. */
export function contraste(a: string, b: string): number {
  const [clara, oscura] = [luminancia(a), luminancia(b)].sort((x, y) => y - x)
  return (clara + 0.05) / (oscura + 0.05)
}

// ─── Contacto ────────────────────────────────────────────────────────────────

/** Un usuario de Instagram: letras, números, punto y guion bajo, hasta 30, sin punto en las puntas ni dos seguidos. */
const USUARIO_DE_INSTAGRAM = /^(?!\.)(?!.*\.\.)(?!.*\.$)[a-z0-9._]{1,30}$/

/** Lo que va antes del usuario cuando lo pegan como enlace. */
const ENLACE_DE_INSTAGRAM = /^(?:https?:\/\/)?(?:www\.|m\.)?(?:instagram\.com|instagr\.am)\/([^/?#]+)\/?(?:[?#].*)?$/i

/**
 * El usuario de Instagram, sin `@` y en minúsculas, o `null` si no se puede
 * leer. Acepta "@salon.ana", "salon.ana" y el enlace del perfil
 * ("https://www.instagram.com/salon.ana/?igsh=..."). Rechaza cualquier otra
 * dirección y caracteres que Instagram no permite: lo guardado se arma como
 * enlace, y no puede terminar apuntando a otro sitio.
 */
export function normalizarInstagram(texto: string | null | undefined): string | null {
  const limpio = (texto ?? "").trim()
  if (!limpio) return null
  const delEnlace = ENLACE_DE_INSTAGRAM.exec(limpio)?.[1]
  const usuario = (delEnlace ?? limpio).replace(/^@/, "").toLowerCase()
  return USUARIO_DE_INSTAGRAM.test(usuario) ? usuario : null
}

export function enlaceDeInstagram(guardado: string | null | undefined): string | null {
  const usuario = normalizarInstagram(guardado)
  return usuario ? `https://www.instagram.com/${usuario}/` : null
}

/** El chat de WhatsApp del negocio: `wa.me` con el número en E.164 sin el `+`. */
export function enlaceDeWhatsapp(guardado: string | null | undefined): string | null {
  const e164 = aE164Chile(guardado)
  return e164 ? `https://wa.me/${e164.slice(1)}` : null
}

/**
 * "Cómo llegar" en Google Maps y en Waze. Sin dirección no hay enlaces: la
 * comuna sola lleva al centro de la comuna, no al local.
 */
export function enlacesDeMapa(
  direccion: string | null | undefined,
  comuna: string | null | undefined
): { googleMaps: string; waze: string } | null {
  const calle = (direccion ?? "").trim()
  if (!calle) return null
  const consulta = encodeURIComponent([calle, (comuna ?? "").trim()].filter(Boolean).join(", "))
  return {
    googleMaps: `https://www.google.com/maps/search/?api=1&query=${consulta}`,
    waze: `https://waze.com/ul?q=${consulta}`,
  }
}

// ─── Sedes (plan Independiente) ──────────────────────────────────────────────

/**
 * Una sede activa tal como la ve cualquiera en la mini página: su nombre, su
 * dirección con "Cómo llegar" a ESA dirección, y los días y horas en que se
 * atiende. Nada interno: ni el orden, ni ids de otras tablas.
 */
export interface SedeDeLaPagina {
  id: string
  nombre: string
  direccion: string
  comuna: string
  /** E.164 (+56...) o null. */
  telefono: string | null
  mapas: { googleMaps: string; waze: string } | null
  /** Los días de la semana (0 domingo a 6 sábado) en que atiende, de lunes a domingo. Vacío: aún sin horario. */
  dias: number[]
  /** Su horario por días agrupados, ya escrito: `Lun, Mié: 09:00–13:00`. Vacío: aún sin horario. */
  horario: string[]
}

/**
 * Las sedes ACTIVAS para la página, en el orden de la lista, cada una con su
 * horario resumido (`resumenDeHorarioPorSede`) y los enlaces de mapa de su
 * dirección. `filas` son las franjas activas del negocio con su `sedeId`: las
 * de otra sede o sin sede no cuentan para una sede. Las sedes inactivas no
 * salen.
 */
export function sedesParaLaPagina(
  sedes: readonly Pick<SedeDelNegocio, "id" | "nombre" | "direccion" | "comuna" | "telefono" | "orden" | "activo">[],
  filas: readonly FilaDeHorarioDeSede[]
): SedeDeLaPagina[] {
  return resumenDeHorarioPorSede(sedes, filas).map(({ sede, dias, grupos }) => ({
    id: sede.id,
    nombre: sede.nombre,
    direccion: sede.direccion,
    comuna: sede.comuna,
    telefono: sede.telefono,
    mapas: enlacesDeMapa(sede.direccion, sede.comuna),
    dias: dias.map((dia) => dia.dayOfWeek),
    horario: grupos.map((grupo) => grupo.texto),
  }))
}

// ─── Reseñas en Google (#77) ─────────────────────────────────────────────────

/** El largo máximo que se acepta para el enlace de reseñas. */
export const LARGO_MAXIMO_DE_ENLACE_DE_RESENAS = 500

/**
 * Dónde puede apuntar el enlace de reseñas: sólo a Google, por https. Por
 * dominio exacto (no "termina en"), y en google.com y search.google.com sólo
 * las rutas de Maps y de escribir una reseña. Este enlace va en un correo que
 * sale con el nombre del negocio y de Eli: una dirección libre lo convertiría
 * en un canal para mandar a cualquiera a cualquier sitio.
 */
const DESTINOS_DE_RESENAS: { host: string; ruta: (ruta: string) => boolean }[] = [
  { host: "g.page", ruta: (ruta) => ruta.length > 1 },
  { host: "maps.app.goo.gl", ruta: (ruta) => ruta.length > 1 },
  { host: "google.com", ruta: (ruta) => ruta === "/maps" || ruta.startsWith("/maps/") },
  { host: "www.google.com", ruta: (ruta) => ruta === "/maps" || ruta.startsWith("/maps/") },
  { host: "search.google.com", ruta: (ruta) => ruta === "/local/writereview" || ruta === "/local/writereview/" },
]

/**
 * El enlace de reseñas de Google normalizado, o `null` si no es uno. Acepta
 * https y los destinos de `DESTINOS_DE_RESENAS` (g.page,
 * maps.app.goo.gl, google.com/maps, search.google.com/local/writereview);
 * nada más: ni http, ni usuario o puerto en la dirección, ni espacios, ni
 * otro dominio de Google. La usan el endpoint al guardar y el cron al enviar
 * (un enlace guardado antes de una regla nueva no sale).
 */
export function normalizarEnlaceDeResenas(texto: string | null | undefined): string | null {
  const limpio = (texto ?? "").trim()
  if (!limpio || limpio.length > LARGO_MAXIMO_DE_ENLACE_DE_RESENAS || /\s/.test(limpio)) return null
  let url: URL
  try {
    url = new URL(limpio)
  } catch {
    return null
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null
  const destino = DESTINOS_DE_RESENAS.find((opcion) => opcion.host === url.hostname)
  if (!destino || !destino.ruta(url.pathname)) return null
  return url.toString()
}

/** Si lo guardado es un enlace de reseñas que se puede mandar. */
export function esEnlaceDeResenasValido(guardado: string | null | undefined): guardado is string {
  return normalizarEnlaceDeResenas(guardado) !== null
}

// ─── Imágenes ────────────────────────────────────────────────────────────────

/**
 * La URL de una foto (logo, portada, profesional) sólo si es del mismo sitio
 * ("/..."). Las fotos que sube el panel se guardan como `/fotos/negocios/...`
 * (`lib/almacenamiento-de-fotos.ts`) y las sirve nuestra propia ruta, así que
 * la CSP (`lib/csp.ts`) sigue dejando cargar sólo imágenes propias: una URL
 * externa se vería rota, y por eso no pasa.
 */
export function imagenPublica(url: string | null | undefined): string | null {
  const limpia = (url ?? "").trim()
  if (!limpia.startsWith("/") || limpia.startsWith("//") || limpia.startsWith("/\\")) return null
  return limpia
}

/** Los tratamientos que preceden a un nombre propio y no son parte de él, sin tilde ni punto. */
const TRATAMIENTOS = new Set(["dr", "dra", "doctor", "doctora", "sr", "sra", "srta", "don", "dona", "lic", "ing", "mg"])

/**
 * El nombre de pila de un profesional para hablarle al cliente, sin el
 * tratamiento: "Dra. Camila Rojas" → "Camila", no "Dra.". Si el nombre es sólo
 * un tratamiento (o está vacío), se devuelve tal cual.
 */
export function primerNombreDelProfesional(nombre: string): string {
  const palabras = nombre.trim().split(/\s+/).filter(Boolean)
  const sinTratamiento = palabras.findIndex(
    (palabra) => !TRATAMIENTOS.has(palabra.normalize("NFD").replace(/\p{M}/gu, "").replace(/\.$/, "").toLowerCase())
  )
  return palabras[sinTratamiento === -1 ? 0 : sinTratamiento] ?? nombre
}

/** Hasta dos iniciales, en mayúsculas: "Ana María Pérez" → "AM". */
export function iniciales(nombre: string): string {
  const letras = nombre
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((palabra) => Array.from(palabra)[0])
    .join("")
    .toLocaleUpperCase("es-CL")
  return letras || "?"
}

// ─── Equipo, servicios, medios y horario ─────────────────────────────────────

/**
 * Quién aparece en "Equipo": quien atiende. Los profesionales siempre; el
 * encargado no (PRODUCTO.md, sección 4: no cuenta como persona que atiende
 * hasta que exista el interruptor "también atiende"). El dueño no es miembro
 * del equipo y no tiene ficha propia que mostrar.
 */
export function apareceEnLaPagina(rol: string): boolean {
  return rol === "worker"
}

/** Lo que se muestra de los servicios sin categoría ("Otros"); vive junto a la regla de agrupar. */
export { CATEGORIA_SIN_NOMBRE }

/**
 * Los servicios agrupados por `Service.category`, en el orden en que aparece
 * cada categoría (el del catálogo). Los sin categoría van al final, en
 * "Otros". "Color" y "color " son la misma: se agrupa sin mayúsculas ni
 * espacios de más y se muestra como la escribió el primero. La regla es la de
 * `lib/servicios-por-categoria.ts`, la misma que usa el primer paso de la
 * reserva.
 */
export function serviciosPorCategoria<T extends { category: string | null }>(
  servicios: T[]
): { categoria: string; servicios: T[] }[] {
  return agruparPorCategoria(servicios).map(({ categoria, servicios: delGrupo }) => ({ categoria, servicios: delGrupo }))
}

/** Los medios que acepta el negocio, en el orden del catálogo, sin los que el catálogo no conoce. */
export function mediosParaMostrar(guardados: readonly string[]): { id: MedioDePagoId; nombre: string }[] {
  return MEDIOS_DE_PAGO.filter((medio) => guardados.includes(medio.id)).map(({ id, nombre }) => ({ id, nombre }))
}

const DIAS_DESDE_EL_LUNES = [
  { dayOfWeek: 1, nombre: "Lunes" },
  { dayOfWeek: 2, nombre: "Martes" },
  { dayOfWeek: 3, nombre: "Miércoles" },
  { dayOfWeek: 4, nombre: "Jueves" },
  { dayOfWeek: 5, nombre: "Viernes" },
  { dayOfWeek: 6, nombre: "Sábado" },
  { dayOfWeek: 0, nombre: "Domingo" },
]

/**
 * La semana de lunes a domingo, con las franjas de cada día escritas
 * ("10:00–14:00", "15:00–20:00"); un día sin franjas, vacío: la pantalla
 * dice "Cerrado". Una franja por renglón: en el teléfono, dos en una línea no
 * entran. Recibe el horario ya resuelto por `horarioSemanalDeAtencion`.
 */
export function horarioParaMostrar(franjas: FranjaDelDia[]): { dayOfWeek: number; dia: string; franjas: string[] }[] {
  return DIAS_DESDE_EL_LUNES.map(({ dayOfWeek, nombre }) => ({
    dayOfWeek,
    dia: nombre,
    franjas: franjas
      .filter((franja) => franja.dayOfWeek === dayOfWeek)
      .map((franja) => `${franja.startTime}–${franja.endTime}`),
  }))
}

/**
 * La descripción de la página al compartirla (buscadores, WhatsApp, redes), con
 * la comuna si la hay. `rubro` (`Business.type`) pone las palabras: "Reserva tu
 * hora en Salón Ana. Mira sus servicios, precios y horarios." en un salón y
 * "…Mira sus prestaciones, precios y horarios." en una clínica. Sin rubro, la de
 * siempre.
 */
export function descripcionParaCompartir(
  nombre: string,
  comuna: string | null | undefined,
  rubro?: string | null
): string {
  const { hora, servicio } = palabrasDeLaReserva(rubro)
  const lugar = (comuna ?? "").trim()
  const cierre = `Mira sus ${servicio.plural}, precios y horarios.`
  return lugar
    ? `Reserva tu ${hora.singular} en ${nombre}, en ${lugar}. ${cierre}`
    : `Reserva tu ${hora.singular} en ${nombre}. ${cierre}`
}
