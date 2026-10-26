/**
 * El cuerpo JSON del pedido, o `undefined` si no vino o no es JSON. Así un
 * cuerpo roto lo rechaza zod con un 400, en vez de lanzar un `SyntaxError`
 * que termina en 500.
 *
 * Lo usan los endpoints del tablero. Las rutas más viejas leen con
 * `request.json()` directo y responden distinto ante un JSON roto: pasarlas a
 * esto cambia su comportamiento, así que no es un reemplazo automático.
 */
export async function cuerpoDelPedido(request: Request): Promise<unknown> {
  return request.json().catch(() => undefined)
}

/** Lo que devuelve `cuerpoConTope`: el cuerpo, o que pasó del tope. */
export type CuerpoLeido = { excedido: true } | { excedido: false; cuerpo: unknown }

/**
 * Como `cuerpoDelPedido`, pero sin leer más de `maxBytes`: un endpoint
 * público no tiene por qué cargar en memoria un cuerpo de megas para
 * rechazarlo después con zod.
 *
 * Si el `Content-Length` declarado ya pasa el tope, no lee nada. Como esa
 * cabecera puede faltar (cuerpo por partes) o mentir, además lee el cuerpo
 * por trozos y corta apenas lo leído pasa el tope. Un JSON roto o un cuerpo
 * que no se pudo leer dan `cuerpo: undefined`, igual que `cuerpoDelPedido`.
 */
export async function cuerpoConTope(request: Request, maxBytes: number): Promise<CuerpoLeido> {
  const declarado = Number(request.headers.get("content-length") ?? "")
  if (Number.isFinite(declarado) && declarado > maxBytes) return { excedido: true }
  if (!request.body) return { excedido: false, cuerpo: undefined }

  const lector = request.body.getReader()
  const trozos: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await lector.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        await lector.cancel().catch(() => {})
        return { excedido: true }
      }
      trozos.push(value)
    }
  } catch {
    return { excedido: false, cuerpo: undefined }
  }

  const bytes = new Uint8Array(total)
  let desde = 0
  for (const trozo of trozos) {
    bytes.set(trozo, desde)
    desde += trozo.byteLength
  }
  try {
    return { excedido: false, cuerpo: JSON.parse(new TextDecoder().decode(bytes)) }
  } catch {
    return { excedido: false, cuerpo: undefined }
  }
}
