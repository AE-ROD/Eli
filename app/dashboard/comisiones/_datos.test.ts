import { describe, it, expect } from "vitest"
import { formatearPorcentaje, leerPorcentaje, leerReparto, porcentajeParaEscribir, repartoParaEscribir } from "./_datos"

describe("leerPorcentaje", () => {
  it.each([
    ["40", 40],
    ["33,33", 33.33],
    ["12.5", 12.5],
    ["0", 0],
    ["100", 100],
    [" 40 % ", 40],
  ])("%s → %s", (texto, valor) => {
    expect(leerPorcentaje(texto)).toEqual({ ok: true, valor })
  })

  it("vacío es sin configurar (null), no 0", () => {
    expect(leerPorcentaje("  ")).toEqual({ ok: true, valor: null })
  })

  it.each(["100,01", "101", "-5", "12,345", "abc", "1.000"])("%s no se adivina", (texto) => {
    expect(leerPorcentaje(texto).ok).toBe(false)
  })
})

describe("formatearPorcentaje", () => {
  it("con coma decimal y sin configurar", () => {
    expect(formatearPorcentaje(33.33)).toBe("33,33 %")
    expect(formatearPorcentaje(0)).toBe("0 %")
    expect(formatearPorcentaje(null)).toBe("Sin configurar")
  })

  it("para escribir, de vuelta a como se lee", () => {
    expect(porcentajeParaEscribir(33.33)).toBe("33,33")
    expect(porcentajeParaEscribir(null)).toBe("")
    expect(leerPorcentaje(porcentajeParaEscribir(12.5))).toEqual({ ok: true, valor: 12.5 })
  })
})

describe("leerReparto", () => {
  it("lee las tres partes en puntos base cuando suman 100 %", () => {
    expect(leerReparto({ odontologo: "40", clinica: "33,33", tecnico: "26.67" })).toEqual({
      ok: true,
      reparto: { pbOdontologo: 4000, pbClinica: 3333, pbTecnico: 2667 },
      sumaPb: 10000,
    })
  })

  it("dice cuánto suma hoy si no llega a 100 %", () => {
    const leido = leerReparto({ odontologo: "40", clinica: "30", tecnico: "25" })
    expect(leido).toEqual({ ok: false, error: "Hoy suma 95 %. Ajusta las partes hasta llegar a 100 % para guardar.", sumaPb: 9500 })
  })

  it("una parte vacía o mal escrita no se adivina", () => {
    expect(leerReparto({ odontologo: "40", clinica: "", tecnico: "60" })).toMatchObject({ ok: false, sumaPb: null })
    expect(leerReparto({ odontologo: "abc", clinica: "30", tecnico: "30" })).toMatchObject({ ok: false, sumaPb: null })
  })

  it("se escribe como se guardó", () => {
    expect(repartoParaEscribir({ pbOdontologo: 3500, pbClinica: 2050, pbTecnico: 4450 })).toEqual({
      odontologo: "35",
      clinica: "20,5",
      tecnico: "44,5",
    })
  })
})
