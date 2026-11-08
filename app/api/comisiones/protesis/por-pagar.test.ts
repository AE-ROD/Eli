import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { pedido } from "@/pruebas/datos"
import { conParams, sesionesDentales as sesiones } from "../../clientes/_pruebas/clinica-dental"
import { ENTREGADA_EL, escenarioDeAbonos } from "../../clientes/_pruebas/abonos"

/**
 * "Por pagar al laboratorio" (sólo la dueña): la parte del técnico de los
 * abonos cobrados de prótesis entregadas, por laboratorio; "Marcar pagado"
 * (líneas o todo lo pendiente de un laboratorio) y anular un pago, que suelta
 * sus líneas. Una atención con un abono pagado al laboratorio no se anula.
 */

const mockGetServerSession = vi.fn()
vi.mock("next-auth", () => ({ getServerSession: (...args: unknown[]) => mockGetServerSession(...args) }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const base = crearBaseFalsa()
vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

const AHORA = new Date("2026-11-10T15:00:00.000Z")
const URL = "http://localhost/api/comisiones/protesis"

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(AHORA)
  base.reiniciar(escenarioDeAbonos())
})

afterEach(() => vi.useRealTimers())

async function porPagar(sesion: unknown) {
  const { GET } = await import("./por-pagar/route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  return GET()
}

async function pagar(sesion: unknown, cuerpo: unknown) {
  const { POST } = await import("./pagos-al-laboratorio/route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  return POST(pedido(`${URL}/pagos-al-laboratorio`, cuerpo))
}

async function pagos(sesion: unknown, laboratorio = "") {
  const { GET } = await import("./pagos-al-laboratorio/route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  return GET(pedido(`${URL}/pagos-al-laboratorio${laboratorio ? `?laboratorio=${laboratorio}` : ""}`))
}

async function anularPago(sesion: unknown, id: string) {
  const { POST } = await import("./pagos-al-laboratorio/[id]/anulacion/route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  return POST(pedido(`${URL}/pagos-al-laboratorio/${id}/anulacion`), conParams({ id }))
}

const pagoDe = (lineaId: string) => base.buscar("visitService", { id: lineaId })[0].pagoAlLaboratorioId

describe("GET /api/comisiones/protesis/por-pagar", () => {
  it("la parte del técnico de lo cobrado y entregado, sin pagar, por laboratorio; ni lo sin entregar, ni lo anulado, ni lo ajeno", async () => {
    const res = await porPagar(sesiones.dueña)

    expect(res.status).toBe(200)
    const cuerpo = await res.json()
    expect(cuerpo.totalCents).toBe(1_500_000 + 900_000 + 300_000 + 1_305_000)
    expect(cuerpo.laboratorios.map((g: { laboratorio: { nombre: string }; totalCents: number }) => [g.laboratorio.nombre, g.totalCents])).toEqual([
      ["Laboratorio Norte", 1_305_000],
      ["Laboratorio Sur", 2_700_000],
    ])
    const sur = cuerpo.laboratorios[1]
    expect(sur.laboratorio).toEqual({ id: "lab-sur", nombre: "Laboratorio Sur", activo: true })
    // También la de la dueña tratante: al laboratorio se le paga igual.
    expect(sur.lineas.map((l: { id: string }) => l.id)).toEqual(["ab-duena", "ab-nov", "ab-oct"])
    expect(sur.lineas[2]).toEqual({
      id: "ab-oct",
      visitId: "at-oct",
      protesisId: "pt-entregada",
      paciente: "Camila Rojas",
      detalle: "Abono prótesis · pt-entregada",
      cobradoEn: "2026-10-20T15:00:00.000Z",
      entregadaEn: ENTREGADA_EL.toISOString(),
      abonoCents: 5_000_000,
      tecnicoCents: 1_500_000,
    })
  })

  it.each([
    ["sin sesión", null, 401],
    ["el encargado", sesiones.encargado, 401],
    ["un odontólogo", sesiones.perez, 401],
    ["un salón", sesiones.salon, 404],
    ["una sesión sin rubro", sesiones.sinRubro, 404],
  ])("%s: %s", async (_caso, sesion, status) => {
    expect((await porPagar(sesion)).status).toBe(status)
  })

  it("la dueña de otra clínica ve lo suyo y nada de ésta", async () => {
    const cuerpo = await (await porPagar(sesiones.dueñaAjena)).json()
    expect(cuerpo.laboratorios.map((g: { laboratorio: { id: string } }) => g.laboratorio.id)).toEqual(["lab-ajeno"])
    expect(cuerpo.laboratorios[0].lineas.map((l: { id: string }) => l.id)).toEqual(["ab-ajeno"])
  })
})

describe("POST /api/comisiones/protesis/pagos-al-laboratorio", () => {
  it("marca pagadas las líneas pedidas: el monto lo suma el servidor, con medio, quién y cuándo", async () => {
    const res = await pagar(sesiones.dueña, { laboratorioId: "lab-sur", medio: "transferencia", lineas: ["ab-oct"], montoCents: 1 })

    expect(res.status).toBe(201)
    const pago = await res.json()
    expect(pago).toMatchObject({
      laboratorio: { id: "lab-sur", nombre: "Laboratorio Sur" },
      montoCents: 1_500_000,
      medio: "transferencia",
      nombreMedio: "Transferencia",
      pagadoEn: AHORA.toISOString(),
      pagadoPorNombre: "Valentina Soto",
      anuladoEn: null,
      lineas: 1,
    })
    expect(pagoDe("ab-oct")).toBe(pago.id)
    const sur = (await (await porPagar(sesiones.dueña)).json()).laboratorios.find((g: { laboratorio: { id: string } }) => g.laboratorio.id === "lab-sur")
    expect(sur.lineas.map((l: { id: string }) => l.id)).toEqual(["ab-duena", "ab-nov"])
    // Bajo el candado del laboratorio y con las atenciones trabadas.
    const candados = base.prisma.$queryRaw.mock.calls.map(([partes]) => (partes as TemplateStringsArray).join("?"))
    expect(candados.some((sql) => sql.includes("FROM laboratorios") && sql.includes("FOR UPDATE"))).toBe(true)
    expect(candados.some((sql) => sql.includes("FROM atenciones") && sql.includes("FOR UPDATE"))).toBe(true)
  })

  it("todo lo pendiente de un laboratorio, de una vez", async () => {
    const pago = await (await pagar(sesiones.dueña, { laboratorioId: "lab-sur", medio: "efectivo", todo: true })).json()
    expect(pago).toMatchObject({ montoCents: 2_700_000, lineas: 3 })
    for (const id of ["ab-oct", "ab-nov", "ab-duena"]) expect(pagoDe(id)).toBe(pago.id)
    for (const id of ["ab-nunez", "ab-sin-entregar", "ab-anulada", "ab-ajeno"]) expect(pagoDe(id)).toBeNull()
    // Ya no queda nada para ese laboratorio.
    expect((await pagar(sesiones.dueña, { laboratorioId: "lab-sur", medio: "efectivo", todo: true })).status).toBe(409)
  })

  it.each([
    ["de otro laboratorio", ["ab-nunez"], 409],
    ["de una prótesis sin entregar", ["ab-sin-entregar"], 409],
    ["de una atención anulada", ["ab-anulada"], 409],
    ["una buena y una de otro laboratorio", ["ab-oct", "ab-nunez"], 409],
    ["de otra clínica", ["ab-ajeno"], 404],
    ["que no existe", ["ab-no-existe"], 404],
    ["una línea que no es un abono", ["l-servicio"], 404],
  ])("una línea %s: %s y nada se paga", async (_caso, lineas, status) => {
    const antes = base.volcado()
    expect((await pagar(sesiones.dueña, { laboratorioId: "lab-sur", medio: "efectivo", lineas })).status).toBe(status)
    expect(base.volcado()).toEqual(antes)
  })

  it("una línea ya pagada: 409", async () => {
    await pagar(sesiones.dueña, { laboratorioId: "lab-sur", medio: "efectivo", lineas: ["ab-oct"] })
    expect((await pagar(sesiones.dueña, { laboratorioId: "lab-sur", medio: "efectivo", lineas: ["ab-oct"] })).status).toBe(409)
    expect(base.buscar("pagoAlLaboratorio")).toHaveLength(1)
  })

  it("un laboratorio de otra clínica: 404; uno sin nada por pagar: 409", async () => {
    expect((await pagar(sesiones.dueña, { laboratorioId: "lab-ajeno", medio: "efectivo", todo: true })).status).toBe(404)
    expect((await pagar(sesiones.dueña, { laboratorioId: "lab-viejo", medio: "efectivo", todo: true })).status).toBe(409)
    expect(base.buscar("pagoAlLaboratorio")).toEqual([])
  })

  it.each([
    ["un medio que no existe", { laboratorioId: "lab-sur", medio: "cheque", todo: true }],
    ["líneas y todo a la vez", { laboratorioId: "lab-sur", medio: "efectivo", todo: true, lineas: ["ab-oct"] }],
    ["ni líneas ni todo", { laboratorioId: "lab-sur", medio: "efectivo" }],
    ["una lista vacía", { laboratorioId: "lab-sur", medio: "efectivo", lineas: [] }],
  ])("%s: 400", async (_caso, cuerpo) => {
    expect((await pagar(sesiones.dueña, cuerpo)).status).toBe(400)
    expect(base.buscar("pagoAlLaboratorio")).toEqual([])
  })

  it.each([
    ["el encargado", sesiones.encargado, 401],
    ["un odontólogo", sesiones.perez, 401],
    ["la dueña de otra clínica", sesiones.dueñaAjena, 404],
    ["un salón", sesiones.salon, 404],
  ])("%s: %s y nada se paga", async (_caso, sesion, status) => {
    const res = await pagar(sesion, { laboratorioId: "lab-sur", medio: "efectivo", todo: true })
    expect(res.status).toBe(status)
    expect(base.buscar("pagoAlLaboratorio")).toEqual([])
  })

  it("si anulan una de las atenciones a mitad del pago: 409 y no queda pago ni línea pagada", async () => {
    const crear = base.prisma.pagoAlLaboratorio.create.getMockImplementation()!
    base.prisma.pagoAlLaboratorio.create.mockImplementationOnce(async (args) => {
      await base.prisma.visit.updateMany({ where: { id: "at-nov" }, data: { status: "anulada" } })
      return crear(args)
    })
    expect((await pagar(sesiones.dueña, { laboratorioId: "lab-sur", medio: "efectivo", todo: true })).status).toBe(409)
    expect(base.buscar("pagoAlLaboratorio")).toEqual([])
    expect(base.buscar("visitService").filter((l) => l.pagoAlLaboratorioId)).toEqual([])
  })
})

describe("pagos al laboratorio: historial y anulación", () => {
  it("anular un pago suelta sus líneas, que vuelven a estar por pagar; queda en el historial; dos veces, 409", async () => {
    const pago = await (await pagar(sesiones.dueña, { laboratorioId: "lab-sur", medio: "efectivo", todo: true })).json()

    const res = await anularPago(sesiones.dueña, pago.id)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ id: pago.id, anuladoEn: AHORA.toISOString(), anuladoPorNombre: "Valentina Soto", lineas: 0 })
    for (const id of ["ab-oct", "ab-nov", "ab-duena"]) expect(pagoDe(id)).toBeNull()
    expect((await (await porPagar(sesiones.dueña)).json()).totalCents).toBe(4_005_000)

    const historial = await (await pagos(sesiones.dueña, "lab-sur")).json()
    expect(historial).toEqual([expect.objectContaining({ id: pago.id, montoCents: 2_700_000, anuladoPorNombre: "Valentina Soto" })])
    expect(await (await pagos(sesiones.dueña, "lab-norte")).json()).toEqual([])

    expect((await anularPago(sesiones.dueña, pago.id)).status).toBe(409)
  })

  it("anular: ajeno 404; encargado u odontólogo 401; nada cambia", async () => {
    const pago = await (await pagar(sesiones.dueña, { laboratorioId: "lab-sur", medio: "efectivo", lineas: ["ab-oct"] })).json()
    expect((await anularPago(sesiones.dueñaAjena, pago.id)).status).toBe(404)
    expect((await anularPago(sesiones.encargado, pago.id)).status).toBe(401)
    expect((await anularPago(sesiones.perez, pago.id)).status).toBe(401)
    expect((await anularPago(sesiones.dueña, "pago-que-no-existe")).status).toBe(404)
    expect(pagoDe("ab-oct")).toBe(pago.id)
    expect((await pagos(sesiones.dueñaAjena)).status).toBe(200)
    expect(await (await pagos(sesiones.dueñaAjena)).json()).toEqual([])
  })

  it("una atención con un abono pagado al laboratorio no se anula hasta anular el pago", async () => {
    const pago = await (await pagar(sesiones.dueña, { laboratorioId: "lab-sur", medio: "efectivo", lineas: ["ab-nov"] })).json()
    const { POST } = await import("../../atenciones/[id]/anulacion/route")
    const anularAtencion = async () => {
      mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)
      return POST(pedido("http://localhost/api/atenciones/at-nov/anulacion", { motivo: "Error" }), conParams({ id: "at-nov" }))
    }

    const bloqueada = await anularAtencion()
    expect(bloqueada.status).toBe(409)
    const cuerpo = await bloqueada.json()
    expect(cuerpo.error).toMatch(/laboratorio/)
    expect(cuerpo.codigo).toBeUndefined()
    expect(base.buscar("visit", { id: "at-nov" })[0].status).toBe("finalizada")

    await anularPago(sesiones.dueña, pago.id)
    expect((await anularAtencion()).status).toBe(200)
    // Anulada, ya no se le debe nada al laboratorio por ese abono.
    const sur = (await (await porPagar(sesiones.dueña)).json()).laboratorios.find((g: { laboratorio: { id: string } }) => g.laboratorio.id === "lab-sur")
    expect(sur.lineas.map((l: { id: string }) => l.id)).toEqual(["ab-duena", "ab-oct"])
  })
})
