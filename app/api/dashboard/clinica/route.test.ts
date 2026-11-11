import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, OTRO_NEGOCIO, atencion, linea, sesiones } from "@/pruebas/datos"
import { citaDental, datosDeLaClinica, santiago, sesionesDentales } from "@/pruebas/clinica-con-sillones"
import { MARCA_DE_CLIENTE_ELIMINADO } from "@/lib/clientes-eliminados"

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const base = crearBaseFalsa()

vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

/** Jueves 5 de noviembre de 2026, 10:12 en Santiago (UTC-3). */
const HOY = "2026-11-05"
const AHORA = santiago(HOY, "10:12")
const hace = (dias: number) => new Date(AHORA.getTime() - dias * 24 * 60 * 60 * 1000)

const plan = (id: string, customerId: string, datos: Record<string, unknown> = {}) => ({
  id,
  businessId: NEGOCIO,
  customerId,
  version: 1,
  creadoPorNombre: "Carla",
  ...datos,
})
const etapa = (id: string, planId: string, datos: Record<string, unknown> = {}) => ({
  id,
  businessId: NEGOCIO,
  planId,
  orden: 1,
  nombre: "Etapa 1",
  ...datos,
})
const prestacion = (id: string, etapaId: string, valorCents: number, datos: Record<string, unknown> = {}) => ({
  id,
  businessId: NEGOCIO,
  etapaId,
  orden: 1,
  nombre: "Restauración",
  valorCents,
  ...datos,
})

function escenario() {
  const datos = datosDeLaClinica()
  base.reiniciar({
    ...datos,
    customer: [
      ...datos.customer,
      { id: "c-diego", businessId: NEGOCIO, name: "Diego", lastName: "Fuentes" },
      { id: "c-eliminado", businessId: NEGOCIO, name: "Cliente eliminado", tags: [MARCA_DE_CLIENTE_ELIMINADO] },
    ],
    appointment: [
      // Sillón 1: Carla atiende a María desde las 09:34; después viene Beto con Pedro.
      citaDental("cita-maria", HOY, "09:30", "10:30", { status: "en-progreso", sillonId: "sl-1", title: "Endodoncia · pieza 36" }),
      citaDental("cita-beto", HOY, "10:45", "11:15", { sillonId: "sl-1", memberId: "m-pedro", customerId: "c-beto" }),
      // Sillón 2: libre; Diego (de Carla) ya llegó y espera su hora de las 10:30.
      citaDental("cita-diego", HOY, "10:30", "11:15", { status: "confirmada", sillonId: "sl-2", customerId: "c-diego", title: "Restauración · pieza 16" }),
      citaDental("cita-cancelada", HOY, "10:00", "11:00", { status: "cancelada", sillonId: "sl-2" }),
      // Ayer, en el sillón 1, todavía en progreso: no es de hoy.
      citaDental("cita-ayer", "2026-11-04", "10:00", "11:00", { status: "en-progreso", sillonId: "sl-1" }),
      // En el sillón desactivado: no sale.
      citaDental("cita-viejo", HOY, "10:00", "11:00", { status: "en-progreso", sillonId: "sl-viejo" }),
      { ...citaDental("cita-ajena", HOY, "10:00", "11:00", { status: "en-progreso", sillonId: "sl-ajeno" }), businessId: OTRO_NEGOCIO, customerId: "c-ajeno", memberId: "m-ajeno" },
    ],
    visit: [
      atencion("v-maria", { appointmentId: "cita-maria", status: "en-atencion", arrivedAt: santiago(HOY, "09:25"), startedAt: santiago(HOY, "09:34") }),
      atencion("v-diego", { appointmentId: "cita-diego", customerId: "c-diego", customerName: "Diego Fuentes", arrivedAt: santiago(HOY, "10:00") }),
      atencion("v-sin-reserva", { customerId: null, customerName: "Pedro Lagos", arrivedAt: santiago(HOY, "10:08") }),
      atencion("v-ayer", { customerName: "Olvidado", arrivedAt: santiago("2026-11-04", "18:00") }),
      atencion("v-ajena", { businessId: OTRO_NEGOCIO, customerId: "c-ajeno", customerName: "Otra", arrivedAt: santiago(HOY, "09:00") }),
    ],
    // Pedro le anotó algo a Diego: ve su atención, pero no la cita de Carla.
    visitService: [linea("l-pedro", "v-diego", { memberId: "m-pedro", professionalName: "Pedro Profesional" })],
    planDeTratamiento: [
      plan("plan-maria-v1", "c-maria", { vigente: false }),
      plan("plan-maria", "c-maria", { version: 2 }),
      plan("plan-diego", "c-diego"),
      plan("plan-eliminado", "c-eliminado"),
      { ...plan("plan-ajeno", "c-ajeno"), businessId: OTRO_NEGOCIO },
    ],
    etapaDelPlan: [
      etapa("et-maria", "plan-maria", { presentadaEn: hace(4) }),
      etapa("et-maria-aprobada", "plan-maria", { orden: 2, estado: "aprobada", presentadaEn: hace(5), aprobadaEn: hace(1), aprobadaPorNombre: "María" }),
      etapa("et-maria-sin-presentar", "plan-maria", { orden: 3 }),
      etapa("et-maria-v1", "plan-maria-v1", { presentadaEn: hace(30) }),
      etapa("et-diego", "plan-diego", { presentadaEn: hace(2) }),
      etapa("et-eliminado", "plan-eliminado", { presentadaEn: hace(1) }),
      { ...etapa("et-ajena", "plan-ajeno", { presentadaEn: hace(1) }), businessId: OTRO_NEGOCIO },
    ],
    prestacionDelPlan: [
      prestacion("pr-maria-1", "et-maria", 18_000_000),
      prestacion("pr-maria-2", "et-maria", 8_500_000, { orden: 2 }),
      prestacion("pr-diego", "et-diego", 48_000_000),
      prestacion("pr-v1", "et-maria-v1", 99_900_000),
      prestacion("pr-eliminado", "et-eliminado", 1_000_000),
      { ...prestacion("pr-ajena", "et-ajena", 77_700_000), businessId: OTRO_NEGOCIO },
    ],
  })
}

async function inicio(sesion: unknown) {
  const { GET } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  return GET()
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(AHORA)
  escenario()
})

afterEach(() => vi.useRealTimers())

describe("GET /api/dashboard/clinica", () => {
  it("la dueña ve toda la clínica: sillones, sala de espera y presupuestos con montos", async () => {
    const res = await inicio(sesionesDentales.dueña)
    const cuerpo = await res.json()

    expect(res.status).toBe(200)
    expect(cuerpo).toMatchObject({ fecha: HOY, zona: "America/Santiago", ahora: AHORA.toISOString(), alcance: "negocio" })

    expect(cuerpo.sillones).toEqual([
      {
        id: "sl-1",
        nombre: "Sillón 1",
        orden: 1,
        estado: "atendiendo",
        actual: {
          citaId: "cita-maria",
          titulo: "Endodoncia · pieza 36",
          paciente: { id: "c-maria", nombre: "María González" },
          odontologo: { id: "m-carla", nombre: "Carla Profesional" },
          inicio: santiago(HOY, "09:30").toISOString(),
          fin: santiago(HOY, "10:30").toISOString(),
          desde: santiago(HOY, "09:34").toISOString(),
        },
        siguiente: {
          citaId: "cita-beto",
          titulo: "Control",
          paciente: { id: "c-beto", nombre: "Beto" },
          odontologo: { id: "m-pedro", nombre: "Pedro Profesional" },
          inicio: santiago(HOY, "10:45").toISOString(),
          fin: santiago(HOY, "11:15").toISOString(),
        },
        libreHasta: null,
      },
      {
        id: "sl-2",
        nombre: "Sillón 2",
        orden: 2,
        estado: "libre",
        actual: null,
        siguiente: expect.objectContaining({ citaId: "cita-diego", paciente: { id: "c-diego", nombre: "Diego Fuentes" } }),
        libreHasta: santiago(HOY, "10:30").toISOString(),
      },
    ])

    expect(cuerpo.salaDeEspera).toEqual({
      cantidad: 2,
      mayorEsperaMinutos: 12,
      lista: [
        {
          atencionId: "v-diego",
          citaId: "cita-diego",
          paciente: { id: "c-diego", nombre: "Diego Fuentes" },
          minutos: 12,
          titulo: "Restauración · pieza 16",
          sillon: { id: "sl-2", nombre: "Sillón 2" },
        },
        { atencionId: "v-sin-reserva", citaId: null, paciente: { id: null, nombre: "Pedro Lagos" }, minutos: 4, titulo: null, sillon: null },
      ],
    })

    expect(cuerpo.presupuestosPorResponder).toEqual({
      cantidad: 2,
      totalCents: 74_500_000,
      lista: [
        {
          etapaId: "et-diego",
          planId: "plan-diego",
          etapa: "Etapa 1",
          paciente: { id: "c-diego", nombre: "Diego Fuentes" },
          presentadaEn: hace(2).toISOString(),
          montoCents: 48_000_000,
        },
        {
          etapaId: "et-maria",
          planId: "plan-maria",
          etapa: "Etapa 1",
          paciente: { id: "c-maria", nombre: "María González" },
          presentadaEn: hace(4).toISOString(),
          montoCents: 26_500_000,
        },
      ],
    })
  })

  it("el encargado ve lo mismo, montos incluidos (ve la plata del negocio, como en el inicio)", async () => {
    const cuerpo = await (await inicio(sesionesDentales.encargado)).json()

    expect(cuerpo.alcance).toBe("negocio")
    expect(cuerpo.salaDeEspera.cantidad).toBe(2)
    expect(cuerpo.presupuestosPorResponder).toMatchObject({ cantidad: 2, totalCents: 74_500_000 })
  })

  it("la odontóloga ve sus citas en los sillones, su sala de espera y los presupuestos sin montos", async () => {
    const cuerpo = await (await inicio(sesionesDentales.carla)).json()

    expect(cuerpo.alcance).toBe("propias")
    // La de Beto es de Pedro: para ella el sillón 1 no tiene siguiente.
    expect(cuerpo.sillones[0]).toMatchObject({ estado: "atendiendo", actual: { citaId: "cita-maria" }, siguiente: null })
    expect(cuerpo.sillones[1]).toMatchObject({ estado: "libre", siguiente: { citaId: "cita-diego" } })
    expect(cuerpo.salaDeEspera).toMatchObject({ cantidad: 1, lista: [{ atencionId: "v-diego", citaId: "cita-diego" }] })

    expect(cuerpo.presupuestosPorResponder.cantidad).toBe(2)
    expect(cuerpo.presupuestosPorResponder).not.toHaveProperty("totalCents")
    for (const presupuesto of cuerpo.presupuestosPorResponder.lista) expect(presupuesto).not.toHaveProperty("montoCents")
    expect(JSON.stringify(cuerpo)).not.toContain("48000000")
  })

  it("un odontólogo con una línea en la atención de la cita de un colega la ve en espera, sin la cita ni el sillón", async () => {
    const cuerpo = await (await inicio(sesionesDentales.pedro)).json()

    expect(cuerpo.salaDeEspera).toEqual({
      cantidad: 1,
      mayorEsperaMinutos: 12,
      lista: [{ atencionId: "v-diego", citaId: null, paciente: { id: "c-diego", nombre: "Diego Fuentes" }, minutos: 12, titulo: null, sillon: null }],
    })
    // De los sillones, sólo su cita: la de Beto, que viene después en el 1.
    expect(cuerpo.sillones[0]).toMatchObject({ estado: "libre", siguiente: { citaId: "cita-beto" } })
    expect(cuerpo.sillones[1]).toMatchObject({ estado: "libre", siguiente: null, libreHasta: null })
  })

  it("aislamiento: la otra clínica sólo ve lo suyo", async () => {
    const cuerpo = await (await inicio(sesionesDentales.dueñoAjeno)).json()

    expect(cuerpo.sillones).toEqual([
      expect.objectContaining({ id: "sl-ajeno", estado: "atendiendo", actual: expect.objectContaining({ citaId: "cita-ajena" }) }),
    ])
    expect(cuerpo.salaDeEspera).toMatchObject({ cantidad: 1, lista: [{ atencionId: "v-ajena" }] })
    expect(cuerpo.presupuestosPorResponder).toMatchObject({ cantidad: 1, totalCents: 77_700_000 })
    // El paciente ajeno se llama igual que María a propósito: se compara por ids.
    expect(JSON.stringify(cuerpo)).not.toMatch(/c-maria|c-diego|c-beto|v-diego|v-sin-reserva|"sl-1"|Pedro Lagos/)
  })

  it("sin sillones, la lista viene vacía y no se leen citas", async () => {
    base.reiniciar({ ...datosDeLaClinica(), sillon: [] })
    const cuerpo = await (await inicio(sesionesDentales.dueña)).json()

    expect(cuerpo.sillones).toEqual([])
    expect(base.prisma.appointment.findMany).not.toHaveBeenCalled()
  })

  it("en un salón no existe: 404", async () => {
    expect((await inicio(sesiones.dueña)).status).toBe(404)
  })

  it("sin sesión: 401", async () => {
    expect((await inicio(null)).status).toBe(401)
  })
})
