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
 * - `llegada`: en la landing, lo que cambia de lugar solo y frena largo al
 *   final (las fotos de Áreas al rotar), con `CURVA.llegada`
 *   (`duration-900 ease-llegada` en CSS).
 */
export const DURACION = { hover: 0.15, sombra: 0.2, pildora: 0.3, expandir: 0.5, fundido: 0.6, llegada: 0.9 } as const

/**
 * `suave` para lo que responde a la mano; `fundido` para lo que entra solo.
 * De la landing: `llegada` (`ease-llegada`) para lo que entra o cambia de
 * lugar solo, y `onda` (`ease-onda`), simétrica, para las líneas del enredo
 * de la portada, que van y vuelven sin fin.
 */
export const CURVA = {
  suave: [0.4, 0, 0.2, 1],
  fundido: [0.5, 0, 0.5, 1],
  llegada: [0.22, 1, 0.36, 1],
  onda: [0.45, 0, 0.55, 1],
} as const
