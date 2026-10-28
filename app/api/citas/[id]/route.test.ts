import { describe, it, expect, vi, beforeEach } from "vitest"
import { coincideConWhere } from "@/pruebas/where-simple"
import type { NextRequest } from "next/server"
import { cuerpoDePrueba } from "@/pruebas/pedidos"

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const citasFake = [
  { id: "cita-mia", businessId: "negocio-1", memberId: "member-worker-1", customerId: "c-1" },
  { id: "cita-colega", businessId: "negocio-1", memberId: "member-colega", customerId: "c-2" },
  /** Sin profesional asignado: `memberId` es opcional en el esquema, así que existen de verdad. */
  { id: "cita-sin-profesional", businessId: "negocio-1", memberId: null, customerId: "c-3" },
  /** Con su horario, para validar un cambio de sólo el inicio o sólo el fin contra lo guardado. */
  {
    id: "cita-con-horario",
    businessId: "negocio-1",
    memberId: "member-worker-1",
    customerId: "c-1",
    startTime: new Date("2026-10-20T13:00:00.000Z"),
    endTime: new Date("2026-10-20T13:30:00.000Z"),
  },
]

const prismaMock = {
  appointment: {
    findFirst: vi.fn((args: { where: Record<string, unknown> }) =>
      Promise.resolve(citasFake.find((c) => coincideConWhere(c, args.where)) ?? null)
    ),
    update: vi.fn((args: { where: { id: string }; data: Record<string, unknown> }) => {
      const cita = citasFake.find((c) => c.id === args.where.id)
      return Promise.resolve({ ...cita, ...args.data })
    }),
    delete: vi.fn((args: { where: { id: string } }) =>
      Promise.resolve(citasFake.find((c) => c.id === args.where.id))
    ),
    // Las advertencias al mover: acá no hay otras citas con qué chocar.
    findMany: vi.fn(() => Promise.resolve([])),
  },
  // Mover una cita pregunta si tiene una atención en el Tablero, el horario y
  // la zona del negocio. Los escenarios de mover viven en `mover.test.ts`.
  visit: { findFirst: vi.fn(() => Promise.resolve(null)) },
  business: { findUnique: vi.fn(() => Promise.resolve({ timezone: "America/Santiago" })) },
  workSchedule: { findMany: vi.fn(() => Promise.resolve([])) },
  timeBlock: { findMany: vi.fn(() => Promise.resolve([])) },
  businessMember: { findFirst: vi.fn(() => Promise.resolve(null)) },
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

const pedidoFalso = (body?: Record<string, unknown>): NextRequest =>
  ({
    url: "http://localhost/api/citas/cita-colega",
    headers: new Headers(),
    body: cuerpoDePrueba(body ?? {}),
  }) as unknown as NextRequest

const params = (id: string) => ({ params: Promise.resolve({ id }) })

describe("GET /api/citas/[id]", () => {
  beforeEach(() => vi.clearAllMocks())

  it("un worker no llega a la cita de un colega: 404, no 403", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionProfesional)

    const res = await GET(pedidoFalso(), params("cita-colega"))

    expect(res.status).toBe(404)
    const data = await res.json()
    expect(data).toEqual({ error: "Cita no encontrada" })
  })

  it("un worker sí llega a su propia cita", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionProfesional)

    const res = await GET(pedidoFalso(), params("cita-mia"))

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.id).toBe("cita-mia")
  })

  it("el dueño llega a cualquier cita del negocio", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionDueño)

    const res = await GET(pedidoFalso(), params("cita-colega"))

    expect(res.status).toBe(200)
  })

  it("el encargado llega a cualquier cita del negocio", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionEncargado)

    const res = await GET(pedidoFalso(), params("cita-colega"))

    expect(res.status).toBe(200)
  })

  it("un worker sin memberId no llega a ninguna cita (falla cerrado)", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionProfesionalSinMember)

    const res = await GET(pedidoFalso(), params("cita-mia"))

    expect(res.status).toBe(404)
  })

  it("un worker no llega a una cita sin profesional asignado: 404, no 403", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionProfesional)

    const res = await GET(pedidoFalso(), params("cita-sin-profesional"))

    expect(res.status).toBe(404)
  })

  it("el dueño y el encargado llegan a una cita sin profesional asignado", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionDueño)
    const resDueño = await GET(pedidoFalso(), params("cita-sin-profesional"))
    expect(resDueño.status).toBe(200)

    mockGetServerSession.mockResolvedValueOnce(sesionEncargado)
    const resEncargado = await GET(pedidoFalso(), params("cita-sin-profesional"))
    expect(resEncargado.status).toBe(200)
  })
})

describe("PUT /api/citas/[id]", () => {
  beforeEach(() => vi.clearAllMocks())

  it("un worker no puede editar la cita de un colega: 404, no 403", async () => {
    const { PUT } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionProfesional)

    const res = await PUT(pedidoFalso({ title: "Hackeada" }), params("cita-colega"))

    expect(res.status).toBe(404)
    expect(prismaMock.appointment.update).not.toHaveBeenCalled()
  })

  it("un worker sí puede editar su propia cita", async () => {
    const { PUT } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionProfesional)

    const res = await PUT(pedidoFalso({ title: "Actualizada" }), params("cita-mia"))

    expect(res.status).toBe(200)
    expect(prismaMock.appointment.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "cita-mia" } })
    )
  })

  it("el dueño puede editar cualquier cita del negocio", async () => {
    const { PUT } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionDueño)

    const res = await PUT(pedidoFalso({ title: "Editada por el dueño" }), params("cita-colega"))

    expect(res.status).toBe(200)
  })

  it("el encargado puede editar cualquier cita del negocio", async () => {
    const { PUT } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionEncargado)

    const res = await PUT(pedidoFalso({ title: "Editada por el encargado" }), params("cita-colega"))

    expect(res.status).toBe(200)
  })

  it("un worker sin memberId no puede editar ninguna cita", async () => {
    const { PUT } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionProfesionalSinMember)

    const res = await PUT(pedidoFalso({ title: "x" }), params("cita-mia"))

    expect(res.status).toBe(404)
    expect(prismaMock.appointment.update).not.toHaveBeenCalled()
  })

  it("un worker no puede editar una cita sin profesional asignado: 404, no 403", async () => {
    const { PUT } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionProfesional)

    const res = await PUT(pedidoFalso({ title: "xx" }), params("cita-sin-profesional"))

    expect(res.status).toBe(404)
    expect(prismaMock.appointment.update).not.toHaveBeenCalled()
  })

  it("el dueño y el encargado pueden editar una cita sin profesional asignado", async () => {
    const { PUT } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionDueño)
    const resDueño = await PUT(pedidoFalso({ title: "xx" }), params("cita-sin-profesional"))
    expect(resDueño.status).toBe(200)

    mockGetServerSession.mockResolvedValueOnce(sesionEncargado)
    const resEncargado = await PUT(pedidoFalso({ title: "yy" }), params("cita-sin-profesional"))
    expect(resEncargado.status).toBe(200)
  })
})

describe("DELETE /api/citas/[id]", () => {
  beforeEach(() => vi.clearAllMocks())

  it("un worker no puede borrar la cita de un colega: 404, no 403", async () => {
    const { DELETE } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionProfesional)

    const res = await DELETE(pedidoFalso(), params("cita-colega"))

    expect(res.status).toBe(404)
    expect(prismaMock.appointment.delete).not.toHaveBeenCalled()
  })

  it("un worker sí puede borrar su propia cita", async () => {
    const { DELETE } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionProfesional)

    const res = await DELETE(pedidoFalso(), params("cita-mia"))

    expect(res.status).toBe(200)
    expect(prismaMock.appointment.delete).toHaveBeenCalledWith({ where: { id: "cita-mia" } })
  })

  it("el dueño puede borrar cualquier cita del negocio", async () => {
    const { DELETE } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionDueño)

    const res = await DELETE(pedidoFalso(), params("cita-colega"))

    expect(res.status).toBe(200)
  })

  it("el encargado puede borrar cualquier cita del negocio", async () => {
    const { DELETE } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionEncargado)

    const res = await DELETE(pedidoFalso(), params("cita-colega"))

    expect(res.status).toBe(200)
  })

  it("un worker sin memberId no puede borrar ninguna cita", async () => {
    const { DELETE } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionProfesionalSinMember)

    const res = await DELETE(pedidoFalso(), params("cita-mia"))

    expect(res.status).toBe(404)
    expect(prismaMock.appointment.delete).not.toHaveBeenCalled()
  })

  it("un worker no puede borrar una cita sin profesional asignado: 404, no 403", async () => {
    const { DELETE } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionProfesional)

    const res = await DELETE(pedidoFalso(), params("cita-sin-profesional"))

    expect(res.status).toBe(404)
    expect(prismaMock.appointment.delete).not.toHaveBeenCalled()
  })

  it("el dueño y el encargado pueden borrar una cita sin profesional asignado", async () => {
    const { DELETE } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionDueño)
    const resDueño = await DELETE(pedidoFalso(), params("cita-sin-profesional"))
    expect(resDueño.status).toBe(200)

    mockGetServerSession.mockResolvedValueOnce(sesionEncargado)
    const resEncargado = await DELETE(pedidoFalso(), params("cita-sin-profesional"))
    expect(resEncargado.status).toBe(200)
  })
})

describe("PUT /api/citas/[id] — largos, tipos y horario", () => {
  beforeEach(() => vi.clearAllMocks())

  it.each([
    ["un título de 121 caracteres", { title: "a".repeat(121) }, "El título no puede tener más de 120 caracteres"],
    ["unas notas de 2001 caracteres", { notes: "a".repeat(2001) }, "Las notas no pueden tener más de 2000 caracteres"],
    ["un precio de más de 10.000.000", { price: 10_000_001 }, "El precio no puede ser mayor que 10.000.000"],
    ["un estado que no existe", { status: "borrada" }, "Datos inválidos"],
    [
      "inicio y fin invertidos",
      { startTime: "2026-10-20T15:00:00.000Z", endTime: "2026-10-20T14:00:00.000Z" },
      "La cita tiene que terminar después de empezar",
    ],
    ["sólo un fin anterior al inicio guardado", { endTime: "2026-10-20T12:00:00.000Z" }, "La cita tiene que terminar después de empezar"],
    ["sólo un inicio posterior al fin guardado", { startTime: "2026-10-20T14:00:00.000Z" }, "La cita tiene que terminar después de empezar"],
  ])("rechaza %s: 400 con un error legible, sin `detalles`, y no escribe", async (_caso, cuerpo, mensaje) => {
    const { PUT } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionDueño)

    const res = await PUT(pedidoFalso(cuerpo), params("cita-con-horario"))

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: mensaje })
    expect(prismaMock.appointment.update).not.toHaveBeenCalled()
  })

  it("mover sólo el fin a más tarde, contra el inicio guardado, pasa", async () => {
    const { PUT } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionDueño)

    const res = await PUT(pedidoFalso({ endTime: "2026-10-20T14:00:00.000Z" }), params("cita-con-horario"))

    expect(res.status).toBe(200)
  })
})
