import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { pedido } from "@/pruebas/datos"
import { CLINICA, conParams, sesionesDentales as sesiones } from "../clientes/_pruebas/clinica-dental"
import { abono, atencionCobrada, escenarioDeAbonos } from "../clientes/_pruebas/abonos"

/**
 * La parte de la odontóloga de los abonos de prótesis en su liquidación, en
 * Mi plata y en Comisiones (docs/PRODUCTO.md, "Prótesis"): sobre lo cobrado,
 * liberado al entregar. Un abono se libera el día más tardío entre su cobro y
 * la entrega, y entra en la liquidación del período que contiene ese día; lo
 * cobrado después de cerrar entra en la siguiente. No lleva la comisión de la
 * cascada ni cuenta como "sin %".
 */

const mockGetServerSession = vi.fn()
vi.mock("next-auth", () => ({ getServerSession: (...args: unknown[]) => mockGetServerSession(...args) }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const base = crearBaseFalsa()
vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

/** Martes 10 de noviembre de 2026, mediodía en Santiago. */
const AHORA = new Date("2026-11-10T15:00:00.000Z")
const URL = "http://localhost/api/liquidaciones"

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(AHORA)
  base.reiniciar(escenarioDeAbonos())
})

afterEach(() => vi.useRealTimers())

const enSesion = (sesion: unknown) => mockGetServerSession.mockResolvedValue(sesion)

async function vista(miembro = "m-perez") {
  const { GET } = await import("./vista-previa/route")
  return GET(pedido(`${URL}/vista-previa?miembro=${miembro}`))
}

/** Cierra como la pantalla: con el total que mostró la vista previa (0 si no respondió). */
async function cerrar(miembroId: string, desde: string) {
  const { POST } = await import("./route")
  const previa = await vista(miembroId)
  const totalEsperadoCents = previa.status === 200 ? (await previa.json()).totales.totalCents : 0
  return POST(pedido(URL, { miembroId, desde, totalEsperadoCents }))
}

async function detalle(id: string) {
  const { GET } = await import("./[id]/route")
  return GET(pedido(`${URL}/${id}`), conParams({ id }))
}

async function anular(id: string) {
  const { POST } = await import("./[id]/anulacion/route")
  return POST(pedido(`${URL}/${id}/anulacion`, { motivo: "Se cerró antes de tiempo" }), conParams({ id }))
}

const ids = (lista: { id: string }[]) => lista.map((item) => item.id).sort()
const lineaGuardada = (id: string) => base.buscar("visitService", { id })[0]

describe("la liquidación de la odontóloga: sus abonos de prótesis entregadas", () => {
  it("octubre lleva su servicio; el abono cobrado en octubre de una prótesis entregada en noviembre todavía no", async () => {
    enSesion(sesiones.dueña)
    const cuerpo = await (await vista()).json()

    expect(cuerpo.periodo).toMatchObject({ desde: "2026-10-01", hasta: "2026-10-31" })
    expect(ids(cuerpo.lineas)).toEqual(["l-servicio"])
    expect(cuerpo.protesis).toEqual([])
    expect(cuerpo.totales).toMatchObject({ comisionServiciosCents: 1_920_000, comisionProtesisCents: 0, totalCents: 1_920_000 })
    // El abono no es una línea "sin %": no frena el cierre.
    expect(cuerpo.sinPorcentaje).toBe(0)
    expect(cuerpo.noSePuedeCerrar).toBeNull()
  })

  it("noviembre libera lo cobrado antes de entregar (el día de la entrega) y lo cobrado después; lo no entregado y lo anulado, no", async () => {
    enSesion(sesiones.dueña)
    expect((await cerrar("m-perez", "2026-10-01")).status).toBe(201)

    const cuerpo = await (await vista()).json()

    expect(cuerpo.periodo).toMatchObject({ desde: "2026-11-01", hasta: "2026-11-30" })
    expect(cuerpo.lineas).toEqual([])
    expect(cuerpo.protesis).toEqual([
      {
        id: "ab-oct",
        visitId: "at-oct",
        protesisId: "pt-entregada",
        fecha: "2026-11-03",
        cobradoEl: "2026-10-20",
        entregadaEl: "2026-11-03",
        cliente: "Camila Rojas",
        detalle: "Abono prótesis · pt-entregada",
        abonoCents: 5_000_000,
        comisionCents: 2_000_000,
      },
      expect.objectContaining({ id: "ab-nov", fecha: "2026-11-05", cobradoEl: "2026-11-05", comisionCents: 1_200_000 }),
    ])
    expect(cuerpo.totales).toMatchObject({
      comisionServiciosCents: 0,
      comisionProtesisCents: 3_200_000,
      brutoCents: 3_200_000,
      totalCents: 3_200_000,
    })
  })

  it("al cerrar se marca la liquidación en cada abono, con su comisión por prótesis; anularla los suelta", async () => {
    enSesion(sesiones.dueña)
    await cerrar("m-perez", "2026-10-01")
    const res = await cerrar("m-perez", "2026-11-01")
    expect(res.status).toBe(201)
    const noviembre = { ...base.buscar("liquidacion", { desde: new Date("2026-11-01T00:00:00.000Z") })[0] } as { id: string } & Record<string, unknown>

    expect(noviembre).toMatchObject({ comisionProtesisCents: 3_200_000, comisionServiciosCents: 0, brutoCents: 3_200_000, totalCents: 3_200_000 })
    expect(lineaGuardada("ab-oct").liquidacionId).toBe(noviembre.id)
    expect(lineaGuardada("ab-nov").liquidacionId).toBe(noviembre.id)
    for (const id of ["ab-sin-entregar", "ab-anulada", "ab-duena", "ab-nunez"]) expect(lineaGuardada(id).liquidacionId).toBeNull()
    // El reparto congelado no se tocó.
    expect(lineaGuardada("ab-oct")).toMatchObject({ odontologoCents: 2_000_000, clinicaCents: 1_500_000, tecnicoCents: 1_500_000, commissionAt: null })

    expect((await anular(noviembre.id)).status).toBe(200)
    expect(lineaGuardada("ab-oct").liquidacionId).toBeNull()
    expect(lineaGuardada("ab-nov").liquidacionId).toBeNull()
    expect(ids((await (await vista()).json()).protesis)).toEqual(["ab-nov", "ab-oct"])
  })

  it("lo cobrado después del cierre entra en la siguiente", async () => {
    enSesion(sesiones.dueña)
    await cerrar("m-perez", "2026-10-01")
    await cerrar("m-perez", "2026-11-01")

    // El 2 de diciembre la paciente abona $20.000 más a la prótesis ya entregada.
    vi.setSystemTime(new Date("2026-12-03T15:00:00.000Z"))
    base.reiniciar({
      ...base.volcado(),
      visit: [...base.volcado().visit, atencionCobrada("at-dic", "2026-12-02T15:00:00.000Z")],
      visitService: [
        ...base.volcado().visitService,
        abono("ab-dic", "at-dic", "pt-entregada", { memberId: "m-perez", byOwner: false, professionalName: "Diego Pérez" }, [800_000, 600_000, 600_000]),
      ],
    })

    const cuerpo = await (await vista()).json()
    expect(cuerpo.periodo).toMatchObject({ desde: "2026-12-01", hasta: "2026-12-31" })
    expect(ids(cuerpo.protesis)).toEqual(["ab-dic"])
    expect(cuerpo.totales.comisionProtesisCents).toBe(800_000)
  })

  it("entregar la prótesis libera lo que ya se había cobrado: entra en la liquidación del período de la entrega", async () => {
    enSesion(sesiones.dueña)
    await cerrar("m-perez", "2026-10-01")
    expect(ids((await (await vista()).json()).protesis)).toEqual(["ab-nov", "ab-oct"])

    const { PATCH } = await import("../clientes/[id]/protesis/[protesisId]/route")
    const entregada = await PATCH(
      pedido("http://localhost/api/clientes/p-camila/protesis/pt-removible", { estado: "entregada" }),
      conParams({ id: "p-camila", protesisId: "pt-removible" })
    )
    expect(entregada.status).toBe(200)

    const cuerpo = await (await vista()).json()
    expect(cuerpo.protesis.find((a: { id: string }) => a.id === "ab-sin-entregar")).toMatchObject({
      fecha: "2026-11-10",
      cobradoEl: "2026-10-21",
      entregadaEl: "2026-11-10",
      comisionCents: 800_000,
    })
    expect(cuerpo.totales.comisionProtesisCents).toBe(4_000_000)
  })

  it("si la tratante es la dueña, su abono no entra a ninguna liquidación", async () => {
    enSesion(sesiones.dueña)
    await cerrar("m-perez", "2026-10-01")
    const perez = await (await vista("m-perez")).json()
    const nunez = await (await vista("m-nunez")).json()
    expect([...perez.protesis, ...nunez.protesis].map((a: { id: string }) => a.id)).not.toContain("ab-duena")
    expect(ids(nunez.protesis)).toEqual(["ab-nunez"])
    expect(nunez.totales.comisionProtesisCents).toBe(1_015_000)
  })

  it("una atención con un abono ya liquidado no se anula: 409, corrígelo con un ajuste", async () => {
    enSesion(sesiones.dueña)
    await cerrar("m-perez", "2026-10-01")
    await cerrar("m-perez", "2026-11-01")
    const { POST } = await import("../atenciones/[id]/anulacion/route")
    const res = await POST(pedido("http://localhost/api/atenciones/at-oct/anulacion", { motivo: "Error" }), conParams({ id: "at-oct" }))
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ codigo: "corregir-con-ajuste" })
    expect(base.buscar("visit", { id: "at-oct" })[0].status).toBe("finalizada")
  })

  it("el detalle, el comprobante y el CSV muestran los abonos; la odontóloga ve los suyos y no los de otra", async () => {
    enSesion(sesiones.dueña)
    await cerrar("m-perez", "2026-10-01")
    await cerrar("m-perez", "2026-11-01")
    const noviembre = { ...base.buscar("liquidacion", { desde: new Date("2026-11-01T00:00:00.000Z") })[0] } as { id: string } & Record<string, unknown>

    enSesion(sesiones.perez)
    const suyo = await (await detalle(noviembre.id)).json()
    expect(ids(suyo.protesis)).toEqual(["ab-nov", "ab-oct"])
    expect(suyo.lineas).toEqual([])
    expect(suyo.totales).toMatchObject({ comisionProtesisCents: 3_200_000, totalCents: 3_200_000 })
    expect(suyo.protesis.find((a: { id: string }) => a.id === "ab-oct")).toMatchObject({ fecha: "2026-11-03", cobradoEl: "2026-10-20", comisionCents: 2_000_000 })

    const { GET: csv } = await import("./[id]/comprobante/route")
    const texto = await (await csv(pedido(`${URL}/${noviembre.id}/comprobante`), conParams({ id: noviembre.id }))).text()
    expect(texto).toMatch(/Parte de la odontóloga/)
    expect(texto).toMatch(/Comisión por prótesis[;,]"?32000/)

    enSesion(sesiones.nunez)
    expect((await detalle(noviembre.id)).status).toBe(404)
    const { GET: lista } = await import("./route")
    expect(await (await lista(pedido(URL))).json()).toEqual([])
  })

  it("la dueña de otra clínica no ve ni liquida nada de ésta", async () => {
    enSesion(sesiones.dueñaAjena)
    expect((await vista("m-perez")).status).toBe(404)
    expect((await cerrar("m-perez", "2026-10-01")).status).toBe(404)
    expect(base.buscar("liquidacion")).toEqual([])
  })
})

describe("Mi plata de la odontóloga", () => {
  async function miPlata(sesion: unknown) {
    const { GET } = await import("../mi-plata/route")
    mockGetServerSession.mockResolvedValueOnce(sesion)
    return (await GET()).json()
  }

  it("su parte liberada cuenta el día en que se liberó; lo cobrado sin entregar, aparte como por liberar", async () => {
    const plata = await miPlata(sesiones.perez)

    expect(plata.periodo).toMatchObject({ desde: "2026-11-01", hasta: "2026-11-30", comisionesCents: 0, protesisCents: 3_200_000, totalCents: 3_200_000 })
    expect(plata.hoy).toMatchObject({ protesisCents: 0, totalCents: 0 })
    expect(plata.protesisPorLiberar).toEqual({ totalCents: 800_000, abonos: 1 })
    // Los abonos no esperan %.
    expect(plata.esperanPorcentaje).toBe(0)
  })

  it("el día y la semana del cobro y de la entrega", async () => {
    vi.setSystemTime(new Date("2026-11-05T20:00:00.000Z"))
    const plata = await miPlata(sesiones.perez)
    expect(plata.hoy).toMatchObject({ fecha: "2026-11-05", protesisCents: 1_200_000 })
    expect(plata.semana).toMatchObject({ desde: "2026-11-02", protesisCents: 3_200_000 })
  })

  it("lo cobrado antes de 'Liquidar desde' no cuenta como liberado aunque se entregue después (decisión 2)", async () => {
    // Liquida desde el 1 de noviembre: el abono del 20 de octubre (2.000.000 de su parte) ya se pagó por fuera.
    base.reiniciar({
      ...escenarioDeAbonos(),
      business: escenarioDeAbonos().business.map((negocio) =>
        negocio.id === CLINICA ? { ...negocio, liquidacionDesde: new Date("2026-11-01T00:00:00.000Z") } : negocio
      ),
    })
    const plata = await miPlata(sesiones.perez)
    expect(plata.periodo).toMatchObject({ protesisCents: 1_200_000, totalCents: 1_200_000 })
    // Lo mismo que liquidaría: la vista previa de noviembre tampoco lo trae.
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)
    const previa = await (await vista("m-perez")).json()
    expect(previa.totales.comisionProtesisCents).toBe(1_200_000)
  })

  it("Núñez ve sólo lo suyo; nada de Pérez ni de la dueña", async () => {
    const plata = await miPlata(sesiones.nunez)
    expect(plata.periodo.protesisCents).toBe(1_015_000)
    expect(plata.protesisPorLiberar).toEqual({ totalCents: 0, abonos: 0 })
  })
})

describe("Comisiones: los abonos no cuentan como pendientes de %", () => {
  it("nadie tiene % configurado y los abonos tienen la comisión en null: igual no son pendientes", async () => {
    const { GET } = await import("../comisiones/route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)
    const cuerpo = await (await GET()).json()
    const pendientes = Object.fromEntries(cuerpo.miembros.map((m: { id: string; pendientes: number }) => [m.id, m.pendientes]))
    expect(pendientes).toMatchObject({ "m-perez": 0, "m-nunez": 0 })
  })
})

describe("Reportes: el abono es plata que entró", () => {
  it("suma a los ingresos del día", async () => {
    base.reiniciar({
      ...escenarioDeAbonos(),
      visit: escenarioDeAbonos().visit.map((v) => (v.id === "at-nov" ? { ...v, totalCents: 3_000_000 } : v)),
      visitPayment: [{ id: "pg-nov", visitId: "at-nov", method: "efectivo", amountCents: 3_000_000 }],
    })
    const { GET } = await import("../reportes/route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)
    const res = await GET(pedido("http://localhost/api/reportes?desde=2026-11-05T03:00:00.000Z&hasta=2026-11-05T19:00:00.000Z&zona=America/Santiago"))
    const cuerpo = await res.json()
    expect(cuerpo.resumen.ingresos).toBe(30_000)
    expect(cuerpo.resumen.porMedio).toEqual([{ medio: "efectivo", nombre: "Efectivo", monto: 30_000 }])
    expect(CLINICA).toBe("clinica-aurora")
  })
})
