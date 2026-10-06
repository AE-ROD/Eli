import { aCentavos } from "@/lib/atenciones"

/**
 * Cómo se escribe y cómo se lee un monto en pantalla. Hasta ahora cada vista
 * armaba el suyo con `$` + `toLocaleString("es-ES")` (configuración de
 * servicios, reservar, agenda, clientes, inicio): éste es ese mismo formato en
 * un solo lugar, para que el tablero, el cobro y los reportes no inventen
 * cada uno el propio.
 *
 * No hay moneda configurada en ningún lado: el `$` es el que ya usa toda la
 * app, y no se elige una moneda que el negocio no eligió.
 */

/** El mismo idioma de formato que el resto de la app. */
const IDIOMA = "es-ES"

/**
 * `$8000`, `$25.000`, `$10,50`, `-$500`.
 *
 * - Sin decimales si el monto es entero, como se veía siempre. Con dos si
 *   tiene centavos: `$10,5` se lee como un error de tipeo.
 * - `es-ES` no separa los miles en números de cuatro cifras (`8000`, pero
 *   `25.000`). Es lo que la app ya mostraba en cada precio; cambiarlo sólo
 *   acá dejaría al tablero distinto de la agenda.
 * - Los centavos se miran en enteros (`aCentavos`), así un `0.1 + 0.2` se
 *   escribe `$0,30` y no arrastra el error de la suma.
 */
export function formatearMonto(monto: number): string {
  const conCentavos = aCentavos(monto) % 100 !== 0
  const texto = Math.abs(monto).toLocaleString(IDIOMA, {
    minimumFractionDigits: conCentavos ? 2 : 0,
    maximumFractionDigits: 2,
  })
  return `${monto < 0 ? "-" : ""}$${texto}`
}

/**
 * Lo que alguien escribió en un campo de monto, como número; `null` si está
 * vacío o no es un número. Acepta la coma decimal porque es como se escribe en
 * español, aunque el campo numérico del navegador ya la entregue como punto.
 *
 * No decide si el monto sirve: eso lo dicen `esPrecioValido` y
 * `esMontoDePagoValido` (`lib/atenciones.ts`), las mismas reglas que aplica
 * el servidor.
 */
export function leerMonto(texto: string): number | null {
  const limpio = texto.trim().replace(",", ".")
  if (limpio === "") return null
  const numero = Number(limpio)
  return Number.isFinite(numero) ? numero : null
}
