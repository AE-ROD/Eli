import { describe, it, expect, vi, afterEach } from "vitest"
import { json, simularRespuesta } from "@/pruebas/respuestas"
import { vocabularioDe } from "@/lib/vocabulario"
import { anularCobro, formatearCambio, formatearMinutos, formatearTasa, leerOpcionesDeFiltro } from "./_datos"

describe("formato de Llenar horas", () => {
  it("formatearTasa", () => {
    expect(formatearTasa(0.4249)).toBe("42 %")
    expect(formatearTasa(0)).toBe("0 %")
    expect(formatearTasa(null)).toBe("—")
  })

  it("formatearMinutos", () => {
    expect(formatearMinutos(0)).toBe("0 min")
    expect(formatearMinutos(45)).toBe("45 min")
    expect(formatearMinutos(120)).toBe("2 h")
    expect(formatearMinutos(750)).toBe("12 h 30 min")
  })

  it("formatearCambio: relativo en cantidades, puntos en tasas, nada sin base", () => {
    expect(formatearCambio({ actual: 5, anterior: 4, cambio: 0.25 }, "cantidad")).toBe("+25 %")
    expect(formatearCambio({ actual: 0.3, anterior: 0.35, cambio: -0.05 }, "tasa")).toBe("−5 pts")
    expect(formatearCambio({ actual: 1, anterior: 1, cambio: 0 }, "cantidad")).toBe("0 %")
    expect(formatearCambio({ actual: 3, anterior: 0, cambio: null }, "cantidad")).toBeNull()
  })
})

describe("anularCobro", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("un cobro ya rendido vuelve marcado por el código del servidor, con su mensaje (#117)", async () => {
    const mensaje = "Esta atención ya está en una liquidación cerrada: no se anula, corrígelo con un ajuste."
    simularRespuesta(json({ error: mensaje, codigo: "corregir-con-ajuste" }, 409))

    expect(await anularCobro("v1", "")).toEqual({ ok: false, error: mensaje, codigo: 409, corregirConAjuste: true })
  })

  it("con un abono ya pagado al laboratorio tampoco se anula: se trata igual (no recarga ni pierde el motivo)", async () => {
    const mensaje = "Un abono de prótesis de esta atención ya se le pagó al laboratorio: anula primero ese pago."
    simularRespuesta(json({ error: mensaje, codigo: "pagado-al-laboratorio" }, 409))

    expect(await anularCobro("v1", "Error")).toEqual({ ok: false, error: mensaje, codigo: 409, corregirConAjuste: true })
  })

  it("otro 409 no lo es: la pantalla lo trata como un cobro que cambió", async () => {
    simularRespuesta(json({ error: "Esta atención ya está anulada." }, 409))

    expect(await anularCobro("v1", "")).toEqual({
      ok: false,
      error: "Esta atención ya está anulada.",
      codigo: 409,
      corregirConAjuste: false,
    })
  })
})

describe("leerOpcionesDeFiltro: el mensaje de cuando falla habla con las palabras del rubro", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("sin palabras, lo de siempre; en una clínica dental, odontólogos y prestaciones", async () => {
    simularRespuesta(json({}, 500))
    expect(await leerOpcionesDeFiltro()).toEqual({
      ok: false,
      error: "No se pudieron cargar los profesionales y servicios para filtrar",
    })
    simularRespuesta(json({}, 500))
    expect(await leerOpcionesDeFiltro(vocabularioDe("odontologia").palabras)).toEqual({
      ok: false,
      error: "No se pudieron cargar los odontólogos y prestaciones para filtrar",
    })
    simularRespuesta(json({}, 500))
    expect(await leerOpcionesDeFiltro(vocabularioDe("salon").palabras)).toEqual({
      ok: false,
      error: "No se pudieron cargar las estilistas y servicios para filtrar",
    })
  })

  it("el mensaje que manda el servidor sigue ganando", async () => {
    simularRespuesta(json({ error: "Sin permiso" }, 403))
    expect(await leerOpcionesDeFiltro(vocabularioDe("odontologia").palabras)).toEqual({ ok: false, error: "Sin permiso" })
  })
})
