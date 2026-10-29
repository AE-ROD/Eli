import { describe, it, expect, vi, afterEach } from "vitest"
import { json, simularRespuesta } from "@/pruebas/respuestas"
import { aQuienBloquea, citaPorConfirmar, crearBloqueo, crearCita, precioDeLaCita, quitarBloqueo, type Bloqueo, type DatosDeNuevaCita } from "./_datos"

/** El cuerpo JSON con que se llamó a `fetch`. */
const cuerpoEnviado = (fetchFalso: ReturnType<typeof simularRespuesta>) =>
  JSON.parse(String((fetchFalso.mock.calls[0][1] as RequestInit).body))

const CITA: DatosDeNuevaCita = {
  clienteId: "cliente-1",
  clienteNombre: "Ana",
  servicio: "Corte",
  fecha: "2026-10-20",
  horaInicio: "10:00",
  horaFin: "10:30",
  precio: "",
  notas: "",
  memberId: "",
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("citaPorConfirmar", () => {
  it("pendiente con la marca: por confirmar; si el cliente ya llegó al Tablero, ya no", () => {
    expect(citaPorConfirmar({ status: "pendiente", confirmacionPorFaltas: true })).toBe(true)
    expect(citaPorConfirmar({ status: "pendiente", confirmacionPorFaltas: true, conAtencion: true })).toBe(false)
    expect(citaPorConfirmar({ status: "confirmada", confirmacionPorFaltas: true })).toBe(false)
    expect(citaPorConfirmar({ status: "pendiente" })).toBe(false)
  })
})

describe("precioDeLaCita", () => {
  it("lee los miles con punto, como se ven en pantalla: 8.000 es ocho mil, no 8", () => {
    expect(precioDeLaCita("8.000")).toEqual({ ok: true, datos: 8000 })
    expect(precioDeLaCita("8000")).toEqual({ ok: true, datos: 8000 })
    expect(precioDeLaCita("8.000,50")).toEqual({ ok: true, datos: 8000.5 })
    expect(precioDeLaCita("15.000")).toEqual({ ok: true, datos: 15000 })
  })

  it("vacío es sin precio", () => {
    expect(precioDeLaCita("")).toEqual({ ok: true, datos: undefined })
    expect(precioDeLaCita("  ")).toEqual({ ok: true, datos: undefined })
  })

  it("lo que no se puede leer sin adivinar es un error, no otro precio", () => {
    expect(precioDeLaCita("8,000")).toEqual({ ok: false, error: expect.stringContaining("No se entiende el precio") })
    expect(precioDeLaCita("abc").ok).toBe(false)
  })
})

describe("crearCita", () => {
  it("manda 8.000 como 8000", async () => {
    const fetchFalso = simularRespuesta(json({ id: "c1" }, 201))

    await crearCita({ ...CITA, precio: "8.000" })

    expect(cuerpoEnviado(fetchFalso).price).toBe(8000)
  })

  it("sin precio no manda el campo", async () => {
    const fetchFalso = simularRespuesta(json({ id: "c1" }, 201))

    await crearCita(CITA)

    expect(cuerpoEnviado(fetchFalso)).not.toHaveProperty("price")
  })

  it("con un precio ilegible no llama al servidor y devuelve el motivo", async () => {
    const fetchFalso = simularRespuesta(json({ id: "c1" }, 201))

    const resultado = await crearCita({ ...CITA, precio: "8,000" })

    expect(resultado.tipo).toBe("error")
    expect(fetchFalso).not.toHaveBeenCalled()
  })

  it("creada: 'guardada'", async () => {
    simularRespuesta(json({ id: "c1" }, 201))

    expect(await crearCita(CITA)).toEqual({ tipo: "guardada" })
  })

  it("un 409 con advertencias las devuelve para preguntar, sin dar la cita por creada", async () => {
    const advertencias = [{ tipo: "bloqueo", mensaje: "Carla tiene bloqueado de 13:00 a 14:00." }]
    simularRespuesta(json({ error: advertencias[0].mensaje, advertencias }, 409))

    expect(await crearCita(CITA)).toEqual({ tipo: "advertencias", advertencias })
  })

  it("el primer envío no confirma; 'guardar igual' manda confirmarAdvertencias", async () => {
    const primero = simularRespuesta(json({ id: "c1" }, 201))
    await crearCita(CITA)
    expect(cuerpoEnviado(primero)).not.toHaveProperty("confirmarAdvertencias")

    const segundo = simularRespuesta(json({ id: "c1" }, 201))
    await crearCita(CITA, { confirmar: true })
    expect(cuerpoEnviado(segundo).confirmarAdvertencias).toBe(true)
  })

  it("otro error del servidor es un error, con su mensaje", async () => {
    simularRespuesta(json({ error: "Cliente no encontrado" }, 404))

    expect(await crearCita(CITA)).toEqual({ tipo: "error", error: "Cliente no encontrado" })
  })
})

describe("bloqueos", () => {
  const BLOQUEO = {
    memberId: "m-carla",
    fechaDesde: "2026-10-20",
    horaDesde: "13:00",
    fechaHasta: "2026-10-20",
    horaHasta: "14:00",
    motivo: "  Almuerzo ",
  }

  it("crear manda el profesional, el tramo en ISO y el motivo sin espacios", async () => {
    const fetchFalso = simularRespuesta(json({ id: "b1" }, 201))

    const resultado = await crearBloqueo(BLOQUEO)

    expect(resultado.ok).toBe(true)
    const cuerpo = cuerpoEnviado(fetchFalso)
    expect(cuerpo).toMatchObject({ memberId: "m-carla", motivo: "Almuerzo" })
    expect(new Date(cuerpo.startTime).getTime()).toBe(new Date("2026-10-20T13:00:00").getTime())
    expect(new Date(cuerpo.endTime).getTime()).toBe(new Date("2026-10-20T14:00:00").getTime())
  })

  it("sin profesional es todo el negocio (null), y sin motivo no manda el campo", async () => {
    const fetchFalso = simularRespuesta(json({ id: "b1" }, 201))

    await crearBloqueo({ ...BLOQUEO, memberId: "", motivo: " " })

    expect(cuerpoEnviado(fetchFalso).memberId).toBeNull()
    expect(cuerpoEnviado(fetchFalso)).not.toHaveProperty("motivo")
  })

  it("un hasta que no es después del desde no llama al servidor", async () => {
    const fetchFalso = simularRespuesta(json({ id: "b1" }, 201))

    const resultado = await crearBloqueo({ ...BLOQUEO, horaHasta: "13:00" })

    expect(resultado).toEqual({ ok: false, error: "El bloqueo tiene que terminar después de empezar" })
    expect(fetchFalso).not.toHaveBeenCalled()
  })

  it("quitar pide DELETE al bloqueo", async () => {
    const fetchFalso = simularRespuesta(json({ mensaje: "Bloqueo quitado" }))

    await quitarBloqueo("b-1")

    expect(fetchFalso.mock.calls[0][0]).toBe("/api/bloqueos/b-1")
    expect((fetchFalso.mock.calls[0][1] as RequestInit).method).toBe("DELETE")
  })

  it("de quién es: el profesional, o todo el negocio", () => {
    const base: Bloqueo = { id: "b", memberId: null, startTime: "", endTime: "", motivo: null, member: null }
    expect(aQuienBloquea(base)).toBe("Todo el negocio")
    expect(aQuienBloquea({ ...base, memberId: "m", member: { user: { name: "Carla" } } })).toBe("Carla")
  })
})
