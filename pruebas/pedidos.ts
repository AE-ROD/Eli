import type { NextRequest } from "next/server"

/**
 * El cuerpo de un pedido de prueba como lo trae uno de verdad: un stream con
 * el JSON (los endpoints lo leen con tope, `lib/cuerpo-del-pedido.ts`), o
 * `null` si no hay cuerpo. Un string va tal cual, para probar un JSON roto.
 */
export function cuerpoDePrueba(cuerpo: unknown): ReadableStream<Uint8Array> | null {
  if (cuerpo === undefined) return null
  return new Response(typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo)).body
}

/**
 * Un pedido con lo mínimo que leen los endpoints de formulario: las cabeceras
 * (para el límite por IP) y el cuerpo JSON.
 *
 * Los tests que necesitan otra forma (una URL, un `nextUrl`, un cuerpo que
 * falla al leerse) arman la suya: ver `pedido` en `datos.ts`.
 */
export function pedidoFalso(cuerpo: unknown): NextRequest {
  return {
    headers: new Headers(),
    body: cuerpoDePrueba(cuerpo),
  } as unknown as NextRequest
}
