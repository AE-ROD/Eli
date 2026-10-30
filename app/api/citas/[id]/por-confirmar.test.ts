import { describe, it, expect, vi, beforeEach } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { MENSAJE_CANCELACION_CAMBIO, MENSAJE_CONFIRMACION_CAMBIO } from "@/lib/por-confirmar"
import { NEGOCIO, OTRO_NEGOCIO, atencion, conId, datosBase, pedido, sesiones } from "@/pruebas/datos"

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
      // El cliente ya llegó al Tablero; en la otra, la atención se anuló.
      cita("llego", { confirmacionPorFaltas: true }),
      cita("llego-anulada", { confirmacionPorFaltas: true }),
    ],
    visit: [
      atencion("v-llego", { appointmentId: "llego", status: "en-espera" }),
      atencion("v-anulada", { appointmentId: "llego-anulada", status: "anulada" }),
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

  it("dos 'Confirmar' a la vez: la cita queda confirmada y al cliente le llega UN correo", async () => {
    const [una, otra] = await Promise.all([
      cambiar(sesiones.dueña, "por-confirmar", { status: "confirmada" }),
      cambiar(sesiones.encargado, "por-confirmar", { status: "confirmada" }),
    ])
    expect([una.status, otra.status]).toEqual([200, 200])
    expect(estadoDe("por-confirmar")).toBe("confirmada")
    expect(mockAvisar).toHaveBeenCalledTimes(1)
  })

  it("si otro la resolvió entre la lectura y la escritura: no se pisa ni se avisa", async () => {
    const leida = base.buscar("appointment", { id: "por-confirmar" })[0]
    // Ya la confirmó otro; esta petición la leyó todavía pendiente.
    base.prisma.appointment.update({ where: { id: "por-confirmar" }, data: { status: "confirmada" } })
    base.prisma.appointment.findFirst.mockResolvedValueOnce({ ...leida, status: "pendiente" })
    const confirmar = await cambiar(sesiones.dueña, "por-confirmar", { status: "confirmada" })
    expect(confirmar.status).toBe(200)
    expect(confirmar.cuerpo.status).toBe("confirmada")
    expect(mockAvisar).not.toHaveBeenCalled()

    // Y si pedía cancelarla: 409, sigue confirmada.
    base.prisma.appointment.findFirst.mockResolvedValueOnce({ ...leida, status: "pendiente" })
    const cancelar = await cambiar(sesiones.encargado, "por-confirmar", { status: "cancelada" })
    expect(cancelar.status).toBe(409)
    expect(cancelar.cuerpo.error).toBe(MENSAJE_CANCELACION_CAMBIO)
    expect(estadoDe("por-confirmar")).toBe("confirmada")
    expect(mockAvisar).not.toHaveBeenCalled()
  })

  it("el perdedor de la carrera que traía además notas, precio u horario: 409, no 200 en silencio", async () => {
    const leida = base.buscar("appointment", { id: "por-confirmar" })[0]
    base.prisma.appointment.update({ where: { id: "por-confirmar" }, data: { status: "confirmada" } })
    for (const extra of [{ notes: "Pagó abono" }, { price: 9000 }, { startTime: "2099-10-21T13:00:00.000Z", endTime: "2099-10-21T14:00:00.000Z", confirmarAdvertencias: true }]) {
      base.prisma.appointment.findFirst.mockResolvedValueOnce({ ...leida, status: "pendiente" })
      const respuesta = await cambiar(sesiones.dueña, "por-confirmar", { status: "confirmada", ...extra })
      expect(respuesta.status).toBe(409)
      // El mensaje habla de confirmar, no de reactivar (#136).
      expect(respuesta.cuerpo.error).toBe(MENSAJE_CONFIRMACION_CAMBIO)
    }
    // Lo que perdió no quedó a medias: ni la nota ni el precio ni el horario.
    expect(base.buscar("appointment", { id: "por-confirmar" })[0]).toMatchObject({
      status: "confirmada",
      startTime: FUTURA.startTime,
    })
    expect(base.buscar("appointment", { id: "por-confirmar" })[0].notes ?? null).toBeNull()
    expect(base.buscar("appointment", { id: "por-confirmar" })[0].price ?? null).toBeNull()
    expect(mockAvisar).not.toHaveBeenCalled()
  })

  it("si el cliente ya llegó al Tablero, confirmarla la confirma pero NO le manda el correo", async () => {
    expect((await cambiar(sesiones.dueña, "llego", { status: "confirmada" })).status).toBe(200)
    expect(estadoDe("llego")).toBe("confirmada")
    expect(mockAvisar).not.toHaveBeenCalled()
  })

  it("si el cliente ya llegó al Tablero, cancelarla responde 409: primero se anula la atención", async () => {
    const { status, cuerpo } = await cambiar(sesiones.encargado, "llego", { status: "cancelada" })
    expect(status).toBe(409)
    expect(cuerpo.error).toBe("Esta cita ya tiene una atención en el Tablero: anúlala ahí primero")
    expect(estadoDe("llego")).toBe("pendiente")
  })

  it("con la atención anulada, vuelve a ser una por confirmar cualquiera: se confirma con correo o se cancela", async () => {
    expect((await cambiar(sesiones.dueña, "llego-anulada", { status: "confirmada" })).status).toBe(200)
    expect(mockAvisar).toHaveBeenCalledWith({ businessId: NEGOCIO, citaId: "llego-anulada" })

    base.prisma.appointment.update({ where: { id: "llego-anulada" }, data: { status: "pendiente" } })
    expect((await cambiar(sesiones.encargado, "llego-anulada", { status: "cancelada" })).status).toBe(200)
    expect(estadoDe("llego-anulada")).toBe("cancelada")
  })

  it("la atención se busca filtrando por el negocio de la sesión", async () => {
    const { PUT } = await import("./route")
    const visitas = base.prisma.visit.findFirst
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)
    await PUT(pedido("http://localhost/api/citas/por-confirmar", { status: "confirmada" }), conId("por-confirmar"))
    expect(visitas).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ businessId: NEGOCIO }) }))
    expect(mockAvisar).toHaveBeenCalledTimes(1)
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
