import type { NextRequest } from "next/server"

/**
 * Un pedido con lo mínimo que leen los endpoints de formulario: las cabeceras
 * (para el límite por IP) y el cuerpo JSON ya interpretado.
 *
 * Los tests que necesitan otra forma (una URL, un `nextUrl`, un cuerpo que
 * falla al leerse) arman la suya: ver `pedido` en `datos.ts`.
 */
export function pedidoFalso(cuerpo: unknown): NextRequest {
  return {
    headers: new Headers(),
    json: async () => cuerpo,
  } as unknown as NextRequest
}
