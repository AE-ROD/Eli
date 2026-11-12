import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { pedido } from "@/pruebas/datos"
import { MAX_SEDES } from "@/lib/sedes"
import { MENSAJE_NOMBRE_DE_SEDE_REPETIDO, MENSAJE_PLAN_SIN_SEDES, MENSAJE_SIN_SEDES_TODAVIA } from "@/lib/reglas-de-sedes"
import { AHORA, FUTURO, NEGOCIO, OTRO_NEGOCIO, PASADO, cita, datosDeSedes, franja, sede, sesionesDeSedes } from "./_pruebas"

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const base = crearBaseFalsa()

vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

const URL = "http://localhost/api/configuracion/sedes"

async function listar(sesion: unknown) {
  const { GET } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  return GET()
}

async function crear(sesion: unknown, cuerpo: unknown) {
  const { POST } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  return POST(pedido(URL, cuerpo))
}

const nueva = { nombre: "Maipú", direccion: "Av. Pajaritos 100", comuna: "Maipú" }
const sedesDelNegocio = (negocio = NEGOCIO) => base.buscar("sede", { businessId: negocio })

/** Un negocio con n sedes activas (s1..sn). */
const conSedes = (n: number, extra: Record<string, Record<string, unknown>[]> = {}) =>
  datosDeSedes({
    sede: Array.from({ length: n }, (_, i) => sede(`s${i + 1}`, NEGOCIO, `Sede ${i + 1}`, { orden: i })),
    ...extra,
  })

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(AHORA)
  base.reiniciar(conSedes(2))
})

afterEach(() => vi.useRealTimers())

describe("GET /api/configuracion/sedes", () => {
  it("la dueña ve el plan y sus sedes con el horario, las horas por delante y el orden de la lista", async () => {
    base.reiniciar(
      datosDeSedes({
        sede: [
          sede("b", NEGOCIO, "Providencia", { orden: 1, telefono: "+56912345678" }),
          sede("a", NEGOCIO, "Centro", { orden: 0 }),
          sede("v", NEGOCIO, "Vieja", { orden: 2, activo: false }),
        ],
        workSchedule: [
          franja("f1", NEGOCIO, "a", 3, "15:00", "19:00"),
          franja("f2", NEGOCIO, "a", 3, "09:00", "13:00"),
          franja("f3", NEGOCIO, "a", 1, "09:00", "13:00"),
          franja("f4", NEGOCIO, "a", 5, "09:00", "13:00", { active: false }),
        ],
        appointment: [
          cita("c1", NEGOCIO, "a", FUTURO),
          cita("c2", NEGOCIO, "a", FUTURO, { status: "confirmada" }),
          cita("c3", NEGOCIO, "a", FUTURO, { status: "cancelada" }),
          cita("c4", NEGOCIO, "a", FUTURO, { status: "no-asistio" }),
          cita("c5", NEGOCIO, "a", PASADO),
          cita("c6", NEGOCIO, "b", FUTURO),
          cita("c7", NEGOCIO, null, FUTURO),
        ],
      })
    )

    const res = await listar(sesionesDeSedes.dueña)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      plan: "independiente",
      sedes: [
        {
          id: "a",
          nombre: "Centro",
          direccion: "Calle Centro 1",
          comuna: "Ñuñoa",
          telefono: null,
          orden: 0,
          activo: true,
          horarios: [
            { dayOfWeek: 1, franjas: [{ start: "09:00", end: "13:00" }] },
            { dayOfWeek: 3, franjas: [{ start: "09:00", end: "13:00" }, { start: "15:00", end: "19:00" }] },
          ],
          horasFuturas: 2,
        },
        { id: "b", nombre: "Providencia", direccion: "Calle Providencia 1", comuna: "Ñuñoa", telefono: "+56912345678", orden: 1, activo: true, horarios: [], horasFuturas: 1 },
        { id: "v", nombre: "Vieja", direccion: "Calle Vieja 1", comuna: "Ñuñoa", telefono: null, orden: 2, activo: false, horarios: [], horasFuturas: 0 },
      ],
    })
  })

  it("a igual orden, por nombre", async () => {
    base.reiniciar(datosDeSedes({ sede: [sede("z", NEGOCIO, "Zeta"), sede("a", NEGOCIO, "Alfa"), sede("m", NEGOCIO, "Mar")] }))

    const { sedes } = await (await listar(sesionesDeSedes.dueña)).json()

    expect(sedes.map((s: { nombre: string }) => s.nombre)).toEqual(["Alfa", "Mar", "Zeta"])
  })

  it.each([
    ["el encargado", sesionesDeSedes.encargado],
    ["una profesional", sesionesDeSedes.profesional],
  ])("%s también las ve (la agenda las necesita): no son un dato de dinero", async (_quien, sesion) => {
    const res = await listar(sesion)

    expect(res.status).toBe(200)
    expect((await res.json()).sedes).toHaveLength(2)
  })

  it("el otro negocio sólo ve las suyas: las sedes, sus horarios y sus horas son del negocio de la sesión", async () => {
    base.reiniciar(
      datosDeSedes({
        sede: [sede("a", NEGOCIO, "Centro"), sede("x", OTRO_NEGOCIO, "Centro")],
        workSchedule: [franja("f1", NEGOCIO, "a", 1, "09:00", "13:00"), franja("f2", OTRO_NEGOCIO, "x", 2, "10:00", "14:00")],
        appointment: [cita("c1", NEGOCIO, "a", FUTURO), cita("c2", OTRO_NEGOCIO, "x", FUTURO), cita("c3", OTRO_NEGOCIO, "x", FUTURO)],
      })
    )

    const { sedes } = await (await listar(sesionesDeSedes.dueñaAjena)).json()

    expect(sedes).toHaveLength(1)
    expect(sedes[0]).toMatchObject({ id: "x", horasFuturas: 2, horarios: [{ dayOfWeek: 2, franjas: [{ start: "10:00", end: "14:00" }] }] })
  })

  it("un negocio sin sedes recibe la lista vacía", async () => {
    base.reiniciar(datosDeSedes())

    expect(await (await listar(sesionesDeSedes.dueña)).json()).toEqual({ plan: "independiente", sedes: [] })
  })

  it("el plan sale de la base, no del token: una sesión que dice Independiente en un negocio Equipo recibe equipo", async () => {
    base.reiniciar({ ...datosDeSedes(), business: [{ id: NEGOCIO, name: "Salón Uno", slug: "salon-uno", userId: "u-duena", plan: "equipo" }] })

    expect(await (await listar(sesionesDeSedes.dueña)).json()).toEqual({ plan: "equipo", sedes: [] })
  })

  it("sin sesión, 401", async () => {
    expect((await listar(null)).status).toBe(401)
  })
})

describe("POST /api/configuracion/sedes", () => {
  it("la dueña agrega una sede: recortada, con el teléfono en E.164, al final de la lista y con la forma de la pantalla", async () => {
    const res = await crear(sesionesDeSedes.dueña, { nombre: "  Maipú ", direccion: " Av. Pajaritos 100 ", comuna: " Maipú ", telefono: "9 8765 4321" })

    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({
      sede: {
        id: expect.any(String),
        nombre: "Maipú",
        direccion: "Av. Pajaritos 100",
        comuna: "Maipú",
        telefono: "+56987654321",
        orden: 2,
        activo: true,
        horarios: [],
        horasFuturas: 0,
      },
    })
    expect(sedesDelNegocio()).toHaveLength(3)
    expect(sedesDelNegocio()[2]).toMatchObject({ businessId: NEGOCIO, activo: true })
  })

  it("el teléfono es opcional: sin él, o vacío, o null, queda null", async () => {
    for (const [i, telefono] of [undefined, "", null].entries()) {
      const res = await crear(sesionesDeSedes.dueña, { ...nueva, nombre: `Sede n${i}`, telefono })
      expect(res.status).toBe(201)
      expect((await res.json()).sede.telefono).toBeNull()
    }
  })

  it("el negocio sale de la sesión: un businessId en el cuerpo no cambia dónde se guarda", async () => {
    const res = await crear(sesionesDeSedes.dueña, { ...nueva, businessId: OTRO_NEGOCIO, sedeId: "x", activo: false, orden: 0 })

    expect(res.status).toBe(201)
    const creada = base.buscar("sede", { id: (await res.json()).sede.id })[0]
    expect(creada).toMatchObject({ businessId: NEGOCIO, activo: true, orden: 2 })
    expect(sedesDelNegocio(OTRO_NEGOCIO)).toHaveLength(0)
  })

  it("toma el candado de planes y sedes del negocio antes de leer", async () => {
    await crear(sesionesDeSedes.dueña, nueva)

    const claves = base.transaccion.$executeRaw.mock.calls.map((llamada) => (llamada as unknown[])[1])
    expect(claves).toEqual(["plan-y-sedes:negocio-1"])
    expect(base.transaccion.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(base.prisma.sede.findMany.mock.invocationCallOrder.at(-1)!)
  })

  describe("sin permiso: 401 y no se escribe nada", () => {
    it.each([
      ["el encargado", sesionesDeSedes.encargado],
      ["una profesional", sesionesDeSedes.profesional],
      ["la dueña de un negocio Equipo (el plan de la sesión)", sesionesDeSedes.dueñaEquipo],
      ["una sesión sin plan", sesionesDeSedes.dueñaSinPlan],
      ["nadie con sesión", null],
    ])("%s", async (_quien, sesion) => {
      const antes = base.volcado()

      const res = await crear(sesion, nueva)

      expect(res.status).toBe(401)
      expect(base.volcado()).toEqual(antes)
    })
  })

  it("sin sedes todavía: 409 que manda a convertir (para eso está el otro endpoint)", async () => {
    base.reiniciar(datosDeSedes())

    const res = await crear(sesionesDeSedes.dueña, nueva)

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: MENSAJE_SIN_SEDES_TODAVIA })
    expect(sedesDelNegocio()).toHaveLength(0)
  })

  it("con inactivas pero ninguna activa también es 'sin sedes': convertir", async () => {
    base.reiniciar(datosDeSedes({ sede: [sede("v", NEGOCIO, "Vieja", { activo: false })] }))

    expect((await crear(sesionesDeSedes.dueña, nueva)).status).toBe(409)
  })

  it(`con ${MAX_SEDES} sedes activas: 409 con el tope en el mensaje, y no se crea`, async () => {
    base.reiniciar(conSedes(MAX_SEDES))

    const res = await crear(sesionesDeSedes.dueña, nueva)

    expect(res.status).toBe(409)
    expect((await res.json()).error).toContain(`hasta ${MAX_SEDES} sedes activas`)
    expect(sedesDelNegocio()).toHaveLength(MAX_SEDES)
  })

  it(`el tope cuenta sólo las activas: con ${MAX_SEDES - 1} activas y una inactiva, la quinta entra`, async () => {
    base.reiniciar(
      datosDeSedes({
        sede: [
          ...Array.from({ length: MAX_SEDES - 1 }, (_, i) => sede(`s${i}`, NEGOCIO, `Sede ${i}`)),
          sede("v", NEGOCIO, "Vieja", { activo: false }),
        ],
      })
    )

    expect((await crear(sesionesDeSedes.dueña, nueva)).status).toBe(201)
  })

  it("las sedes de otro negocio no cuentan para el tope", async () => {
    base.reiniciar(
      datosDeSedes({
        sede: [sede("a", NEGOCIO, "Centro"), ...Array.from({ length: MAX_SEDES }, (_, i) => sede(`x${i}`, OTRO_NEGOCIO, `Sede ${i}`))],
      })
    )

    expect((await crear(sesionesDeSedes.dueña, nueva)).status).toBe(201)
  })

  it("un nombre que ya tiene otra sede, con otras mayúsculas o tildes, o una desactivada: 409", async () => {
    base.reiniciar(datosDeSedes({ sede: [sede("a", NEGOCIO, "Providencia"), sede("v", NEGOCIO, "Peñalolén", { activo: false })] }))

    for (const nombre of ["Providencia", "providencia", "PROVIDÉNCIA", "peñalolen"]) {
      const res = await crear(sesionesDeSedes.dueña, { ...nueva, nombre })
      expect(res.status).toBe(409)
      expect(await res.json()).toEqual({ error: MENSAJE_NOMBRE_DE_SEDE_REPETIDO })
    }
    expect(sedesDelNegocio()).toHaveLength(2)
  })

  it("el mismo nombre que una sede de otro negocio sí se puede", async () => {
    base.reiniciar(datosDeSedes({ sede: [sede("a", NEGOCIO, "Centro"), sede("x", OTRO_NEGOCIO, "Maipú")] }))

    expect((await crear(sesionesDeSedes.dueña, nueva)).status).toBe(201)
  })

  describe("datos inválidos: 400 con un mensaje legible y no se escribe", () => {
    it.each([
      ["sin cuerpo", undefined, "Datos inválidos"],
      ["un JSON roto", "{no es json", "Datos inválidos"],
      ["sin nombre", { direccion: "x", comuna: "y" }, "Escribe el nombre de la sede"],
      ["un nombre en blanco", { ...nueva, nombre: "   " }, "Escribe el nombre de la sede"],
      ["un nombre de 41 caracteres", { ...nueva, nombre: "a".repeat(41) }, "El nombre de la sede no puede tener más de 40 caracteres"],
      ["sin dirección", { nombre: "A", comuna: "y" }, "Escribe la dirección de la sede"],
      ["una dirección de 201 caracteres", { ...nueva, direccion: "a".repeat(201) }, "La dirección de la sede no puede tener más de 200 caracteres"],
      ["sin comuna", { nombre: "A", direccion: "x" }, "Escribe la comuna de la sede"],
      ["una comuna de 81 caracteres", { ...nueva, comuna: "a".repeat(81) }, "La comuna de la sede no puede tener más de 80 caracteres"],
      ["un teléfono que no se lee", { ...nueva, telefono: "123" }, expect.stringContaining("No pudimos leer el teléfono")],
      ["un teléfono extranjero", { ...nueva, telefono: "+14155550123" }, expect.stringContaining("No pudimos leer el teléfono")],
      ["un nombre que no es texto", { ...nueva, nombre: 5 }, "Escribe el nombre de la sede"],
    ])("%s", async (_caso, cuerpo, mensaje) => {
      const antes = base.volcado()

      const res = await crear(sesionesDeSedes.dueña, cuerpo)

      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: mensaje })
      expect(base.volcado()).toEqual(antes)
    })

    it("el largo máximo exacto sí entra", async () => {
      const res = await crear(sesionesDeSedes.dueña, { nombre: "a".repeat(40), direccion: "d".repeat(200), comuna: "c".repeat(80) })

      expect(res.status).toBe(201)
    })

    it("un cuerpo enorme se corta con 413 antes de leerlo", async () => {
      const res = await crear(sesionesDeSedes.dueña, { ...nueva, nombre: "a".repeat(200 * 1024) })

      expect(res.status).toBe(413)
      expect(sedesDelNegocio()).toHaveLength(2)
    })
  })

  describe("el plan se lee de la base, no del token", () => {
    it("una sesión que dice Independiente en un negocio que ya es Equipo: 409, no se crea", async () => {
      base.reiniciar({ ...conSedes(2), business: [{ id: NEGOCIO, name: "Salón Uno", slug: "salon-uno", userId: "u-duena", plan: "equipo" }] })

      const res = await crear(sesionesDeSedes.dueña, nueva)

      expect(res.status).toBe(409)
      expect(await res.json()).toEqual({ error: MENSAJE_PLAN_SIN_SEDES })
      expect(sedesDelNegocio()).toHaveLength(2)
    })
  })

  describe("la base como segunda barrera: si algo se cuela, es 409 con el motivo y nunca 500", () => {
    it("el trigger del tope de activas", async () => {
      base.reiniciar(conSedes(MAX_SEDES))
      // La lectura de antes no ve la sexta (una carrera): sólo el trigger la frena.
      base.prisma.sede.findMany.mockResolvedValueOnce([{ id: "s1", nombre: "Sede 1", orden: 0, activo: true }])

      const res = await crear(sesionesDeSedes.dueña, nueva)

      expect(res.status).toBe(409)
      expect(await res.json()).toEqual({ error: `Un negocio tiene hasta ${MAX_SEDES} sedes activas. Desactiva una antes` })
      expect(sedesDelNegocio()).toHaveLength(MAX_SEDES)
    })

    it("el trigger del plan", async () => {
      base.reiniciar({ ...conSedes(2), business: [{ id: NEGOCIO, name: "Salón Uno", slug: "salon-uno", userId: "u-duena", plan: "equipo" }] })
      base.prisma.business.findUnique.mockResolvedValueOnce({ plan: "independiente" })

      const res = await crear(sesionesDeSedes.dueña, nueva)

      expect(res.status).toBe(409)
      expect(await res.json()).toEqual({ error: MENSAJE_PLAN_SIN_SEDES })
    })

    it("el único (negocio, nombre) de la base cuando dos altas llegan a la vez", async () => {
      base.prisma.sede.findMany.mockResolvedValueOnce([{ id: "s2", nombre: "Sede 2", orden: 1, activo: true }])

      const res = await crear(sesionesDeSedes.dueña, { ...nueva, nombre: "Sede 1" })

      expect(res.status).toBe(409)
      expect(await res.json()).toEqual({ error: MENSAJE_NOMBRE_DE_SEDE_REPETIDO })
    })
  })

  it("un error inesperado es 500 sin datos y se deshace", async () => {
    const consola = vi.spyOn(console, "error").mockImplementation(() => {})
    base.prisma.sede.create.mockRejectedValueOnce(new Error("se cayó la base: contraseña=123"))

    const res = await crear(sesionesDeSedes.dueña, nueva)

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: "Error interno del servidor" })
    expect(sedesDelNegocio()).toHaveLength(2)
    consola.mockRestore()
  })
})
