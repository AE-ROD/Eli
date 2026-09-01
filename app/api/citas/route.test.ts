import { describe, it, expect, vi, beforeEach } from "vitest"
import type { NextRequest } from "next/server"
import { whereDeAgenda, type Actor } from "@/lib/permisos"

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

/**
 * Filtro mínimo que entiende las formas de `where` que produce `lib/permisos`:
 * `AND` de condiciones, igualdad simple y `{ in: [...] }`. Alcanza para que el
 * mock de Prisma filtre de verdad según lo que el endpoint le pasa, en vez de
 * limitarse a inspeccionar el argumento.
 */
function coincide(item: Record<string, unknown>, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([clave, valor]) => {
    if (clave === "AND") {
      return (valor as Record<string, unknown>[]).every((sub) => coincide(item, sub))
    }
    if (valor && typeof valor === "object" && "in" in (valor as Record<string, unknown>)) {
      return ((valor as { in: unknown[] }).in).includes(item[clave])
    }
    return item[clave] === valor
  })
}

const citasFake = [
  { id: "cita-mia", businessId: "negocio-1", memberId: "member-worker-1", patientId: "p-1" },
  { id: "cita-colega", businessId: "negocio-1", memberId: "member-colega", patientId: "p-2" },
]

const prismaMock = {
  appointment: {
    findMany: vi.fn((args: { where: Record<string, unknown> }) =>
      Promise.resolve(citasFake.filter((c) => coincide(c, args.where)))
    ),
  },
  patient: { findFirst: vi.fn() },
  businessMember: { findFirst: vi.fn() },
}

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))

const sesionDueño = {
  user: { id: "owner-1", role: "owner", businessId: "negocio-1", businessName: "Mi negocio" },
}

const sesionProfesional = {
  user: {
    id: "worker-1",
    role: "worker",
    businessId: "negocio-1",
    businessName: "Mi negocio",
    memberId: "member-worker-1",
  },
}

const fakeRequest = (url: string): NextRequest => ({ url } as unknown as NextRequest)

describe("GET /api/citas", () => {
  beforeEach(() => vi.clearAllMocks())

  it("un worker no ve la cita de un colega, sólo la suya", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionProfesional)

    const res = await GET(fakeRequest("http://localhost/api/citas"))
    const data = await res.json()

    expect(data).toHaveLength(1)
    expect(data[0].id).toBe("cita-mia")
  })

  it("el dueño ve las citas de todo el negocio, las dos", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionDueño)

    const res = await GET(fakeRequest("http://localhost/api/citas"))
    const data = await res.json()

    expect(data).toHaveLength(2)
    expect(data.map((c: { id: string }) => c.id).sort()).toEqual(["cita-colega", "cita-mia"])
  })

  // `route.ts` no expone hoy un query param que produzca un `extra` con
  // `memberId` o `AND` propios (sólo `patientId` y rango de fechas), así que
  // estos dos casos no se pueden disparar armando una URL: se prueba
  // directamente `whereDeAgenda` — la misma función que usa el endpoint —
  // contra `citasFake`, reusando `coincide`. Es justo la combinación que
  // rompía con `{ ...filtroDeAgenda(actor), ...extra }`.
  const workerConMember: Actor = { rol: "worker", businessId: "negocio-1", memberId: "member-worker-1" }
  const workerSinMember: Actor = { rol: "worker", businessId: "negocio-1", memberId: null }

  it("worker con memberId: un extra con memberId de un colega no le abre su cita (antes sí, pisaba el filtro)", () => {
    const where = whereDeAgenda(workerConMember, { memberId: "member-colega" })

    expect(citasFake.filter((c) => coincide(c, where))).toHaveLength(0)
  })

  it("worker sin memberId: un extra con su propio AND no destapa todas las del negocio (bug de F-002)", () => {
    const where = whereDeAgenda(workerSinMember, { AND: [{ businessId: "negocio-1" }] })

    expect(citasFake.filter((c) => coincide(c, where))).toHaveLength(0)
  })

  it("sin sesión recibe 401", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(null)

    const res = await GET(fakeRequest("http://localhost/api/citas"))

    expect(res.status).toBe(401)
    expect(prismaMock.appointment.findMany).not.toHaveBeenCalled()
  })
})
