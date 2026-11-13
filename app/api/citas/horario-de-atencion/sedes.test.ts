import { describe, it, expect, vi, beforeEach } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"

/**
 * GET /api/citas/horario-de-atencion con sedes (etapa 9, plan Independiente):
 * con `?sedeId=` es el horario de ESA sede (lo que usa "Nueva cita"); la sede
 * se revalida contra las del negocio de la sesión. Sin él, el vigente de
 * siempre: la unión de las sedes activas.
 */

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const base = crearBaseFalsa()

vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

const SOLO = "negocio-solo"
const AJENO = "negocio-ajeno"

const dueñaSola = { user: { id: "u-sofia", role: "owner", businessId: SOLO, businessName: "Estudio Sofía", memberId: null } }

const sede = (id: string, businessId: string, nombre: string, extra: Record<string, unknown> = {}) => ({
  id,
  businessId,
  nombre,
  direccion: `Calle ${nombre} 123`,
  comuna: "Santiago",
  ...extra,
})

const franja = (id: string, businessId: string, sedeId: string | null, dayOfWeek: number, startTime: string, endTime: string) => ({
  id,
  businessId,
  sedeId,
  memberId: null,
  dayOfWeek,
  startTime,
  endTime,
})

function escenario(sedes: Record<string, unknown>[] = [
  sede("sede-centro", SOLO, "Centro"),
  sede("sede-providencia", SOLO, "Providencia"),
  sede("sede-vieja", SOLO, "Vieja", { activo: false }),
  sede("sede-ajena", AJENO, "Ajena"),
]) {
  base.reiniciar({
    user: [
      { id: "u-sofia", name: "Sofía Sola", email: "sofia@solo.test" },
      { id: "u-ajena", name: "Dueña Ajena", email: "ajena@ajeno.test" },
    ],
    business: [
      { id: SOLO, name: "Estudio Sofía", slug: "estudio-sofia", userId: "u-sofia", plan: "independiente" },
      { id: AJENO, name: "Estudio Ajeno", slug: "estudio-ajeno", userId: "u-ajena", plan: "independiente" },
    ],
    sede: sedes,
    workSchedule: [
      franja("h-centro-1", SOLO, "sede-centro", 1, "09:00", "13:00"),
      franja("h-centro-2", SOLO, "sede-centro", 2, "09:00", "13:00"),
      franja("h-prov-2", SOLO, "sede-providencia", 2, "14:00", "19:00"),
      franja("h-prov-4", SOLO, "sede-providencia", 4, "14:00", "19:00"),
      franja("h-vieja-5", SOLO, "sede-vieja", 5, "10:00", "12:00"),
      franja("h-ajena-3", AJENO, "sede-ajena", 3, "05:00", "23:00"),
    ],
  })
}

async function get(sesion: unknown, consulta = "") {
  const { GET } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  return GET(new Request(`http://localhost/api/citas/horario-de-atencion${consulta}`))
}

describe("GET /api/citas/horario-de-atencion con sedes", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    escenario()
  })

  it("sin `sedeId`: la unión de las sedes activas (la de una sede desactivada no cuenta)", async () => {
    const res = await get(dueñaSola)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([
      { dayOfWeek: 1, startTime: "09:00", endTime: "13:00" },
      { dayOfWeek: 2, startTime: "09:00", endTime: "13:00" },
      { dayOfWeek: 2, startTime: "14:00", endTime: "19:00" },
      { dayOfWeek: 4, startTime: "14:00", endTime: "19:00" },
    ])
  })

  it("con `sedeId`: sólo el horario de esa sede", async () => {
    const centro = await (await get(dueñaSola, "?sedeId=sede-centro")).json()
    const providencia = await (await get(dueñaSola, "?sedeId=sede-providencia")).json()

    expect(centro).toEqual([
      { dayOfWeek: 1, startTime: "09:00", endTime: "13:00" },
      { dayOfWeek: 2, startTime: "09:00", endTime: "13:00" },
    ])
    expect(providencia).toEqual([
      { dayOfWeek: 2, startTime: "14:00", endTime: "19:00" },
      { dayOfWeek: 4, startTime: "14:00", endTime: "19:00" },
    ])
  })

  it("una sede de otro negocio, una que no existe o una desactivada: 404, el mismo para las tres", async () => {
    const respuestas = []
    for (const sedeId of ["sede-ajena", "sede-que-no-existe", "sede-vieja"]) {
      const res = await get(dueñaSola, `?sedeId=${sedeId}`)
      respuestas.push({ status: res.status, cuerpo: await res.json() })
    }

    expect(respuestas.map((respuesta) => respuesta.status)).toEqual([404, 404, 404])
    expect(new Set(respuestas.map((respuesta) => JSON.stringify(respuesta.cuerpo))).size).toBe(1)
  })

  it("un `sedeId` vacío es como no pedir sede", async () => {
    const res = await get(dueñaSola, "?sedeId=")

    expect(res.status).toBe(200)
    expect(await res.json()).toHaveLength(4)
  })

  it("sin sesión, 401, con o sin sede", async () => {
    expect((await get(null, "?sedeId=sede-centro")).status).toBe(401)
  })

  it("con una sola sede activa vale el horario vigente, como siempre (el `sedeId` válido no lo acota)", async () => {
    escenario([sede("sede-centro", SOLO, "Centro"), sede("sede-providencia", SOLO, "Providencia", { activo: false })])

    const res = await get(dueñaSola, "?sedeId=sede-centro")

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([
      { dayOfWeek: 1, startTime: "09:00", endTime: "13:00" },
      { dayOfWeek: 2, startTime: "09:00", endTime: "13:00" },
    ])
  })

  it("sin sedes, el `sedeId` que llegue se ignora: el horario de siempre", async () => {
    escenario([])

    const res = await get(dueñaSola, "?sedeId=sede-ajena")

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })
})
