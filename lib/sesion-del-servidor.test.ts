import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { mockGetServerSession } = vi.hoisted(() => ({ mockGetServerSession: vi.fn() }))
// Como en los tests de las páginas del panel: `next-auth` y las opciones se simulan.
vi.mock("next-auth", () => ({ getServerSession: (...args: unknown[]) => mockGetServerSession(...args) }))
vi.mock("@/lib/auth", () => ({ authOptions: { marca: "opciones-de-prueba" } }))

const SESION = { user: { id: "u1", businessId: "neg-1" } }

describe("sesionDelServidor", () => {
  beforeEach(() => {
    vi.resetModules()
    mockGetServerSession.mockReset()
    mockGetServerSession.mockResolvedValue(SESION)
  })

  afterEach(() => {
    vi.doUnmock("react")
  })

  it("fuera de un render llama a getServerSession con las opciones de auth, cada vez", async () => {
    const { sesionDelServidor } = await import("./sesion-del-servidor")

    expect(await sesionDelServidor()).toBe(SESION)
    expect(await sesionDelServidor()).toBe(SESION)

    // Sin render de servidor, `cache` de React no memoiza: nada se queda guardado entre llamadas.
    expect(mockGetServerSession).toHaveBeenCalledTimes(2)
    expect(mockGetServerSession).toHaveBeenCalledWith({ marca: "opciones-de-prueba" })
  })

  it("devuelve la sesión nula sin inventar una", async () => {
    mockGetServerSession.mockResolvedValue(null)
    const { sesionDelServidor } = await import("./sesion-del-servidor")

    expect(await sesionDelServidor()).toBeNull()
  })

  it("si getServerSession falla, el error llega a quien pregunta", async () => {
    mockGetServerSession.mockRejectedValue(new Error("base caída"))
    const { sesionDelServidor } = await import("./sesion-del-servidor")

    await expect(sesionDelServidor()).rejects.toThrow("base caída")
  })

  it("va envuelta en `cache` de React: dentro de un render, una sola lectura aunque la pidan el layout y la página", async () => {
    // Un `cache` que memoiza como lo hace el render de servidor de React.
    vi.doMock("react", () => ({
      cache: <T>(fn: () => T) => {
        let guardado: { valor: T } | undefined
        return () => (guardado ??= { valor: fn() }).valor
      },
    }))
    const { sesionDelServidor } = await import("./sesion-del-servidor")

    const [delLayout, deLaPagina] = await Promise.all([sesionDelServidor(), sesionDelServidor()])

    expect(delLayout).toBe(SESION)
    expect(deLaPagina).toBe(SESION)
    expect(mockGetServerSession).toHaveBeenCalledTimes(1)
    expect(mockGetServerSession).toHaveBeenCalledWith({ marca: "opciones-de-prueba" })
  })
})
