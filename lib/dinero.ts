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

/** Sólo cifras, puntos y comas, con al menos una cifra. El signo menos va aparte. */
const FORMA_DE_MONTO = /^[\d.,]*\d[\d.,]*$/

/** Hasta dos cifras después del separador decimal, o ninguna mientras se escribe. */
const DECIMALES = /^\d{0,2}$/

/** Una parte entera con miles separados por `separador`: `1.234.567`. */
function parteEnteraValida(entera: string, separador: "." | ","): boolean {
  if (/^\d*$/.test(entera)) return true
  const grupos = separador === "." ? /^[1-9]\d{0,2}(?:\.\d{3})+$/ : /^[1-9]\d{0,2}(?:,\d{3})+$/
  return grupos.test(entera)
}

/**
 * Lo que alguien escribió en un campo de monto, como número; `null` si está
 * vacío o no se puede leer sin adivinar.
 *
 * Los campos de monto son de texto (`inputMode="decimal"`), no numéricos:
 * Chromium descartaba la coma en un `type="number"` y "8000,50" llegaba como
 * 800050. Leerlo es cosa de esta función, con una regla que nunca lee un monto
 * distinto del que se quiso escribir:
 *
 * - El separador decimal es el último signo (coma o punto) cuando lo siguen
 *   una o dos cifras, o ninguna mientras se escribe: ningún monto tiene más de
 *   dos decimales. "8000,50", "8000.50", "8.000,50" y "8,000.50" son 8000,5.
 * - El otro signo separa los miles, en grupos de tres cifras: "1.234.567,89".
 * - Sin separador decimal, el punto separa miles, como en español y como los
 *   escribe `formatearMonto` ("$25.000"): "8.000" es ocho mil, no ocho.
 * - Una coma seguida de tres cifras ("8,000") no se lee: en español sería un
 *   decimal de tres cifras, y donde la coma separa miles serían ocho mil.
 *   Antes que cobrar mil veces más o menos, se pide escribirlo de otra forma.
 * - El signo menos se lee (un negativo lo rechazan las reglas, no esta
 *   función); espacios en el medio, letras o notación científica, no.
 *
 * No decide si el monto sirve: eso lo dicen `esPrecioValido` y
 * `esMontoDePagoValido` (`lib/atenciones.ts`), las mismas reglas que aplica
 * el servidor.
 */
export function leerMonto(texto: string): number | null {
  const limpio = texto.trim()
  const negativo = limpio.startsWith("-")
  const cuerpo = negativo ? limpio.slice(1) : limpio
  if (!FORMA_DE_MONTO.test(cuerpo)) return null

  const ultimoSigno = Math.max(cuerpo.lastIndexOf("."), cuerpo.lastIndexOf(","))
  const esDecimal = ultimoSigno !== -1 && DECIMALES.test(cuerpo.slice(ultimoSigno + 1))

  const entera = esDecimal ? cuerpo.slice(0, ultimoSigno) : cuerpo
  const decimales = esDecimal ? cuerpo.slice(ultimoSigno + 1) : ""
  // Con decimales, los miles van con el otro signo; sin decimales, sólo con punto.
  const separadorDeMiles = esDecimal && cuerpo[ultimoSigno] === "." ? "," : "."
  if (!parteEnteraValida(entera, separadorDeMiles)) return null

  const numero = Number(`${entera.split(separadorDeMiles).join("") || "0"}.${decimales || "0"}`)
  if (!Number.isFinite(numero)) return null
  return negativo ? -numero : numero
}

/**
 * Un monto como se le escribe a un campo de monto, para que `leerMonto` lo
 * lea de vuelta igual: con coma decimal y sin separador de miles, como lo
 * escribiría alguien a mano (`8000`, `8000,50`).
 *
 * No redondea: un precio del catálogo con tres decimales se ve con sus tres
 * ("10,005"), `leerMonto` no lo lee y el campo pide corregirlo, en vez de
 * cobrar un precio que nadie escribió. Con `String` y un punto, ese mismo
 * "10.005" se habría leído como diez mil cinco.
 */
export function montoParaEscribir(monto: number): string {
  if (Number.isInteger(monto)) return String(monto)
  const [entera, decimales = ""] = String(monto).split(".")
  return `${entera},${decimales.length === 1 ? `${decimales}0` : decimales}`
}
