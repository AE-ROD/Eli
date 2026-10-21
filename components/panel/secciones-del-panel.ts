import { MODULOS, type ModuloId } from "@/lib/modulos"

/**
 * Las secciones del panel: el inicio, los cinco módulos y las que no son un
 * módulo. Las leen tres piezas que no se ven entre sí: la barra lateral (que
 * las lista), la barra superior (que pone el antetítulo de cada página) y el
 * contenido (que pone el halo del foco). Así el nombre y el color de cada una
 * salen de un solo lugar, y los de los módulos, de `lib/modulos.ts`.
 *
 * Las secciones de un módulo llevan su pastel; las demás (inicio,
 * configuración y ayuda) van en neutro.
 *
 * Chats no está: se escondió hasta que exista un canal real (WhatsApp), porque
 * hoy los mensajes no le llegan al cliente. `/dashboard/chats` redirige al
 * inicio; la pantalla y la API siguen en el repo.
 */

export type IdDeSeccion = "inicio" | ModuloId | "configuracion" | "ayuda"

export interface SeccionDelPanel {
  id: IdDeSeccion
  nombre: string
  ruta: string
  /** El módulo de la sección, si es uno: de ahí salen su color y su ícono. Sin módulo, neutra. */
  modulo?: ModuloId
}

export const SECCION_DE_INICIO: SeccionDelPanel = { id: "inicio", nombre: "Inicio", ruta: "/dashboard" }

/** Los módulos, en el orden de `lib/modulos.ts`: el del día de trabajo, de la cita al equipo. */
export const SECCIONES_DE_MODULOS: readonly SeccionDelPanel[] = MODULOS.map((modulo) => ({
  id: modulo.id,
  nombre: modulo.nombre,
  ruta: modulo.ruta,
  modulo: modulo.id,
}))

export const SECCION_DE_CONFIGURACION: SeccionDelPanel = {
  id: "configuracion",
  nombre: "Configuración",
  ruta: "/dashboard/configuracion",
}

/** Lleva a una página que todavía no existe: queda en la barra hasta que el dueño decida. */
export const SECCION_DE_AYUDA: SeccionDelPanel = { id: "ayuda", nombre: "Ayuda", ruta: "/dashboard/ayuda" }

/** Todas, en el orden de la barra lateral. */
export const SECCIONES_DEL_PANEL: readonly SeccionDelPanel[] = [
  SECCION_DE_INICIO,
  ...SECCIONES_DE_MODULOS,
  SECCION_DE_CONFIGURACION,
  SECCION_DE_AYUDA,
]

/**
 * La sección de una ruta del panel: la suya o la de una página que cuelga de
 * ella (`/dashboard/clientes/123` es de Clientes). El inicio es sólo
 * `/dashboard`: todas las demás cuelgan de esa ruta. Una ruta que no es de
 * ninguna (`/dashboard/agendas`, otra parte de la app) no tiene sección.
 */
export function seccionDeLaRuta(ruta: string): SeccionDelPanel | null {
  const sinBarraFinal = ruta.length > 1 && ruta.endsWith("/") ? ruta.slice(0, -1) : ruta
  if (sinBarraFinal === SECCION_DE_INICIO.ruta) return SECCION_DE_INICIO
  return (
    SECCIONES_DEL_PANEL.find(
      (seccion) =>
        seccion !== SECCION_DE_INICIO &&
        (sinBarraFinal === seccion.ruta || sinBarraFinal.startsWith(`${seccion.ruta}/`))
    ) ?? null
  )
}
