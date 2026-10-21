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
