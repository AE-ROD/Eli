import { vi } from "vitest"

/** Simula la respuesta que daría el servidor, sin red de por medio. */
export function simularRespuesta(respuesta: Response) {
  const fetchFalso = vi.fn().mockResolvedValue(respuesta)
  vi.stubGlobal("fetch", fetchFalso)
  return fetchFalso
}

/** Una respuesta JSON del servidor, con su código. */
export const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { "Content-Type": "application/json" } })
