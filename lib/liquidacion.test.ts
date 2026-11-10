import { describe, it, expect } from "vitest"
import { Prisma } from "@prisma/client"
import {
  calcularTotales,
  enPesos,
  filasDelComprobante,
  liberadoEl,
  motivoParaNoCerrar,
  respuestaDeErrorDePlata,
  type DetalleDeLiquidacion,
} from "./liquidacion"

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
      comisionProtesisCents: 0,
      propinasCents: 2000,
      adelantosCents: 5300,
      ajustesCents: -700,
      brutoCents: 602800,
      totalCents: 602800 - 5300 - 700,
    })
  })

  it("la parte de la odontóloga de los abonos de prótesis suma al bruto, aparte de servicios y productos", () => {
    const totales = calcularTotales([{ tipo: "servicio", comisionCents: 1000 }], [], [], [{ comisionCents: 720_000 }, { comisionCents: 1 }])
    expect(totales).toMatchObject({ comisionServiciosCents: 1000, comisionProtesisCents: 720_001, brutoCents: 721_001, totalCents: 721_001 })
  })
})

describe("liberadoEl", () => {
  const antes = new Date("2026-10-20T15:00:00.000Z")
  const despues = new Date("2026-11-03T15:00:00.000Z")

  it("cobrado antes de entregar: se libera al entregar; cobrado después: al cobrarse", () => {
    expect(liberadoEl(antes, despues)).toEqual(despues)
    expect(liberadoEl(despues, antes)).toEqual(despues)
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
      comisionProtesisCents: 0,
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
    protesis: [],
    propinas: [],
    movimientos: [],
  }
  const fila = (filas: (string | number | null)[][], concepto: string) => filas.find((f) => f[0] === concepto)

  it("cerrada: el total a pagar es el total", () => {
    const filas = filasDelComprobante(detalle)
    expect(fila(filas, "Total a pagar")).toEqual(["Total a pagar", 25_600])
    expect(fila(filas, "Total al cerrarse (anulada)")).toBeUndefined()
    expect(fila(filas, "Anulada por")).toBeUndefined()
    // Sin prótesis, el comprobante es el de siempre: no hay sección ni fila de prótesis.
    expect(fila(filas, "Comisión por prótesis")).toBeUndefined()
    expect(fila(filas, "Liberado el")).toBeUndefined()
  })

  it("con abonos de prótesis: su sección con cobro y entrega, y la comisión por prótesis en los totales", () => {
    const filas = filasDelComprobante({
      ...detalle,
      totales: { ...detalle.totales, comisionProtesisCents: 720_000, brutoCents: 3_280_000, totalCents: 3_280_000 },
      protesis: [
        {
          id: "ab-1",
          visitId: "at-1",
          protesisId: "pt-1",
          fecha: "2026-11-03",
          cobradoEl: "2026-10-20",
          entregadaEl: "2026-11-03",
          cliente: "Camila Rojas",
          detalle: "Abono prótesis · Removible parcial · Acrílico (45, 46, 47)",
          abonoCents: 1_800_000,
          comisionCents: 720_000,
        },
      ],
    })
    expect(fila(filas, "Liberado el")).toEqual(["Liberado el", "Cliente", "Prótesis", "Cobrado el", "Entregada el", "Abono", "Parte de la odontóloga"])
    expect(fila(filas, "2026-11-03")).toEqual([
      "2026-11-03",
      "Camila Rojas",
      "Abono prótesis · Removible parcial · Acrílico (45, 46, 47)",
      "2026-10-20",
      "2026-11-03",
      18_000,
      7_200,
    ])
    expect(fila(filas, "Comisión por prótesis")).toEqual(["Comisión por prótesis", 7_200])
    expect(fila(filas, "Total a pagar")).toEqual(["Total a pagar", 32_800])
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

describe("enPesos (CSV del comprobante)", () => {
  it("entero como número; con centavos, siempre dos decimales con coma", () => {
    expect(enPesos(1_000_000)).toBe(10000)
    expect(enPesos(1990)).toBe("19,90")
    expect(enPesos(1905)).toBe("19,05")
    expect(enPesos(-1990)).toBe("-19,90")
    expect(enPesos(1)).toBe("0,01")
  })
})

describe("respuestaDeErrorDePlata", () => {
  const conocido = (code: string) => new Prisma.PrismaClientKnownRequestError("x", { code, clientVersion: "prueba" })

  it("lo que ya no existe (P2025) es 404 y una referencia perdida (P2003) es 409, no 500", async () => {
    const noExiste = respuestaDeErrorDePlata(conocido("P2025"), "prueba")
    expect(noExiste.status).toBe(404)
    expect((await noExiste.json()).error).toMatch(/vuelve a cargar/)
    expect(respuestaDeErrorDePlata(conocido("P2003"), "prueba").status).toBe(409)
    expect(respuestaDeErrorDePlata(conocido("P2002"), "prueba").status).toBe(409)
  })
})
