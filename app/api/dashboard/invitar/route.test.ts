import { describe, it, expect, vi, beforeEach } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, OTRO_NEGOCIO, datosBase, sesiones } from "@/pruebas/datos"

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const base = crearBaseFalsa()

vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

const EN_UN_MES = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
const PREMIADO_EL = new Date("2026-10-01T12:00:00.000Z")

/**
 * El negocio 1 invitó a dos negocios y no tiene premio. El negocio 2 invitó a
 * uno y ya sumó sus días. Si algo de uno se cuela en el otro, la cuenta o el
 * estado del premio salen distintos.
 */
function escenario() {
  const datos = datosBase()
  const invitado = (id: string, invitadoPorId: string, codigo: string) => ({
    id,
    name: `Invitado ${id}`,
    slug: id,
    userId: `u-${id}`,
    pruebaTerminaEl: EN_UN_MES,
    codigoInvitacion: codigo,
    invitadoPorId,
    referidoContabilizadoAt: PREMIADO_EL,
  })
  return {
    ...datos,
    user: [
      ...datos.user,
      ...["inv-1", "inv-2", "inv-3"].map((id) => ({ id: `u-${id}`, name: id, email: `${id}@x.test` })),
    ],
    business: [
      { ...datos.business[0], pruebaTerminaEl: EN_UN_MES, codigoInvitacion: "ab12cd34ef" },
      { ...datos.business[1], pruebaTerminaEl: EN_UN_MES, codigoInvitacion: "zz98yx76wv", extensionPorReferidoAt: PREMIADO_EL },
      invitado("inv-1", NEGOCIO, "aaaaaaaaa1"),
      invitado("inv-2", NEGOCIO, "aaaaaaaaa2"),
      invitado("inv-3", OTRO_NEGOCIO, "aaaaaaaaa3"),
    ],
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  base.reiniciar(escenario())
})

const leer = async () => {
  const { GET } = await import("./route")
  return GET()
}

describe("GET /api/dashboard/invitar", () => {
  it("el dueño ve su código, su estado y cuántos invitó: nada del otro negocio", async () => {
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)

    const respuesta = await leer()

    expect(respuesta.status).toBe(200)
    expect(await respuesta.json()).toEqual({ codigo: "ab12cd34ef", yaSumoLosDias: false, registrados: 2 })
  })

  it("el otro dueño ve lo suyo: ya premiado y un registrado", async () => {
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueñoAjeno)

    expect(await (await leer()).json()).toEqual({ codigo: "zz98yx76wv", yaSumoLosDias: true, registrados: 1 })
  })

  it("no viaja nada de los negocios invitados: ni ids, ni nombres, ni códigos, ni fechas", async () => {
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueñoAjeno)

    const texto = JSON.stringify(await (await leer()).json())

    expect(texto).not.toContain("inv-")
    expect(texto).not.toContain("Invitado")
    expect(texto).not.toContain("aaaaaaaaa")
    expect(texto).not.toContain("2026")
  })

  it.each([
    ["sin sesión", null],
    ["encargado", sesiones.encargado],
    ["profesional", sesiones.carla],
  ])("%s → 401 sin leer la base", async (_quien, sesion) => {
    mockGetServerSession.mockResolvedValueOnce(sesion)

    expect((await leer()).status).toBe(401)
    expect(base.prisma.business.findUnique).not.toHaveBeenCalled()
    expect(base.prisma.business.count).not.toHaveBeenCalled()
  })
})
