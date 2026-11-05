import { describe, it, expect, vi, beforeEach } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, OTRO_NEGOCIO, conId, datosBase, pedido, sesiones } from "@/pruebas/datos"

/**
 * "En progreso" y "completada" vienen del Tablero (#101): empezar la atención
 * y cobrarla. El PUT de la agenda no las marca a mano, desde ningún estado
 * abierto, para nadie.
 */

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const base = crearBaseFalsa()

vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

const cita = (id: string, datos: Record<string, unknown> = {}) => ({
  id,
  businessId: NEGOCIO,
  customerId: "c-maria",
  memberId: "m-carla",
  title: "Corte",
  status: "pendiente",
  startTime: new Date("2026-10-20T13:00:00.000Z"),
  endTime: new Date("2026-10-20T14:00:00.000Z"),
  ...datos,
})

beforeEach(() => {
  vi.clearAllMocks()
  base.reiniciar({
    ...datosBase(),
    appointment: [
      cita("pendiente"),
      cita("confirmada", { status: "confirmada" }),
      cita("en-progreso", { status: "en-progreso" }),
      cita("completada", { status: "completada" }),
      { ...cita("ajena"), businessId: OTRO_NEGOCIO, customerId: "c-ajeno", memberId: "m-ajeno" },
    ],
  })
})

async function cambiar(sesion: unknown, id: string, cuerpo: Record<string, unknown>) {
  const { PUT } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  const respuesta = await PUT(pedido(`http://localhost/api/citas/${id}`, cuerpo), conId(id))
  return { status: respuesta.status, cuerpo: await respuesta.json() }
}

const estadoDe = (id: string) => base.buscar("appointment", { id })[0]?.status

describe("PUT /api/citas/[id]: en progreso y completada son del Tablero (#101)", () => {
  describe.each(["pendiente", "confirmada"])("desde %s", (desde) => {
    it.each(["en-progreso", "completada"])("no pasa a %s: 409 con el motivo y nada cambia", async (hacia) => {
      const antes = base.volcado()
      const { status, cuerpo } = await cambiar(sesiones.dueña, desde, { status: hacia })

      expect(status).toBe(409)
      expect(cuerpo.error).toMatch(/Tablero/)
      expect(base.volcado()).toEqual(antes)
    })
  })

  it("una en progreso tampoco se completa a mano", async () => {
    const { status } = await cambiar(sesiones.dueña, "en-progreso", { status: "completada" })
    expect(status).toBe(409)
    expect(estadoDe("en-progreso")).toBe("en-progreso")
  })

  it("el profesional, en una cita suya, tampoco", async () => {
    expect((await cambiar(sesiones.carla, "confirmada", { status: "completada" })).status).toBe(409)
    expect(estadoDe("confirmada")).toBe("confirmada")
  })

  it("volver a mandar el estado que ya tiene no es un cambio: 200", async () => {
    expect((await cambiar(sesiones.dueña, "en-progreso", { status: "en-progreso" })).status).toBe(200)
    expect((await cambiar(sesiones.dueña, "completada", { status: "completada" })).status).toBe(200)
  })

  it("los demás cambios de estado siguen igual: confirmar una pendiente", async () => {
    expect((await cambiar(sesiones.dueña, "pendiente", { status: "confirmada" })).status).toBe(200)
    expect(estadoDe("pendiente")).toBe("confirmada")
  })

  it("una cita de otro negocio: 404, antes de cualquier regla", async () => {
    expect((await cambiar(sesiones.dueña, "ajena", { status: "completada" })).status).toBe(404)
  })
})
