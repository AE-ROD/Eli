import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { conId, pedido } from "@/pruebas/datos"
import { MAX_SEDES } from "@/lib/sedes"
import {
  MENSAJE_NOMBRE_DE_SEDE_REPETIDO,
  MENSAJE_PLAN_SIN_SEDES,
  MENSAJE_SEDE_CON_CITAS,
  MENSAJE_SEDE_NO_ENCONTRADA,
} from "@/lib/reglas-de-sedes"
import { AHORA, FUTURO, NEGOCIO, OTRO_NEGOCIO, PASADO, cita, datosDeSedes, franja, inscripcion, sede, sesionesDeSedes } from "../_pruebas"

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const base = crearBaseFalsa()

vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

const URL = "http://localhost/api/configuracion/sedes/a"

async function editar(sesion: unknown, id: string, cuerpo: unknown) {
  const { PUT } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  return PUT(pedido(URL, cuerpo), conId(id))
}

async function borrar(sesion: unknown, id: string) {
  const { DELETE } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  return DELETE(pedido(URL), conId(id))
}

const fila = (id: string) => base.buscar("sede", { id })[0]

/** Centro y Providencia activas, Vieja inactiva, y una sede del otro negocio con el mismo nombre. */
const datos = (extra: Record<string, Record<string, unknown>[]> = {}) =>
  datosDeSedes({
    sede: [
      sede("a", NEGOCIO, "Centro", { orden: 0, telefono: "+56911111111" }),
      sede("b", NEGOCIO, "Providencia", { orden: 1 }),
      sede("v", NEGOCIO, "Vieja", { orden: 2, activo: false }),
      sede("x", OTRO_NEGOCIO, "Centro"),
    ],
    ...extra,
  })

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(AHORA)
  base.reiniciar(datos())
})

afterEach(() => vi.useRealTimers())

describe("PUT /api/configuracion/sedes/[id]", () => {
  it("edita lo que viene y deja lo demás: devuelve la sede con la forma de la pantalla", async () => {
    const res = await editar(sesionesDeSedes.dueña, "a", {
      nombre: "  Centro Norte ",
      direccion: " Huérfanos 500 ",
      comuna: "Santiago",
      telefono: "9 2222 2222",
      orden: 5,
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      sede: {
        id: "a",
        nombre: "Centro Norte",
        direccion: "Huérfanos 500",
        comuna: "Santiago",
        telefono: "+56922222222",
        orden: 5,
        activo: true,
        horarios: [],
        horasFuturas: 0,
      },
    })
    expect(fila("b")).toMatchObject({ nombre: "Providencia", orden: 1 })
  })

  it("un cambio sólo de un campo no toca los otros", async () => {
    await editar(sesionesDeSedes.dueña, "a", { comuna: "Santiago" })

    expect(fila("a")).toMatchObject({ nombre: "Centro", direccion: "Calle Centro 1", comuna: "Santiago", telefono: "+56911111111", orden: 0, activo: true })
  })

  it("el teléfono se quita con null o vacío", async () => {
    expect((await (await editar(sesionesDeSedes.dueña, "a", { telefono: null })).json()).sede.telefono).toBeNull()
    expect(fila("a").telefono).toBeNull()

    base.reiniciar(datos())
    await editar(sesionesDeSedes.dueña, "a", { telefono: "" })
    expect(fila("a").telefono).toBeNull()
  })

  it("una sede puede quedarse con su propio nombre", async () => {
    expect((await editar(sesionesDeSedes.dueña, "a", { nombre: "centro" })).status).toBe(200)
  })

  it("toma el candado de planes y sedes antes de leer", async () => {
    await editar(sesionesDeSedes.dueña, "a", { orden: 3 })

    expect(base.transaccion.$executeRaw.mock.calls.map((llamada) => (llamada as unknown[])[1])).toEqual(["plan-y-sedes:negocio-1"])
  })

  describe("lo ajeno no existe: 404, nunca 403, y no se escribe nada", () => {
    it.each([
      ["una sede de otro negocio", "x"],
      ["una sede que no existe", "no-existe"],
    ])("%s", async (_caso, id) => {
      const antes = base.volcado()

      const res = await editar(sesionesDeSedes.dueña, id, { nombre: "Otra" })

      expect(res.status).toBe(404)
      expect(await res.json()).toEqual({ error: MENSAJE_SEDE_NO_ENCONTRADA })
      expect(base.volcado()).toEqual(antes)
    })

    it("la dueña del otro negocio tampoco alcanza la sede de este", async () => {
      const antes = base.volcado()

      expect((await editar(sesionesDeSedes.dueñaAjena, "a", { activo: false })).status).toBe(404)
      expect(base.volcado()).toEqual(antes)
    })

    it("sin permiso y sede ajena: 404, la pertenencia va antes que el permiso", async () => {
      expect((await editar(sesionesDeSedes.profesional, "x", { orden: 1 })).status).toBe(404)
    })
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

      const res = await editar(sesion, "a", { nombre: "Otra" })

      expect(res.status).toBe(401)
      expect(base.volcado()).toEqual(antes)
    })
  })

  describe("datos inválidos: 400", () => {
    it.each([
      ["un cuerpo vacío", {}, "No hay nada que cambiar"],
      ["sin cuerpo", undefined, "Datos inválidos"],
      ["un nombre en blanco", { nombre: " " }, "Escribe el nombre de la sede"],
      ["un nombre largo", { nombre: "a".repeat(41) }, "El nombre de la sede no puede tener más de 40 caracteres"],
      ["una dirección vacía", { direccion: "" }, "Escribe la dirección de la sede"],
      ["una comuna larga", { comuna: "a".repeat(81) }, "La comuna de la sede no puede tener más de 80 caracteres"],
      ["un teléfono que no se lee", { telefono: "12" }, expect.stringContaining("No pudimos leer el teléfono")],
      ["un orden de 1000", { orden: 1000 }, "El orden no puede ser mayor que 999"],
      ["un orden negativo", { orden: -1 }, "El orden no puede ser negativo"],
      ["un orden con decimales", { orden: 1.5 }, "El orden tiene que ser un número entero"],
      ["un activo que no es sí o no", { activo: "si" }, "Activo tiene que ser sí o no"],
    ])("%s", async (_caso, cuerpo, mensaje) => {
      const antes = base.volcado()

      const res = await editar(sesionesDeSedes.dueña, "a", cuerpo)

      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: mensaje })
      expect(base.volcado()).toEqual(antes)
    })

    it("el negocio y el id salen de la sesión y de la URL: lo que mande el cuerpo se ignora", async () => {
      const res = await editar(sesionesDeSedes.dueña, "a", { orden: 7, businessId: OTRO_NEGOCIO, id: "x" })

      expect(res.status).toBe(200)
      expect(fila("a")).toMatchObject({ orden: 7, businessId: NEGOCIO })
      expect(fila("x")).toMatchObject({ orden: 0, businessId: OTRO_NEGOCIO })
    })
  })

  describe("nombre repetido: 409", () => {
    it("con otra sede del negocio (sin mayúsculas ni tildes), también desactivada", async () => {
      for (const nombre of ["providencia", "PROVIDENCIA", "vieja"]) {
        const res = await editar(sesionesDeSedes.dueña, "a", { nombre })
        expect(res.status).toBe(409)
        expect(await res.json()).toEqual({ error: MENSAJE_NOMBRE_DE_SEDE_REPETIDO })
      }
      expect(fila("a").nombre).toBe("Centro")
    })

    it("el único de la base cuando dos cambios llegan a la vez", async () => {
      base.prisma.sede.findMany.mockResolvedValueOnce([
        { id: "a", nombre: "Centro", orden: 0, activo: true },
        { id: "b", nombre: "Otra", orden: 1, activo: true },
      ])

      const res = await editar(sesionesDeSedes.dueña, "a", { nombre: "Providencia" })

      expect(res.status).toBe(409)
      expect(await res.json()).toEqual({ error: MENSAJE_NOMBRE_DE_SEDE_REPETIDO })
    })
  })

  describe("desactivar", () => {
    it("con horas por delante (pendientes o confirmadas) se bloquea con 409 que dice cuántas, y la sede sigue activa", async () => {
      base.reiniciar(datos({ appointment: [cita("c1", NEGOCIO, "a", FUTURO), cita("c2", NEGOCIO, "a", FUTURO, { status: "confirmada" })] }))

      const res = await editar(sesionesDeSedes.dueña, "a", { activo: false })

      expect(res.status).toBe(409)
      const cuerpo = await res.json()
      expect(cuerpo.error).toContain("2 horas por delante")
      expect(cuerpo.horasFuturas).toBe(2)
      expect(fila("a").activo).toBe(true)
    })

    it("con una sola, el mensaje va en singular", async () => {
      base.reiniciar(datos({ appointment: [cita("c1", NEGOCIO, "a", FUTURO)] }))

      expect((await (await editar(sesionesDeSedes.dueña, "a", { activo: false })).json()).error).toContain("1 hora por delante")
    })

    it("las canceladas, las que no vinieron, las pasadas y las de otra sede no la frenan", async () => {
      base.reiniciar(
        datos({
          appointment: [
            cita("c1", NEGOCIO, "a", FUTURO, { status: "cancelada" }),
            cita("c2", NEGOCIO, "a", FUTURO, { status: "no-asistio" }),
            cita("c3", NEGOCIO, "a", PASADO),
            cita("c4", NEGOCIO, "b", FUTURO),
            cita("c5", OTRO_NEGOCIO, "x", FUTURO),
          ],
        })
      )

      const res = await editar(sesionesDeSedes.dueña, "a", { activo: false })

      expect(res.status).toBe(200)
      expect((await res.json()).sede.activo).toBe(false)
      // Sus citas pasadas siguen apuntando a ella.
      expect(base.buscar("appointment", { id: "c3" })[0].sedeId).toBe("a")
    })

    it("la última sede activa no se apaga si el negocio tiene horas por delante, aunque no sean de ella", async () => {
      base.reiniciar(
        datosDeSedes({
          sede: [sede("a", NEGOCIO, "Centro")],
          appointment: [cita("sin-sede", NEGOCIO, null, FUTURO)],
        })
      )

      const res = await editar(sesionesDeSedes.dueña, "a", { activo: false })

      expect(res.status).toBe(409)
      expect((await res.json()).error).toContain("única sede activa")
      expect(fila("a").activo).toBe(true)
    })

    it("la última sede activa sin horas por delante sí se apaga: el negocio vuelve a cero sedes activas", async () => {
      base.reiniciar(datosDeSedes({ sede: [sede("a", NEGOCIO, "Centro")], appointment: [cita("c1", NEGOCIO, "a", PASADO)] }))

      expect((await editar(sesionesDeSedes.dueña, "a", { activo: false })).status).toBe(200)
      expect(fila("a").activo).toBe(false)
    })

    it("desactivar no toca el horario guardado: queda ahí por si se reactiva", async () => {
      base.reiniciar(datos({ workSchedule: [franja("f1", NEGOCIO, "a", 1, "09:00", "13:00")] }))

      await editar(sesionesDeSedes.dueña, "a", { activo: false })

      expect(base.buscar("workSchedule", { id: "f1" })).toHaveLength(1)
    })

    it("desactivar una ya desactivada es un no-hacer-nada: 200", async () => {
      expect((await editar(sesionesDeSedes.dueña, "v", { activo: false })).status).toBe(200)
    })
  })

  describe("reactivar", () => {
    it("una sede inactiva sin choques vuelve a estar activa", async () => {
      const res = await editar(sesionesDeSedes.dueña, "v", { activo: true })

      expect(res.status).toBe(200)
      expect((await res.json()).sede.activo).toBe(true)
      expect(fila("v").activo).toBe(true)
    })

    it(`con ${MAX_SEDES} sedes activas ya, 409`, async () => {
      base.reiniciar(
        datosDeSedes({
          sede: [...Array.from({ length: MAX_SEDES }, (_, i) => sede(`s${i}`, NEGOCIO, `Sede ${i}`)), sede("v", NEGOCIO, "Vieja", { activo: false })],
        })
      )

      const res = await editar(sesionesDeSedes.dueña, "v", { activo: true })

      expect(res.status).toBe(409)
      expect((await res.json()).error).toContain(`${MAX_SEDES} sedes activas`)
      expect(fila("v").activo).toBe(false)
    })

    it("si su horario guardado se pisaría con el de otra sede activa, 409 con los choques (día y sede), y sigue inactiva", async () => {
      base.reiniciar(
        datos({
          workSchedule: [
            franja("f1", NEGOCIO, "v", 1, "09:00", "13:00"),
            franja("f2", NEGOCIO, "v", 4, "10:00", "12:00"),
            franja("f3", NEGOCIO, "a", 1, "12:00", "16:00"),
            franja("f4", NEGOCIO, "b", 4, "11:00", "15:00"),
          ],
        })
      )

      const res = await editar(sesionesDeSedes.dueña, "v", { activo: true })

      expect(res.status).toBe(409)
      const cuerpo = await res.json()
      expect(cuerpo.choques).toEqual([
        { dayOfWeek: 1, conSede: "Centro" },
        { dayOfWeek: 4, conSede: "Providencia" },
      ])
      expect(cuerpo.error).toContain("el lunes con Centro")
      expect(cuerpo.error).toContain("el jueves con Providencia")
      expect(fila("v").activo).toBe(false)
    })

    it("tocarse no es pisarse, y lo que choca con otra sede INACTIVA no cuenta", async () => {
      base.reiniciar(
        datosDeSedes({
          sede: [sede("a", NEGOCIO, "Centro"), sede("v", NEGOCIO, "Vieja", { activo: false }), sede("w", NEGOCIO, "Otra vieja", { activo: false })],
          workSchedule: [
            franja("f1", NEGOCIO, "v", 1, "13:00", "17:00"),
            franja("f2", NEGOCIO, "a", 1, "09:00", "13:00"),
            franja("f3", NEGOCIO, "w", 1, "10:00", "15:00"),
          ],
        })
      )

      expect((await editar(sesionesDeSedes.dueña, "v", { activo: true })).status).toBe(200)
    })

    it("las franjas inactivas y las de otro negocio no chocan", async () => {
      base.reiniciar(
        datos({
          workSchedule: [
            franja("f1", NEGOCIO, "v", 1, "09:00", "13:00"),
            franja("f2", NEGOCIO, "a", 1, "10:00", "12:00", { active: false }),
            franja("f3", OTRO_NEGOCIO, "x", 1, "10:00", "12:00"),
          ],
        })
      )

      expect((await editar(sesionesDeSedes.dueña, "v", { activo: true })).status).toBe(200)
    })

    it("la base como segunda barrera: si el choque se cuela a la lectura de antes, el trigger responde 409 con el motivo y no queda nada a medias", async () => {
      base.reiniciar(
        datos({ workSchedule: [franja("f1", NEGOCIO, "v", 1, "09:00", "13:00"), franja("f2", NEGOCIO, "a", 1, "12:00", "16:00")] })
      )
      // La revisión previa no ve el choque (una franja que entra justo en medio): sólo lo frena el trigger.
      base.prisma.workSchedule.findMany.mockResolvedValueOnce([{ dayOfWeek: 1, startTime: "09:00", endTime: "13:00" }])
      base.prisma.workSchedule.findMany.mockResolvedValueOnce([])

      const res = await editar(sesionesDeSedes.dueña, "v", { activo: true })

      expect(res.status).toBe(409)
      expect((await res.json()).error).toContain("se pisa")
      expect(fila("v").activo).toBe(false)
    })
  })

  describe("el plan se lee de la base, no del token", () => {
    it("un negocio que ya es Equipo: 409 aunque la sesión diga Independiente", async () => {
      base.reiniciar({ ...datos(), business: [{ id: NEGOCIO, name: "Salón Uno", slug: "salon-uno", userId: "u-duena", plan: "equipo" }] })
      const antes = base.volcado()

      const res = await editar(sesionesDeSedes.dueña, "a", { orden: 3 })

      expect(res.status).toBe(409)
      expect(await res.json()).toEqual({ error: MENSAJE_PLAN_SIN_SEDES })
      expect(base.volcado()).toEqual(antes)
    })
  })

  it("un error inesperado es 500 sin datos y se deshace", async () => {
    const consola = vi.spyOn(console, "error").mockImplementation(() => {})
    const antes = base.volcado()
    base.prisma.sede.updateMany.mockRejectedValueOnce(new Error("se cayó"))

    const res = await editar(sesionesDeSedes.dueña, "a", { orden: 3 })

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: "Error interno del servidor" })
    expect(base.volcado()).toEqual(antes)
    consola.mockRestore()
  })
})

describe("DELETE /api/configuracion/sedes/[id]", () => {
  it("una sede sin citas se borra y se lleva su horario y su lista de espera; lo demás queda", async () => {
    base.reiniciar(
      datos({
        workSchedule: [franja("f1", NEGOCIO, "a", 1, "09:00", "13:00"), franja("f2", NEGOCIO, "b", 1, "14:00", "18:00"), franja("g1", NEGOCIO, null, 2, "09:00", "13:00")],
        inscripcionEnEspera: [inscripcion("e1", NEGOCIO, "s-corte", "a"), inscripcion("e2", NEGOCIO, "s-corte", "b")],
      })
    )

    const res = await borrar(sesionesDeSedes.dueña, "a")

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(base.buscar("sede", { id: "a" })).toHaveLength(0)
    expect(base.buscar("workSchedule").map((f) => f.id)).toEqual(["f2", "g1"])
    expect(base.buscar("inscripcionEnEspera").map((e) => e.id)).toEqual(["e2"])
    expect(base.buscar("sede", { businessId: NEGOCIO }).map((s) => s.id)).toEqual(["b", "v"])
  })

  it.each([
    ["una hora por delante", cita("c1", NEGOCIO, "a", FUTURO)],
    ["una hora pasada", cita("c1", NEGOCIO, "a", PASADO, { status: "completada" })],
    ["una hora cancelada", cita("c1", NEGOCIO, "a", FUTURO, { status: "cancelada" })],
  ])("con %s no se borra: 409 que manda a desactivarla, y no se pierde nada", async (_caso, unaCita) => {
    base.reiniciar(datos({ appointment: [unaCita], workSchedule: [franja("f1", NEGOCIO, "a", 1, "09:00", "13:00")] }))
    const antes = base.volcado()

    const res = await borrar(sesionesDeSedes.dueña, "a")

    expect(res.status).toBe(409)
    const cuerpo = await res.json()
    expect(cuerpo.error).toBe(MENSAJE_SEDE_CON_CITAS)
    expect(cuerpo.error).toContain("Desactívala")
    expect(base.volcado()).toEqual(antes)
  })

  it("las citas de otra sede o de otro negocio no la frenan", async () => {
    base.reiniciar(datos({ appointment: [cita("c1", NEGOCIO, "b", FUTURO), cita("c2", OTRO_NEGOCIO, "x", FUTURO)] }))

    expect((await borrar(sesionesDeSedes.dueña, "a")).status).toBe(200)
  })

  it("la FK de las citas como segunda barrera: una hora que entra entre el conteo y el borrado también da 409", async () => {
    base.reiniciar(datos({ appointment: [cita("c1", NEGOCIO, "a", FUTURO)] }))
    base.prisma.appointment.count.mockResolvedValueOnce(0)

    const res = await borrar(sesionesDeSedes.dueña, "a")

    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe(MENSAJE_SEDE_CON_CITAS)
    expect(base.buscar("sede", { id: "a" })).toHaveLength(1)
  })

  it.each([
    ["una sede de otro negocio", "x"],
    ["una sede que no existe", "no-existe"],
  ])("%s: 404 y no se borra nada", async (_caso, id) => {
    const antes = base.volcado()

    const res = await borrar(sesionesDeSedes.dueña, id)

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: MENSAJE_SEDE_NO_ENCONTRADA })
    expect(base.volcado()).toEqual(antes)
  })

  it("la dueña del otro negocio no borra la sede de éste", async () => {
    const antes = base.volcado()

    expect((await borrar(sesionesDeSedes.dueñaAjena, "a")).status).toBe(404)
    expect(base.volcado()).toEqual(antes)
  })

  it.each([
    ["el encargado", sesionesDeSedes.encargado],
    ["una profesional", sesionesDeSedes.profesional],
    ["la dueña de un negocio Equipo", sesionesDeSedes.dueñaEquipo],
    ["nadie con sesión", null],
  ])("sin permiso (%s): 401 y no se borra nada", async (_quien, sesion) => {
    const antes = base.volcado()

    expect((await borrar(sesion, "a")).status).toBe(401)
    expect(base.volcado()).toEqual(antes)
  })

  it("el plan se lee de la base: un negocio Equipo no borra sedes aunque el token diga Independiente", async () => {
    base.reiniciar({ ...datos(), business: [{ id: NEGOCIO, name: "Salón Uno", slug: "salon-uno", userId: "u-duena", plan: "equipo" }] })

    expect((await borrar(sesionesDeSedes.dueña, "a")).status).toBe(409)
    expect(base.buscar("sede", { id: "a" })).toHaveLength(1)
  })

  it("toma el candado de planes y sedes", async () => {
    await borrar(sesionesDeSedes.dueña, "a")

    expect(base.transaccion.$executeRaw.mock.calls.map((llamada) => (llamada as unknown[])[1])).toEqual(["plan-y-sedes:negocio-1"])
  })
})
