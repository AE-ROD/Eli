import { beforeEach, describe, expect, it, vi } from "vitest"
import { sesiones } from "@/pruebas/datos"
import { sesionesDentales } from "@/pruebas/clinica-con-sillones"

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
vi.mock("./_componentes/pantalla-de-fila", () => ({ PantallaDeFila: () => null }))

import PaginaPantallaDeFila from "./page"

async function abrir(sesion: unknown) {
  mockGetServerSession.mockResolvedValueOnce(sesion)
  try {
    await PaginaPantallaDeFila()
    return null
  } catch (error) {
    return (error as Error).message
  }
}

describe("/dashboard/fila: la pantalla de la fila virtual", () => {
  beforeEach(() => {
    redirect.mockClear()
  })

  it("sin sesión, a iniciar sesión", async () => {
    expect(await abrir(null)).toBe("redirect:/iniciar-sesion")
  })

  it("al profesional lo devuelve al panel", async () => {
    expect(await abrir(sesiones.carla)).toBe("redirect:/dashboard")
  })

  it("la dueña y el encargado de un salón entran", async () => {
    expect(await abrir(sesiones.dueña)).toBeNull()
    expect(await abrir(sesiones.encargado)).toBeNull()
  })

  it("en una clínica dental no existe: ni la dueña ni la recepción entran, y vuelven al panel", async () => {
    expect(await abrir(sesionesDentales.dueña)).toBe("redirect:/dashboard")
    expect(await abrir(sesionesDentales.encargado)).toBe("redirect:/dashboard")
    expect(await abrir(sesionesDentales.carla)).toBe("redirect:/dashboard")
  })
})
