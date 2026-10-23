import { createHash, timingSafeEqual } from "node:crypto"
import type { NextRequest } from "next/server"

/**
 * La autorización de los crons (`app/api/cron/*`). Una sola, para que ningún
 * cron nuevo la copie y se olvide de un detalle.
 */

/**
 * Compara en tiempo constante. `timingSafeEqual` exige dos buffers del mismo
 * largo: se comparan los hashes, que siempre miden lo mismo, en vez de cortar
 * antes cuando los largos difieren, que también diría algo del secreto.
 */
function mismoSecreto(recibido: string, esperado: string): boolean {
  const hashRecibido = createHash("sha256").update(recibido).digest()
  const hashEsperado = createHash("sha256").update(esperado).digest()
  return timingSafeEqual(hashRecibido, hashEsperado)
}

/**
 * Vercel Cron llama con `Authorization: Bearer <CRON_SECRET>` cuando la
 * variable está configurada en el proyecto, y no puede mandar un header
 * propio: esperando sólo `x-cron-secret`, la llamada de Vercel recibía siempre
 * 401. `x-cron-secret` se sigue aceptando por si alguien lo llama a mano con
 * él.
 *
 * Sin `CRON_SECRET`, o vacío, falla cerrado antes de comparar: si no, lo
 * esperado sería `Bearer undefined`, y un `x-cron-secret` vacío coincidiría
 * con una variable vacía.
 */
export function llamadaDeCronAutorizada(request: NextRequest | { headers: Headers }): boolean {
  const secreto = process.env.CRON_SECRET
  if (!secreto) return false

  const authorization = request.headers.get("authorization")
  const propio = request.headers.get("x-cron-secret")
  return (
    (authorization !== null && mismoSecreto(authorization, `Bearer ${secreto}`)) ||
    (propio !== null && mismoSecreto(propio, secreto))
  )
}
