import { describe, it, expect } from "vitest"
import { calcularTotales, filasDelComprobante, motivoParaNoCerrar, type DetalleDeLiquidacion } from "./liquidacion"

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

describe("filasDelComprobante", () => {
  const detalle: DetalleDeLiquidacion = {
    id: "liq-1",
    memberId: "m-1",
    miembro: "Carla",
    periodo: "mensual",
    desde: "2026-11-01",
    hasta: "2026-11-30",
    texto: "1 al 30 nov 2026",
    estado: "cerrada",
    totalCents: 2_560_000,
    cerradaAt: "2026-11-04T15:00:00.000Z",
    pagadaAt: null,
    zona: "America/Santiago",
    totales: {
      comisionServiciosCents: 2_560_000,
      comisionProductosCents: 0,
      propinasCents: 0,
      adelantosCents: 0,
      ajustesCents: 0,
      brutoCents: 2_560_000,
      totalCents: 2_560_000,
    },
    cerradaPorNombre: "Ana",
    pagadaPorNombre: null,
    medioDePago: null,
    medioDePagoTexto: null,
    anuladaAt: null,
    anuladaPorNombre: null,
    motivoAnulacion: null,
    nota: null,
    lineas: [],
    propinas: [],
    movimientos: [],
  }
  const fila = (filas: (string | number | null)[][], concepto: string) => filas.find((f) => f[0] === concepto)

  it("cerrada: el total a pagar es el total", () => {
    const filas = filasDelComprobante(detalle)
    expect(fila(filas, "Total a pagar")).toEqual(["Total a pagar", 25_600])
    expect(fila(filas, "Total al cerrarse (anulada)")).toBeUndefined()
    expect(fila(filas, "Anulada por")).toBeUndefined()
  })

  it("anulada: dice que está anulada y el total a pagar queda en 0", () => {
    const filas = filasDelComprobante({
      ...detalle,
      estado: "anulada",
      anuladaAt: "2026-11-05T15:00:00.000Z",
      anuladaPorNombre: "Ana",
      motivoAnulacion: "Se cerró antes de tiempo",
    })
    expect(fila(filas, "Estado")).toEqual(["Estado", "Anulada"])
    expect(fila(filas, "Anulada por")).toEqual(["Anulada por", "Ana"])
    expect(fila(filas, "Motivo de la anulación")).toEqual(["Motivo de la anulación", "Se cerró antes de tiempo"])
    expect(fila(filas, "Total al cerrarse (anulada)")).toEqual(["Total al cerrarse (anulada)", 25_600])
    expect(fila(filas, "Total a pagar")).toEqual(["Total a pagar", 0])
  })
})
