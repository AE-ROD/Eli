import { describe, it, expect, vi, beforeEach } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, OTRO_NEGOCIO, atencion, datosBase, linea, lineaDeLaDueña, pedido, sesiones } from "@/pruebas/datos"

/**
 * Comisiones (#64, #35): sólo la dueña fija porcentajes y ve su historial.
 * Cada cambio deja exactamente una fila en `CommissionChange`, en la misma
 * transacción; sin cambio, ninguna. `null` (sin configurar) no es 0.
 */

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const base = crearBaseFalsa()

vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

const URL_BASE = "http://localhost/api/comisiones"

function escenario() {
  const datos = datosBase()
  base.reiniciar({
    ...datos,
    businessMember: datos.businessMember.map((miembro) =>
      miembro.id === "m-pedro" ? { ...miembro, commissionPercent: 40 } : miembro
    ),
    commissionRate: [
      { id: "r-pedro-color", businessId: NEGOCIO, memberId: "m-pedro", serviceId: "s-color", percent: 50 },
    ],
    commissionChange: [
      // De alguien que ya no está: su memberId quedó en null al irse.
      {
        id: "cc-viejo",
        businessId: NEGOCIO,
        memberId: null,
        memberName: "Lucía Exprofesional",
        scope: "default",
        changedById: "u-duena",
        changedByName: "Ana Dueña",
        changedByEmail: "duena@uno.test",
        previousPercent: null,
        newPercent: 30,
        createdAt: new Date("2026-02-01T12:00:00.000Z"),
      },
      {
        id: "cc-ajeno",
        businessId: OTRO_NEGOCIO,
        memberId: "m-ajeno",
        memberName: "Carla Profesional",
        scope: "default",
        changedById: "u-otro",
        changedByName: "Otro Dueño",
        changedByEmail: "dueno@dos.test",
        previousPercent: null,
        newPercent: 90,
      },
    ],
    visit: [
      atencion("v-cobrada", { status: "finalizada", paidAt: new Date("2026-10-06T15:00:00.000Z"), totalCents: 2400000 }),
      atencion("v-abierta", { status: "en-atencion" }),
      atencion("v-ajena", { businessId: OTRO_NEGOCIO, customerId: "c-ajeno", status: "finalizada", paidAt: new Date("2026-10-06T15:00:00.000Z") }),
    ],
    visitService: [
      linea("l-carla-1", "v-cobrada"),
      linea("l-carla-2", "v-cobrada"),
      linea("l-pedro-congelada", "v-cobrada", {
        memberId: "m-pedro",
        commissionPercent: 40,
        commissionCents: 320000,
        commissionAt: new Date("2026-10-06T15:00:00.000Z"),
      }),
      lineaDeLaDueña("l-duena", "v-cobrada"),
      // Abierta: todavía no se cobró, no cuenta como pendiente.
      linea("l-carla-abierta", "v-abierta"),
      linea("l-ajena", "v-ajena", { memberId: "m-ajeno", serviceId: "s-ajeno" }),
    ],
  })
}

async function leer(sesion: unknown) {
  const { GET } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  return GET()
}

async function fijarMiembro(sesion: unknown, id: string, cuerpo: unknown) {
  const { PUT } = await import("./miembros/[id]/route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  return PUT(pedido(`${URL_BASE}/miembros/${id}`, cuerpo), { params: Promise.resolve({ id }) })
}

async function fijarExcepcion(sesion: unknown, id: string, servicioId: string, cuerpo: unknown) {
  const { PUT } = await import("./miembros/[id]/servicios/[servicioId]/route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  return PUT(pedido(`${URL_BASE}/miembros/${id}/servicios/${servicioId}`, cuerpo), {
    params: Promise.resolve({ id, servicioId }),
  })
}

async function historial(sesion: unknown, consulta = "") {
  const { GET } = await import("./historial/route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  return GET(pedido(`${URL_BASE}/historial${consulta}`))
}

const cambiosDelNegocio = () => base.buscar("commissionChange", { businessId: NEGOCIO })
const SIN_SESION = null

describe("quién entra", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    escenario()
  })

  it.each([
    ["el encargado", sesiones.encargado],
    ["un profesional", sesiones.carla],
    ["sin sesión", SIN_SESION],
  ])("%s recibe 401 en todo y no escribe nada", async (_quien, sesion) => {
    const antes = base.volcado()
    expect((await leer(sesion)).status).toBe(401)
    expect((await fijarMiembro(sesion, "m-carla", { porcentaje: 40 })).status).toBe(401)
    expect((await fijarExcepcion(sesion, "m-carla", "s-corte", { porcentaje: 40 })).status).toBe(401)
    expect((await historial(sesion)).status).toBe(401)
    expect(base.volcado()).toEqual(antes)
  })
})

describe("GET /api/comisiones", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    escenario()
  })

  it("trae el equipo con su %, sus excepciones y lo pendiente; sólo del negocio", async () => {
    const res = await leer(sesiones.dueña)
    expect(res.status).toBe(200)
    const cuerpo = await res.json()

    expect(cuerpo.miembros.map((m: { id: string }) => m.id)).toEqual(["m-encargado", "m-carla", "m-pedro"])
    const carla = cuerpo.miembros.find((m: { id: string }) => m.id === "m-carla")
    const pedro = cuerpo.miembros.find((m: { id: string }) => m.id === "m-pedro")
    // Sin configurar es null, no 0.
    expect(carla.porcentaje).toBeNull()
    expect(carla.pendientes).toBe(2)
    expect(pedro.porcentaje).toBe(40)
    expect(pedro.pendientes).toBe(0)
    expect(pedro.excepciones).toEqual([{ servicioId: "s-color", servicio: "Color", porcentaje: 50 }])

    expect(cuerpo.servicios.map((s: { id: string }) => s.id)).not.toContain("s-ajeno")
    expect(cuerpo.productos.map((p: { id: string }) => p.id).sort()).toEqual(["p-cera", "p-shampoo", "p-viejo"])
    expect(cuerpo.productos.find((p: { id: string }) => p.id === "p-cera").porcentaje).toBeNull()
  })

  it("lo cobrado antes de \"Liquidar desde\" (en la zona del negocio) no cuenta como pendiente", async () => {
    const datos = base.volcado()
    base.reiniciar({
      ...datos,
      business: base
        .buscar("business")
        .map((b) => (b.id === NEGOCIO ? { ...b, timezone: "America/Santiago", liquidacionDesde: new Date("2026-10-07T00:00:00.000Z") } : b)),
      visit: [
        ...base.buscar("visit"),
        // 6 de octubre a las 23:59 en Santiago (UTC-3): antes del borde.
        atencion("v-antes", { status: "finalizada", paidAt: new Date("2026-10-07T02:59:00.000Z") }),
        // 7 de octubre a las 00:00: ya cuenta.
        atencion("v-justo", { status: "finalizada", paidAt: new Date("2026-10-07T03:00:00.000Z") }),
      ],
      visitService: [...base.buscar("visitService"), linea("l-antes", "v-antes"), linea("l-justo", "v-justo")],
    })

    const cuerpo = await (await leer(sesiones.dueña)).json()

    // Las dos de v-cobrada (6 de octubre) y l-antes quedan fuera; l-justo cuenta.
    expect(cuerpo.miembros.find((m: { id: string }) => m.id === "m-carla").pendientes).toBe(1)
  })
})

describe("PUT /api/comisiones/miembros/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    escenario()
  })

  it("fija el % y audita exactamente una fila con antes null y después el valor", async () => {
    const res = await fijarMiembro(sesiones.dueña, "m-carla", { porcentaje: 33.33 })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ porcentaje: 33.33, cambio: true })
    expect(base.buscar("businessMember", { id: "m-carla" })[0].commissionPercent).toBe(33.33)

    const nuevos = cambiosDelNegocio().filter((c) => c.memberId === "m-carla")
    expect(nuevos).toHaveLength(1)
    expect(nuevos[0]).toMatchObject({
      scope: "default",
      memberName: "Carla Profesional",
      previousPercent: null,
      newPercent: 33.33,
      changedById: "u-duena",
      changedByName: "Ana Dueña",
      changedByEmail: "duena@uno.test",
      serviceId: null,
    })
  })

  it("de 0 a null es un cambio: sin configurar no es 0", async () => {
    await fijarMiembro(sesiones.dueña, "m-carla", { porcentaje: 0 })
    const res = await fijarMiembro(sesiones.dueña, "m-carla", { porcentaje: null })
    expect(await res.json()).toEqual({ porcentaje: null, cambio: true })
    const filas = cambiosDelNegocio().filter((c) => c.memberId === "m-carla")
    expect(filas.map((c) => [c.previousPercent, c.newPercent])).toEqual([
      [null, 0],
      [0, null],
    ])
  })

  it("el mismo valor no cambia nada ni audita", async () => {
    const antes = base.volcado()
    const res = await fijarMiembro(sesiones.dueña, "m-pedro", { porcentaje: 40 })
    expect(await res.json()).toEqual({ porcentaje: 40, cambio: false })
    expect(base.volcado()).toEqual(antes)
  })

  it("lo hace dentro de una transacción con candado sobre el profesional", async () => {
    await fijarMiembro(sesiones.dueña, "m-pedro", { porcentaje: 45 })
    expect(base.prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(base.prisma.$queryRaw).toHaveBeenCalledTimes(1)
    const [partes, ...valores] = base.prisma.$queryRaw.mock.calls[0]
    expect(partes.join("?")).toContain("FOR UPDATE")
    expect(valores).toEqual(["m-pedro", NEGOCIO])
  })

  it("si la auditoría falla, el % no queda cambiado", async () => {
    base.prisma.commissionChange.create.mockRejectedValueOnce(new Error("se cayó"))
    await expect(fijarMiembro(sesiones.dueña, "m-pedro", { porcentaje: 45 })).rejects.toThrow("se cayó")
    expect(base.buscar("businessMember", { id: "m-pedro" })[0].commissionPercent).toBe(40)
  })

  it.each([
    ["el miembro de otro negocio", "m-ajeno"],
    ["un miembro que no existe", "m-nadie"],
  ])("%s es 404 y no escribe nada", async (_caso, id) => {
    const antes = base.volcado()
    const res = await fijarMiembro(sesiones.dueña, id, { porcentaje: 10 })
    expect(res.status).toBe(404)
    expect(base.volcado()).toEqual(antes)
  })

  it("el dueño de otro negocio no llega a un miembro de éste: 404", async () => {
    const res = await fijarMiembro(sesiones.dueñoAjeno, "m-carla", { porcentaje: 10 })
    expect(res.status).toBe(404)
  })

  it.each([
    ["más de 100", { porcentaje: 100.01 }],
    ["negativo", { porcentaje: -1 }],
    ["tres decimales", { porcentaje: 12.345 }],
    ["un texto", { porcentaje: "40" }],
    ["sin el campo", {}],
    ["sin cuerpo", undefined],
  ])("%s: 400", async (_caso, cuerpo) => {
    const res = await fijarMiembro(sesiones.dueña, "m-carla", cuerpo)
    expect(res.status).toBe(400)
    expect(cambiosDelNegocio()).toHaveLength(1)
  })

  it.each([0, 100, 12.5])("%s es válido", async (porcentaje) => {
    const res = await fijarMiembro(sesiones.dueña, "m-carla", { porcentaje })
    expect(res.status).toBe(200)
  })
})

describe("PUT /api/comisiones/miembros/[id]/servicios/[servicioId]", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    escenario()
  })

  it("crea la excepción y audita una fila con el servicio copiado", async () => {
    const res = await fijarExcepcion(sesiones.dueña, "m-carla", "s-corte", { porcentaje: 45 })
    expect(res.status).toBe(200)
    expect(base.buscar("commissionRate", { memberId: "m-carla" })).toMatchObject([
      { businessId: NEGOCIO, serviceId: "s-corte", percent: 45 },
    ])
    const filas = cambiosDelNegocio().filter((c) => c.memberId === "m-carla")
    expect(filas).toHaveLength(1)
    expect(filas[0]).toMatchObject({
      scope: "service",
      serviceId: "s-corte",
      serviceName: "Corte",
      previousPercent: null,
      newPercent: 45,
    })
  })

  it("cambia una existente con el antes correcto", async () => {
    await fijarExcepcion(sesiones.dueña, "m-pedro", "s-color", { porcentaje: 55 })
    expect(base.buscar("commissionRate", { id: "r-pedro-color" })[0].percent).toBe(55)
    const filas = cambiosDelNegocio().filter((c) => c.memberId === "m-pedro")
    expect(filas.map((c) => [c.previousPercent, c.newPercent])).toEqual([[50, 55]])
  })

  it("null borra la excepción y lo audita", async () => {
    const res = await fijarExcepcion(sesiones.dueña, "m-pedro", "s-color", { porcentaje: null })
    expect(await res.json()).toEqual({ porcentaje: null, cambio: true })
    expect(base.buscar("commissionRate", { memberId: "m-pedro" })).toEqual([])
    const filas = cambiosDelNegocio().filter((c) => c.memberId === "m-pedro")
    expect(filas.map((c) => [c.previousPercent, c.newPercent])).toEqual([[50, null]])
  })

  it("borrar una que no existe no audita", async () => {
    const antes = base.volcado()
    const res = await fijarExcepcion(sesiones.dueña, "m-carla", "s-corte", { porcentaje: null })
    expect(await res.json()).toEqual({ porcentaje: null, cambio: false })
    expect(base.volcado()).toEqual(antes)
  })

  it("una excepción de 0 % es un valor, distinto de no tenerla", async () => {
    await fijarExcepcion(sesiones.dueña, "m-carla", "s-corte", { porcentaje: 0 })
    expect(base.buscar("commissionRate", { memberId: "m-carla" })[0].percent).toBe(0)
  })

  it.each([
    ["servicio de otro negocio", "m-carla", "s-ajeno"],
    ["servicio que no existe", "m-carla", "s-nada"],
    ["miembro de otro negocio", "m-ajeno", "s-corte"],
  ])("%s: 404 y nada escrito", async (_caso, id, servicioId) => {
    const antes = base.volcado()
    const res = await fijarExcepcion(sesiones.dueña, id, servicioId, { porcentaje: 10 })
    expect(res.status).toBe(404)
    expect(base.volcado()).toEqual(antes)
  })

  it("fuera de rango: 400", async () => {
    const res = await fijarExcepcion(sesiones.dueña, "m-carla", "s-corte", { porcentaje: 101 })
    expect(res.status).toBe(400)
  })
})

describe("GET /api/comisiones/historial", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    escenario()
  })

  it("trae los cambios del negocio, nuevos primero, incluidos los de ex-miembros; nunca los de otro", async () => {
    await fijarMiembro(sesiones.dueña, "m-carla", { porcentaje: 40 })
    await fijarExcepcion(sesiones.dueña, "m-pedro", "s-color", { porcentaje: 60 })

    const res = await historial(sesiones.dueña)
    expect(res.status).toBe(200)
    const cuerpo = await res.json()
    expect(cuerpo.total).toBe(3)
    expect(cuerpo.cambios.map((c: { miembro: { nombre: string } }) => c.miembro.nombre)).toContain("Lucía Exprofesional")
    expect(cuerpo.cambios.map((c: { id: string }) => c.id)).not.toContain("cc-ajeno")
    expect(cuerpo.cambios.at(-1)).toMatchObject({
      id: "cc-viejo",
      miembro: { id: null, nombre: "Lucía Exprofesional" },
      alcance: "default",
      sobre: null,
      quien: "Ana Dueña",
      antes: null,
      despues: 30,
    })
    const dePedro = cuerpo.cambios.find((c: { miembro: { id: string } }) => c.miembro.id === "m-pedro")
    expect(dePedro).toMatchObject({ alcance: "service", sobre: "Color", antes: 50, despues: 60 })
  })

  it("filtra por profesional del negocio", async () => {
    await fijarMiembro(sesiones.dueña, "m-carla", { porcentaje: 40 })
    await fijarMiembro(sesiones.dueña, "m-pedro", { porcentaje: 41 })
    const cuerpo = await (await historial(sesiones.dueña, "?miembro=m-carla")).json()
    expect(cuerpo.cambios.map((c: { miembro: { id: string } }) => c.miembro.id)).toEqual(["m-carla"])
  })

  it("un profesional de otro negocio es 404", async () => {
    const res = await historial(sesiones.dueña, "?miembro=m-ajeno")
    expect(res.status).toBe(404)
  })

  it("el dueño de otro negocio sólo ve lo suyo", async () => {
    const cuerpo = await (await historial(sesiones.dueñoAjeno)).json()
    expect(cuerpo.cambios.map((c: { id: string }) => c.id)).toEqual(["cc-ajeno"])
  })

  describe("filtrar por alguien que ya no está en el equipo (#119)", () => {
    /** Un cambio de alguien que se fue: su memberId quedó en null y el nombre, copiado. */
    const deExMiembro = (id: string, businessId: string, memberName: string) =>
      base.prisma.commissionChange.create({
        data: {
          id,
          businessId,
          memberId: null,
          memberName,
          scope: "default",
          changedByName: "Alguien",
          changedByEmail: "alguien@test",
          newPercent: 10,
        },
      })

    it("ofrece a los ex-miembros del negocio para elegir, sin repetir y nunca los de otro", async () => {
      await deExMiembro("cc-viejo-2", NEGOCIO, "Lucía Exprofesional")
      await deExMiembro("cc-beto", NEGOCIO, "Beto Exprofesional")
      await deExMiembro("cc-ajeno-ex", OTRO_NEGOCIO, "Zoe Del Otro")

      const cuerpo = await (await historial(sesiones.dueña)).json()
      expect(cuerpo.exMiembros).toEqual(["Beto Exprofesional", "Lucía Exprofesional"])

      const delOtro = await (await historial(sesiones.dueñoAjeno)).json()
      expect(delOtro.exMiembros).toEqual(["Zoe Del Otro"])
    })

    it("trae sólo los cambios de ese ex-miembro, del negocio", async () => {
      await deExMiembro("cc-viejo-2", NEGOCIO, "Lucía Exprofesional")
      await deExMiembro("cc-beto", NEGOCIO, "Beto Exprofesional")
      await deExMiembro("cc-lucia-ajena", OTRO_NEGOCIO, "Lucía Exprofesional")
      await fijarMiembro(sesiones.dueña, "m-carla", { porcentaje: 40 })

      const res = await historial(sesiones.dueña, `?exMiembro=${encodeURIComponent("Lucía Exprofesional")}`)
      expect(res.status).toBe(200)
      const cuerpo = await res.json()
      expect(cuerpo.total).toBe(2)
      expect(cuerpo.cambios.map((c: { id: string }) => c.id).sort()).toEqual(["cc-viejo", "cc-viejo-2"])
    })

    it("no trae los cambios de alguien que sigue en el equipo aunque se llame igual", async () => {
      await fijarMiembro(sesiones.dueña, "m-carla", { porcentaje: 40 })
      const [deCarla] = base.buscar("commissionChange", { memberId: "m-carla" })

      const cuerpo = await (
        await historial(sesiones.dueña, `?exMiembro=${encodeURIComponent(String(deCarla.memberName))}`)
      ).json()
      expect(cuerpo.cambios).toEqual([])
      expect(cuerpo.total).toBe(0)
    })

    /** El % de un producto también va sin miembro, pero es de todo el equipo, no de alguien que se fue. */
    const deProducto = async () => {
      // Import dinámico: `lib/productos` carga prisma, que acá es la base falsa del mock.
      const { TODO_EL_EQUIPO } = await import("@/lib/productos")
      await base.prisma.commissionChange.create({
        data: {
          id: "cc-producto",
          businessId: NEGOCIO,
          memberId: null,
          memberName: TODO_EL_EQUIPO,
          scope: "product",
          productName: "Shampoo",
          changedByName: "Ana Dueña",
          changedByEmail: "duena@uno.test",
          newPercent: 10,
        },
      })
      return TODO_EL_EQUIPO
    }

    it("un cambio del % de un producto no cuenta como ex-miembro", async () => {
      const todoElEquipo = await deProducto()

      const cuerpo = await (await historial(sesiones.dueña)).json()
      expect(cuerpo.exMiembros).toEqual(["Lucía Exprofesional"])
      // Sin filtro sí sale en el historial.
      expect(cuerpo.cambios.map((c: { id: string }) => c.id)).toContain("cc-producto")

      const filtrado = await (
        await historial(sesiones.dueña, `?exMiembro=${encodeURIComponent(todoElEquipo)}`)
      ).json()
      expect(filtrado.total).toBe(0)
      expect(filtrado.cambios).toEqual([])
    })

    it("el nombre de un ex-miembro de otro negocio no trae nada", async () => {
      await deExMiembro("cc-ajeno-ex", OTRO_NEGOCIO, "Zoe Del Otro")
      const cuerpo = await (await historial(sesiones.dueña, "?exMiembro=Zoe%20Del%20Otro")).json()
      expect(cuerpo.total).toBe(0)
    })

    it("pedir un profesional y un ex-miembro a la vez es 400", async () => {
      const res = await historial(sesiones.dueña, "?miembro=m-carla&exMiembro=Luc%C3%ADa%20Exprofesional")
      expect(res.status).toBe(400)
    })
  })
})
