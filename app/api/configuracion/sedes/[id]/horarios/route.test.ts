import { describe, it, expect, vi, beforeEach } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { conId, pedido } from "@/pruebas/datos"
import { MENSAJE_DE_DIA_REPETIDO, MENSAJE_DE_FRANJAS_PISADAS } from "@/lib/grilla-de-sede"
import { MENSAJE_PLAN_SIN_SEDES, MENSAJE_SEDE_NO_ENCONTRADA } from "@/lib/reglas-de-sedes"
import { NEGOCIO, OTRO_NEGOCIO, datosDeSedes, franja, sede, sesionesDeSedes } from "../../_pruebas"

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const base = crearBaseFalsa()

vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

const URL = "http://localhost/api/configuracion/sedes/a/horarios"

async function guardar(sesion: unknown, id: string, cuerpo: unknown) {
  const { PUT } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  return PUT(pedido(URL, cuerpo), conId(id))
}

const dia = (dayOfWeek: number, ...franjas: [string, string][]) => ({ dayOfWeek, franjas: franjas.map(([start, end]) => ({ start, end })) })
const filasDe = (sedeId: string | null, negocio = NEGOCIO) =>
  base
    .buscar("workSchedule", { businessId: negocio, sedeId })
    .map((f) => `${f.dayOfWeek} ${f.startTime}-${f.endTime}`)
    .sort()

/** Centro (a) con horario, Providencia (b) con otro, Vieja (v) inactiva, un horario general sin sede y lo del otro negocio. */
const datos = () =>
  datosDeSedes({
    sede: [sede("a", NEGOCIO, "Centro"), sede("b", NEGOCIO, "Providencia"), sede("v", NEGOCIO, "Vieja", { activo: false }), sede("x", OTRO_NEGOCIO, "Centro")],
    workSchedule: [
      franja("a1", NEGOCIO, "a", 1, "09:00", "13:00"),
      franja("a2", NEGOCIO, "a", 2, "09:00", "13:00"),
      franja("b1", NEGOCIO, "b", 1, "14:00", "18:00"),
      franja("b2", NEGOCIO, "b", 3, "09:00", "13:00"),
      franja("v1", NEGOCIO, "v", 1, "09:00", "18:00"),
      franja("g1", NEGOCIO, null, 1, "09:00", "13:00"),
      franja("x1", OTRO_NEGOCIO, "x", 1, "09:00", "13:00"),
    ],
  })

beforeEach(() => {
  vi.clearAllMocks()
  base.reiniciar(datos())
})

describe("PUT /api/configuracion/sedes/[id]/horarios", () => {
  it("reemplaza TODA la grilla de la sede y responde con la sede (horario con la forma de la pantalla)", async () => {
    const res = await guardar(sesionesDeSedes.dueña, "a", { dias: [dia(5, ["10:00", "14:00"], ["15:00", "19:00"]), dia(0, ["09:00", "12:00"])] })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      sede: {
        id: "a",
        nombre: "Centro",
        direccion: "Calle Centro 1",
        comuna: "Ñuñoa",
        telefono: null,
        orden: 0,
        activo: true,
        horarios: [dia(0, ["09:00", "12:00"]), dia(5, ["10:00", "14:00"], ["15:00", "19:00"])],
        horasFuturas: 0,
      },
    })
    expect(filasDe("a")).toEqual(["0 09:00-12:00", "5 10:00-14:00", "5 15:00-19:00"])
  })

  it("no toca las otras sedes, el horario general ni lo del otro negocio", async () => {
    await guardar(sesionesDeSedes.dueña, "a", { dias: [dia(5, ["10:00", "14:00"])] })

    expect(filasDe("b")).toEqual(["1 14:00-18:00", "3 09:00-13:00"])
    expect(filasDe("v")).toEqual(["1 09:00-18:00"])
    expect(filasDe(null)).toEqual(["1 09:00-13:00"])
    expect(filasDe("x", OTRO_NEGOCIO)).toEqual(["1 09:00-13:00"])
  })

  it("las franjas guardadas son del horario de la sede: activas y sin integrante", async () => {
    await guardar(sesionesDeSedes.dueña, "a", { dias: [dia(5, ["10:00", "14:00"])] })

    expect(base.buscar("workSchedule", { sedeId: "a" })).toEqual([
      expect.objectContaining({ businessId: NEGOCIO, sedeId: "a", memberId: null, dayOfWeek: 5, startTime: "10:00", endTime: "14:00", active: true }),
    ])
  })

  it("vacío = la sede no atiende: se borra su grilla", async () => {
    const res = await guardar(sesionesDeSedes.dueña, "a", { dias: [] })

    expect(res.status).toBe(200)
    expect((await res.json()).sede.horarios).toEqual([])
    expect(filasDe("a")).toEqual([])
    expect(filasDe("b")).toHaveLength(2)
  })

  it("un día sin franjas es un día sin atención", async () => {
    const res = await guardar(sesionesDeSedes.dueña, "a", { dias: [dia(1), dia(2, ["09:00", "10:00"])] })

    expect(res.status).toBe(200)
    expect(filasDe("a")).toEqual(["2 09:00-10:00"])
  })

  it("dentro de la misma sede, franjas que se tocan valen", async () => {
    const res = await guardar(sesionesDeSedes.dueña, "a", { dias: [dia(2, ["09:00", "12:00"], ["12:00", "15:00"])] })

    expect(res.status).toBe(200)
    expect(filasDe("a")).toEqual(["2 09:00-12:00", "2 12:00-15:00"])
  })

  it("guardar lo mismo dos veces no duplica la grilla", async () => {
    const cuerpo = { dias: [dia(5, ["10:00", "14:00"])] }

    await guardar(sesionesDeSedes.dueña, "a", cuerpo)
    await guardar(sesionesDeSedes.dueña, "a", cuerpo)

    expect(filasDe("a")).toEqual(["5 10:00-14:00"])
  })

  it("reemplaza bajo el candado de planes y sedes, antes de borrar y crear", async () => {
    await guardar(sesionesDeSedes.dueña, "a", { dias: [dia(5, ["10:00", "14:00"])] })

    expect(base.transaccion.$executeRaw.mock.calls.map((llamada) => (llamada as unknown[])[1])).toEqual(["plan-y-sedes:negocio-1"])
    expect(base.transaccion.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(base.prisma.workSchedule.deleteMany.mock.invocationCallOrder[0])
    expect(base.prisma.workSchedule.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(base.prisma.workSchedule.createMany.mock.invocationCallOrder[0])
  })

  describe("choques con otra sede: 409 con { error, choques: [{ dayOfWeek, conSede }] } y no se escribe nada", () => {
    it("una franja que se pisa con la de otra sede ACTIVA el mismo día", async () => {
      const antes = base.volcado()

      const res = await guardar(sesionesDeSedes.dueña, "a", { dias: [dia(1, ["09:00", "13:00"], ["17:00", "19:00"]), dia(3, ["12:00", "14:00"])] })

      expect(res.status).toBe(409)
      const cuerpo = await res.json()
      expect(cuerpo.choques).toEqual([
        { dayOfWeek: 1, conSede: "Providencia" },
        { dayOfWeek: 3, conSede: "Providencia" },
      ])
      expect(cuerpo.error).toContain("el lunes con Providencia")
      expect(cuerpo.error).toContain("el miércoles con Providencia")
      expect(base.volcado()).toEqual(antes)
    })

    it("con dos sedes distintas, un renglón por cada", async () => {
      base.reiniciar(
        datosDeSedes({
          sede: [sede("a", NEGOCIO, "Centro"), sede("b", NEGOCIO, "Providencia"), sede("c", NEGOCIO, "Maipú")],
          workSchedule: [franja("b1", NEGOCIO, "b", 1, "10:00", "12:00"), franja("c1", NEGOCIO, "c", 1, "15:00", "17:00")],
        })
      )

      const res = await guardar(sesionesDeSedes.dueña, "a", { dias: [dia(1, ["09:00", "18:00"])] })

      expect((await res.json()).choques).toEqual([
        { dayOfWeek: 1, conSede: "Maipú" },
        { dayOfWeek: 1, conSede: "Providencia" },
      ])
    })

    it("tocarse con la de otra sede sí vale", async () => {
      const res = await guardar(sesionesDeSedes.dueña, "a", { dias: [dia(1, ["09:00", "14:00"], ["18:00", "20:00"])] })

      expect(res.status).toBe(200)
    })

    it("la franja de otra sede inactiva, o inactiva ella, o de otro negocio no cuenta", async () => {
      // La de Vieja (inactiva) cubre el lunes entero; la de Otra no está activa.
      base.reiniciar({
        ...datos(),
        workSchedule: [franja("v1", NEGOCIO, "v", 1, "09:00", "18:00"), franja("b1", NEGOCIO, "b", 2, "09:00", "18:00", { active: false }), franja("x1", OTRO_NEGOCIO, "x", 3, "09:00", "18:00")],
      })

      const res = await guardar(sesionesDeSedes.dueña, "a", { dias: [dia(1, ["10:00", "12:00"]), dia(2, ["10:00", "12:00"]), dia(3, ["10:00", "12:00"])] })

      expect(res.status).toBe(200)
    })

    it("el horario general sin sede no cuenta: es de un negocio sin sedes", async () => {
      expect((await guardar(sesionesDeSedes.dueña, "a", { dias: [dia(1, ["09:00", "13:00"])] })).status).toBe(200)
    })

    it("una sede INACTIVA también se revisa contra las activas (la base no mira si la sede de la franja está activa), y sin choque guarda", async () => {
      const antes = base.volcado()

      const choca = await guardar(sesionesDeSedes.dueña, "v", { dias: [dia(1, ["09:00", "18:00"])] })

      expect(choca.status).toBe(409)
      expect((await choca.json()).choques).toEqual([{ dayOfWeek: 1, conSede: "Centro" }, { dayOfWeek: 1, conSede: "Providencia" }])
      expect(base.volcado()).toEqual(antes)

      const sinChoque = await guardar(sesionesDeSedes.dueña, "v", { dias: [dia(1, ["13:00", "14:00"]), dia(4, ["09:00", "18:00"])] })

      expect(sinChoque.status).toBe(200)
      expect(filasDe("v")).toEqual(["1 13:00-14:00", "4 09:00-18:00"])
    })

    it("la base como segunda barrera: si el choque se cuela a la revisión previa, el trigger responde 409 y la grilla de antes queda intacta (la transacción se deshace)", async () => {
      // La revisión previa no ve la franja de Providencia (una escritura que entró justo en medio).
      base.prisma.workSchedule.findMany.mockResolvedValueOnce([])
      const antes = base.volcado()

      const res = await guardar(sesionesDeSedes.dueña, "a", { dias: [dia(1, ["09:00", "15:00"])] })

      expect(res.status).toBe(409)
      expect((await res.json()).error).toContain("se pisa")
      expect(base.volcado()).toEqual(antes)
    })
  })

  describe("datos inválidos: 400 con un mensaje legible y no se escribe", () => {
    it.each([
      ["sin cuerpo", undefined, "Falta el horario de la sede"],
      ["sin dias", {}, "Falta el horario de la sede"],
      ["dias que no es una lista", { dias: "lunes" }, "Los días van en una lista"],
      ["una hora de una cifra", { dias: [dia(1, ["9:00", "13:00"])] }, "Las horas van como HH:MM, de 00:00 a 23:59"],
      ["las 24:00", { dias: [dia(1, ["09:00", "24:00"])] }, "Las horas van como HH:MM, de 00:00 a 23:59"],
      ["inicio igual al fin", { dias: [dia(1, ["09:00", "09:00"])] }, "La hora de inicio debe ser anterior a la hora de fin"],
      ["inicio después del fin", { dias: [dia(1, ["18:00", "09:00"])] }, "La hora de inicio debe ser anterior a la hora de fin"],
      ["franjas que se pisan dentro de la sede", { dias: [dia(1, ["09:00", "13:00"], ["12:00", "15:00"])] }, MENSAJE_DE_FRANJAS_PISADAS],
      ["un día repetido", { dias: [dia(1, ["09:00", "10:00"]), dia(1, ["11:00", "12:00"])] }, MENSAJE_DE_DIA_REPETIDO],
      ["un día 7", { dias: [dia(7, ["09:00", "10:00"])] }, "El día de la semana tiene que ser un número entero del 0 al 6"],
      ["más de 4 franjas en un día", { dias: [dia(1, ["06:00", "07:00"], ["08:00", "09:00"], ["10:00", "11:00"], ["12:00", "13:00"], ["14:00", "15:00"])] }, "Un día no puede tener más de 4 franjas"],
    ])("%s", async (_caso, cuerpo, mensaje) => {
      const antes = base.volcado()

      const res = await guardar(sesionesDeSedes.dueña, "a", cuerpo)

      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: mensaje })
      expect(base.volcado()).toEqual(antes)
    })

    it("un cuerpo enorme se corta con 413", async () => {
      const res = await guardar(sesionesDeSedes.dueña, "a", { dias: [], relleno: "a".repeat(200 * 1024) })

      expect(res.status).toBe(413)
    })
  })

  describe("lo ajeno no existe: 404, nunca 403, y no se escribe nada", () => {
    it.each([
      ["una sede de otro negocio", "x"],
      ["una sede que no existe", "no-existe"],
    ])("%s", async (_caso, id) => {
      const antes = base.volcado()

      const res = await guardar(sesionesDeSedes.dueña, id, { dias: [dia(1, ["09:00", "10:00"])] })

      expect(res.status).toBe(404)
      expect(await res.json()).toEqual({ error: MENSAJE_SEDE_NO_ENCONTRADA })
      expect(base.volcado()).toEqual(antes)
    })

    it("la dueña del otro negocio no alcanza el horario de esta sede", async () => {
      const antes = base.volcado()

      expect((await guardar(sesionesDeSedes.dueñaAjena, "a", { dias: [] })).status).toBe(404)
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

      expect((await guardar(sesion, "a", { dias: [] })).status).toBe(401)
      expect(base.volcado()).toEqual(antes)
    })
  })

  it("el plan se lee de la base: un negocio Equipo no guarda horarios de sede aunque el token diga Independiente", async () => {
    base.reiniciar({ ...datos(), business: [{ id: NEGOCIO, name: "Salón Uno", slug: "salon-uno", userId: "u-duena", plan: "equipo" }] })
    const antes = base.volcado()

    const res = await guardar(sesionesDeSedes.dueña, "a", { dias: [] })

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: MENSAJE_PLAN_SIN_SEDES })
    expect(base.volcado()).toEqual(antes)
  })

  it("un error inesperado es 500 sin datos y la grilla vieja queda: no se borra sin crear", async () => {
    const consola = vi.spyOn(console, "error").mockImplementation(() => {})
    const antes = base.volcado()
    base.prisma.workSchedule.createMany.mockRejectedValueOnce(new Error("se cayó"))

    const res = await guardar(sesionesDeSedes.dueña, "a", { dias: [dia(5, ["10:00", "14:00"])] })

    expect(res.status).toBe(500)
    expect(base.volcado()).toEqual(antes)
    consola.mockRestore()
  })
})
