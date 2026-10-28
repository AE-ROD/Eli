import { describe, it, expect, vi, afterEach } from "vitest"
import { json, simularRespuesta } from "@/pruebas/respuestas"
import { crearServicio, cuerpoDeServicio, editarServicio, type DatosDeServicio } from "./_datos"

/** El cuerpo JSON con que se llamó a `fetch`. */
const cuerpoEnviado = (fetchFalso: ReturnType<typeof simularRespuesta>) =>
  JSON.parse(String((fetchFalso.mock.calls[0][1] as RequestInit).body))

const SERVICIO: DatosDeServicio = { name: "Corte", description: "", duration: 30, price: "", category: "" }

const precioLeido = (texto: string) => {
  const cuerpo = cuerpoDeServicio({ ...SERVICIO, price: texto })
  return cuerpo.ok ? cuerpo.datos.price : null
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("cuerpoDeServicio", () => {
  it("lee los miles con punto, como se ven en pantalla: 8.000 es ocho mil, no 8", () => {
    expect(precioLeido("8.000")).toBe(8000)
    expect(precioLeido("8000")).toBe(8000)
    expect(precioLeido("8.000,50")).toBe(8000.5)
    expect(precioLeido("25.000")).toBe(25000)
  })

  it("precio y descripción vacíos no se mandan; la categoría vacía se borra", () => {
    expect(cuerpoDeServicio(SERVICIO)).toEqual({
      ok: true,
      datos: { name: "Corte", description: undefined, duration: 30, price: undefined, category: null },
    })
  })

  it("la categoría se manda sin los espacios de las puntas", () => {
    const cuerpo = cuerpoDeServicio({ ...SERVICIO, category: "  Color " })
    expect(cuerpo.ok && cuerpo.datos.category).toBe("Color")
  })

  it("un precio que no se puede leer sin adivinar es un error, no otro precio", () => {
    expect(cuerpoDeServicio({ ...SERVICIO, price: "8,000" })).toEqual({
      ok: false,
      error: expect.stringContaining("No se entiende el precio"),
    })
  })
})

describe("crearServicio y editarServicio", () => {
  it("crear manda 8.000 como 8000", async () => {
    const fetchFalso = simularRespuesta(json({ id: "s1" }, 201))

    await crearServicio({ ...SERVICIO, price: "8.000" })

    expect(cuerpoEnviado(fetchFalso).price).toBe(8000)
  })

  it("editar manda 8.000,50 como 8000,5", async () => {
    const fetchFalso = simularRespuesta(json({ id: "s1" }))

    await editarServicio("s1", { ...SERVICIO, price: "8.000,50" })

    expect(cuerpoEnviado(fetchFalso).price).toBe(8000.5)
  })

  it("con un precio ilegible no llama al servidor y devuelve el motivo", async () => {
    const fetchFalso = simularRespuesta(json({ id: "s1" }))

    const resultado = await editarServicio("s1", { ...SERVICIO, price: "abc" })

    expect(resultado.ok).toBe(false)
    expect(fetchFalso).not.toHaveBeenCalled()
  })
})
