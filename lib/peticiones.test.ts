import { describe, it, expect, vi, afterEach } from "vitest"
import { pedir, pedirConCodigo, pedirConCuerpo, leerCuerpo, conJson, SIN_CONEXION } from "./peticiones"

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

  it("con 204 (sin contenido) es un éxito: los datos quedan sin definir", async () => {
    simularRespuesta(new Response(null, { status: 204 }))

    const resultado = await pedir("/api/clientes/c1", "No se pudieron guardar las notas")

    expect(resultado).toEqual({ ok: true, datos: undefined })
  })

  it("con 200 y una página HTML (un portal cautivo, un proxy) falla con el mensaje por defecto", async () => {
    simularRespuesta(
      new Response("<html>Conectate al wifi</html>", { status: 200, headers: { "Content-Type": "text/html" } })
    )

    const resultado = await pedir<{ id: string }[]>("/api/citas", "No se pudieron cargar las citas")

    expect(resultado).toEqual({ ok: false, error: "No se pudieron cargar las citas" })
  })

  it("con 200 y cuerpo vacío falla con el mensaje por defecto: sólo un 204 es éxito sin cuerpo", async () => {
    simularRespuesta(new Response(null, { status: 200 }))
    expect(await pedir("/api/chats", "No se pudieron cargar las conversaciones")).toEqual({
      ok: false,
      error: "No se pudieron cargar las conversaciones",
    })

    simularRespuesta(new Response("", { status: 200 }))
    expect(await pedir("/api/chats", "No se pudieron cargar las conversaciones")).toEqual({
      ok: false,
      error: "No se pudieron cargar las conversaciones",
    })
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

describe("pedirConCodigo", () => {
  it("con respuesta ok devuelve los datos, igual que pedir", async () => {
    simularRespuesta(json({ id: "v1" }, 201))

    expect(await pedirConCodigo("/api/atenciones", "No se pudo anotar")).toEqual({ ok: true, datos: { id: "v1" } })
  })

  it.each([
    {
      caso: "200 con JSON: éxito con los datos",
      respuesta: () => json({ atenciones: [] }),
      esperado: { ok: true, datos: { atenciones: [] } },
    },
    {
      caso: "204: éxito sin datos",
      respuesta: () => new Response(null, { status: 204 }),
      esperado: { ok: true, datos: undefined },
    },
    {
      caso: "200 con HTML: fallo con el mensaje por defecto y el código",
      respuesta: () =>
        new Response("<html>Conectate al wifi</html>", { status: 200, headers: { "Content-Type": "text/html" } }),
      esperado: { ok: false, error: "No se pudo cargar el tablero", codigo: 200 },
    },
    {
      caso: "200 vacío: fallo con el mensaje por defecto y el código",
      respuesta: () => new Response(null, { status: 200 }),
      esperado: { ok: false, error: "No se pudo cargar el tablero", codigo: 200 },
    },
  ])("$caso", async ({ respuesta, esperado }) => {
    simularRespuesta(respuesta())

    expect(await pedirConCodigo("/api/atenciones", "No se pudo cargar el tablero")).toEqual(esperado)
  })

  it("con error devuelve el mensaje del servidor y el código, para decidir según el motivo", async () => {
    simularRespuesta(json({ error: "La atención cambió mientras tanto" }, 409))

    const resultado = await pedirConCodigo("/api/atenciones/v1/estado", "No se pudo mover")

    expect(resultado).toEqual({ ok: false, error: "La atención cambió mientras tanto", codigo: 409 })
  })

  it("con error y sin mensaje usa el mensaje por defecto y conserva el código", async () => {
    simularRespuesta(new Response(null, { status: 404 }))

    expect(await pedirConCodigo("/api/atenciones/v9", "No se pudo guardar")).toEqual({
      ok: false,
      error: "No se pudo guardar",
      codigo: 404,
    })
  })

  it("sin respuesta del servidor el código es null", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")))

    expect(await pedirConCodigo("/api/atenciones", "No se pudo cargar")).toEqual({
      ok: false,
      error: SIN_CONEXION,
      codigo: null,
    })
  })

  it("pedir sigue sin exponer el código: su fallo es sólo el mensaje", async () => {
    simularRespuesta(json({ error: "No autorizado" }, 401))

    expect(await pedir("/api/atenciones/v1/cobro", "No se pudo cobrar")).toEqual({ ok: false, error: "No autorizado" })
  })
})

describe("pedirConCuerpo", () => {
  it("con error devuelve también el cuerpo, para leer lo que no es el mensaje", async () => {
    simularRespuesta(json({ error: "Inicia sesión con esa cuenta", requiereSesion: true }, 409))

    expect(await pedirConCuerpo("/api/equipo/invitacion/t/aceptar", "Error al crear la cuenta")).toEqual({
      ok: false,
      error: "Inicia sesión con esa cuenta",
      codigo: 409,
      cuerpo: { error: "Inicia sesión con esa cuenta", requiereSesion: true },
    })
  })

  it("con 200 y una página HTML falla igual que pedir, con el cuerpo en null", async () => {
    simularRespuesta(new Response("<html>Conectate al wifi</html>", { status: 200, headers: { "Content-Type": "text/html" } }))

    expect(await pedirConCuerpo("/api/equipo/invitacion/t/aceptar", "Error al crear la cuenta")).toEqual({
      ok: false,
      error: "Error al crear la cuenta",
      codigo: 200,
      cuerpo: null,
    })
  })

  it("con 204 es un éxito sin datos, y con JSON devuelve los datos", async () => {
    simularRespuesta(new Response(null, { status: 204 }))
    expect(await pedirConCuerpo("/api/x", "Por defecto")).toEqual({ ok: true, datos: undefined })

    simularRespuesta(json({ cuentaNueva: false }, 201))
    expect(await pedirConCuerpo("/api/x", "Por defecto")).toEqual({ ok: true, datos: { cuentaNueva: false } })
  })

  it("sin respuesta no lanza: sin conexión, sin código y sin cuerpo", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")))

    expect(await pedirConCuerpo("/api/x", "Por defecto")).toEqual({
      ok: false,
      error: SIN_CONEXION,
      codigo: null,
      cuerpo: null,
    })
  })

  it("pedirConCodigo sigue sin exponer el cuerpo", async () => {
    simularRespuesta(json({ error: "La atención cambió", detalle: 1 }, 409))

    expect(await pedirConCodigo("/api/atenciones/v1/estado", "No se pudo mover")).toEqual({
      ok: false,
      error: "La atención cambió",
      codigo: 409,
    })
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
