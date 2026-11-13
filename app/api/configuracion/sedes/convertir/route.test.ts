import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { pedido } from "@/pruebas/datos"
import { MENSAJE_NOMBRE_DE_SEDE_REPETIDO, MENSAJE_PLAN_SIN_SEDES, MENSAJE_YA_HAY_SEDES } from "@/lib/reglas-de-sedes"
import { AHORA, FUTURO, NEGOCIO, OTRO_NEGOCIO, PASADO, cita, datosDeSedes, franja, inscripcion, sede, sesionesDeSedes } from "../_pruebas"

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const base = crearBaseFalsa()

vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

const URL = "http://localhost/api/configuracion/sedes/convertir"

async function convertir(sesion: unknown, cuerpo: unknown) {
  const { POST } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  return POST(pedido(URL, cuerpo))
}

const principal = { nombre: "Casa matriz", direccion: "Av. Siempre Viva 123", comuna: "Providencia", telefono: "+56 9 1234 5678" }
const nueva = { nombre: "Maipú", direccion: "Av. Pajaritos 100", comuna: "Maipú" }

/** Un negocio de hoy: sin sedes, con su horario general, horas de todos los tiempos y estados, y una lista de espera. */
const negocioDeHoy = () =>
  datosDeSedes({
    workSchedule: [
      franja("g1", NEGOCIO, null, 1, "09:00", "13:00"),
      franja("g2", NEGOCIO, null, 1, "15:00", "19:00"),
      franja("g3", NEGOCIO, null, 5, "10:00", "14:00", { active: false }),
      // Del otro negocio: no se toca.
      franja("x1", OTRO_NEGOCIO, null, 1, "09:00", "13:00"),
    ],
    appointment: [
      cita("futura-pendiente", NEGOCIO, null, FUTURO),
      cita("futura-confirmada", NEGOCIO, null, FUTURO, { status: "confirmada" }),
      cita("futura-cancelada", NEGOCIO, null, FUTURO, { status: "cancelada" }),
      cita("futura-no-vino", NEGOCIO, null, FUTURO, { status: "no-asistio" }),
      cita("pasada-completada", NEGOCIO, null, PASADO, { status: "completada" }),
      cita("pasada-pendiente", NEGOCIO, null, PASADO),
      cita("ajena", OTRO_NEGOCIO, null, FUTURO),
    ],
    inscripcionEnEspera: [
      inscripcion("e-activa", NEGOCIO, "s-corte", null),
      inscripcion("e-reservo", NEGOCIO, "s-corte", null, { estado: "reservo" }),
      inscripcion("e-salio", NEGOCIO, "s-corte", null, { estado: "salio" }),
      inscripcion("e-ajena", OTRO_NEGOCIO, "s-ajeno", null),
    ],
  })

const sedeDe = (tabla: "appointment" | "workSchedule" | "inscripcionEnEspera", id: string) => base.buscar(tabla, { id })[0]?.sedeId

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(AHORA)
  base.reiniciar(negocioDeHoy())
})

afterEach(() => vi.useRealTimers())

describe("POST /api/configuracion/sedes/convertir", () => {
  it("pasa de cero sedes a dos y responde 201 con las dos, la principal con el horario que ya tenía", async () => {
    const res = await convertir(sesionesDeSedes.dueña, { principal, nueva })

    expect(res.status).toBe(201)
    const { sedes } = await res.json()
    expect(sedes).toEqual([
      {
        id: expect.any(String),
        nombre: "Casa matriz",
        direccion: "Av. Siempre Viva 123",
        comuna: "Providencia",
        telefono: "+56912345678",
        orden: 0,
        activo: true,
        horarios: [
          { dayOfWeek: 1, franjas: [{ start: "09:00", end: "13:00" }, { start: "15:00", end: "19:00" }] },
        ],
        // Las dos futuras vivas; la cancelada, la de "no vino" y las pasadas no.
        horasFuturas: 2,
      },
      { id: expect.any(String), nombre: "Maipú", direccion: "Av. Pajaritos 100", comuna: "Maipú", telefono: null, orden: 1, activo: true, horarios: [], horasFuturas: 0 },
    ])
    expect(base.buscar("sede", { businessId: NEGOCIO })).toHaveLength(2)
  })

  it("le pasa a la principal TODO el horario general (también las franjas inactivas) y deja la nueva sin horario", async () => {
    const { sedes } = await (await convertir(sesionesDeSedes.dueña, { principal, nueva })).json()
    const [idPrincipal, idNueva] = [sedes[0].id, sedes[1].id]

    for (const id of ["g1", "g2", "g3"]) expect(sedeDe("workSchedule", id)).toBe(idPrincipal)
    expect(base.buscar("workSchedule", { sedeId: idNueva })).toHaveLength(0)
    // Sigue siendo el horario del negocio (sin integrante), ahora de la sede: no queda ninguna fila general.
    expect(base.buscar("workSchedule", { businessId: NEGOCIO, sedeId: null })).toHaveLength(0)
  })

  it("estampa la principal en las horas por delante vivas y en las inscripciones activas; las pasadas y las cerradas quedan como estaban", async () => {
    const { sedes } = await (await convertir(sesionesDeSedes.dueña, { principal, nueva })).json()
    const idPrincipal = sedes[0].id

    expect(sedeDe("appointment", "futura-pendiente")).toBe(idPrincipal)
    expect(sedeDe("appointment", "futura-confirmada")).toBe(idPrincipal)
    for (const id of ["futura-cancelada", "futura-no-vino", "pasada-completada", "pasada-pendiente"]) {
      expect(sedeDe("appointment", id)).toBeNull()
    }
    expect(sedeDe("inscripcionEnEspera", "e-activa")).toBe(idPrincipal)
    expect(sedeDe("inscripcionEnEspera", "e-reservo")).toBeNull()
    expect(sedeDe("inscripcionEnEspera", "e-salio")).toBeNull()
  })

  it("no toca nada del otro negocio", async () => {
    await convertir(sesionesDeSedes.dueña, { principal, nueva })

    expect(sedeDe("workSchedule", "x1")).toBeNull()
    expect(sedeDe("appointment", "ajena")).toBeNull()
    expect(sedeDe("inscripcionEnEspera", "e-ajena")).toBeNull()
    expect(base.buscar("sede", { businessId: OTRO_NEGOCIO })).toHaveLength(0)
  })

  it("el negocio sale de la sesión: un businessId en el cuerpo no cambia a quién se convierte", async () => {
    const res = await convertir(sesionesDeSedes.dueña, {
      principal: { ...principal, businessId: OTRO_NEGOCIO },
      nueva: { ...nueva, businessId: OTRO_NEGOCIO },
      businessId: OTRO_NEGOCIO,
    })

    expect(res.status).toBe(201)
    expect(base.buscar("sede", { businessId: OTRO_NEGOCIO })).toHaveLength(0)
    expect(base.buscar("sede", { businessId: NEGOCIO })).toHaveLength(2)
  })

  it("las franjas que una sede no puede guardar (una hora rota que se coló antes) se quedan donde estaban: la conversión no falla", async () => {
    base.reiniciar(
      datosDeSedes({
        workSchedule: [
          franja("buena", NEGOCIO, null, 1, "09:00", "13:00"),
          franja("rota-1", NEGOCIO, null, 2, "9:00", "13:00"),
          franja("rota-2", NEGOCIO, null, 3, "10:00", "24:00"),
          franja("rota-3", NEGOCIO, null, 4, "18:00", "09:00"),
        ],
      })
    )

    const res = await convertir(sesionesDeSedes.dueña, { principal, nueva })

    expect(res.status).toBe(201)
    const idPrincipal = (await res.json()).sedes[0].id
    expect(sedeDe("workSchedule", "buena")).toBe(idPrincipal)
    for (const id of ["rota-1", "rota-2", "rota-3"]) expect(sedeDe("workSchedule", id)).toBeNull()
  })

  it("el horario de un integrante (memberId) no se toca", async () => {
    base.reiniciar({
      ...datosDeSedes({ workSchedule: [franja("g1", NEGOCIO, null, 1, "09:00", "13:00"), franja("m1", NEGOCIO, null, 2, "09:00", "13:00", { memberId: "m-carla" })] }),
      businessMember: [{ id: "m-carla", businessId: NEGOCIO, userId: "u-carla", role: "worker" }],
    })

    await convertir(sesionesDeSedes.dueña, { principal, nueva })

    expect(sedeDe("workSchedule", "g1")).not.toBeNull()
    expect(sedeDe("workSchedule", "m1")).toBeNull()
  })

  it("toma el candado de planes y sedes antes de leer ni escribir", async () => {
    await convertir(sesionesDeSedes.dueña, { principal, nueva })

    expect(base.transaccion.$executeRaw.mock.calls.map((llamada) => (llamada as unknown[])[1])).toEqual(["plan-y-sedes:negocio-1"])
    expect(base.transaccion.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(base.prisma.sede.create.mock.invocationCallOrder[0])
  })

  it("es todo o nada: si falla un paso del medio no queda ni una sede, ni horario movido, ni hora estampada", async () => {
    const consola = vi.spyOn(console, "error").mockImplementation(() => {})
    const antes = base.volcado()
    base.prisma.inscripcionEnEspera.updateMany.mockRejectedValueOnce(new Error("se cayó"))

    const res = await convertir(sesionesDeSedes.dueña, { principal, nueva })

    expect(res.status).toBe(500)
    expect(base.volcado()).toEqual(antes)
    consola.mockRestore()
  })

  describe("409", () => {
    it("si el negocio ya tiene sedes activas, no se convierte de nuevo y no se escribe nada", async () => {
      base.reiniciar(datosDeSedes({ sede: [sede("a", NEGOCIO, "Centro"), sede("b", NEGOCIO, "Providencia")] }))
      const antes = base.volcado()

      const res = await convertir(sesionesDeSedes.dueña, { principal, nueva })

      expect(res.status).toBe(409)
      expect(await res.json()).toEqual({ error: MENSAJE_YA_HAY_SEDES })
      expect(base.volcado()).toEqual(antes)
    })

    it("con sedes pero todas inactivas sí se puede (el negocio vuelve a estar en cero sedes activas)", async () => {
      base.reiniciar(negocioDeHoy())
      base.reiniciar({ ...negocioDeHoy(), sede: [sede("v", NEGOCIO, "Vieja", { activo: false, orden: 4 })] })

      const res = await convertir(sesionesDeSedes.dueña, { principal, nueva })

      expect(res.status).toBe(201)
      const { sedes } = await res.json()
      expect(sedes).toHaveLength(3)
      // Las nuevas van después de la vieja.
      expect(sedes.map((s: { nombre: string }) => s.nombre)).toEqual(["Vieja", "Casa matriz", "Maipú"])
      expect(sedes.map((s: { activo: boolean }) => s.activo)).toEqual([false, true, true])
    })

    it("un nombre que ya tiene una sede desactivada: 409", async () => {
      base.reiniciar({ ...negocioDeHoy(), sede: [sede("v", NEGOCIO, "casa MATRIZ", { activo: false })] })
      const antes = base.volcado()

      const res = await convertir(sesionesDeSedes.dueña, { principal, nueva })

      expect(res.status).toBe(409)
      expect(await res.json()).toEqual({ error: MENSAJE_NOMBRE_DE_SEDE_REPETIDO })
      expect(base.volcado()).toEqual(antes)
    })

    it("el plan se lee de la base: un negocio que ya es Equipo no se convierte aunque el token diga Independiente", async () => {
      base.reiniciar({ ...negocioDeHoy(), business: [{ id: NEGOCIO, name: "Salón Uno", slug: "salon-uno", userId: "u-duena", plan: "equipo" }] })
      const antes = base.volcado()

      const res = await convertir(sesionesDeSedes.dueña, { principal, nueva })

      expect(res.status).toBe(409)
      expect(await res.json()).toEqual({ error: MENSAJE_PLAN_SIN_SEDES })
      expect(base.volcado()).toEqual(antes)
    })
  })

  describe("sin permiso: 401 y no se escribe nada", () => {
    it.each([
      ["el encargado", sesionesDeSedes.encargado],
      ["una profesional", sesionesDeSedes.profesional],
      ["la dueña de un negocio Equipo", sesionesDeSedes.dueñaEquipo],
      ["nadie con sesión", null],
    ])("%s", async (_quien, sesion) => {
      const antes = base.volcado()

      const res = await convertir(sesion, { principal, nueva })

      expect(res.status).toBe(401)
      expect(base.volcado()).toEqual(antes)
    })
  })

  describe("datos inválidos: 400 y no se escribe", () => {
    it.each([
      ["sin cuerpo", undefined, "Datos inválidos"],
      ["sin la sede nueva", { principal }, "Datos inválidos"],
      ["sin la principal", { nueva }, "Datos inválidos"],
      ["una principal sin dirección", { principal: { ...principal, direccion: " " }, nueva }, "Escribe la dirección de la sede"],
      ["una nueva sin nombre", { principal, nueva: { ...nueva, nombre: "" } }, "Escribe el nombre de la sede"],
      ["un teléfono que no se lee", { principal: { ...principal, telefono: "abc" }, nueva }, expect.stringContaining("No pudimos leer el teléfono")],
      ["las dos con el mismo nombre", { principal, nueva: { ...nueva, nombre: "CASA matriz" } }, "Las dos sedes necesitan nombres distintos"],
    ])("%s", async (_caso, cuerpo, mensaje) => {
      const antes = base.volcado()

      const res = await convertir(sesionesDeSedes.dueña, cuerpo)

      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: mensaje })
      expect(base.volcado()).toEqual(antes)
    })
  })
})
