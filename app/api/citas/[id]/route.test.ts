import { describe, it, expect, vi, beforeEach } from "vitest"
import type { NextRequest } from "next/server"

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

/**
 * Mismo helper que `app/api/citas/route.test.ts`: entiende las formas de
 * `where` que produce `lib/permisos` (`AND`, igualdad simple, `{ in: [...] }`),
 * para que el mock de Prisma filtre de verdad en vez de sólo inspeccionar el
 * argumento.
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
  /** Sin profesional asignado: `memberId` es opcional en el esquema, así que existen de verdad. */
  { id: "cita-sin-profesional", businessId: "negocio-1", memberId: null, patientId: "p-3" },
]

const prismaMock = {
  appointment: {
    findFirst: vi.fn((args: { where: Record<string, unknown> }) =>
      Promise.resolve(citasFake.find((c) => coincide(c, args.where)) ?? null)
    ),
    update: vi.fn((args: { where: { id: string }; data: Record<string, unknown> }) => {
      const cita = citasFake.find((c) => c.id === args.where.id)
      return Promise.resolve({ ...cita, ...args.data })
    }),
    delete: vi.fn((args: { where: { id: string } }) =>
      Promise.resolve(citasFake.find((c) => c.id === args.where.id))
    ),
  },
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

/** Worker legítimo del negocio, pero sin `memberId` asignado: falla cerrado. */
const sesionProfesionalSinMember = {
  user: {
    id: "worker-2",
    role: "worker",
    businessId: "negocio-1",
    businessName: "Mi negocio",
  },
}

/**
 * El encargado, a diferencia del dueño, es miembro del negocio: tiene
 * `memberId`. Ve toda la agenda igual (por `puedeVerTodaLaAgenda`), no porque
 * le falte el filtro por profesional.
 */
const sesionEncargado = {
  user: {
    id: "admin-1",
    role: "admin",
    businessId: "negocio-1",
    businessName: "Mi negocio",
    memberId: "member-admin-1",
  },
}

const fakeRequest = (body?: Record<string, unknown>): NextRequest =>
  ({
    url: "http://localhost/api/citas/cita-colega",
    json: () => Promise.resolve(body ?? {}),
  }) as unknown as NextRequest

const params = (id: string) => ({ params: Promise.resolve({ id }) })

describe("GET /api/citas/[id]", () => {
  beforeEach(() => vi.clearAllMocks())

  it("un worker no llega a la cita de un colega: 404, no 403", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionProfesional)

    const res = await GET(fakeRequest(), params("cita-colega"))

    expect(res.status).toBe(404)
    const data = await res.json()
    expect(data).toEqual({ error: "Cita no encontrada" })
  })

  it("un worker sí llega a su propia cita", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionProfesional)

    const res = await GET(fakeRequest(), params("cita-mia"))

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.id).toBe("cita-mia")
  })

  it("el dueño llega a cualquier cita del negocio", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionDueño)

    const res = await GET(fakeRequest(), params("cita-colega"))

    expect(res.status).toBe(200)
  })

  it("el encargado llega a cualquier cita del negocio", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionEncargado)

    const res = await GET(fakeRequest(), params("cita-colega"))

    expect(res.status).toBe(200)
  })

  it("un worker sin memberId no llega a ninguna cita (falla cerrado)", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionProfesionalSinMember)

    const res = await GET(fakeRequest(), params("cita-mia"))

    expect(res.status).toBe(404)
  })

  it("un worker no llega a una cita sin profesional asignado: 404, no 403", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionProfesional)

    const res = await GET(fakeRequest(), params("cita-sin-profesional"))

    expect(res.status).toBe(404)
  })

  it("el dueño y el encargado llegan a una cita sin profesional asignado", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionDueño)
    const resDueño = await GET(fakeRequest(), params("cita-sin-profesional"))
    expect(resDueño.status).toBe(200)

    mockGetServerSession.mockResolvedValueOnce(sesionEncargado)
    const resEncargado = await GET(fakeRequest(), params("cita-sin-profesional"))
    expect(resEncargado.status).toBe(200)
  })
})

describe("PUT /api/citas/[id]", () => {
  beforeEach(() => vi.clearAllMocks())

  it("un worker no puede editar la cita de un colega: 404, no 403", async () => {
    const { PUT } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionProfesional)

    const res = await PUT(fakeRequest({ title: "Hackeada" }), params("cita-colega"))

    expect(res.status).toBe(404)
    expect(prismaMock.appointment.update).not.toHaveBeenCalled()
  })

  it("un worker sí puede editar su propia cita", async () => {
    const { PUT } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionProfesional)

    const res = await PUT(fakeRequest({ title: "Actualizada" }), params("cita-mia"))

    expect(res.status).toBe(200)
    expect(prismaMock.appointment.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "cita-mia" } })
    )
  })

  it("el dueño puede editar cualquier cita del negocio", async () => {
    const { PUT } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionDueño)

    const res = await PUT(fakeRequest({ title: "Editada por el dueño" }), params("cita-colega"))

    expect(res.status).toBe(200)
  })

  it("el encargado puede editar cualquier cita del negocio", async () => {
    const { PUT } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionEncargado)

    const res = await PUT(fakeRequest({ title: "Editada por el encargado" }), params("cita-colega"))

    expect(res.status).toBe(200)
  })

  it("un worker sin memberId no puede editar ninguna cita", async () => {
    const { PUT } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionProfesionalSinMember)

    const res = await PUT(fakeRequest({ title: "x" }), params("cita-mia"))

    expect(res.status).toBe(404)
    expect(prismaMock.appointment.update).not.toHaveBeenCalled()
  })

  it("un worker no puede editar una cita sin profesional asignado: 404, no 403", async () => {
    const { PUT } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionProfesional)

    const res = await PUT(fakeRequest({ title: "xx" }), params("cita-sin-profesional"))

    expect(res.status).toBe(404)
    expect(prismaMock.appointment.update).not.toHaveBeenCalled()
  })

  it("el dueño y el encargado pueden editar una cita sin profesional asignado", async () => {
    const { PUT } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionDueño)
    const resDueño = await PUT(fakeRequest({ title: "xx" }), params("cita-sin-profesional"))
    expect(resDueño.status).toBe(200)

    mockGetServerSession.mockResolvedValueOnce(sesionEncargado)
    const resEncargado = await PUT(fakeRequest({ title: "yy" }), params("cita-sin-profesional"))
    expect(resEncargado.status).toBe(200)
  })
})

describe("DELETE /api/citas/[id]", () => {
  beforeEach(() => vi.clearAllMocks())

  it("un worker no puede borrar la cita de un colega: 404, no 403", async () => {
    const { DELETE } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionProfesional)

    const res = await DELETE(fakeRequest(), params("cita-colega"))

    expect(res.status).toBe(404)
    expect(prismaMock.appointment.delete).not.toHaveBeenCalled()
  })

  it("un worker sí puede borrar su propia cita", async () => {
    const { DELETE } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionProfesional)

    const res = await DELETE(fakeRequest(), params("cita-mia"))

    expect(res.status).toBe(200)
    expect(prismaMock.appointment.delete).toHaveBeenCalledWith({ where: { id: "cita-mia" } })
  })

  it("el dueño puede borrar cualquier cita del negocio", async () => {
    const { DELETE } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionDueño)

    const res = await DELETE(fakeRequest(), params("cita-colega"))

    expect(res.status).toBe(200)
  })

  it("el encargado puede borrar cualquier cita del negocio", async () => {
    const { DELETE } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionEncargado)

    const res = await DELETE(fakeRequest(), params("cita-colega"))

    expect(res.status).toBe(200)
  })

  it("un worker sin memberId no puede borrar ninguna cita", async () => {
    const { DELETE } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionProfesionalSinMember)

    const res = await DELETE(fakeRequest(), params("cita-mia"))

    expect(res.status).toBe(404)
    expect(prismaMock.appointment.delete).not.toHaveBeenCalled()
  })

  it("un worker no puede borrar una cita sin profesional asignado: 404, no 403", async () => {
    const { DELETE } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionProfesional)

    const res = await DELETE(fakeRequest(), params("cita-sin-profesional"))

    expect(res.status).toBe(404)
    expect(prismaMock.appointment.delete).not.toHaveBeenCalled()
  })

  it("el dueño y el encargado pueden borrar una cita sin profesional asignado", async () => {
    const { DELETE } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionDueño)
    const resDueño = await DELETE(fakeRequest(), params("cita-sin-profesional"))
    expect(resDueño.status).toBe(200)

    mockGetServerSession.mockResolvedValueOnce(sesionEncargado)
    const resEncargado = await DELETE(fakeRequest(), params("cita-sin-profesional"))
    expect(resEncargado.status).toBe(200)
  })
})
