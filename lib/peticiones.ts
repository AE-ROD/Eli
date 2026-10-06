/**
 * Cómo le pide cosas la interfaz al servidor. Cada `_datos.ts` de una vista se
 * arma sobre esto, así que la regla vive en un solo lugar y no en siete copias.
 *
 * La regla: el error es parte del valor de retorno, nunca una excepción. Con
 * excepciones es demasiado fácil no atraparlas y dejar al usuario mirando una
 * pantalla que no hizo nada y no dice por qué. Con `{ ok }`, TypeScript no deja
 * tocar los datos sin mirar antes `ok`, así que la pantalla está obligada a
 * decidir qué mostrar cuando algo falla.
 *
 * Sólo usa `fetch` del navegador: se puede importar desde componentes de
 * cliente sin arrastrar nada del servidor.
 */

/** Lo que devuelve todo pedido al servidor: los datos, o por qué no llegaron. */
export type Resultado<T = void> = { ok: true; datos: T } | { ok: false; error: string }

/**
 * Como `Resultado`, pero el fallo trae además el código HTTP: `null` si no
 * hubo respuesta. Es para las pantallas que reaccionan distinto según el
 * motivo, como el tablero de atenciones, que ante un 409 recarga en vez de
 * sólo avisar.
 */
export type ResultadoConCodigo<T = void> =
  | { ok: true; datos: T }
  | { ok: false; error: string; codigo: number | null }

/** El aviso cuando el pedido ni siquiera llegó: sin red o con el servidor caído. */
export const SIN_CONEXION = "Sin conexión con el servidor"

/**
 * El cuerpo de la respuesta interpretado como JSON, o `null` si vino vacío o no
 * es JSON. Un 204, la página HTML de un proxy caído o un cuerpo cortado no deben
 * convertirse en una excepción que tape el error de verdad.
 */
export async function leerCuerpo(respuesta: Response): Promise<unknown> {
  return respuesta.json().catch(() => null)
}

/** El mensaje que mandó el servidor, sólo si es un texto que se pueda mostrar. */
function mensajeDelServidor(cuerpo: unknown): string | null {
  if (typeof cuerpo !== "object" || cuerpo === null || !("error" in cuerpo)) return null
  return typeof cuerpo.error === "string" && cuerpo.error.trim() !== "" ? cuerpo.error : null
}

/**
 * Hace el pedido y devuelve un `Resultado`. No lanza nunca.
 *
 * - Si la respuesta es ok, `datos` es el cuerpo JSON. Un 204 No Content es un
 *   éxito sin cuerpo: `datos` queda sin definir.
 * - Si la respuesta es ok pero el cuerpo no se puede leer como JSON (HTML,
 *   vacío sin ser un 204, cortado), es un fallo con `errorPorDefecto`. Ningún
 *   endpoint responde así: lo que llegó es la página de un portal cautivo o de
 *   un proxy, y darlo por bueno deja a la pantalla usando datos que no existen.
 *   Un `null` literal cuenta igual (`leerCuerpo` no lo distingue): ningún
 *   endpoint lo manda como éxito.
 * - Si no, el campo `error` que mandó el servidor y, si no mandó ninguno,
 *   `errorPorDefecto`: el mensaje que tiene sentido para esa acción.
 * - Si no hubo respuesta, `SIN_CONEXION`.
 *
 * Los datos no se validan: se confía en el contrato del endpoint, igual que
 * cuando cada pantalla hacía `await respuesta.json()`. El tipo lo pone quien
 * llama, que es quien conoce ese contrato.
 */
export async function pedir<T = void>(
  url: string,
  errorPorDefecto: string,
  opciones?: RequestInit
): Promise<Resultado<T>> {
  const resultado = await pedirConCodigo<T>(url, errorPorDefecto, opciones)
  // Sin el código: quien usa `pedir` decide sólo con el mensaje, y así el
  // valor que recibe es exactamente el de siempre.
  return resultado.ok ? resultado : { ok: false, error: resultado.error }
}

/**
 * Igual que `pedir`, pero el fallo dice también con qué código respondió el
 * servidor (`null` si no respondió). No lanza nunca.
 *
 * Ese código puede ser un 2xx: es el caso de un ok cuyo cuerpo no se pudo leer.
 */
export async function pedirConCodigo<T = void>(
  url: string,
  errorPorDefecto: string,
  opciones?: RequestInit
): Promise<ResultadoConCodigo<T>> {
  try {
    const respuesta = await fetch(url, opciones)
    const cuerpo = await leerCuerpo(respuesta)
    if (!respuesta.ok) {
      return { ok: false, error: mensajeDelServidor(cuerpo) ?? errorPorDefecto, codigo: respuesta.status }
    }
    // 204: el servidor dice que salió bien y que no manda nada. Es el único
    // éxito sin cuerpo que se acepta.
    if (respuesta.status === 204) return { ok: true, datos: undefined as T }
    // Cualquier otro ok sin JSON no lo armó el endpoint (ver `pedir`): se avisa
    // en vez de dejar que la pantalla se caiga al usar `datos`.
    if (cuerpo === null) return { ok: false, error: errorPorDefecto, codigo: respuesta.status }
    return { ok: true, datos: cuerpo as T }
  } catch {
    return { ok: false, error: SIN_CONEXION, codigo: null }
  }
}

/**
 * Las opciones de un pedido que manda JSON: el método, la cabecera que lo
 * declara y el cuerpo serializado. Son las mismas tres líneas en cada envío de
 * cada vista; acá se escriben una sola vez.
 */
export function conJson(metodo: "POST" | "PUT", cuerpo: unknown): RequestInit {
  return {
    method: metodo,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo),
  }
}
