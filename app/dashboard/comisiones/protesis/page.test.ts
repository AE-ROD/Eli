import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import type { ReactElement, ReactNode } from "react"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { CLINICA, OTRA_CLINICA, escenarioDental, sesionesDentales } from "@/app/api/clientes/_pruebas/clinica-dental"

const { redirect, mockGetServerSession } = vi.hoisted(() => ({
  // Como el de Next: corta la página ahí.
  redirect: vi.fn((ruta: string) => {
    throw new Error(`redirect:${ruta}`)
  }),
  mockGetServerSession: vi.fn(),
}))
vi.mock("next/navigation", () => ({ redirect }))
vi.mock("next-auth", () => ({ getServerSession: (...args: unknown[]) => mockGetServerSession(...args) }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("../_componentes/reparto-de-protesis", () => ({ RepartoDeProtesisConfig: () => null }))

const base = crearBaseFalsa()
vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

import { HistorialDeCambiosDelReparto } from "./_historial-de-cambios"

/** La página se importa después de crear la base: `vi.mock` se iza arriba de todo y su fábrica la necesita ya creada. */
let PaginaRepartoDeProtesis: typeof import("./page").default
beforeAll(async () => {
  PaginaRepartoDeProtesis = (await import("./page")).default
})

type Registro = Record<string, unknown>

function cambio(id: string, minutos: number, datos: Registro = {}): Registro {
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
    createdAt: new Date(Date.UTC(2026, 10, 9, 17, 5) - minutos * 60_000),
    ...datos,
  }
}

/** Los cambios `c-000`… `c-<n-1>`: el 0 es el más nuevo. */
const cambios = (cuantos: number, datos: Registro = {}) => Array.from({ length: cuantos }, (_, i) => cambio(`c-${String(i).padStart(3, "0")}`, i, datos))

function escenario(registros: Registro[], zonaDeLaClinica?: string) {
  const datos = escenarioDental()
  if (zonaDeLaClinica) datos.business = datos.business.map((negocio) => (negocio.id === CLINICA ? { ...negocio, timezone: zonaDeLaClinica } : negocio))
  base.reiniciar({ ...datos, cambioDeRepartoDeProtesis: registros })
}

/** Lo que la página le pasa a la sección del historial: recorre el árbol sin dibujarlo. */
function seccionDelHistorial(nodo: ReactNode): ReactElement<React.ComponentProps<typeof HistorialDeCambiosDelReparto>> | null {
  if (Array.isArray(nodo)) {
    for (const hijo of nodo) {
      const encontrado = seccionDelHistorial(hijo)
      if (encontrado) return encontrado
    }
    return null
  }
  if (!nodo || typeof nodo !== "object" || !("type" in nodo)) return null
  const elemento = nodo as ReactElement<{ children?: ReactNode }>
  if (elemento.type === HistorialDeCambiosDelReparto) return elemento as never
  return seccionDelHistorial(elemento.props.children)
}

async function abrir(sesion: unknown, buscar: Record<string, string | string[] | undefined> = {}) {
  mockGetServerSession.mockResolvedValueOnce(sesion)
  try {
    const pagina = await PaginaRepartoDeProtesis({ searchParams: Promise.resolve(buscar) })
    return { redirigio: null, historial: seccionDelHistorial(pagina as ReactNode)?.props ?? null }
  } catch (error) {
    return { redirigio: (error as Error).message, historial: null }
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  escenario([cambio("c-propio", 0)])
})

describe("Comisiones › Reparto de prótesis › Historial de cambios", () => {
  it("sin sesión, a iniciar sesión; y sin leer la base", async () => {
    const buscar = vi.spyOn(base.prisma.cambioDeRepartoDeProtesis, "findMany")

    expect((await abrir(null)).redirigio).toBe("redirect:/iniciar-sesion")
    expect(buscar).not.toHaveBeenCalled()
  })

  it("la página ya redirige a quien no es la dueña de una clínica dental, y a ellos ni se les lee el historial", async () => {
    const buscar = vi.spyOn(base.prisma.cambioDeRepartoDeProtesis, "findMany")

    // El encargado y el odontólogo de la clínica: al inicio (no editan comisiones).
    expect((await abrir(sesionesDentales.encargado)).redirigio).toBe("redirect:/dashboard")
    expect((await abrir(sesionesDentales.perez)).redirigio).toBe("redirect:/dashboard")
    // La dueña de un negocio que no es clínica dental, o con una sesión sin rubro: a Comisiones.
    expect((await abrir(sesionesDentales.salon)).redirigio).toBe("redirect:/dashboard/comisiones")
    expect((await abrir(sesionesDentales.sinRubro)).redirigio).toBe("redirect:/dashboard/comisiones")
    expect(buscar).not.toHaveBeenCalled()
  })

  it("la dueña ve los cambios de su clínica, del más nuevo al más viejo, y ninguno de otra", async () => {
    escenario([
      cambio("c-viejo", 600),
      cambio("c-nuevo", 0),
      cambio("c-medio", 60),
      cambio("c-ajeno", 5, { businessId: OTRA_CLINICA, materialNombre: "Material de la otra clínica" }),
    ])

    const { redirigio, historial } = await abrir(sesionesDentales.dueña)

    expect(redirigio).toBeNull()
    expect(historial?.filas.map((fila) => fila.id)).toEqual(["c-nuevo", "c-medio", "c-viejo"])
    expect(JSON.stringify(historial?.filas)).not.toContain("Material de la otra clínica")
    expect(historial?.hrefDeVerMas).toBeNull()
    expect(historial?.topeAlcanzado).toBeNull()
    // Y la dueña de la otra clínica, sólo el suyo.
    expect((await abrir(sesionesDentales.dueñaAjena)).historial?.filas.map((fila) => fila.id)).toEqual(["c-ajeno"])
  })

  it("las fechas salen en la zona horaria del negocio", async () => {
    escenario([cambio("c-1", 0)], "America/Santiago")
    expect((await abrir(sesionesDentales.dueña)).historial?.filas[0].cuando).toBe("9 nov 2026, 14:05")

    escenario([cambio("c-1", 0)], "America/Bogota")
    expect((await abrir(sesionesDentales.dueña)).historial?.filas[0].cuando).toBe("9 nov 2026, 12:05")
  })

  it("las frases hablan con las palabras de la clínica", async () => {
    const { historial } = await abrir(sesionesDentales.dueña)

    expect(historial?.frases.etiquetaDeLaExcepcion).toBe("Excepción por odontólogo")
  })

  it("los últimos 50, con «Ver más cambios» que pide 50 más, y al llegar a todos ya no hay enlace", async () => {
    escenario(cambios(120))

    const primera = await abrir(sesionesDentales.dueña)
    expect(primera.historial?.filas).toHaveLength(50)
    expect(primera.historial?.filas[0].id).toBe("c-000")
    expect(primera.historial?.hrefDeVerMas).toBe("/dashboard/comisiones/protesis?hasta=100")

    const segunda = await abrir(sesionesDentales.dueña, { hasta: "100" })
    expect(segunda.historial?.filas).toHaveLength(100)
    expect(segunda.historial?.hrefDeVerMas).toBe("/dashboard/comisiones/protesis?hasta=150")

    const tercera = await abrir(sesionesDentales.dueña, { hasta: "150" })
    expect(tercera.historial?.filas).toHaveLength(120)
    expect(tercera.historial?.hrefDeVerMas).toBeNull()
  })

  it("justo 50 cambios: se ven los 50 y no hay «Ver más»", async () => {
    escenario(cambios(50))

    const { historial } = await abrir(sesionesDentales.dueña)

    expect(historial?.filas).toHaveLength(50)
    expect(historial?.hrefDeVerMas).toBeNull()
  })

  it("tiene un tope de 500 por pantalla: se avisa y no se ofrece más", async () => {
    escenario(cambios(520))

    const { historial } = await abrir(sesionesDentales.dueña, { hasta: "500" })
    expect(historial?.filas).toHaveLength(500)
    expect(historial?.hrefDeVerMas).toBeNull()
    expect(historial?.topeAlcanzado).toBe(500)

    // Pedir más del tope no lo agranda.
    const demasiado = await abrir(sesionesDentales.dueña, { hasta: "99999" })
    expect(demasiado.historial?.filas).toHaveLength(500)
  })

  it("un `?hasta=` que no es un número no rompe la página: vuelve a los 50 de siempre", async () => {
    escenario(cambios(60))

    for (const hasta of ["abc", "-1", "1.5", "", ["x", "y"]]) {
      const { redirigio, historial } = await abrir(sesionesDentales.dueña, { hasta })
      expect(redirigio).toBeNull()
      expect(historial?.filas).toHaveLength(50)
    }
  })

  it("sin ningún cambio todavía, la sección está y sin filas", async () => {
    escenario([])

    const { historial } = await abrir(sesionesDentales.dueña)

    expect(historial?.filas).toEqual([])
    expect(historial?.frases.sinCambios).toContain("Todavía no hay cambios")
  })

  it("si el material o el odontólogo ya no existen, se ve el nombre que quedó copiado", async () => {
    escenario([
      cambio("c-1", 0, { scope: "excepcion", materialId: "mt-borrado", materialNombre: "Resina antigua", memberId: "m-ex", memberName: "Camilo Rojas" }),
    ])

    const { historial } = await abrir(sesionesDentales.dueña)

    expect(historial?.filas[0]).toMatchObject({ titulo: "Camilo Rojas · Resina antigua", resumen: "Valentina Soto cambió la excepción" })
  })
})
