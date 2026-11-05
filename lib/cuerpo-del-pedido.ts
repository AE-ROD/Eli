import { NextResponse } from "next/server"

/**
 * Tope por defecto del cuerpo de un pedido a la API: 100 KB.
 *
 * El formulario más grande del panel (la página del negocio con 200
 * profesionales y sus especialidades) no llega a 60 KB ni con todo en
 * caracteres de 3 bytes. Lo que pase de acá no es un pedido de la app: se
 * corta antes de parsear el JSON, para que zod nunca tenga que recorrer una
 * colección enorme (GHSA-mrhx-c7xc-m3w5, zod 3 puede agotar la memoria).
 *
 * Un endpoint que necesite más (importar clientes) pasa su propio tope.
 */
export const TOPE_DEL_CUERPO_POR_DEFECTO = 100 * 1024

/**
 * Techo de cualquier pedido a `/api`, el que mira `proxy.ts` sobre el
 * `Content-Length` declarado: por encima del tope más alto que acepta un
 * endpoint (importar clientes, ~4 MB). Es una primera barrera barata; el
 * tope de verdad lo pone cada endpoint al leer.
 */
export const TOPE_DE_CUALQUIER_PEDIDO = 5 * 1024 * 1024

export const MENSAJE_DE_CUERPO_DEMASIADO_GRANDE = "El pedido es demasiado grande."

/** El 413 de un pedido que pasó el tope. */
export function respuestaDeCuerpoDemasiadoGrande(mensaje = MENSAJE_DE_CUERPO_DEMASIADO_GRANDE): NextResponse {
  return NextResponse.json({ error: mensaje }, { status: 413 })
}

/** Lo que lanza `leerJsonConTope` cuando el cuerpo pasa el tope. */
export class CuerpoDemasiadoGrande extends Error {
  constructor() {
    super(MENSAJE_DE_CUERPO_DEMASIADO_GRANDE)
    this.name = "CuerpoDemasiadoGrande"
  }
}

/**
 * Los bytes del cuerpo, o `null` si pasa de `maxBytes`.
 *
 * Si el `Content-Length` declarado ya pasa el tope, no lee nada. Como esa
 * cabecera puede faltar (cuerpo por partes) o mentir, además lee el cuerpo
 * por trozos y corta apenas lo leído pasa el tope. Un error al leer el
 * stream se propaga.
 */
async function bytesConTope(request: Request, maxBytes: number): Promise<Uint8Array | null> {
  const declarado = Number(request.headers.get("content-length") ?? "")
  if (Number.isFinite(declarado) && declarado > maxBytes) return null
  if (!request.body) return new Uint8Array(0)

  const lector = request.body.getReader()
  const trozos: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await lector.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await lector.cancel().catch(() => {})
      return null
    }
    trozos.push(value)
  }

  const bytes = new Uint8Array(total)
  let desde = 0
  for (const trozo of trozos) {
    bytes.set(trozo, desde)
    desde += trozo.byteLength
  }
  return bytes
}

/**
 * Reemplazo de `request.json()` con tope: mismo contrato (un JSON roto o un
 * cuerpo vacío lanzan `SyntaxError`), y además lanza `CuerpoDemasiadoGrande`
 * si el cuerpo pasa de `maxBytes`. Para las rutas que leen el cuerpo dentro
 * de un `try` y ya deciden qué hacer con cada error en el `catch`.
 */
export async function leerJsonConTope(
  request: Request,
  maxBytes: number = TOPE_DEL_CUERPO_POR_DEFECTO
): Promise<unknown> {
  const bytes = await bytesConTope(request, maxBytes)
  if (!bytes) throw new CuerpoDemasiadoGrande()
  return JSON.parse(new TextDecoder().decode(bytes))
}

/** Lo que devuelve `cuerpoConTope`: el cuerpo, o que pasó del tope. */
export type CuerpoLeido = { excedido: true } | { excedido: false; cuerpo: unknown }

/**
 * El cuerpo JSON del pedido sin leer más de `maxBytes`, o que pasó del tope
 * (y el endpoint responde 413). Un JSON roto, un pedido sin cuerpo o uno que
 * no se pudo leer dan `cuerpo: undefined`: así lo rechaza zod con un 400, en
 * vez de lanzar un `SyntaxError` que termina en 500.
 */
export async function cuerpoConTope(
  request: Request,
  maxBytes: number = TOPE_DEL_CUERPO_POR_DEFECTO
): Promise<CuerpoLeido> {
  let bytes: Uint8Array | null
  try {
    bytes = await bytesConTope(request, maxBytes)
  } catch {
    return { excedido: false, cuerpo: undefined }
  }
  if (!bytes) return { excedido: true }
  try {
    return { excedido: false, cuerpo: JSON.parse(new TextDecoder().decode(bytes)) }
  } catch {
    return { excedido: false, cuerpo: undefined }
  }
}
