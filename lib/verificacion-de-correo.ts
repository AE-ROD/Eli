/**
 * Lo que las pantallas le piden al servidor sobre la confirmación del correo
 * de la cuenta: el aviso del panel (`components/panel/aviso-de-verificar-correo.tsx`)
 * y la página del enlace (`/verificar-correo/[token]`). Sólo `fetch`: se puede
 * importar desde componentes de cliente. Lo del servidor está en
 * `lib/verificacion-de-correo-servidor.ts`.
 *
 * Ninguna lleva un id: la cuenta la pone el servidor desde la sesión.
 */

import { conJson, pedir, pedirConCodigo, type Resultado, type ResultadoConCodigo } from "@/lib/peticiones"

export interface EstadoDeVerificacion {
  verificado: boolean
  /** El correo de la cuenta, al que va el enlace. */
  email: string
}

/** Si la cuenta de la sesión ya confirmó su correo. Sin sesión falla con 401. */
export function leerVerificacion(): Promise<ResultadoConCodigo<EstadoDeVerificacion>> {
  return pedirConCodigo<EstadoDeVerificacion>("/api/cuenta/verificacion", "No se pudo revisar tu correo")
}

/**
 * Pide otro enlace para la cuenta de la sesión. `verificado: true` es que ya
 * estaba confirmada y no se mandó nada.
 */
export function reenviarVerificacion(): Promise<Resultado<{ verificado: boolean }>> {
  return pedir<{ verificado: boolean }>(
    "/api/cuenta/verificacion/reenviar",
    "No pudimos mandar el correo, intenta de nuevo",
    { method: "POST" },
  )
}

/**
 * Confirma el correo con el token del enlace. Con 410 el enlace no sirve
 * (venció, ya se usó o no existe): `enlaceDeVerificacionVencido`.
 */
export function confirmarCorreo(token: string): Promise<ResultadoConCodigo<{ ok: true }>> {
  return pedirConCodigo<{ ok: true }>(
    "/api/cuenta/verificar-correo",
    "No se pudo confirmar tu correo, intenta de nuevo",
    conJson("POST", { token }),
  )
}

/** Si el fallo al confirmar dice que el enlace no sirve (y no que algo falló en el camino). */
export function enlaceDeVerificacionVencido(codigo: number | null): boolean {
  return codigo === 410
}
