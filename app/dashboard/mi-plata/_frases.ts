/**
 * Las frases de Mi plata con las palabras del rubro (`vocabularioDe(rubro)
 * .palabras`, `lib/vocabulario.ts`) y la concordancia de `lib/concordancia.ts`:
 * "1 prestación espera su porcentaje de comisión" en una clínica dental.
 *
 * Es lógica sin pantalla: la página pide las frases con
 * `frasesDeMiPlata(palabras)`. Un rubro desconocido o `null` recibe las
 * palabras neutras, y con ellas los textos de siempre, sin un cambio.
 *
 * Lo que NO cambia con el rubro: "Comisión" (en ningún rubro), "Adelantos y
 * vales", "propinas" y lo propio de las prótesis.
 */

import { cantidadDe, numeroDe } from "@/lib/concordancia"
import type { PalabrasDelRubro } from "@/lib/vocabulario"

export function frasesDeMiPlata(palabras: PalabrasDelRubro) {
  const { servicio } = palabras

  return {
    /**
     * Lo cobrado que todavía no tiene % de comisión, dicho a quien atiende:
     * "1 servicio espera su porcentaje…" / "3 prestaciones esperan su porcentaje…".
     */
    esperanSuPorcentaje: (cantidad: number): string =>
      `${cantidadDe(cantidad, servicio)} ${numeroDe(cantidad) === "singular" ? "espera" : "esperan"} su porcentaje de comisión: avísale a la dueña.`,
  }
}
