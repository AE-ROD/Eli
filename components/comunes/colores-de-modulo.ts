import type { ColorDeModulo, ModuloId } from "@/lib/modulos"

/**
 * Las clases de cada pastel, escritas enteras. Tailwind sólo genera las
 * clases que encuentra literales en el código: un `bg-${color}-suave` armado
 * al vuelo no aparecería en el CSS.
 */

/** El pastel suave: fondos, insignias y el ícono en reposo. */
export const FONDO_SUAVE: Record<ColorDeModulo, string> = {
  azul: "bg-azul-suave",
  naranja: "bg-naranja-suave",
  lila: "bg-lila-suave",
  lima: "bg-lima-suave",
  turquesa: "bg-turquesa-suave",
}

/** El pastel fuerte: el ícono del módulo activo. */
export const FONDO_FUERTE: Record<ColorDeModulo, string> = {
  azul: "bg-azul",
  naranja: "bg-naranja",
  lila: "bg-lila",
  lima: "bg-lima",
  turquesa: "bg-turquesa",
}

/**
 * El halo del foco de cada módulo (`halo-*`, en `app/globals.css`): cambia el
 * halo de `anillo-foco` por el pastel suave del módulo, en el elemento y en
 * todo lo que tiene adentro. Va por módulo y no por color porque así se
 * llaman las utilidades.
 */
export const HALO_DE_MODULO: Record<ModuloId, string> = {
  agenda: "halo-agenda",
  tablero: "halo-tablero",
  clientes: "halo-clientes",
  reportes: "halo-reportes",
  equipo: "halo-equipo",
}
