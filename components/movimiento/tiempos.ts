/**
 * Tiempos y curvas del sistema para framer-motion, que los pide en segundos y
 * con la curva como arreglo. Son los mismos que las clases de Tailwind de
 * `app/globals.css` (`duration-150`, `ease-suave`, `ease-fundido`…): si cambia
 * uno, cambia el otro, o la misma interacción se moverá distinto según la
 * anime CSS o JavaScript.
 *
 * - `hover`: colores y fondos al pasar el cursor.
 * - `sombra`: una tarjeta que se eleva.
 * - `pildora`: indicadores y píldoras que se deslizan al elemento activo.
 * - `expandir`: tarjetas que crecen en ancho (con `easeInOut`, no con `CURVA`).
 * - `fundido`: contenido que aparece o se cruza con otro.
 */
export const DURACION = { hover: 0.15, sombra: 0.2, pildora: 0.3, expandir: 0.5, fundido: 0.6 } as const

/** `suave` para lo que responde a la mano; `fundido` para lo que entra solo. */
export const CURVA = { suave: [0.4, 0, 0.2, 1], fundido: [0.5, 0, 0.5, 1] } as const
