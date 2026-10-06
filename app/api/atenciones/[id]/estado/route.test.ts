import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { crearBaseFalsa } from "../../_pruebas/base-falsa"
import { NEGOCIO, OTRO_NEGOCIO, atencion, conId, datosBase, linea, pedido, sesiones } from "../../_pruebas/datos"

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const base = crearBaseFalsa()

vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

const URL = "http://localhost/api/atenciones/x/estado"
const AHORA = new Date("2026-10-06T15:00:00.000Z")

const cita = (id: string, status: string) => ({
  id,
  businessId: NEGOCIO,
  customerId: "c-maria",
  memberId: "m-carla",
  title: "Corte",
  status,
  startTime: new Date("2026-10-06T14:00:00.000Z"),
  endTime: new Date("2026-10-06T14:30:00.000Z"),
})

function escenario() {
  return {
    ...datosBase(),
    appointment: [cita("cita-confirmada", "confirmada"), cita("cita-cancelada-a-mano", "cancelada")],
    visit: [
      atencion("v-espera", { appointmentId: "cita-confirmada" }),
      atencion("v-espera-vacia"),
      atencion("v-espera-ex-miembro"),
      atencion("v-espera-de-cita-cancelada", { appointmentId: "cita-cancelada-a-mano" }),
      atencion("v-atencion", { status: "en-atencion", startedAt: new Date("2026-10-06T14:05:00.000Z") }),
      atencion("v-atencion-ex-miembro", { status: "en-atencion", startedAt: new Date("2026-10-06T14:05:00.000Z") }),
      atencion("v-por-cobrar", {
        status: "por-cobrar",
        startedAt: new Date("2026-10-06T14:05:00.000Z"),
        readyAt: new Date("2026-10-06T14:40:00.000Z"),
      }),
      atencion("v-pedro"),
      atencion("v-cobrada", { status: "finalizada", paidAt: new Date(), total: 8000 }),
      atencion("v-ajena", { businessId: OTRO_NEGOCIO, customerId: "c-ajeno" }),
    ],
    visitService: [
      linea("l-espera", "v-espera"),
      // Quien la hizo dejó el equipo: el nombre quedó copiado, el memberId no.
      linea("l-ex-miembro", "v-espera-ex-miembro", { memberId: null, professionalName: "Juan (ya no está)" }),
      linea("l-cita-cancelada", "v-espera-de-cita-cancelada"),
      linea("l-atencion", "v-atencion"),
      linea("l-atencion-bien", "v-atencion-ex-miembro"),
      linea("l-atencion-ex", "v-atencion-ex-miembro", { memberId: null, professionalName: "Juan (ya no está)" }),
      linea("l-por-cobrar", "v-por-cobrar"),
      linea("l-pedro", "v-pedro", { memberId: "m-pedro", professionalName: "Pedro Profesional" }),
      linea("l-cobrada", "v-cobrada"),
      linea("l-ajena", "v-ajena", { memberId: "m-ajeno", serviceId: "s-ajeno" }),
    ],
  }
}

const atencionGuardada = (id: string) => base.buscar("visit", { id })[0]
const citaGuardada = (id: string) => base.buscar("appointment", { id })[0]

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(AHORA)
  base.reiniciar(escenario())
})

afterEach(() => vi.useRealTimers())

async function mover(sesion: unknown, id: string, estado: unknown) {
  const { POST } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  return POST(pedido(URL, { estado }), conId(id))
}

describe("POST /api/atenciones/[id]/estado: aislamiento", () => {
  it("una atención de otro negocio da 404 y no escribe nada", async () => {
    const antes = base.volcado()

    const res = await mover(sesiones.dueña, "v-ajena", "en-atencion")

    expect(res.status).toBe(404)
    expect(base.volcado()).toEqual(antes)
    expect(base.prisma.$transaction).not.toHaveBeenCalled()
  })

  it("la profesional no mueve la atención de un colega: 404", async () => {
    const antes = base.volcado()

    const res = await mover(sesiones.carla, "v-pedro", "en-atencion")

    expect(res.status).toBe(404)
    expect(base.volcado()).toEqual(antes)
  })

  it("sin sesión recibe 401", async () => {
    const res = await mover(null, "v-espera", "en-atencion")

    expect(res.status).toBe(401)
  })
})

describe("POST /api/atenciones/[id]/estado: transiciones", () => {
  it.each([
    ["saltar de en espera a por cobrar", "v-espera", "por-cobrar"],
    ["volver de por cobrar a en espera de un salto", "v-por-cobrar", "en-espera"],
    ["mover lo ya cobrado", "v-cobrada", "en-atencion"],
    ["quedarse donde está", "v-espera", "en-espera"],
  ])("%s da 409 y no cambia nada", async (_caso, id, estado) => {
    const antes = base.volcado()

    const res = await mover(sesiones.dueña, id, estado)

    expect(res.status).toBe(409)
    expect(base.volcado()).toEqual(antes)
  })

  it.each(["finalizada", "anulada", "cualquiera"])("pedir `%s` acá es un cuerpo inválido: 400", async (estado) => {
    const res = await mover(sesiones.dueña, "v-por-cobrar", estado)

    expect(res.status).toBe(400)
    expect(atencionGuardada("v-por-cobrar").status).toBe("por-cobrar")
  })

  it("empezar la atención marca la hora y pasa la cita a en progreso", async () => {
    const res = await mover(sesiones.encargado, "v-espera", "en-atencion")

    expect(res.status).toBe(200)
    expect(atencionGuardada("v-espera")).toMatchObject({ status: "en-atencion", startedAt: AHORA })
    expect(citaGuardada("cita-confirmada").status).toBe("en-progreso")
    expect((await res.json()).estado).toBe("en-atencion")
  })

  it("una cita cancelada a mano en la agenda no se pisa al empezar la atención", async () => {
    await mover(sesiones.dueña, "v-espera-de-cita-cancelada", "en-atencion")

    expect(citaGuardada("cita-cancelada-a-mano").status).toBe("cancelada")
  })

  it("terminar la atención marca cuándo quedó lista para cobrar", async () => {
    const res = await mover(sesiones.dueña, "v-atencion", "por-cobrar")

    expect(res.status).toBe(200)
    expect(atencionGuardada("v-atencion")).toMatchObject({ status: "por-cobrar", readyAt: AHORA })
  })

  it("volver un paso borra la hora del paso que se deshace", async () => {
    await mover(sesiones.dueña, "v-por-cobrar", "en-atencion")
    await mover(sesiones.dueña, "v-atencion", "en-espera")

    expect(atencionGuardada("v-por-cobrar")).toMatchObject({ status: "en-atencion", readyAt: null })
    expect(atencionGuardada("v-por-cobrar").startedAt).not.toBeNull()
    expect(atencionGuardada("v-atencion")).toMatchObject({ status: "en-espera", startedAt: null })
  })

  it("la profesional mueve su propia atención", async () => {
    const res = await mover(sesiones.carla, "v-espera", "en-atencion")

    expect(res.status).toBe(200)
  })

  it("si otro la movió entretanto, responde 409 y no pisa lo que hizo", async () => {
    const { POST } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)
    const original = base.prisma.visit.findFirst.getMockImplementation()!
    base.prisma.visit.findFirst.mockImplementationOnce(async (args) => {
      const leida = await original(args)
      await base.prisma.visit.updateMany({ where: { id: "v-espera" }, data: { status: "anulada" } })
      return leida
    })

    const res = await POST(pedido(URL, { estado: "en-atencion" }), conId("v-espera"))

    expect(res.status).toBe(409)
    expect(atencionGuardada("v-espera").status).toBe("anulada")
    expect(citaGuardada("cita-confirmada").status).toBe("confirmada")
  })
})

describe("POST /api/atenciones/[id]/estado: requisitos", () => {
  it("sin servicios no empieza la atención: 400 con lo que falta, y nada cambia", async () => {
    const antes = base.volcado()

    const res = await mover(sesiones.dueña, "v-espera-vacia", "en-atencion")

    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/al menos un servicio con su profesional/)
    expect(base.volcado()).toEqual(antes)
  })

  it("con un único servicio de alguien que ya no está, tampoco empieza", async () => {
    const res = await mover(sesiones.dueña, "v-espera-ex-miembro", "en-atencion")

    expect(res.status).toBe(400)
    expect(atencionGuardada("v-espera-ex-miembro").status).toBe("en-espera")
  })

  it("no pasa a cobrar si un servicio no tiene profesional: 400 y la atención sigue igual", async () => {
    const antes = base.volcado()

    const res = await mover(sesiones.dueña, "v-atencion-ex-miembro", "por-cobrar")

    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/sin profesional/)
    expect(base.volcado()).toEqual(antes)
  })
})
