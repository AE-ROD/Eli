import { describe, it, expect } from "vitest"
import { calcularTotales, motivoParaNoCerrar } from "./liquidacion"

describe("calcularTotales", () => {
  it("bruto = comisiones + propinas; total = bruto − adelantos y vales + ajustes; lo excluido no cuenta", () => {
    const totales = calcularTotales(
      [
        { tipo: "servicio", comisionCents: 599600 },
        { tipo: "servicio", comisionCents: null },
        { tipo: "producto", comisionCents: 1200 },
      ],
      [{ montoCents: 2000 }],
      [
        { tipo: "adelanto", montoCents: 5000, incluido: true },
        { tipo: "vale", montoCents: 300, incluido: true },
        { tipo: "vale", montoCents: 999, incluido: false },
        { tipo: "ajuste", montoCents: -700, incluido: true },
      ]
    )
    expect(totales).toEqual({
      comisionServiciosCents: 599600,
      comisionProductosCents: 1200,
      propinasCents: 2000,
      adelantosCents: 5300,
      ajustesCents: -700,
      brutoCents: 602800,
      totalCents: 602800 - 5300 - 700,
    })
  })
})

describe("motivoParaNoCerrar", () => {
  const totales = calcularTotales([], [], [])

  it("sin problemas, null; total 0 se puede cerrar", () => {
    expect(motivoParaNoCerrar({ sinPorcentaje: 0, desde: "2026-10-01", hoy: "2026-11-03", totales })).toBeNull()
  })

  it("en orden: período futuro, líneas sin %, tope, total negativo", () => {
    expect(motivoParaNoCerrar({ sinPorcentaje: 2, desde: "2026-12-01", hoy: "2026-11-03", totales })).toMatch(/todavía no empieza/)
    expect(motivoParaNoCerrar({ sinPorcentaje: 2, desde: "2026-10-01", hoy: "2026-11-03", totales })).toMatch(/2 servicios sin porcentaje/)
    expect(
      motivoParaNoCerrar({ sinPorcentaje: 0, desde: "2026-10-01", hoy: "2026-11-03", totales: { ...totales, brutoCents: 2_000_000_001 } })
    ).toMatch(/tope/)
    expect(
      motivoParaNoCerrar({ sinPorcentaje: 0, desde: "2026-10-01", hoy: "2026-11-03", totales: { ...totales, totalCents: -1 } })
    ).toMatch(/negativo/)
  })
})
