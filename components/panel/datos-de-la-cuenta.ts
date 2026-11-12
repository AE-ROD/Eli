/**
 * Lo que "Mi foto" le pide al servidor: subir y quitar la foto de la CUENTA
 * (`PUT/DELETE /api/cuenta/foto`). La pantalla no conoce la URL; si cambia el
 * endpoint, se cambia acá. No lleva ningún id: la cuenta la pone el servidor
 * desde la sesión, nunca el navegador.
 *
 * Devuelve `{ ok }` y no lanza (`lib/enviar-foto.ts`): el selector de foto
 * tiene que decidir qué mostrar si falla.
 */

import { enviarFoto, pedirQuitarFoto, type ResultadoDeFoto } from "@/lib/enviar-foto"

export const RUTA_DE_LA_FOTO_DE_LA_CUENTA = "/api/cuenta/foto"

/** Sube la foto de la cuenta. La imagen ya viene ajustada por el navegador. Devuelve la URL con que quedó. */
export function subirFotoDeLaCuenta(foto: Blob): Promise<ResultadoDeFoto> {
  return enviarFoto(RUTA_DE_LA_FOTO_DE_LA_CUENTA, foto)
}

/** Quita la foto de la cuenta: vuelven a verse las iniciales. */
export function quitarFotoDeLaCuenta(): Promise<ResultadoDeFoto> {
  return pedirQuitarFoto(RUTA_DE_LA_FOTO_DE_LA_CUENTA)
}
