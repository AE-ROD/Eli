import { describe, it, expect, vi, afterEach } from "vitest"
import { pedir, leerCuerpo, conJson, SIN_CONEXION } from "./peticiones"

/** Simula la respuesta que daría el servidor, sin red de por medio. */
function simularRespuesta(respuesta: Response) {
  const fetchFalso = vi.fn().mockResolvedValue(respuesta)
  vi.stubGlobal("fetch", fetchFalso)
  return fetchFalso
}

const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { "Content-Type": "application/json" } })

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("pedir", () => {
  it("con respuesta ok devuelve el cuerpo como datos", async () => {
    simularRespuesta(json([{ id: "c1" }]))

    const resultado = await pedir<{ id: string }[]>("/api/citas", "No se pudieron cargar las citas")

    expect(resultado).toEqual({ ok: true, datos: [{ id: "c1" }] })
  })

  it("le pasa al fetch la URL y las opciones tal cual", async () => {
    const fetchFalso = simularRespuesta(json({}))
    const opciones = conJson("PUT", { status: "completada" })

    await pedir("/api/citas/c1", "No se pudo cambiar el estado", opciones)

    expect(fetchFalso).toHaveBeenCalledWith("/api/citas/c1", opciones)
  })

  it("con respuesta ok y cuerpo vacío no revienta: los datos quedan sin definir", async () => {
    simularRespuesta(new Response(null, { status: 204 }))

    const resultado = await pedir("/api/clientes/c1", "No se pudieron guardar las notas")

    expect(resultado).toEqual({ ok: true, datos: undefined })
  })

  it("con error usa el mensaje que mandó el servidor", async () => {
    simularRespuesta(json({ error: "El horario ya no está disponible" }, 409))

    const resultado = await pedir("/api/reservar/x/confirmar", "Error al confirmar la reserva")

    expect(resultado).toEqual({ ok: false, error: "El horario ya no está disponible" })
  })

  it("con error y cuerpo vacío cae al mensaje por defecto", async () => {
    simularRespuesta(new Response(null, { status: 500 }))

    const resultado = await pedir("/api/chats", "No se pudieron cargar las conversaciones")

    expect(resultado).toEqual({ ok: false, error: "No se pudieron cargar las conversaciones" })
  })

  it("con error y un cuerpo que no es JSON (la página de un proxy caído) cae al mensaje por defecto", async () => {
    simularRespuesta(new Response("<html>502 Bad Gateway</html>", { status: 502 }))

    const resultado = await pedir("/api/equipo", "No se pudo cargar el equipo")

    expect(resultado).toEqual({ ok: false, error: "No se pudo cargar el equipo" })
  })

  it("con error y un campo `error` que no es un texto mostrable cae al mensaje por defecto", async () => {
    simularRespuesta(json({ error: { codigo: 42 } }, 400))
    expect(await pedir("/api/x", "Por defecto")).toEqual({ ok: false, error: "Por defecto" })

    simularRespuesta(json({ error: "   " }, 400))
    expect(await pedir("/api/x", "Por defecto")).toEqual({ ok: false, error: "Por defecto" })
  })

  it("si la red falla no lanza: avisa que no hubo conexión", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")))

    const resultado = await pedir("/api/dashboard/stats", "No se pudieron cargar las estadísticas")

    expect(resultado).toEqual({ ok: false, error: SIN_CONEXION })
    expect(SIN_CONEXION).toBe("Sin conexión con el servidor")
  })
})

describe("leerCuerpo", () => {
  it("devuelve el JSON del cuerpo", async () => {
    expect(await leerCuerpo(json({ requiereSesion: true }, 401))).toEqual({ requiereSesion: true })
  })

  it("devuelve null si el cuerpo viene vacío o no es JSON", async () => {
    expect(await leerCuerpo(new Response(null, { status: 204 }))).toBeNull()
    expect(await leerCuerpo(new Response("no es json"))).toBeNull()
  })
})

describe("conJson", () => {
  it("arma método, cabecera y cuerpo serializado", () => {
    expect(conJson("POST", { nombre: "Ana" })).toEqual({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre: "Ana" }),
    })
  })
})
