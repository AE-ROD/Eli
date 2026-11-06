import { beforeEach, describe, expect, it, vi } from "vitest"
import { sesiones } from "@/pruebas/datos"

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
vi.mock("./_componentes/pantalla-de-equipo", () => ({ PantallaDeEquipo: () => null }))

import PaginaEquipo from "./page"

async function abrir(sesion: unknown) {
  mockGetServerSession.mockResolvedValueOnce(sesion)
  try {
    await PaginaEquipo()
    return null
  } catch (error) {
    return (error as Error).message
  }
}

describe("/dashboard/equipo (#49)", () => {
  beforeEach(() => {
    redirect.mockClear()
  })

  it("sin sesión, a iniciar sesión", async () => {
    expect(await abrir(null)).toBe("redirect:/iniciar-sesion")
  })

  it("al profesional lo devuelve al panel, sin mostrarle la pantalla", async () => {
    expect(await abrir(sesiones.carla)).toBe("redirect:/dashboard")
    expect(await abrir(sesiones.sinMiembro)).toBe("redirect:/dashboard")
  })

  it("la dueña y el encargado entran", async () => {
    expect(await abrir(sesiones.dueña)).toBeNull()
    expect(await abrir(sesiones.encargado)).toBeNull()
    expect(redirect).not.toHaveBeenCalled()
  })
})
