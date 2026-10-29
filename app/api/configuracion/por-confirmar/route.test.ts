import { describe, it, expect, vi, beforeEach } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, OTRO_NEGOCIO, datosBase, pedido, sesiones } from "@/pruebas/datos"

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const base = crearBaseFalsa()

vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

async function guardar(sesion: unknown, cuerpo: unknown) {
  const { PUT } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  const respuesta = await PUT(pedido("http://localhost/api/configuracion/por-confirmar", cuerpo))
  return { status: respuesta.status, cuerpo: await respuesta.json() }
}

const faltasDe = (id: string) => base.buscar("business", { id })[0].porConfirmarTrasFaltas

beforeEach(() => {
  vi.clearAllMocks()
  base.reiniciar(datosBase())
})

describe("PUT /api/configuracion/por-confirmar (#84)", () => {
  it("viene apagado", () => {
    expect(faltasDe(NEGOCIO)).toBeNull()
  })

  it("la dueña lo enciende y lo apaga en su negocio, y sólo en el suyo", async () => {
    expect(await guardar(sesiones.dueña, { faltas: 2 })).toEqual({ status: 200, cuerpo: { faltas: 2 } })
    expect(faltasDe(NEGOCIO)).toBe(2)
    expect(faltasDe(OTRO_NEGOCIO)).toBeNull()
    expect(await guardar(sesiones.dueña, { faltas: null })).toEqual({ status: 200, cuerpo: { faltas: null } })
    expect(faltasDe(NEGOCIO)).toBeNull()
  })

  it("el dueño de otro negocio sólo toca el suyo", async () => {
    expect((await guardar(sesiones.dueñoAjeno, { faltas: 5 })).status).toBe(200)
    expect(faltasDe(OTRO_NEGOCIO)).toBe(5)
    expect(faltasDe(NEGOCIO)).toBeNull()
  })

  it.each([
    ["el encargado", sesiones.encargado],
    ["el profesional", sesiones.carla],
    ["sin sesión", null],
  ])("%s: 401 sin cambiar nada", async (_quien, sesion) => {
    expect((await guardar(sesion, { faltas: 2 })).status).toBe(401)
    expect(faltasDe(NEGOCIO)).toBeNull()
  })

  it.each([[{ faltas: 0 }], [{ faltas: 21 }], [{ faltas: 1.5 }], [{ faltas: "2" }], [{}], [undefined]])(
    "fuera de 1–20, no entero o sin dato (%j): 400",
    async (cuerpo) => {
      const { status, cuerpo: respuesta } = await guardar(sesiones.dueña, cuerpo)
      expect(status).toBe(400)
      expect(respuesta.error).toMatch(/de 1 a 20/)
      expect(faltasDe(NEGOCIO)).toBeNull()
    }
  )
})
