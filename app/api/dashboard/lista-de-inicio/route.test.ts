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

const EN_UN_MES = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
const COMPARTIDO_ANTES = new Date("2026-01-05T12:00:00.000Z")

/**
 * El negocio 1 no hizo nada todavía (sólo tiene servicios, de `datosBase`).
 * El negocio 2 hizo todo: horario, enlace compartido y una reserva pública.
 * Si algo del 2 se cuela en la lista del 1, el paso aparece hecho.
 */
function escenario() {
  const datos = datosBase()
  return {
    ...datos,
    business: [
      { ...datos.business[0], pruebaTerminaEl: EN_UN_MES, codigoInvitacion: "codigo-uno" },
      {
        ...datos.business[1],
        pruebaTerminaEl: EN_UN_MES,
        codigoInvitacion: "codigo-dos",
        enlaceCompartidoAt: COMPARTIDO_ANTES,
      },
    ],
    // Los servicios del negocio 1 se apagan: el único activo es del otro.
    service: datos.service.map((servicio) =>
      servicio.businessId === NEGOCIO ? { ...servicio, active: false } : servicio
    ),
    workSchedule: [
      { id: "h-ajeno", businessId: OTRO_NEGOCIO, memberId: null, dayOfWeek: 1, startTime: "09:00", endTime: "18:00", active: true },
      // Del negocio 1, pero apagado: no cuenta.
      { id: "h-apagado", businessId: NEGOCIO, memberId: null, dayOfWeek: 2, startTime: "09:00", endTime: "18:00", active: false },
    ],
    appointment: [
      {
        id: "cita-ajena",
        businessId: OTRO_NEGOCIO,
        title: "Corte",
        source: "reserva-publica",
        startTime: new Date("2026-10-06T14:00:00.000Z"),
        endTime: new Date("2026-10-06T14:30:00.000Z"),
      },
      // Del negocio 1, pero cargada desde el panel: no es la primera reserva pública.
      {
        id: "cita-panel",
        businessId: NEGOCIO,
        title: "Corte",
        source: "panel",
        startTime: new Date("2026-10-06T15:00:00.000Z"),
        endTime: new Date("2026-10-06T15:30:00.000Z"),
      },
    ],
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  base.reiniciar(escenario())
})

const leer = async () => {
  const { GET } = await import("./route")
  return GET()
}

const marcar = async () => {
  const { POST } = await import("./enlace-compartido/route")
  return POST()
}

const enlaceDe = (id: string) => base.buscar("business", { id })[0].enlaceCompartidoAt

describe("GET /api/dashboard/lista-de-inicio", () => {
  it("no ve nada del otro negocio: todos los pasos quedan sin hacer", async () => {
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)

    const respuesta = await leer()

    expect(respuesta.status).toBe(200)
    expect(await respuesta.json()).toEqual({
      pasos: { horario: false, servicios: false, enlace: false, primeraReserva: false },
      pruebaTerminada: false,
    })
  })

  it("marca cada paso con los datos del propio negocio", async () => {
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueñoAjeno)

    const respuesta = await leer()

    expect(await respuesta.json()).toEqual({
      pasos: { horario: true, servicios: true, enlace: true, primeraReserva: true },
      pruebaTerminada: false,
    })
  })

  it("sólo viaja un sí o un no por paso: ni ids ni fechas", async () => {
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueñoAjeno)

    const texto = JSON.stringify(await (await leer()).json())

    expect(texto).not.toContain("h-ajeno")
    expect(texto).not.toContain("cita-ajena")
    expect(texto).not.toContain("2026")
  })

  it("dice si la prueba ya terminó", async () => {
    base.reiniciar({
      ...escenario(),
      business: escenario().business.map((negocio) => ({ ...negocio, pruebaTerminaEl: new Date("2020-01-01") })),
    })
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)

    expect((await (await leer()).json()).pruebaTerminada).toBe(true)
  })

  it.each([
    ["sin sesión", null],
    ["encargado", sesiones.encargado],
    ["profesional", sesiones.carla],
  ])("%s → 401", async (_quien, sesion) => {
    mockGetServerSession.mockResolvedValueOnce(sesion)

    expect((await leer()).status).toBe(401)
    expect(base.prisma.business.findUnique).not.toHaveBeenCalled()
  })
})

describe("POST /api/dashboard/lista-de-inicio/enlace-compartido", () => {
  it("anota la fecha en el negocio de la sesión, y sólo en ése", async () => {
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)

    const respuesta = await marcar()

    expect(respuesta.status).toBe(200)
    expect(await respuesta.json()).toEqual({ marcado: true })
    expect(enlaceDe(NEGOCIO)).toBeInstanceOf(Date)
    expect(enlaceDe(OTRO_NEGOCIO)).toEqual(COMPARTIDO_ANTES)
  })

  it("marcar dos veces no cambia la fecha de la primera", async () => {
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)
    await marcar()
    const primera = enlaceDe(NEGOCIO)

    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)
    const segunda = await marcar()

    expect(await segunda.json()).toEqual({ marcado: false })
    expect(enlaceDe(NEGOCIO)).toEqual(primera)
  })

  it("el dueño ajeno no pisa la fecha que ya tenía ni toca el negocio 1", async () => {
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueñoAjeno)

    expect(await (await marcar()).json()).toEqual({ marcado: false })
    expect(enlaceDe(OTRO_NEGOCIO)).toEqual(COMPARTIDO_ANTES)
    expect(enlaceDe(NEGOCIO)).toBeNull()
  })

  it.each([
    ["sin sesión", null],
    ["encargado", sesiones.encargado],
    ["profesional", sesiones.carla],
  ])("%s → 401 y no escribe nada", async (_quien, sesion) => {
    const antes = base.volcado()
    mockGetServerSession.mockResolvedValueOnce(sesion)

    expect((await marcar()).status).toBe(401)
    expect(base.volcado()).toEqual(antes)
  })
})
