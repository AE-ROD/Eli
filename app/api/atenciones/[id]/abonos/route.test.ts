import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { pedido } from "@/pruebas/datos"
import { MENSAJE_CON_ABONOS } from "@/lib/edicion-de-protesis"
import type { Actor } from "@/lib/permisos"
import { CLINICA, OTRA_CLINICA, SALON, conParams, sesionesDentales as sesiones } from "../../../clientes/_pruebas/clinica-dental"
import { escenarioDeProtesis, protesis } from "../../../clientes/_pruebas/protesis"

/**
 * Los abonos de prótesis en la Sala de espera: agregarlos a una atención
 * (con el saldo de la prótesis), quitarlos, y lo que pasa al cobrar: el
 * reparto en tres partes se congela al centavo y la línea no lleva la
 * comisión de la cascada.
 */

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const base = crearBaseFalsa()

vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

const AHORA = new Date("2026-11-08T15:00:00.000Z")

type Registro = Record<string, unknown>

const atencion = (id: string, datos: Registro = {}): Registro => ({
  id,
  businessId: CLINICA,
  customerId: "p-camila",
  customerName: "Camila Rojas",
  status: "en-atencion",
  arrivedAt: new Date("2026-11-08T14:00:00.000Z"),
  ...datos,
})

const lineaDePerez = (id: string, visitId: string, datos: Registro = {}): Registro => ({
  id,
  visitId,
  serviceId: "s-resina",
  serviceName: "Restauración resina compuesta",
  memberId: "m-perez",
  byOwner: false,
  professionalName: "Diego Pérez",
  priceCents: 4_800_000,
  ...datos,
})

const abonoGuardado = (id: string, visitId: string, protesisId: string, priceCents: number, datos: Registro = {}): Registro => ({
  id,
  visitId,
  serviceId: null,
  serviceName: "Abono prótesis",
  memberId: "m-perez",
  byOwner: false,
  professionalName: "Diego Pérez",
  priceCents,
  protesisId,
  ...datos,
})

function escenario() {
  const datos = escenarioDeProtesis()
  return {
    ...datos,
    customer: [...datos.customer],
    protesis: [
      ...datos.protesis,
      protesis("pt-de-la-duena", { memberId: null, byOwner: true, tratanteNombre: "Valentina Soto" }),
      protesis("pt-anulada", { estado: "anulada", anuladaEn: new Date("2026-11-05T15:00:00.000Z"), anuladaPorNombre: "Valentina Soto" }),
      protesis("pt-sin-tratante", { memberId: null, byOwner: false, tratanteNombre: "Ex odontóloga" }),
    ],
    visit: [
      atencion("at-abierta"),
      atencion("at-por-cobrar", { status: "por-cobrar" }),
      atencion("at-cobrada", { status: "finalizada", paidAt: new Date("2026-11-07T15:00:00.000Z"), totalCents: 4_800_000 }),
      atencion("at-anulada", { status: "anulada", voidedAt: new Date("2026-11-07T16:00:00.000Z") }),
      atencion("at-beto", { customerId: "p-beto", customerName: "Beto Fuentes" }),
      atencion("at-sin-cliente", { customerId: null, customerName: "Turno 3" }),
      atencion("at-ajena", { businessId: OTRA_CLINICA, customerId: "p-ajena" }),
      atencion("at-salon", { businessId: SALON, customerId: "p-salon" }),
    ],
    visitService: [
      lineaDePerez("l-resina", "at-abierta"),
      lineaDePerez("l-resina-cobrada", "at-cobrada"),
      lineaDePerez("l-por-cobrar", "at-por-cobrar"),
      lineaDePerez("l-beto", "at-beto"),
      lineaDePerez("l-salon", "at-salon", { serviceId: null, memberId: null, byOwner: true }),
    ],
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(AHORA)
  base.reiniciar(escenario())
})

afterEach(() => vi.useRealTimers())

const URL = "http://localhost/api/atenciones/x/abonos"

async function abonar(sesion: unknown, visitId: string, cuerpo: unknown) {
  const { POST } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  return POST(pedido(URL, cuerpo), conParams({ id: visitId }))
}

async function opciones(sesion: unknown, visitId: string) {
  const { GET } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  return GET(pedido(URL), conParams({ id: visitId }))
}

async function quitar(sesion: unknown, visitId: string, lineaId: string) {
  const { DELETE } = await import("./[lineaId]/route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  return DELETE(pedido(URL), conParams({ id: visitId, lineaId }))
}

async function cobrar(sesion: unknown, visitId: string, monto: number) {
  const { POST } = await import("../cobro/route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  return POST(pedido("http://localhost/api/atenciones/x/cobro", { pagos: [{ medio: "efectivo", monto }] }), conParams({ id: visitId }))
}

const abonosDe = (protesisId: string) => base.buscar("visitService", { protesisId })

/** Los módulos que leen la base se importan después de montar la base falsa. */
const mensajes = () => import("@/lib/abonos-de-protesis")

describe("GET /api/atenciones/[id]/abonos", () => {
  it("la caja ve las prótesis no anuladas del paciente con valor, pagado, por cobrar y saldo, sin el reparto", async () => {
    base.reiniciar({
      ...escenario(),
      visitService: [
        ...escenario().visitService,
        abonoGuardado("ab-cobrado", "at-cobrada", "pt-removible", 3_000_000),
        abonoGuardado("ab-abierto", "at-por-cobrar", "pt-removible", 2_000_000),
        abonoGuardado("ab-anulado", "at-anulada", "pt-removible", 9_000_000),
      ],
    })

    const res = await opciones(sesiones.encargado, "at-abierta")

    expect(res.status).toBe(200)
    const { protesis: lista } = await res.json()
    const removible = lista.find((p: { id: string }) => p.id === "pt-removible")
    expect(removible).toEqual({
      id: "pt-removible",
      nombre: "Removible parcial · Acrílico termocurado (45, 46, 47)",
      estado: "rodete",
      nombreDeEstado: "Prueba de rodete",
      tratante: "Diego Pérez",
      valor: 180_000,
      pagado: 30_000,
      porCobrar: 20_000,
      saldo: 130_000,
    })
    const ids = lista.map((p: { id: string }) => p.id)
    expect(ids).toContain("pt-corona")
    expect(ids).not.toContain("pt-anulada")
    expect(ids).not.toContain("pt-beto")
    expect(ids).not.toContain("pt-ajena")
    expect(JSON.stringify(lista)).not.toMatch(/pb|reparto|odontologo|tecnico/i)
  })

  it("una atención sin paciente no tiene prótesis que abonar", async () => {
    const res = await opciones(sesiones.dueña, "at-sin-cliente")
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ protesis: [] })
  })

  it.each([
    ["sin sesión", null, "at-abierta", 401],
    ["el odontólogo (no cobra)", sesiones.perez, "at-abierta", 401],
    ["la dueña de otra clínica", sesiones.dueñaAjena, "at-abierta", 404],
    ["un salón, con su propia atención", sesiones.salon, "at-salon", 404],
    ["una sesión sin rubro", sesiones.sinRubro, "at-abierta", 404],
  ])("%s: %s", async (_caso, sesion, visitId, status) => {
    expect((await opciones(sesion, visitId as string)).status).toBe(status)
  })
})

describe("POST /api/atenciones/[id]/abonos", () => {
  it("el encargado agrega un abono: una línea a nombre de la tratante, ligada a la prótesis, sin servicio ni comisión", async () => {
    const res = await abonar(sesiones.encargado, "at-abierta", { protesisId: "pt-removible", monto: 50_000 })

    expect(res.status).toBe(201)
    const [linea] = abonosDe("pt-removible")
    expect(linea).toMatchObject({
      visitId: "at-abierta",
      serviceId: null,
      productId: null,
      tipo: "servicio",
      serviceName: "Abono prótesis · Removible parcial · Acrílico termocurado (45, 46, 47)",
      memberId: "m-perez",
      byOwner: false,
      professionalName: "Diego Pérez",
      priceCents: 5_000_000,
      commissionAt: null,
      odontologoCents: null,
    })
    const cuerpo = await res.json()
    const delAbono = cuerpo.lineas.find((l: { id: string }) => l.id === linea.id)
    expect(delAbono).toMatchObject({ precio: 50_000, comision: { estado: "no-aplica" }, abono: { protesisId: "pt-removible", reparto: null } })
    expect(cuerpo.total).toBe(48_000 + 50_000)
    // Las demás líneas viajan como siempre: sin `abono`.
    expect(cuerpo.lineas.find((l: { id: string }) => l.id === "l-resina")).not.toHaveProperty("abono")
  })

  it("si la tratante es la dueña, la línea queda a nombre de la dueña", async () => {
    expect((await abonar(sesiones.dueña, "at-abierta", { protesisId: "pt-de-la-duena", monto: 10_000 })).status).toBe(201)
    expect(abonosDe("pt-de-la-duena")[0]).toMatchObject({ memberId: null, byOwner: true, professionalName: "Valentina Soto" })
  })

  it("el saldo cuenta lo cobrado y lo por cobrar en otras atenciones abiertas, no lo anulado: un centavo más es 409", async () => {
    base.reiniciar({
      ...escenario(),
      visitService: [
        ...escenario().visitService,
        abonoGuardado("ab-cobrado", "at-cobrada", "pt-removible", 10_000_000),
        abonoGuardado("ab-abierto", "at-por-cobrar", "pt-removible", 5_000_000),
        abonoGuardado("ab-anulado", "at-anulada", "pt-removible", 9_000_000),
      ],
    })
    const antes = base.volcado()

    const pasado = await abonar(sesiones.encargado, "at-abierta", { protesisId: "pt-removible", monto: 30_000.01 })
    expect(pasado.status).toBe(409)
    expect((await pasado.json()).error).toBe((await mensajes()).mensajeAbonoPasaElSaldo(3_000_000))
    expect(base.volcado()).toEqual(antes)

    expect((await abonar(sesiones.encargado, "at-abierta", { protesisId: "pt-removible", monto: 30_000 })).status).toBe(201)
    const otro = await abonar(sesiones.encargado, "at-abierta", { protesisId: "pt-removible", monto: 1 })
    expect(otro.status).toBe(409)
    expect((await otro.json()).error).toBe((await mensajes()).MENSAJE_PROTESIS_PAGADA)
  })

  it.each([
    ["cero", 0],
    ["negativo", -100],
    ["con tres decimales", 10.005],
    ["sobre el tope", 20_000_001],
  ])("un monto %s: 400 y nada escrito", async (_caso, monto) => {
    const antes = base.volcado()
    expect((await abonar(sesiones.dueña, "at-abierta", { protesisId: "pt-removible", monto })).status).toBe(400)
    expect(base.volcado()).toEqual(antes)
  })

  it("sin prótesis o con un monto que no es número: 400", async () => {
    expect((await abonar(sesiones.dueña, "at-abierta", { monto: 100 })).status).toBe(400)
    expect((await abonar(sesiones.dueña, "at-abierta", { protesisId: "pt-removible", monto: "100" })).status).toBe(400)
  })

  it.each([
    ["de otro paciente de la clínica", "at-abierta", "pt-beto"],
    ["de otra clínica", "at-abierta", "pt-ajena"],
    ["que no existe", "at-abierta", "pt-no-existe"],
    ["a una atención sin paciente", "at-sin-cliente", "pt-removible"],
  ])("una prótesis %s: 404 y nada escrito", async (_caso, visitId, protesisId) => {
    const antes = base.volcado()
    const res = await abonar(sesiones.dueña, visitId, { protesisId, monto: 1_000 })
    expect(res.status).toBe(404)
    expect((await res.json()).error).toBe("Prótesis no encontrada")
    expect(base.volcado()).toEqual(antes)
  })

  it("una prótesis anulada no recibe abonos: 409", async () => {
    const res = await abonar(sesiones.dueña, "at-abierta", { protesisId: "pt-anulada", monto: 1_000 })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe((await mensajes()).MENSAJE_PROTESIS_ANULADA_SIN_ABONOS)
  })

  it("una prótesis cuya tratante ya no está en el equipo: 409 (su parte no tendría a quién liquidarse)", async () => {
    expect((await abonar(sesiones.dueña, "at-abierta", { protesisId: "pt-sin-tratante", monto: 1_000 })).status).toBe(409)
    expect(abonosDe("pt-sin-tratante")).toEqual([])
  })

  it("a una atención ya cobrada o anulada: 409", async () => {
    expect((await abonar(sesiones.dueña, "at-cobrada", { protesisId: "pt-removible", monto: 1_000 })).status).toBe(409)
    expect((await abonar(sesiones.dueña, "at-anulada", { protesisId: "pt-removible", monto: 1_000 })).status).toBe(409)
    expect(abonosDe("pt-removible")).toEqual([])
  })

  it.each([
    ["sin sesión", null, "at-abierta", 401],
    ["el odontólogo que ve la atención", sesiones.perez, "at-abierta", 401],
    ["la dueña de otra clínica, con una atención de esta", sesiones.dueñaAjena, "at-abierta", 404],
    ["la dueña de otra clínica, con una prótesis de esta", sesiones.dueñaAjena, "at-ajena", 404],
    ["un salón, con su propia atención", sesiones.salon, "at-salon", 404],
    ["una sesión sin rubro", sesiones.sinRubro, "at-abierta", 404],
  ])("%s: %s y nada escrito", async (_caso, sesion, visitId, status) => {
    const antes = base.volcado()
    expect((await abonar(sesion, visitId as string, { protesisId: "pt-removible", monto: 1_000 })).status).toBe(status)
    expect(base.volcado()).toEqual(antes)
  })

  it("dos abonos a la vez que juntos pasan el saldo: uno 201 y el otro 409, bajo el candado de la prótesis", async () => {
    // La base falsa no aísla transacciones. El FOR UPDATE de la prótesis hace
    // que en Postgres el segundo espere al primero: se simula en fila.
    const original = base.prisma.$transaction.getMockImplementation()!
    let fila: Promise<unknown> = Promise.resolve()
    const enFila = async (fn: unknown) => {
      const turno = fila.then(() => original(fn))
      fila = turno.catch(() => undefined)
      return turno
    }
    base.prisma.$transaction.mockImplementationOnce(enFila).mockImplementationOnce(enFila)

    const respuestas = await Promise.all([
      abonar(sesiones.encargado, "at-abierta", { protesisId: "pt-removible", monto: 100_000 }),
      abonar(sesiones.dueña, "at-por-cobrar", { protesisId: "pt-removible", monto: 100_000 }),
    ])

    expect(respuestas.map((r) => r.status).sort()).toEqual([201, 409])
    expect(abonosDe("pt-removible")).toHaveLength(1)
    const candados = base.prisma.$queryRaw.mock.calls.map(([partes]) => (partes as TemplateStringsArray).join("?"))
    expect(candados.filter((sql) => sql.includes("FROM protesis") && sql.includes("FOR UPDATE"))).toHaveLength(2)
  })
})

describe("DELETE /api/atenciones/[id]/abonos/[lineaId]", () => {
  beforeEach(() => {
    base.reiniciar({
      ...escenario(),
      visitService: [
        ...escenario().visitService,
        abonoGuardado("ab-abierto", "at-abierta", "pt-removible", 2_000_000),
        abonoGuardado("ab-cobrado", "at-cobrada", "pt-removible", 3_000_000),
      ],
    })
  })

  it("quita un abono de una atención abierta", async () => {
    const res = await quitar(sesiones.encargado, "at-abierta", "ab-abierto")
    expect(res.status).toBe(200)
    expect(base.buscar("visitService", { id: "ab-abierto" })).toEqual([])
    expect((await res.json()).lineas.map((l: { id: string }) => l.id)).toEqual(["l-resina"])
  })

  it("una línea que no es un abono, o de otra atención: 404; lo cobrado: 409", async () => {
    expect((await quitar(sesiones.dueña, "at-abierta", "l-resina")).status).toBe(404)
    expect((await quitar(sesiones.dueña, "at-por-cobrar", "ab-abierto")).status).toBe(404)
    expect((await quitar(sesiones.dueña, "at-cobrada", "ab-cobrado")).status).toBe(409)
    expect(base.buscar("visitService", { id: "l-resina" })).toHaveLength(1)
    expect(base.buscar("visitService", { id: "ab-cobrado" })).toHaveLength(1)
  })

  it("el odontólogo: 401; otra clínica o un salón: 404", async () => {
    expect((await quitar(sesiones.perez, "at-abierta", "ab-abierto")).status).toBe(401)
    expect((await quitar(sesiones.dueñaAjena, "at-abierta", "ab-abierto")).status).toBe(404)
    expect((await quitar(sesiones.salon, "at-salon", "ab-abierto")).status).toBe(404)
    expect(base.buscar("visitService", { id: "ab-abierto" })).toHaveLength(1)
  })
})

describe("el abono en el resto del tablero", () => {
  it("editar las líneas de la atención no se lleva el abono (no viene en el pedido)", async () => {
    await abonar(sesiones.dueña, "at-abierta", { protesisId: "pt-removible", monto: 50_000 })
    const { PUT } = await import("../route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)
    const res = await PUT(
      pedido("http://localhost/api/atenciones/at-abierta", { lineas: [{ servicioId: "s-exodoncia", profesional: "m-perez" }] }),
      conParams({ id: "at-abierta" })
    )
    expect(res.status).toBe(200)
    expect(abonosDe("pt-removible")).toHaveLength(1)
    expect(base.buscar("visitService", { visitId: "at-abierta" }).map((l) => l.serviceName).sort()).toEqual([
      "Abono prótesis · Removible parcial · Acrílico termocurado (45, 46, 47)",
      "Exodoncia simple",
    ])
  })

  it("antes de cobrar, el abono no figura entre las líneas que quedarán sin %", async () => {
    await abonar(sesiones.dueña, "at-por-cobrar", { protesisId: "pt-removible", monto: 50_000 })
    const { GET } = await import("../cobro/route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.encargado)
    const res = await GET(pedido("http://localhost/api/atenciones/x/cobro"), conParams({ id: "at-por-cobrar" }))
    // Pérez no tiene % configurado: su resina queda sin %, el abono no.
    expect(await res.json()).toEqual({ lineasSinPorcentaje: ["l-por-cobrar"] })
  })

  it("al cobrar, el reparto del abono se congela al centavo con la regla de la prótesis, sin comisión de la cascada", async () => {
    // Núñez, corona en zirconio, 35/20/45. $33.333,33: odontóloga 1.166.666,55 → 1.166.667;
    // técnico 1.499.999,85 → 1.500.000; la clínica, el resto (666.666).
    base.reiniciar({
      ...escenario(),
      businessMember: escenario().businessMember.map((m) => (m.id === "m-nunez" || m.id === "m-perez" ? { ...m, commissionPercent: 50 } : m)),
    })
    expect((await abonar(sesiones.encargado, "at-por-cobrar", { protesisId: "pt-corona", monto: 33_333.33 })).status).toBe(201)

    const res = await cobrar(sesiones.encargado, "at-por-cobrar", 48_000 + 33_333.33)

    expect(res.status).toBe(200)
    const [linea] = abonosDe("pt-corona")
    expect(linea).toMatchObject({
      priceCents: 3_333_333,
      odontologoCents: 1_166_667,
      clinicaCents: 666_666,
      tecnicoCents: 1_500_000,
      commissionPercent: null,
      commissionCents: null,
      commissionAt: null,
    })
    // La línea normal sí congela su comisión de la cascada.
    expect(base.buscar("visitService", { id: "l-por-cobrar" })[0]).toMatchObject({ commissionPercent: 50, commissionCents: 2_400_000 })
    // El encargado cobra, pero no ve el reparto.
    const delAbono = (await res.json()).lineas.find((l: { id: string }) => l.id === linea.id)
    expect(delAbono).toMatchObject({ comision: { estado: "no-aplica" }, abono: { protesisId: "pt-corona", reparto: null } })
  })

  it("si la tratante es la dueña, su parte va a la clínica al congelar", async () => {
    await abonar(sesiones.dueña, "at-por-cobrar", { protesisId: "pt-de-la-duena", monto: 10_000 })
    const res = await cobrar(sesiones.dueña, "at-por-cobrar", 48_000 + 10_000)
    expect(res.status).toBe(200)
    expect(abonosDe("pt-de-la-duena")[0]).toMatchObject({ odontologoCents: 0, clinicaCents: 700_000, tecnicoCents: 300_000 })
    const delAbono = (await res.json()).lineas.find((l: { abono?: unknown }) => l.abono)
    expect(delAbono.abono.reparto).toEqual({ odontologo: 0, clinica: 7_000, tecnico: 3_000 })
  })

  it("del reparto congelado, la dueña ve las tres partes; la tratante, sólo la suya; el encargado y otra odontóloga, nada", async () => {
    const { abonoDeLinea } = await import("@/lib/tablero")
    const linea = { protesisId: "pt-removible", memberId: "m-perez", odontologoCents: 2_000_000, clinicaCents: 1_500_000, tecnicoCents: 1_500_000 }
    const actor = (rol: Actor["rol"], memberId: string | null): Actor => ({ rol, businessId: CLINICA, memberId, rubro: "odontologia" })
    expect(abonoDeLinea(actor("owner", null), linea)?.reparto).toEqual({ odontologo: 20_000, clinica: 15_000, tecnico: 15_000 })
    expect(abonoDeLinea(actor("worker", "m-perez"), linea)?.reparto).toEqual({ odontologo: 20_000 })
    expect(abonoDeLinea(actor("worker", "m-nunez"), linea)?.reparto).toBeNull()
    expect(abonoDeLinea(actor("admin", "m-recepcion"), linea)?.reparto).toBeNull()
    expect(abonoDeLinea({ ...actor("owner", null), rubro: "salon" }, linea)?.reparto).toBeNull()
    // Sin congelar todavía, nadie ve montos; una línea normal no es un abono.
    expect(abonoDeLinea(actor("owner", null), { ...linea, odontologoCents: null, clinicaCents: null, tecnicoCents: null })?.reparto).toBeNull()
    expect(abonoDeLinea(actor("owner", null), { ...linea, protesisId: null })).toBeNull()
  })

  it("anular la atención cobrada (dueña) suelta el abono: deja de contar en lo pagado y el saldo vuelve", async () => {
    await abonar(sesiones.dueña, "at-por-cobrar", { protesisId: "pt-removible", monto: 180_000 })
    expect((await cobrar(sesiones.dueña, "at-por-cobrar", 48_000 + 180_000)).status).toBe(200)
    expect((await abonar(sesiones.dueña, "at-abierta", { protesisId: "pt-removible", monto: 1 })).status).toBe(409)

    const { POST } = await import("../anulacion/route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)
    expect((await POST(pedido("http://localhost/api/atenciones/x/anulacion", { motivo: "Error" }), conParams({ id: "at-por-cobrar" }))).status).toBe(200)

    const removible = (await (await opciones(sesiones.dueña, "at-abierta")).json()).protesis.find((p: { id: string }) => p.id === "pt-removible")
    expect(removible).toMatchObject({ pagado: 0, porCobrar: 0, saldo: 180_000 })
    expect((await abonar(sesiones.dueña, "at-abierta", { protesisId: "pt-removible", monto: 180_000 })).status).toBe(201)
  })

  it("una prótesis con un abono por cobrar no se anula, y la anulación traba la prótesis como el abono", async () => {
    await abonar(sesiones.encargado, "at-abierta", { protesisId: "pt-removible", monto: 10_000 })
    vi.mocked(base.prisma.$queryRaw).mockClear()
    const { PATCH } = await import("../../../clientes/[id]/protesis/[protesisId]/route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)
    const res = await PATCH(
      pedido("http://localhost/api/clientes/p-camila/protesis/pt-removible", { estado: "anulada" }),
      conParams({ id: "p-camila", protesisId: "pt-removible" })
    )
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe(MENSAJE_CON_ABONOS)
    const candados = base.prisma.$queryRaw.mock.calls.map(([partes]) => (partes as TemplateStringsArray).join("?"))
    expect(candados.some((sql) => sql.includes("FROM protesis") && sql.includes("FOR UPDATE"))).toBe(true)
  })
})
