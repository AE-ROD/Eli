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
  const respuesta = await PUT(pedido("http://localhost/api/configuracion/fila-virtual", cuerpo))
  return { status: respuesta.status, cuerpo: await respuesta.json() }
}

const filaDe = (id: string) => {
  const negocio = base.buscar("business", { id })[0]
  return { activa: negocio.filaVirtualActiva, tope: negocio.filaVirtualTope }
}

beforeEach(() => {
  vi.clearAllMocks()
  base.reiniciar(datosBase())
})

describe("PUT /api/configuracion/fila-virtual", () => {
  it("la dueña la enciende y fija el tope en su negocio, y sólo en el suyo", async () => {
    expect(await guardar(sesiones.dueña, { activa: true })).toEqual({ status: 200, cuerpo: { activa: true, tope: 15 } })
    expect(await guardar(sesiones.dueña, { tope: 8 })).toEqual({ status: 200, cuerpo: { activa: true, tope: 8 } })
    expect(filaDe(NEGOCIO)).toEqual({ activa: true, tope: 8 })
    expect(filaDe(OTRO_NEGOCIO)).toEqual({ activa: false, tope: 15 })

    expect((await guardar(sesiones.dueña, { activa: false, tope: 30 })).status).toBe(200)
    expect(filaDe(NEGOCIO)).toEqual({ activa: false, tope: 30 })
  })

  it("encargado, profesional, dueño de otro negocio sobre éste y sin sesión: 401 sin cambiar nada", async () => {
    for (const sesion of [sesiones.encargado, sesiones.carla, sesiones.sinMiembro, null]) {
      expect((await guardar(sesion, { activa: true, tope: 3 })).status).toBe(401)
    }
    expect(filaDe(NEGOCIO)).toEqual({ activa: false, tope: 15 })
    // El dueño ajeno sólo cambia el suyo, aunque mande otra cosa en el cuerpo.
    expect((await guardar(sesiones.dueñoAjeno, { activa: true, businessId: NEGOCIO })).status).toBe(200)
    expect(filaDe(NEGOCIO)).toEqual({ activa: false, tope: 15 })
    expect(filaDe(OTRO_NEGOCIO).activa).toBe(true)
  })

  it.each([[{ tope: 0 }], [{ tope: 101 }], [{ tope: 2.5 }], [{ tope: "10" }], [{ activa: "si" }], [{}], [undefined]])(
    "datos inválidos (%j): 400",
    async (cuerpo) => {
      expect((await guardar(sesiones.dueña, cuerpo)).status).toBe(400)
      expect(filaDe(NEGOCIO)).toEqual({ activa: false, tope: 15 })
    }
  )
})
