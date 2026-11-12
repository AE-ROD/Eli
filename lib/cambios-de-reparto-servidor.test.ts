import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { actorDeSesion, type Actor } from "@/lib/permisos"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { CLINICA, OTRA_CLINICA, SALON, escenarioDental, sesionesDentales } from "@/app/api/clientes/_pruebas/clinica-dental"

const base = crearBaseFalsa()
vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

let m: typeof import("./cambios-de-reparto-servidor")
beforeAll(async () => {
  m = await import("./cambios-de-reparto-servidor")
})

/** El actor de una sesión de prueba (son parciales: lo que `actorDeSesion` mira es el rol, el negocio, el miembro y el rubro). */
const actorDe = (sesion: unknown): Actor | null => actorDeSesion(sesion as Parameters<typeof actorDeSesion>[0])

const dueña = actorDe(sesionesDentales.dueña) as Actor
const dueñaAjena = actorDe(sesionesDentales.dueñaAjena) as Actor

type Registro = Record<string, unknown>

/** Un cambio de la regla de un material: de 40/30/30 a 35/25/40, el 9 de noviembre de 2026 a las 14:05 en Santiago. */
function cambio(id: string, datos: Registro = {}): Registro {
  return {
    id,
    businessId: CLINICA,
    scope: "material",
    materialId: "mt-acrilico",
    materialNombre: "Acrílico termocurado",
    anteriorPbOdontologo: 4000,
    anteriorPbClinica: 3000,
    anteriorPbTecnico: 3000,
    nuevoPbOdontologo: 3500,
    nuevoPbClinica: 2500,
    nuevoPbTecnico: 4000,
    changedById: "u-duena",
    changedByName: "Valentina Soto",
    changedByEmail: "valentina@aurora.test",
    createdAt: new Date("2026-11-09T17:05:00.000Z"),
    ...datos,
  }
}

const ids = (historial: { cambios: { id: string }[] }) => historial.cambios.map((c) => c.id)

beforeEach(() => {
  vi.restoreAllMocks()
  base.reiniciar({ ...escenarioDental(), cambioDeRepartoDeProtesis: [] })
})

describe("leerCambiosDeReparto: el historial del reparto de prótesis de la dueña", () => {
  it("del más nuevo al más viejo; a igual instante, el último creado primero", async () => {
    base.reiniciar({
      ...escenarioDental(),
      cambioDeRepartoDeProtesis: [
        cambio("c-1", { createdAt: new Date("2026-11-01T12:00:00.000Z") }),
        cambio("c-3", { createdAt: new Date("2026-11-09T12:00:00.000Z") }),
        cambio("c-2", { createdAt: new Date("2026-11-05T12:00:00.000Z") }),
        cambio("c-4a", { createdAt: new Date("2026-11-09T12:00:00.000Z") }),
      ],
    })

    const historial = await m.leerCambiosDeReparto(dueña)

    expect(ids(historial)).toEqual(["c-4a", "c-3", "c-2", "c-1"])
  })

  it("sólo los del negocio de la sesión: los de otra clínica no aparecen, y a la otra dueña tampoco los nuestros", async () => {
    base.reiniciar({
      ...escenarioDental(),
      cambioDeRepartoDeProtesis: [
        cambio("c-propio"),
        cambio("c-ajeno", { businessId: OTRA_CLINICA, materialNombre: "Acrílico termocurado", changedByName: "Valentina Soto" }),
      ],
    })

    expect(ids(await m.leerCambiosDeReparto(dueña))).toEqual(["c-propio"])
    expect(ids(await m.leerCambiosDeReparto(dueñaAjena))).toEqual(["c-ajeno"])
  })

  it("el negocio sale de la sesión: la consulta lleva su businessId y nada que venga de afuera", async () => {
    base.reiniciar({ ...escenarioDental(), cambioDeRepartoDeProtesis: [cambio("c-propio")] })
    const buscar = vi.spyOn(base.prisma.cambioDeRepartoDeProtesis, "findMany")

    await m.leerCambiosDeReparto(dueña, 10)

    expect(buscar).toHaveBeenCalledTimes(1)
    const { where } = buscar.mock.calls[0][0] as { where: unknown }
    expect(JSON.stringify(where)).toContain(CLINICA)
    expect(JSON.stringify(where)).not.toContain(OTRA_CLINICA)
  })

  it("sólo la dueña de una clínica dental: el encargado, el odontólogo, un salón, una sesión sin rubro o sin sesión no ven nada y ni se consulta la base", async () => {
    base.reiniciar({
      ...escenarioDental(),
      cambioDeRepartoDeProtesis: [cambio("c-propio"), cambio("c-del-salon", { businessId: SALON })],
    })
    const buscar = vi.spyOn(base.prisma.cambioDeRepartoDeProtesis, "findMany")
    const quienes = [
      actorDe(sesionesDentales.encargado),
      actorDe(sesionesDentales.perez),
      actorDe(sesionesDentales.salon),
      actorDe(sesionesDentales.sinRubro),
      { rol: "desconocido", businessId: CLINICA, memberId: null, rubro: "odontologia" } as unknown as Actor,
      null,
    ]

    for (const quien of quienes) {
      expect(await m.leerCambiosDeReparto(quien)).toEqual({ cambios: [], hayMas: false })
    }
    expect(buscar).not.toHaveBeenCalled()
  })

  it("un tope: trae `limite` cambios y avisa si hay más, sin contar toda la tabla", async () => {
    const filas = Array.from({ length: 55 }, (_, i) => cambio(`c-${String(i).padStart(3, "0")}`, { createdAt: new Date(Date.UTC(2026, 9, 1, 0, i)) }))
    base.reiniciar({ ...escenarioDental(), cambioDeRepartoDeProtesis: filas })

    const primeros = await m.leerCambiosDeReparto(dueña)
    expect(primeros.cambios).toHaveLength(m.CAMBIOS_POR_PAGINA)
    expect(primeros.hayMas).toBe(true)
    // Los 50 más nuevos: del 054 al 005.
    expect(primeros.cambios[0].id).toBe("c-054")
    expect(primeros.cambios[49].id).toBe("c-005")

    const todos = await m.leerCambiosDeReparto(dueña, 100)
    expect(todos.cambios).toHaveLength(55)
    expect(todos.hayMas).toBe(false)

    // Justo el tope: no hay más.
    const justos = await m.leerCambiosDeReparto(dueña, 55)
    expect(justos.cambios).toHaveLength(55)
    expect(justos.hayMas).toBe(false)
  })

  it("un tope absurdo no agranda la consulta: se corta a lo máximo, y uno inválido (NaN, negativo) vuelve al de siempre", async () => {
    const buscar = vi.spyOn(base.prisma.cambioDeRepartoDeProtesis, "findMany")

    await m.leerCambiosDeReparto(dueña, 10_000_000)
    await m.leerCambiosDeReparto(dueña, Number.NaN)
    await m.leerCambiosDeReparto(dueña, -5)

    expect(buscar.mock.calls.map(([args]) => (args as { take: number }).take)).toEqual([m.CAMBIOS_MAXIMOS + 1, m.CAMBIOS_POR_PAGINA + 1, m.CAMBIOS_POR_PAGINA + 1])
  })

  it("trae lo que se necesita para mostrarlo y nada más: sin el id del usuario ni su correo", async () => {
    base.reiniciar({ ...escenarioDental(), cambioDeRepartoDeProtesis: [cambio("c-1")] })

    const [primero] = (await m.leerCambiosDeReparto(dueña)).cambios

    expect(Object.keys(primero).sort()).toEqual(["alcance", "antes", "cuando", "despues", "id", "material", "profesional", "quien"])
    expect(JSON.stringify(primero)).not.toContain("u-duena")
    expect(JSON.stringify(primero)).not.toContain("valentina@aurora.test")
  })

  it("el cambio de un material: de qué a qué, con el instante en ISO", async () => {
    base.reiniciar({ ...escenarioDental(), cambioDeRepartoDeProtesis: [cambio("c-1")] })

    const { cambios } = await m.leerCambiosDeReparto(dueña)

    expect(cambios).toEqual([
      {
        id: "c-1",
        cuando: "2026-11-09T17:05:00.000Z",
        alcance: "material",
        material: "Acrílico termocurado",
        profesional: null,
        quien: "Valentina Soto",
        antes: { pbOdontologo: 4000, pbClinica: 3000, pbTecnico: 3000 },
        despues: { pbOdontologo: 3500, pbClinica: 2500, pbTecnico: 4000 },
      },
    ])
  })

  it("un material recién creado no tiene «antes»; una excepción quitada no tiene «después»", async () => {
    base.reiniciar({
      ...escenarioDental(),
      cambioDeRepartoDeProtesis: [
        cambio("c-nuevo", {
          anteriorPbOdontologo: null,
          anteriorPbClinica: null,
          anteriorPbTecnico: null,
          createdAt: new Date("2026-11-01T12:00:00.000Z"),
        }),
        cambio("c-quitada", {
          scope: "excepcion",
          materialNombre: "Zirconio",
          memberId: "m-perez",
          memberName: "Diego Pérez",
          nuevoPbOdontologo: null,
          nuevoPbClinica: null,
          nuevoPbTecnico: null,
          createdAt: new Date("2026-11-02T12:00:00.000Z"),
        }),
      ],
    })

    const [quitada, nuevo] = (await m.leerCambiosDeReparto(dueña)).cambios

    expect(quitada).toMatchObject({ alcance: "excepcion", profesional: "Diego Pérez", material: "Zirconio", despues: null })
    expect(quitada.antes).toEqual({ pbOdontologo: 4000, pbClinica: 3000, pbTecnico: 3000 })
    expect(nuevo).toMatchObject({ alcance: "material", profesional: null, antes: null })
    expect(nuevo.despues).toEqual({ pbOdontologo: 3500, pbClinica: 2500, pbTecnico: 4000 })
  })

  it("si el material, el odontólogo o quien lo hizo ya no existen, queda el nombre copiado: nunca un hueco", async () => {
    // Ni `mt-borrado` ni `m-ex` ni `u-ex` están en ninguna tabla: los registros no tienen llaves foráneas.
    base.reiniciar({
      ...escenarioDental(),
      cambioDeRepartoDeProtesis: [
        cambio("c-1", {
          scope: "excepcion",
          materialId: "mt-borrado",
          materialNombre: "Resina antigua",
          memberId: "m-ex",
          memberName: "Camilo Rojas",
          changedById: "u-ex",
          changedByName: "Rosa Morales",
        }),
      ],
    })

    const [primero] = (await m.leerCambiosDeReparto(dueña)).cambios

    expect(primero).toMatchObject({ material: "Resina antigua", profesional: "Camilo Rojas", quien: "Rosa Morales" })
  })
})

describe("limiteDeCambios: cuántos cambios pide la pantalla", () => {
  it("sin nada, lo de siempre: 50", () => {
    expect(m.limiteDeCambios(undefined)).toBe(50)
    expect(m.limiteDeCambios("")).toBe(50)
  })

  it("«Ver más» suma de a 50, hasta el tope de 500", () => {
    expect(m.limiteDeCambios("100")).toBe(100)
    expect(m.limiteDeCambios("450")).toBe(450)
    expect(m.limiteDeCambios("500")).toBe(500)
    expect(m.limiteDeCambios("550")).toBe(500)
    expect(m.limiteDeCambios("999999")).toBe(500)
  })

  it("lo que no es un número entero, o está fuera de rango, no rompe: vuelve a 50 (o sube al mínimo)", () => {
    for (const raro of ["abc", "-10", "1.5", "1e3", "0x20", " 100", "100 ", "NaN", "Infinity", "0", "10", "9999999999999999"]) {
      expect(m.limiteDeCambios(raro), raro).toBeGreaterThanOrEqual(50)
      expect(m.limiteDeCambios(raro), raro).toBeLessThanOrEqual(500)
    }
    expect(m.limiteDeCambios("abc")).toBe(50)
    expect(m.limiteDeCambios("-10")).toBe(50)
    expect(m.limiteDeCambios("1.5")).toBe(50)
    expect(m.limiteDeCambios("0")).toBe(50)
    expect(m.limiteDeCambios("10")).toBe(50)
  })

  it("si el parámetro viene repetido (?hasta=100&hasta=200), vale el primero", () => {
    expect(m.limiteDeCambios(["100", "200"])).toBe(100)
    expect(m.limiteDeCambios([])).toBe(50)
  })
})
