import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Prisma } from "@prisma/client"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { pedido } from "@/pruebas/datos"
import { MENSAJE_ODONTOGRAMA_SIN_HALLAZGOS, type PlanRespuesta } from "@/lib/edicion-del-plan"
import { CLINICA, conParams, escenarioDental, sesionesDentales as sesiones } from "../../_pruebas/clinica-dental"

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const base = crearBaseFalsa()

vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

const ruta = () => import("./route")
const url = (id: string) => `http://localhost/api/clientes/${id}/plan`
const con = (id: string) => conParams({ id })

const AHORA = new Date("2026-11-06T15:00:00.000Z")

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(AHORA)
  base.reiniciar(escenarioDental())
})

afterEach(() => {
  vi.useRealTimers()
})

async function leer(sesion: unknown, id: string) {
  const { GET } = await ruta()
  mockGetServerSession.mockResolvedValueOnce(sesion)
  return GET(pedido(url(id)), con(id))
}

async function crear(sesion: unknown, id: string, cuerpo: unknown) {
  const { POST } = await ruta()
  mockGetServerSession.mockResolvedValueOnce(sesion)
  return POST(pedido(url(id), cuerpo), con(id))
}

/** El plan sin ids, para comparar una copia con su original. */
function sinIds(plan: PlanRespuesta["plan"]) {
  return plan?.etapas.map(({ id: _etapa, prestaciones, ...etapa }) => ({
    ...etapa,
    prestaciones: prestaciones.map(({ id: _prestacion, ...prestacion }) => prestacion),
  }))
}

describe("GET /api/clientes/[id]/plan", () => {
  it("la dueña ve el plan vigente: etapas y prestaciones en orden, totales, versiones anteriores y la cita", async () => {
    const res = await leer(sesiones.dueña, "p-camila")

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      plan: {
        id: "plan-v2",
        version: 2,
        creadoPorNombre: "Valentina Soto",
        createdAt: "2026-10-28T15:00:00.000Z",
        totales: { totalCents: 101_800_000, aprobadoCents: 8_300_000, realizadoCents: 3_500_000 },
        etapas: [
          {
            id: "et-higiene",
            orden: 1,
            nombre: "Higiene y urgencia",
            estado: "aprobada",
            presentadaEn: "2026-10-27T15:00:00.000Z",
            aprobadaEn: "2026-10-28T15:00:00.000Z",
            aprobadaPorNombre: "Valentina Soto",
            subtotalCents: 8_300_000,
            prestaciones: [
              {
                id: "pr-destartraje",
                orden: 1,
                pieza: null,
                caras: [],
                serviceId: "s-destartraje",
                nombre: "Destartraje y profilaxis",
                memberId: null,
                profesionalNombre: "Valentina Soto",
                estado: "realizada",
                valorCents: 3_500_000,
                appointmentId: null,
                realizadaEn: "2026-10-28T16:00:00.000Z",
                cita: null,
              },
              {
                id: "pr-16",
                orden: 2,
                pieza: 16,
                caras: ["O", "M"],
                serviceId: "s-resina",
                nombre: "Restauración resina compuesta",
                memberId: "m-perez",
                profesionalNombre: "Diego Pérez",
                estado: "agendada",
                valorCents: 4_800_000,
                appointmentId: "cita-perez",
                realizadaEn: null,
                cita: { id: "cita-perez", startTime: "2026-11-06T13:30:00.000Z", status: "confirmada" },
              },
            ],
          },
          {
            id: "et-rehabilitacion",
            orden: 2,
            nombre: "Rehabilitación",
            estado: "por-aprobar",
            presentadaEn: null,
            aprobadaEn: null,
            aprobadaPorNombre: null,
            subtotalCents: 93_500_000,
            prestaciones: [
              expect.objectContaining({ id: "pr-46", orden: 1, pieza: 46, estado: "por-agendar", cita: null }),
              expect.objectContaining({ id: "pr-27", orden: 2, pieza: 27, caras: ["O"] }),
            ],
          },
        ],
      },
      versionesAnteriores: [{ version: 1, createdAt: "2026-09-12T15:00:00.000Z" }],
      puedeEditar: true,
    })
  })

  it("el encargado lo ve, en sólo lectura", async () => {
    const res = await leer(sesiones.encargado, "p-camila")

    expect(res.status).toBe(200)
    const cuerpo = await res.json()
    expect(cuerpo.plan.id).toBe("plan-v2")
    expect(cuerpo.puedeEditar).toBe(false)
  })

  it("la fecha de la cita se ve como en la agenda: el odontólogo ve la suya, de la de un colega sólo el id", async () => {
    const dePerez = await (await leer(sesiones.perez, "p-camila")).json()
    const deNunez = await (await leer(sesiones.nunez, "p-camila")).json()

    expect(dePerez.plan.etapas[0].prestaciones[1]).toMatchObject({ appointmentId: "cita-perez", cita: { id: "cita-perez" } })
    expect(deNunez.plan.etapas[0].prestaciones[1]).toMatchObject({ appointmentId: "cita-perez", cita: null })
  })

  it("sin plan: plan en null", async () => {
    const res = await leer(sesiones.dueña, "p-nadia")

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ plan: null, versionesAnteriores: [], puedeEditar: true })
  })

  it.each([
    ["la dueña de otra clínica", sesiones.dueñaAjena, "p-camila"],
    ["la dueña, con un paciente de otra clínica", sesiones.dueña, "p-ajena"],
    ["un salón", sesiones.salon, "p-salon"],
    ["una sesión sin rubro", sesiones.sinRubro, "p-camila"],
    ["la dueña, con un paciente eliminado", sesiones.dueña, "p-eliminado"],
  ])("%s: 404", async (_caso, sesion, id) => {
    const res = await leer(sesion, id)

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: "Paciente no encontrado" })
  })

  it("sin sesión: 401 y no toca la base", async () => {
    const res = await leer(null, "p-camila")

    expect(res.status).toBe(401)
    expect(base.prisma.planDeTratamiento.findFirst).not.toHaveBeenCalled()
  })
})

describe("POST /api/clientes/[id]/plan", () => {
  it("desde el odontograma: una versión nueva con la propuesta en una etapa, a nombre de quien la arma", async () => {
    const res = await crear(sesiones.perez, "p-camila", { desde: "odontograma" })

    expect(res.status).toBe(201)
    const { plan, versionesAnteriores } = await res.json()
    expect(plan).toMatchObject({ version: 3, creadoPorNombre: "Diego Pérez", createdAt: AHORA.toISOString() })
    expect(versionesAnteriores.map((v: { version: number }) => v.version)).toEqual([2, 1])
    expect(plan.etapas).toHaveLength(1)
    expect(plan.etapas[0]).toMatchObject({ orden: 1, nombre: "Tratamiento indicado", estado: "por-aprobar" })
    // Caries en 16 (O y M) → restauración; extracción indicada en 18 → exodoncia. La corona,
    // el sellante y la ausente no piden nada. El servicio inactivo no se sugiere.
    expect(plan.etapas[0].prestaciones).toEqual([
      expect.objectContaining({
        orden: 1,
        pieza: 16,
        caras: ["O", "M"],
        serviceId: "s-resina",
        nombre: "Restauración resina compuesta",
        valorCents: 4_800_000,
        memberId: "m-perez",
        profesionalNombre: "Diego Pérez",
        estado: "por-agendar",
      }),
      expect.objectContaining({ orden: 2, pieza: 18, caras: [], serviceId: "s-exodoncia", nombre: "Exodoncia simple", valorCents: 6_000_000 }),
    ])
    expect(plan.totales).toEqual({ totalCents: 10_800_000, aprobadoCents: 0, realizadoCents: 0 })

    // La vigente anterior dejó de estarlo, y quedó intacta.
    expect(base.buscar("planDeTratamiento", { id: "plan-v2" })[0]).toMatchObject({ vigente: false })
    expect(base.buscar("etapaDelPlan", { planId: "plan-v2" })).toHaveLength(2)
    expect(base.buscar("planDeTratamiento", { customerId: "p-camila", vigente: true })).toHaveLength(1)
    // Todo con el negocio de la sesión.
    for (const prestacion of base.buscar("prestacionDelPlan", { etapaId: plan.etapas[0].id })) {
      expect(prestacion.businessId).toBe(CLINICA)
    }
  })

  it("la dueña que arma desde el odontograma queda como profesional, sin memberId", async () => {
    const { plan } = await (await crear(sesiones.dueña, "p-camila", { desde: "odontograma" })).json()

    expect(plan.etapas[0].prestaciones[0]).toMatchObject({ memberId: null, profesionalNombre: "Valentina Soto" })
  })

  it("una copia de la vigente parte de donde estaba: mismas etapas, estados, citas y valores", async () => {
    const original = (await (await leer(sesiones.dueña, "p-camila")).json()) as PlanRespuesta

    const res = await crear(sesiones.dueña, "p-camila", { desde: "copia" })

    expect(res.status).toBe(201)
    const copia = (await res.json()) as PlanRespuesta
    expect(copia.plan?.version).toBe(3)
    expect(sinIds(copia.plan)).toEqual(sinIds(original.plan))
    expect(copia.plan?.totales).toEqual(original.plan?.totales)
    // Filas nuevas, no las mismas.
    expect(copia.plan?.etapas.map((etapa) => etapa.id)).not.toContain("et-higiene")
  })

  it("vacío, o copia sin plan vigente: un plan sin etapas, versión 1", async () => {
    const vacio = await (await crear(sesiones.dueña, "p-nadia", { desde: "vacio" })).json()
    expect(vacio.plan).toMatchObject({ version: 1, etapas: [], totales: { totalCents: 0, aprobadoCents: 0, realizadoCents: 0 } })

    base.reiniciar(escenarioDental())
    const copia = await (await crear(sesiones.dueña, "p-nadia", { desde: "copia" })).json()
    expect(copia.plan).toMatchObject({ version: 1, etapas: [] })
  })

  it("desde un odontograma sin caries ni extracciones: 409 y no crea nada", async () => {
    const antes = base.volcado()

    const res = await crear(sesiones.dueña, "p-beto", { desde: "odontograma" })

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: MENSAJE_ODONTOGRAMA_SIN_HALLAZGOS })
    expect(base.volcado()).toEqual(antes)
  })

  it("si otra versión se creó al mismo tiempo (único de versión o de vigente): 409, no 500", async () => {
    base.prisma.planDeTratamiento.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test" })
    )
    const antes = base.volcado()

    const res = await crear(sesiones.dueña, "p-camila", { desde: "vacio" })

    expect(res.status).toBe(409)
    // La transacción se deshizo: la v2 sigue vigente.
    expect(base.volcado()).toEqual(antes)
  })

  it("traba al paciente antes de calcular la versión", async () => {
    await crear(sesiones.dueña, "p-camila", { desde: "vacio" })

    expect(base.prisma.$queryRaw).toHaveBeenCalledWith(expect.arrayContaining([expect.stringContaining("FOR UPDATE")]), "p-camila", CLINICA)
  })

  it("un origen que no existe: 400", async () => {
    const res = await crear(sesiones.dueña, "p-camila", { desde: "pdf" })

    expect(res.status).toBe(400)
  })

  it("el encargado no arma planes: 401 y nada escrito", async () => {
    const antes = base.volcado()

    const res = await crear(sesiones.encargado, "p-camila", { desde: "vacio" })

    expect(res.status).toBe(401)
    expect(base.volcado()).toEqual(antes)
  })

  it.each([
    ["la dueña de otra clínica", sesiones.dueñaAjena, "p-camila"],
    ["la dueña, con un paciente de otra clínica", sesiones.dueña, "p-ajena"],
    ["un salón", sesiones.salon, "p-salon"],
  ])("%s: 404 y nada escrito", async (_caso, sesion, id) => {
    const antes = base.volcado()

    const res = await crear(sesion, id, { desde: "vacio" })

    expect(res.status).toBe(404)
    expect(base.volcado()).toEqual(antes)
  })

  it("sin sesión, o sin usuario a quien firmar: 401", async () => {
    expect((await crear(null, "p-camila", { desde: "vacio" })).status).toBe(401)
    expect((await crear(sesiones.sinUsuario, "p-camila", { desde: "vacio" })).status).toBe(401)
  })
})
