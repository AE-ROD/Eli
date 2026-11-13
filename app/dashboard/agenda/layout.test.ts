import { describe, it, expect, vi, beforeEach } from "vitest"
import type { ReactElement } from "react"
import { crearBaseFalsa } from "@/pruebas/base-falsa"

/**
 * El layout de la agenda le pasa a la pantalla la zona del negocio y, con
 * sedes (etapa 9, plan Independiente), sus sedes activas y el modo (`una` o
 * `varias`). Todo sale del negocio de la SESIÓN, leído de la base.
 */

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const base = crearBaseFalsa()

vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

const SOLO = "negocio-solo"
const AJENO = "negocio-ajeno"
const EQUIPO = "negocio-equipo"

const sesionDe = (businessId: string) => ({ user: { id: "u", role: "owner", businessId, businessName: "X", memberId: null } })

const sede = (id: string, businessId: string, nombre: string, extra: Record<string, unknown> = {}) => ({
  id,
  businessId,
  nombre,
  direccion: `Calle ${nombre} 1`,
  comuna: "Santiago",
  ...extra,
})

function escenario(sedes: Record<string, unknown>[]) {
  base.reiniciar({
    user: [1, 2, 3].map((n) => ({ id: `u${n}`, name: `U${n}`, email: `u${n}@test` })),
    business: [
      { id: SOLO, name: "Solo", slug: "solo", userId: "u1", plan: "independiente", timezone: "America/Santiago" },
      { id: AJENO, name: "Ajeno", slug: "ajeno", userId: "u2", plan: "independiente" },
      { id: EQUIPO, name: "Equipo", slug: "equipo", userId: "u3", plan: "equipo", timezone: "America/Santiago" },
    ],
    sede: sedes,
  })
}

/** Lo que el layout le pasa a los proveedores: la zona y las sedes. */
async function layoutDe(sesion: unknown) {
  const { default: LayoutDeLaAgenda } = await import("./layout")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  const arbol = (await LayoutDeLaAgenda({ children: null })) as ReactElement<{ zona: string; children: ReactElement<{ sedes: unknown }> }>
  return { zona: arbol.props.zona, sedes: arbol.props.children.props.sedes }
}

describe("LayoutDeLaAgenda: las sedes", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("con dos o más sedes activas, el modo 'varias' y sus nombres en el orden de la lista", async () => {
    escenario([sede("b", SOLO, "Providencia", { orden: 1 }), sede("a", SOLO, "Centro", { orden: 0 }), sede("c", SOLO, "Sur", { orden: 2 })])

    const { sedes } = await layoutDe(sesionDe(SOLO))

    expect(sedes).toEqual({
      modo: "varias",
      sedes: [
        { id: "a", nombre: "Centro" },
        { id: "b", nombre: "Providencia" },
        { id: "c", nombre: "Sur" },
      ],
    })
  })

  it("las sedes desactivadas no se ofrecen ni cuentan para el modo", async () => {
    escenario([sede("a", SOLO, "Centro"), sede("v", SOLO, "Vieja", { activo: false })])

    const { sedes } = await layoutDe(sesionDe(SOLO))

    expect(sedes).toEqual({ modo: "una", sedes: [{ id: "a", nombre: "Centro" }] })
  })

  it("sin sedes: modo 'una' y ninguna, como siempre", async () => {
    escenario([])

    expect((await layoutDe(sesionDe(SOLO))).sedes).toEqual({ modo: "una", sedes: [] })
  })

  it("sólo las del negocio de la sesión: las de otro no entran, ni cuentan para el modo", async () => {
    escenario([sede("a", SOLO, "Centro"), sede("x", AJENO, "Ajena 1"), sede("y", AJENO, "Ajena 2")])

    const propias = await layoutDe(sesionDe(SOLO))
    const ajenas = await layoutDe(sesionDe(AJENO))

    expect(propias.sedes).toEqual({ modo: "una", sedes: [{ id: "a", nombre: "Centro" }] })
    expect(ajenas.sedes).toMatchObject({ modo: "varias", sedes: [{ id: "x" }, { id: "y" }] })
  })

  it("un negocio Equipo no tiene sedes, y falla cerrado: aunque la base trajera alguna, modo 'una' y ninguna", async () => {
    // Dato sucio sembrado a propósito: la base de verdad no deja sedes en el plan Equipo.
    escenario([sede("a", EQUIPO, "Centro"), sede("b", EQUIPO, "Norte")])

    expect((await layoutDe(sesionDe(EQUIPO))).sedes).toEqual({ modo: "una", sedes: [] })
  })

  it("sin sesión, sin sedes", async () => {
    escenario([sede("a", SOLO, "Centro"), sede("b", SOLO, "Norte")])

    expect((await layoutDe(null)).sedes).toEqual({ modo: "una", sedes: [] })
  })

  it("la zona sigue siendo la del negocio de la sesión", async () => {
    escenario([])

    expect((await layoutDe(sesionDe(SOLO))).zona).toBe("America/Santiago")
  })
})
