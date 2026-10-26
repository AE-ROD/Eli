import { describe, it, expect, vi, afterEach } from "vitest"
import { json, simularRespuesta } from "@/pruebas/respuestas"
import { crearCita, precioDeLaCita, type DatosDeNuevaCita } from "./_datos"

/** El cuerpo JSON con que se llamó a `fetch`. */
const cuerpoEnviado = (fetchFalso: ReturnType<typeof simularRespuesta>) =>
  JSON.parse(String((fetchFalso.mock.calls[0][1] as RequestInit).body))

const CITA: DatosDeNuevaCita = {
  clienteId: "cliente-1",
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

    expect(resultado.ok).toBe(false)
    expect(fetchFalso).not.toHaveBeenCalled()
  })
})
