import { describe, it, expect, vi, beforeEach } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, OTRO_NEGOCIO, datosBase, sesiones } from "@/pruebas/datos"

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const base = crearBaseFalsa()

vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

async function get(sesion: unknown) {
  const { GET } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  return GET()
}

describe("GET /api/citas/horario-de-atencion", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    base.reiniciar({
      ...datosBase(),
      workSchedule: [
        { id: "h1", businessId: NEGOCIO, memberId: null, dayOfWeek: 1, startTime: "07:00", endTime: "13:00" },
        { id: "h2", businessId: NEGOCIO, memberId: null, dayOfWeek: 1, startTime: "15:00", endTime: "21:00" },
        { id: "h3", businessId: NEGOCIO, memberId: null, dayOfWeek: 2, startTime: "09:00", endTime: "18:00", active: false },
        // Días sin horario general: el del encargado no cuenta, el de una profesional sí (#168).
        { id: "h4", businessId: NEGOCIO, memberId: "m-encargado", dayOfWeek: 4, startTime: "08:00", endTime: "20:00" },
        { id: "h5", businessId: NEGOCIO, memberId: "m-carla", dayOfWeek: 5, startTime: "10:00", endTime: "14:00" },
        { id: "h-ajeno", businessId: OTRO_NEGOCIO, memberId: null, dayOfWeek: 3, startTime: "05:00", endTime: "23:00" },
      ],
    })
  })

  it("sin sesión, 401", async () => {
    const res = await get(null)
    expect(res.status).toBe(401)
  })

  it("devuelve sólo el horario activo del negocio de la sesión, a cualquier rol", async () => {
    for (const sesion of [sesiones.dueña, sesiones.encargado, sesiones.carla]) {
      const res = await get(sesion)
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual([
        { dayOfWeek: 1, startTime: "07:00", endTime: "13:00" },
        { dayOfWeek: 1, startTime: "15:00", endTime: "21:00" },
        { dayOfWeek: 5, startTime: "10:00", endTime: "14:00" },
      ])
    }
  })

  it("el otro negocio no ve este horario, y viceversa", async () => {
    const res = await get(sesiones.dueñoAjeno)
    expect(await res.json()).toEqual([{ dayOfWeek: 3, startTime: "05:00", endTime: "23:00" }])
  })
})
