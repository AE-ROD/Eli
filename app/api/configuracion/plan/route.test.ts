import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { pedido } from "@/pruebas/datos"
import { MENSAJE_FALTA_LA_SEDE_QUE_SE_QUEDA, MENSAJE_SEDE_QUE_SE_QUEDA_NO_VALE } from "@/lib/cambio-de-plan"
import {
  AHORA,
  FUTURO,
  NEGOCIO,
  OTRO_NEGOCIO,
  PASADO,
  cita,
  datosDeSedes,
  franja,
  inscripcion,
  sede,
  sesionesDeSedes,
} from "../sedes/_pruebas"

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const base = crearBaseFalsa()

vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

const URL = "http://localhost/api/configuracion/plan"

async function cambiar(sesion: unknown, cuerpo: unknown) {
  const { PATCH } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  return PATCH(pedido(URL, cuerpo))
}

const planDe = (negocio = NEGOCIO) => base.buscar("business", { id: negocio })[0].plan
const negocio = (plan: string, extra: Record<string, unknown> = {}) => [
  { id: NEGOCIO, name: "Salón Uno", slug: "salon-uno", userId: "u-duena", plan, address: "Av. Siempre Viva 123", comuna: "Providencia", ...extra },
  { id: OTRO_NEGOCIO, name: "Salón Dos", slug: "salon-dos", userId: "u-otro", plan: "independiente", address: "Otra calle 9", comuna: "Maipú" },
]

/** Un Independiente con Centro (a), Providencia (b) y una vieja inactiva (v), con su horario, horas y lista de espera. */
const independienteConSedes = (extra: Record<string, Record<string, unknown>[]> = {}) => ({
  ...datosDeSedes({
    sede: [
      sede("a", NEGOCIO, "Centro", { direccion: "Huérfanos 500", comuna: "Santiago", orden: 0 }),
      sede("b", NEGOCIO, "Providencia", { direccion: "Providencia 2000", comuna: "Providencia", orden: 1 }),
      sede("v", NEGOCIO, "Vieja", { orden: 2, activo: false }),
      sede("x", OTRO_NEGOCIO, "Centro"),
    ],
    workSchedule: [
      franja("a1", NEGOCIO, "a", 1, "09:00", "13:00"),
      franja("a2", NEGOCIO, "a", 3, "09:00", "13:00", { active: false }),
      franja("b1", NEGOCIO, "b", 2, "14:00", "18:00"),
      franja("g1", NEGOCIO, null, 5, "10:00", "11:00"),
      franja("x1", OTRO_NEGOCIO, "x", 1, "09:00", "13:00"),
    ],
    ...extra,
  }),
  business: negocio("independiente"),
})

const sedeDe = (tabla: "appointment" | "workSchedule" | "inscripcionEnEspera", id: string) => base.buscar(tabla, { id })[0]?.sedeId

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(AHORA)
  base.reiniciar(independienteConSedes())
})

afterEach(() => vi.useRealTimers())

describe("PATCH /api/configuracion/plan: quién puede", () => {
  it.each([
    ["el encargado", sesionesDeSedes.encargado],
    ["una profesional", sesionesDeSedes.profesional],
    ["nadie con sesión", null],
  ])("%s no: 401 y no se escribe nada", async (_quien, sesion) => {
    const antes = base.volcado()

    const res = await cambiar(sesion, { plan: "equipo", sedeQueSeQueda: "a" })

    expect(res.status).toBe(401)
    expect(base.volcado()).toEqual(antes)
  })

  it.each([
    ["con el token de Independiente", sesionesDeSedes.dueña],
    ["con el token de Equipo", sesionesDeSedes.dueñaEquipo],
    ["con una sesión sin plan", sesionesDeSedes.dueñaSinPlan],
  ])("la dueña sí, %s: lo que decide es la base", async (_caso, sesion) => {
    base.reiniciar({ ...datosDeSedes(), business: negocio("independiente") })

    const res = await cambiar(sesion, { plan: "equipo" })

    expect(res.status).toBe(200)
    expect(planDe()).toBe("equipo")
  })

  it("la dueña del otro negocio cambia el SUYO: el negocio sale de la sesión y el cuerpo no puede nombrar otro", async () => {
    base.reiniciar({ ...datosDeSedes(), business: negocio("independiente") })

    const res = await cambiar(sesionesDeSedes.dueñaAjena, { plan: "equipo", businessId: NEGOCIO })

    expect(res.status).toBe(200)
    expect(planDe(OTRO_NEGOCIO)).toBe("equipo")
    expect(planDe(NEGOCIO)).toBe("independiente")
  })
})

describe("PATCH /api/configuracion/plan: el pedido", () => {
  it.each([
    ["sin cuerpo", undefined],
    ["un JSON roto", "{no"],
    ["sin plan", {}],
    ["un plan que no existe", { plan: "premium" }],
    ["un plan que no es texto", { plan: 3 }],
    ["un plan en mayúsculas", { plan: "Equipo" }],
    ["una sede que no es texto", { plan: "equipo", sedeQueSeQueda: 5 }],
  ])("%s: 400 con un mensaje legible y no se escribe", async (_caso, cuerpo) => {
    const antes = base.volcado()

    const res = await cambiar(sesionesDeSedes.dueña, cuerpo)

    expect(res.status).toBe(400)
    expect(typeof (await res.json()).error).toBe("string")
    expect(base.volcado()).toEqual(antes)
  })

  it("el mensaje de un plan inválido dice cuáles hay", async () => {
    expect((await (await cambiar(sesionesDeSedes.dueña, { plan: "premium" })).json()).error).toBe("Elige el plan Independiente o el plan Equipo")
  })

  it("un cuerpo enorme se corta con 413", async () => {
    expect((await cambiar(sesionesDeSedes.dueña, { plan: "equipo", sedeQueSeQueda: "a".repeat(200 * 1024) })).status).toBe(413)
  })
})

describe("PATCH /api/configuracion/plan: el mismo plan", () => {
  it.each([
    ["independiente", "independiente"],
    ["equipo", "equipo"],
  ])("pedir %s en un negocio %s es 200 sin tocar nada", async (pedido_, actual) => {
    base.reiniciar({ ...independienteConSedes(), business: negocio(actual) })
    const antes = base.volcado()

    const res = await cambiar(sesionesDeSedes.dueña, { plan: pedido_, sedeQueSeQueda: "no-importa" })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ plan: actual })
    expect(base.volcado()).toEqual(antes)
  })

  it("el plan es el de la base, no el del token: un token viejo que dice Equipo en un negocio ya Independiente no cambia nada", async () => {
    const antes = base.volcado()

    const res = await cambiar(sesionesDeSedes.dueñaEquipo, { plan: "independiente" })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ plan: "independiente" })
    expect(base.volcado()).toEqual(antes)
  })
})

describe("PATCH /api/configuracion/plan: Independiente a Equipo", () => {
  it("un negocio sin sedes pasa directo, y su dirección y horario no cambian", async () => {
    base.reiniciar({
      ...datosDeSedes({ workSchedule: [franja("g1", NEGOCIO, null, 1, "09:00", "13:00")], appointment: [cita("c1", NEGOCIO, null, FUTURO)] }),
      business: negocio("independiente"),
    })

    const res = await cambiar(sesionesDeSedes.dueña, { plan: "equipo" })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ plan: "equipo" })
    expect(base.buscar("business", { id: NEGOCIO })[0]).toMatchObject({ plan: "equipo", address: "Av. Siempre Viva 123", comuna: "Providencia" })
    expect(base.buscar("workSchedule", { id: "g1" })).toHaveLength(1)
  })

  it("un negocio con sedes TODAS inactivas también pasa directo (no hay cuál elegir)", async () => {
    base.reiniciar({ ...datosDeSedes({ sede: [sede("v", NEGOCIO, "Vieja", { activo: false })] }), business: negocio("independiente") })

    expect((await cambiar(sesionesDeSedes.dueña, { plan: "equipo" })).status).toBe(200)
    expect(planDe()).toBe("equipo")
  })

  describe("con sedes activas: hay que decir cuál se queda", () => {
    it.each([
      ["falta", {}, MENSAJE_FALTA_LA_SEDE_QUE_SE_QUEDA],
      ["viene vacía", { sedeQueSeQueda: "" }, MENSAJE_FALTA_LA_SEDE_QUE_SE_QUEDA],
      ["viene null", { sedeQueSeQueda: null }, MENSAJE_FALTA_LA_SEDE_QUE_SE_QUEDA],
      ["es una sede inactiva", { sedeQueSeQueda: "v" }, MENSAJE_SEDE_QUE_SE_QUEDA_NO_VALE],
      ["no existe", { sedeQueSeQueda: "no-existe" }, MENSAJE_SEDE_QUE_SE_QUEDA_NO_VALE],
      ["es una sede de otro negocio", { sedeQueSeQueda: "x" }, MENSAJE_SEDE_QUE_SE_QUEDA_NO_VALE],
    ])("400 si %s, y no se escribe nada", async (_caso, extra, mensaje) => {
      const antes = base.volcado()

      const res = await cambiar(sesionesDeSedes.dueña, { plan: "equipo", ...extra })

      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: mensaje })
      expect(base.volcado()).toEqual(antes)
      expect(planDe()).toBe("independiente")
    })
  })

  describe("si otra sede tiene horas por delante: 409 con cuántas, y no se escribe nada", () => {
    it("las horas de Providencia frenan el cambio aunque se quede Centro", async () => {
      base.reiniciar(
        independienteConSedes({
          appointment: [cita("c1", NEGOCIO, "b", FUTURO), cita("c2", NEGOCIO, "b", FUTURO, { status: "confirmada" }), cita("c3", NEGOCIO, "a", FUTURO)],
        })
      )
      const antes = base.volcado()

      const res = await cambiar(sesionesDeSedes.dueña, { plan: "equipo", sedeQueSeQueda: "a" })

      expect(res.status).toBe(409)
      const cuerpo = await res.json()
      expect(cuerpo.horasFuturas).toBe(2)
      expect(cuerpo.error).toContain("2 horas")
      expect(cuerpo.error).toContain("Providencia (2)")
      expect(base.volcado()).toEqual(antes)
    })

    it("las canceladas, las que no vinieron y las pasadas de otras sedes no frenan nada", async () => {
      base.reiniciar(
        independienteConSedes({
          appointment: [
            cita("c1", NEGOCIO, "b", FUTURO, { status: "cancelada" }),
            cita("c2", NEGOCIO, "b", FUTURO, { status: "no-asistio" }),
            cita("c3", NEGOCIO, "b", PASADO, { status: "completada" }),
            cita("c4", OTRO_NEGOCIO, "x", FUTURO),
          ],
        })
      )

      expect((await cambiar(sesionesDeSedes.dueña, { plan: "equipo", sedeQueSeQueda: "a" })).status).toBe(200)
    })
  })

  describe("lo que pasa con la sede que se queda", () => {
    const completo = () =>
      independienteConSedes({
        appointment: [
          cita("a-futura", NEGOCIO, "a", FUTURO),
          cita("a-confirmada", NEGOCIO, "a", FUTURO, { status: "confirmada" }),
          cita("a-cancelada", NEGOCIO, "a", FUTURO, { status: "cancelada" }),
          cita("a-pasada", NEGOCIO, "a", PASADO, { status: "completada" }),
          cita("b-pasada", NEGOCIO, "b", PASADO, { status: "completada" }),
          cita("ajena", OTRO_NEGOCIO, "x", FUTURO),
        ],
        inscripcionEnEspera: [
          inscripcion("e-a", NEGOCIO, "s-corte", "a"),
          inscripcion("e-a-reservo", NEGOCIO, "s-corte", "a", { estado: "reservo" }),
          inscripcion("e-b", NEGOCIO, "s-corte", "b"),
          inscripcion("e-ajena", OTRO_NEGOCIO, "s-ajeno", "x"),
        ],
      })

    it("responde { plan: 'equipo' }", async () => {
      base.reiniciar(completo())

      const res = await cambiar(sesionesDeSedes.dueña, { plan: "equipo", sedeQueSeQueda: "a" })

      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ plan: "equipo" })
      expect(planDe()).toBe("equipo")
    })

    it("su dirección y su comuna pasan a ser las del negocio", async () => {
      base.reiniciar(completo())

      await cambiar(sesionesDeSedes.dueña, { plan: "equipo", sedeQueSeQueda: "a" })

      expect(base.buscar("business", { id: NEGOCIO })[0]).toMatchObject({ address: "Huérfanos 500", comuna: "Santiago" })
      expect(base.buscar("business", { id: OTRO_NEGOCIO })[0]).toMatchObject({ address: "Otra calle 9", comuna: "Maipú", plan: "independiente" })
    })

    it("su horario pasa a ser el horario general; el general de antes se va y el de las otras sedes queda con ellas", async () => {
      base.reiniciar(completo())

      await cambiar(sesionesDeSedes.dueña, { plan: "equipo", sedeQueSeQueda: "a" })

      expect(sedeDe("workSchedule", "a1")).toBeNull()
      expect(sedeDe("workSchedule", "a2")).toBeNull()
      expect(base.buscar("workSchedule", { id: "g1" })).toHaveLength(0)
      expect(sedeDe("workSchedule", "b1")).toBe("b")
      expect(base.buscar("workSchedule", { businessId: NEGOCIO, sedeId: null }).map((f) => f.id).sort()).toEqual(["a1", "a2"])
      expect(sedeDe("workSchedule", "x1")).toBe("x")
    })

    it("DECISIÓN: las horas por delante y la lista de espera activa de la que se queda dejan de apuntar a una sede; lo pasado y lo cerrado conserva la suya", async () => {
      base.reiniciar(completo())

      await cambiar(sesionesDeSedes.dueña, { plan: "equipo", sedeQueSeQueda: "a" })

      expect(sedeDe("appointment", "a-futura")).toBeNull()
      expect(sedeDe("appointment", "a-confirmada")).toBeNull()
      // La cancelada y la pasada son historia: siguen apuntando a la sede (que no se borra: se desactiva).
      expect(sedeDe("appointment", "a-cancelada")).toBe("a")
      expect(sedeDe("appointment", "a-pasada")).toBe("a")
      expect(sedeDe("appointment", "b-pasada")).toBe("b")
      expect(sedeDe("appointment", "ajena")).toBe("x")
      expect(sedeDe("inscripcionEnEspera", "e-a")).toBeNull()
      expect(sedeDe("inscripcionEnEspera", "e-a-reservo")).toBe("a")
      expect(sedeDe("inscripcionEnEspera", "e-b")).toBe("b")
      expect(sedeDe("inscripcionEnEspera", "e-ajena")).toBe("x")
    })

    it("todas las sedes se desactivan pero ninguna se borra: lo pasado sigue apuntando a una sede que existe", async () => {
      base.reiniciar(completo())

      await cambiar(sesionesDeSedes.dueña, { plan: "equipo", sedeQueSeQueda: "a" })

      expect(base.buscar("sede", { businessId: NEGOCIO }).map((s) => [s.id, s.activo])).toEqual([["a", false], ["b", false], ["v", false]])
      expect(base.buscar("sede", { businessId: OTRO_NEGOCIO }).map((s) => s.activo)).toEqual([true])
    })

    it("la sede que se queda puede tener horas por delante: no frenan el cambio", async () => {
      base.reiniciar(completo())

      expect((await cambiar(sesionesDeSedes.dueña, { plan: "equipo", sedeQueSeQueda: "a" })).status).toBe(200)
    })

    it("con una sola sede activa, la elige y se queda", async () => {
      base.reiniciar({ ...datosDeSedes({ sede: [sede("a", NEGOCIO, "Centro", { direccion: "Huérfanos 500", comuna: "Santiago" })] }), business: negocio("independiente") })

      expect((await cambiar(sesionesDeSedes.dueña, { plan: "equipo", sedeQueSeQueda: "a" })).status).toBe(200)
      expect(base.buscar("business", { id: NEGOCIO })[0]).toMatchObject({ plan: "equipo", address: "Huérfanos 500" })
    })

    it("toma el candado de planes y sedes antes de leer", async () => {
      await cambiar(sesionesDeSedes.dueña, { plan: "equipo", sedeQueSeQueda: "a" })

      expect(base.transaccion.$executeRaw.mock.calls.map((llamada) => (llamada as unknown[])[1])).toEqual(["plan-y-sedes:negocio-1"])
      expect(base.transaccion.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(base.prisma.business.findUnique.mock.invocationCallOrder[0])
    })

    it("es todo o nada: si falla un paso del medio, el plan, las sedes, el horario y las horas quedan como estaban", async () => {
      const consola = vi.spyOn(console, "error").mockImplementation(() => {})
      base.reiniciar(completo())
      const antes = base.volcado()
      base.prisma.workSchedule.updateMany.mockRejectedValueOnce(new Error("se cayó"))

      const res = await cambiar(sesionesDeSedes.dueña, { plan: "equipo", sedeQueSeQueda: "a" })

      expect(res.status).toBe(500)
      expect(base.volcado()).toEqual(antes)
      consola.mockRestore()
    })
  })

  it("la base como segunda barrera: si una sede activa se cuela a la lectura de antes, el trigger responde 409 y no cambia el plan", async () => {
    base.prisma.sede.findMany.mockResolvedValueOnce([])
    const antes = base.volcado()

    const res = await cambiar(sesionesDeSedes.dueña, { plan: "equipo" })

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: "Todavía hay sedes activas. Desactívalas antes de pasar al plan Equipo" })
    expect(base.volcado()).toEqual(antes)
  })
})

describe("PATCH /api/configuracion/plan: Equipo a Independiente", () => {
  const equipo = (extra: Record<string, Record<string, unknown>[]> = {}) => ({ ...datosDeSedes(extra), business: negocio("equipo") })
  const invitacion = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    businessId: NEGOCIO,
    email: `${id}@test`,
    name: id,
    tokenHash: `hash-${id}`,
    expiresAt: new Date("2030-01-01T00:00:00Z"),
    ...extra,
  })
  const miembro = { id: "m-carla", businessId: NEGOCIO, userId: "u-carla", role: "worker" }

  it("sin integrantes ni invitaciones pendientes, sí", async () => {
    base.reiniciar(equipo())

    const res = await cambiar(sesionesDeSedes.dueñaEquipo, { plan: "independiente" })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ plan: "independiente" })
    expect(planDe()).toBe("independiente")
  })

  it("las invitaciones ya aceptadas no cuentan", async () => {
    base.reiniciar(equipo({ workerInvitation: [invitacion("i1", { acceptedAt: new Date("2026-01-01T00:00:00Z") })] }))

    expect((await cambiar(sesionesDeSedes.dueñaEquipo, { plan: "independiente" })).status).toBe(200)
  })

  it("con un integrante en el equipo: 409 que dice cuántos, y el plan no cambia", async () => {
    base.reiniciar(equipo({ businessMember: [miembro] }))
    const antes = base.volcado()

    const res = await cambiar(sesionesDeSedes.dueñaEquipo, { plan: "independiente" })

    expect(res.status).toBe(409)
    const cuerpo = await res.json()
    expect(cuerpo.error).toContain("un integrante")
    expect(cuerpo.integrantes).toBe(1)
    expect(base.volcado()).toEqual(antes)
  })

  it.each([
    ["una invitación pendiente", [invitacion("i1")], "una invitación pendiente"],
    ["una invitación VENCIDA que nadie aceptó (también cuenta)", [invitacion("i1", { expiresAt: new Date("2020-01-01T00:00:00Z") })], "una invitación pendiente"],
    ["dos invitaciones pendientes", [invitacion("i1"), invitacion("i2")], "2 invitaciones pendientes"],
  ])("con %s: 409 que lo dice, y el plan no cambia", async (_caso, invitaciones, texto) => {
    base.reiniciar(equipo({ workerInvitation: invitaciones }))
    const antes = base.volcado()

    const res = await cambiar(sesionesDeSedes.dueñaEquipo, { plan: "independiente" })

    expect(res.status).toBe(409)
    expect((await res.json()).error).toContain(texto)
    expect(base.volcado()).toEqual(antes)
  })

  it("los integrantes y las invitaciones de OTRO negocio no cuentan", async () => {
    base.reiniciar({
      ...equipo({
        businessMember: [{ id: "m-ajeno", businessId: OTRO_NEGOCIO, userId: "u-ajeno", role: "worker" }],
        workerInvitation: [invitacion("i-ajena", { businessId: OTRO_NEGOCIO })],
      }),
    })

    expect((await cambiar(sesionesDeSedes.dueñaEquipo, { plan: "independiente" })).status).toBe(200)
  })

  it("no mira las sedes ni pide sedeQueSeQueda", async () => {
    base.reiniciar(equipo({ sede: [sede("v", NEGOCIO, "Vieja", { activo: false })] }))

    expect((await cambiar(sesionesDeSedes.dueñaEquipo, { plan: "independiente", sedeQueSeQueda: "x" })).status).toBe(200)
  })

  it("la base como segunda barrera: un integrante que se cuela a la lectura de antes lo frena el trigger con un 409, no un 500", async () => {
    base.reiniciar(equipo({ businessMember: [miembro] }))
    base.prisma.businessMember.count.mockResolvedValueOnce(0)
    const antes = base.volcado()

    const res = await cambiar(sesionesDeSedes.dueñaEquipo, { plan: "independiente" })

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: "Tu negocio tiene integrantes o invitaciones pendientes. Quítalos antes de pasar al plan Independiente" })
    expect(base.volcado()).toEqual(antes)
  })

  it("lee los integrantes y las invitaciones de la base dentro de la transacción, del negocio de la sesión", async () => {
    base.reiniciar(equipo())

    await cambiar(sesionesDeSedes.dueñaEquipo, { plan: "independiente" })

    expect(base.prisma.businessMember.count).toHaveBeenCalledWith({ where: { businessId: NEGOCIO } })
    expect(base.prisma.workerInvitation.count).toHaveBeenCalledWith({ where: { businessId: NEGOCIO, acceptedAt: null } })
    expect(base.transaccion.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(base.prisma.businessMember.count.mock.invocationCallOrder[0])
  })
})

describe("PATCH /api/configuracion/plan: ida y vuelta", () => {
  it("de Independiente con sedes a Equipo y de vuelta, el negocio queda sin sedes activas y se puede convertir otra vez", async () => {
    const { POST } = await import("../sedes/convertir/route")
    await cambiar(sesionesDeSedes.dueña, { plan: "equipo", sedeQueSeQueda: "a" })
    await cambiar(sesionesDeSedes.dueñaEquipo, { plan: "independiente" })
    expect(planDe()).toBe("independiente")
    expect(base.buscar("sede", { businessId: NEGOCIO, activo: true })).toHaveLength(0)

    mockGetServerSession.mockResolvedValueOnce(sesionesDeSedes.dueña)
    const res = await POST(
      pedido("http://localhost/api/configuracion/sedes/convertir", {
        principal: { nombre: "Matriz", direccion: "Huérfanos 500", comuna: "Santiago" },
        nueva: { nombre: "Sucursal", direccion: "Otra 1", comuna: "Maipú" },
      })
    )

    expect(res.status).toBe(201)
    const { sedes } = await res.json()
    // El horario que era de Centro (ahora general) vuelve a ser de la principal.
    expect(sedes.find((s: { nombre: string }) => s.nombre === "Matriz").horarios).toEqual([{ dayOfWeek: 1, franjas: [{ start: "09:00", end: "13:00" }] }])
  })
})
