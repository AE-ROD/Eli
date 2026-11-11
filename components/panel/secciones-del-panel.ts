import { MODULOS, type ModuloId } from "@/lib/modulos"
import { esRubroDental } from "@/lib/rubros"
import { conMayuscula, vocabularioDe } from "@/lib/vocabulario"

/**
 * Las secciones del panel: el inicio, los cinco módulos, las de la plata del
 * equipo y las que no son un módulo. Las leen tres piezas que no se ven entre sí: la barra lateral (que
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

export type IdDeSeccion =
  | "inicio"
  | ModuloId
  | "mi-plata"
  | "caja"
  | "liquidaciones"
  | "comisiones"
  | "configuracion"
  | "ayuda"

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

/**
 * La plata del equipo (etapa 2). No son módulos de `lib/modulos.ts` (ése lo
 * lee la landing): van en neutro. Cada una se muestra según un permiso de
 * `lib/permisos.ts`, resuelto en el servidor (`seccionesDeLaPlata`).
 */
export const SECCION_MI_PLATA: SeccionDelPanel = { id: "mi-plata", nombre: "Mi plata", ruta: "/dashboard/mi-plata" }
export const SECCION_DE_CAJA: SeccionDelPanel = { id: "caja", nombre: "Caja", ruta: "/dashboard/caja" }
export const SECCION_DE_LIQUIDACIONES: SeccionDelPanel = {
  id: "liquidaciones",
  nombre: "Liquidaciones",
  ruta: "/dashboard/liquidaciones",
}
export const SECCION_DE_COMISIONES: SeccionDelPanel = { id: "comisiones", nombre: "Comisiones", ruta: "/dashboard/comisiones" }

/** En el orden de la barra: lo propio primero, después la caja del día, y lo de la dueña al final. */
export const SECCIONES_DE_LA_PLATA: readonly SeccionDelPanel[] = [
  SECCION_MI_PLATA,
  SECCION_DE_CAJA,
  SECCION_DE_LIQUIDACIONES,
  SECCION_DE_COMISIONES,
]

/**
 * Qué secciones de la plata ve quien está en sesión. Lo calcula el layout del
 * panel en el servidor con `lib/permisos.ts` (`veMiPlata`,
 * `puedeVerCierresDeCaja`, `puedeVerLiquidacionesDelEquipo`,
 * `puedeEditarComisiones`) y se lo pasa a la barra lateral.
 */
export interface AccesoALaPlata {
  miPlata: boolean
  caja: boolean
  liquidaciones: boolean
  comisiones: boolean
}

/** Sin acceso, ninguna: falla cerrado si falta el dato. */
export const SIN_ACCESO_A_LA_PLATA: AccesoALaPlata = { miPlata: false, caja: false, liquidaciones: false, comisiones: false }

/** Qué campo de `AccesoALaPlata` abre cada sección. Una sección sin campo acá no se muestra. */
const PERMISO_DE_SECCION: Partial<Record<IdDeSeccion, keyof AccesoALaPlata>> = {
  "mi-plata": "miPlata",
  caja: "caja",
  liquidaciones: "liquidaciones",
  comisiones: "comisiones",
}

/** Las secciones de la plata que corresponden a `acceso`, en su orden. */
export function seccionesDeLaPlata(acceso: AccesoALaPlata | null | undefined): SeccionDelPanel[] {
  if (!acceso) return []
  return SECCIONES_DE_LA_PLATA.filter((seccion) => {
    const permiso = PERMISO_DE_SECCION[seccion.id]
    return !!permiso && acceso[permiso] === true
  })
}

export const SECCION_DE_CONFIGURACION: SeccionDelPanel = {
  id: "configuracion",
  nombre: "Configuración",
  ruta: "/dashboard/configuracion",
}

/** El centro de ayuda: preguntas frecuentes y el formulario de soporte (`components/soporte/`). */
export const SECCION_DE_AYUDA: SeccionDelPanel = { id: "ayuda", nombre: "Ayuda", ruta: "/dashboard/ayuda" }

/** Todas, en el orden de la barra lateral. */
export const SECCIONES_DEL_PANEL: readonly SeccionDelPanel[] = [
  SECCION_DE_INICIO,
  ...SECCIONES_DE_MODULOS,
  ...SECCIONES_DE_LA_PLATA,
  SECCION_DE_CONFIGURACION,
  SECCION_DE_AYUDA,
]

/**
 * La sección con el nombre que le da el rubro (`lib/vocabulario.ts`): en una
 * clínica dental, Clientes se llama "Pacientes" y Tablero, "Sala de espera".
 * El id, la ruta y el módulo (el color y el ícono) no cambian. En cualquier
 * otro rubro, uno desconocido o ninguno, devuelve la misma sección, sin
 * tocarla: el salón, la barbería y el spa de uñas se ven como siempre.
 *
 * Es para el panel (la barra lateral y el antetítulo de cada página). Los
 * nombres fijos de `SECCIONES_DEL_PANEL` y de `lib/modulos.ts` no cambian:
 * la landing los lee y habla de todos los rubros.
 */
export function seccionConNombreDelRubro(seccion: SeccionDelPanel, rubro: string | null | undefined): SeccionDelPanel {
  if (!esRubroDental(rubro)) return seccion
  const vocabulario = vocabularioDe(rubro)
  if (seccion.id === "clientes") return { ...seccion, nombre: conMayuscula(vocabulario.clientes) }
  if (seccion.id === "tablero") return { ...seccion, nombre: conMayuscula(vocabulario.tablero) }
  return seccion
}

/** Las secciones, en el mismo orden, con el nombre que les da el rubro (`seccionConNombreDelRubro`). */
export function seccionesConNombreDelRubro(
  secciones: readonly SeccionDelPanel[],
  rubro: string | null | undefined
): SeccionDelPanel[] {
  return secciones.map((seccion) => seccionConNombreDelRubro(seccion, rubro))
}

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

/**
 * La sección que la barra lateral marca en `ruta`, entre las que muestra
 * (`enLaBarra`). Casi siempre es la de la ruta. La excepción es el
 * comprobante de una liquidación (`/dashboard/liquidaciones/<id>`): cuelga de
 * Liquidaciones, pero el profesional no tiene esa sección en la barra y llega
 * desde Mi plata, así que se marca Mi plata (#127). Si no, no se marcaba nada.
 */
export function seccionMarcadaEnLaBarra(ruta: string, enLaBarra: readonly SeccionDelPanel[]): SeccionDelPanel | null {
  const seccion = seccionDeLaRuta(ruta)
  const visible = (id: IdDeSeccion) => enLaBarra.some((candidata) => candidata.id === id)
  if (seccion?.id === SECCION_DE_LIQUIDACIONES.id && !visible(seccion.id) && visible(SECCION_MI_PLATA.id)) {
    return SECCION_MI_PLATA
  }
  return seccion
}
