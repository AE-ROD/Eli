import { describe, it, expect, vi, beforeEach } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, OTRO_NEGOCIO, conId, datosBase, pedido, sesiones } from "@/pruebas/datos"

/**
 * Reservas por confirmar (#84): una cita con `confirmacionPorFaltas` y status
 * "pendiente" la confirman o la cancelan sólo dueña y encargado
 * (`puedeResolverPorConfirmar`). El profesional, 401 aunque la cita sea suya.
 * Al confirmarla se le avisa al cliente por correo.
 */

const mockGetServerSession = vi.fn()
const mockAvisar = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

vi.mock("@/lib/aviso-de-reserva-confirmada", () => ({
  avisarReservaConfirmadaPorElLocal: (...args: unknown[]) => mockAvisar(...args),
}))

// Cancelar o borrar avisa a la lista de espera con `after` de Next, que acá no existe.
vi.mock("@/lib/lista-de-espera", () => ({ programarAvisoDeHoraLiberada: vi.fn() }))

const base = crearBaseFalsa()

vi.mock("@/lib/prisma", () => ({
  get prisma() {
    return base.prisma
  },
}))

const FUTURA = { startTime: new Date("2099-10-20T13:00:00.000Z"), endTime: new Date("2099-10-20T14:00:00.000Z") }
const PASADA = { startTime: new Date("2026-10-20T13:00:00.000Z"), endTime: new Date("2026-10-20T14:00:00.000Z") }

const cita = (id: string, datos: Record<string, unknown> = {}) => ({
  id,
  businessId: NEGOCIO,
  customerId: "c-maria",
  memberId: "m-carla",
  title: "Corte",
  status: "pendiente",
  source: "reserva-publica",
  ...FUTURA,
  ...datos,
})

beforeEach(() => {
  vi.clearAllMocks()
  base.reiniciar({
    ...datosBase(),
    appointment: [
      cita("por-confirmar", { confirmacionPorFaltas: true }),
      cita("por-confirmar-pasada", { confirmacionPorFaltas: true, ...PASADA }),
      cita("normal"),
      // Ya confirmada por el local: la marca queda como registro y no vuelve a pedir permiso.
      cita("ya-confirmada", { confirmacionPorFaltas: true, status: "confirmada" }),
      { ...cita("ajena", { confirmacionPorFaltas: true }), businessId: OTRO_NEGOCIO, customerId: "c-ajeno", memberId: "m-ajeno" },
    ],
  })
})

async function cambiar(sesion: unknown, id: string, cuerpo: Record<string, unknown>) {
  const { PUT } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  const respuesta = await PUT(pedido(`http://localhost/api/citas/${id}`, cuerpo), conId(id))
  return { status: respuesta.status, cuerpo: await respuesta.json() }
}

async function borrar(sesion: unknown, id: string) {
  const { DELETE } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  const respuesta = await DELETE(pedido(`http://localhost/api/citas/${id}`), conId(id))
  return respuesta.status
}

const estadoDe = (id: string) => base.buscar("appointment", { id })[0]?.status

describe("PUT /api/citas/[id]: una reserva por confirmar (#84)", () => {
  it.each([["confirmada"], ["cancelada"], ["completada"]])(
    "el profesional, aunque la cita sea suya, no la pasa a %s: 401 sin tocar nada",
    async (status) => {
      expect((await cambiar(sesiones.carla, "por-confirmar", { status })).status).toBe(401)
      expect(estadoDe("por-confirmar")).toBe("pendiente")
      expect(mockAvisar).not.toHaveBeenCalled()
    }
  )

  it("el profesional tampoco la marca 'no vino': 401", async () => {
    expect((await cambiar(sesiones.carla, "por-confirmar-pasada", { status: "no-asistio" })).status).toBe(401)
    expect(estadoDe("por-confirmar-pasada")).toBe("pendiente")
  })

  it("el profesional sí edita lo que no es el estado (notas)", async () => {
    const { status } = await cambiar(sesiones.carla, "por-confirmar", { notes: "Llamar antes" })
    expect(status).toBe(200)
    expect(base.buscar("appointment", { id: "por-confirmar" })[0]).toMatchObject({ status: "pendiente", notes: "Llamar antes" })
  })

  it("la dueña la confirma y se le avisa al cliente", async () => {
    const { status } = await cambiar(sesiones.dueña, "por-confirmar", { status: "confirmada" })
    expect(status).toBe(200)
    expect(estadoDe("por-confirmar")).toBe("confirmada")
    expect(mockAvisar).toHaveBeenCalledTimes(1)
    expect(mockAvisar).toHaveBeenCalledWith({ businessId: NEGOCIO, citaId: "por-confirmar" })
  })

  it("el encargado la cancela; cancelar no manda el aviso de confirmada", async () => {
    expect((await cambiar(sesiones.encargado, "por-confirmar", { status: "cancelada" })).status).toBe(200)
    expect(estadoDe("por-confirmar")).toBe("cancelada")
    expect(mockAvisar).not.toHaveBeenCalled()
  })

  it("una de otro negocio: 404 para el dueño ajeno y para la dueña", async () => {
    expect((await cambiar(sesiones.dueñoAjeno, "por-confirmar", { status: "confirmada" })).status).toBe(404)
    expect((await cambiar(sesiones.dueña, "ajena", { status: "confirmada" })).status).toBe(404)
    expect(estadoDe("por-confirmar")).toBe("pendiente")
    expect(estadoDe("ajena")).toBe("pendiente")
    expect(mockAvisar).not.toHaveBeenCalled()
  })

  it("una reserva pendiente SIN la marca la sigue confirmando el profesional, sin aviso", async () => {
    expect((await cambiar(sesiones.carla, "normal", { status: "confirmada" })).status).toBe(200)
    expect(estadoDe("normal")).toBe("confirmada")
    expect(mockAvisar).not.toHaveBeenCalled()
  })

  it("ya confirmada, la marca queda como registro: el profesional la completa", async () => {
    expect((await cambiar(sesiones.carla, "ya-confirmada", { status: "completada" })).status).toBe(200)
    expect(estadoDe("ya-confirmada")).toBe("completada")
  })
})

describe("DELETE /api/citas/[id]: una reserva por confirmar (#84)", () => {
  it("el profesional no la borra: 401", async () => {
    expect(await borrar(sesiones.carla, "por-confirmar")).toBe(401)
    expect(estadoDe("por-confirmar")).toBe("pendiente")
  })

  it("la dueña sí; la de otro negocio, 404", async () => {
    expect(await borrar(sesiones.dueñoAjeno, "por-confirmar")).toBe(404)
    expect(await borrar(sesiones.dueña, "por-confirmar")).toBe(200)
    expect(estadoDe("por-confirmar")).toBeUndefined()
  })
})
