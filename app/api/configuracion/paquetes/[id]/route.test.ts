import { describe, it, expect, vi, beforeEach } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, OTRO_NEGOCIO, centavos, datosBase, pedido, sesiones } from "@/pruebas/datos"

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const base = crearBaseFalsa()

vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

const url = (id: string) => `http://localhost/api/configuracion/paquetes/${id}`

/** La dueña de una clínica dental: ahí los paquetes no existen. */
const dueñaDeUnaClinica = { user: { ...sesiones.dueña.user, rubro: "odontologia" } }

beforeEach(() => {
  vi.clearAllMocks()
  base.reiniciar({
    ...datosBase(),
    paqueteDeSesiones: [
      { id: "pq-color", businessId: NEGOCIO, serviceId: "s-color", sesiones: 6, priceCents: centavos(125000) },
      { id: "pq-ajeno", businessId: OTRO_NEGOCIO, serviceId: "s-ajeno", sesiones: 6, priceCents: centavos(40000) },
    ],
  })
})

async function editar(sesion: unknown, id: string, cuerpo: unknown) {
  const { PATCH } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  return PATCH(pedido(url(id), cuerpo), { params: Promise.resolve({ id }) })
}

async function eliminar(sesion: unknown, id: string) {
  const { DELETE } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  return DELETE(pedido(url(id)), { params: Promise.resolve({ id }) })
}

const guardado = (id: string) => base.buscar("paqueteDeSesiones", { id })[0]

describe("PATCH /api/configuracion/paquetes/[id]", () => {
  it("la dueña cambia sesiones, precio y vigencia: la respuesta trae el valor por sesión y el ahorro de nuevo", async () => {
    const res = await editar(sesiones.dueña, "pq-color", { sesiones: 10, precio: 200000, vigenciaMeses: 12 })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      id: "pq-color",
      servicioId: "s-color",
      servicio: "Color",
      sesiones: 10,
      precio: 200000,
      vigenciaMeses: 12,
      activo: true,
      valorPorSesion: 20000,
      // Sueltas: 10 × 25.000 = 250.000.
      ahorro: 20,
    })
    expect(guardado("pq-color")).toMatchObject({ sesiones: 10, priceCents: 20000000, vigenciaMeses: 12, active: true })
  })

  it("el encargado lo pausa y lo reactiva sin tocar lo demás", async () => {
    const pausado = await editar(sesiones.encargado, "pq-color", { activo: false })
    expect(pausado.status).toBe(200)
    expect(await pausado.json()).toMatchObject({ activo: false, sesiones: 6, precio: 125000 })
    expect(guardado("pq-color")).toMatchObject({ active: false, sesiones: 6, priceCents: centavos(125000) })

    const reactivado = await editar(sesiones.encargado, "pq-color", { activo: true })
    expect(await reactivado.json()).toMatchObject({ activo: true })
  })

  it("`vigenciaMeses: null` le quita el vencimiento", async () => {
    await editar(sesiones.dueña, "pq-color", { vigenciaMeses: 3 })
    const res = await editar(sesiones.dueña, "pq-color", { vigenciaMeses: null })

    expect(await res.json()).toMatchObject({ vigenciaMeses: null })
    expect(guardado("pq-color")).toMatchObject({ vigenciaMeses: null })
  })

  it("el paquete de otro negocio, o uno que no existe, es un 404 y no cambia nada", async () => {
    const antes = base.volcado()

    for (const id of ["pq-ajeno", "pq-no-existe"]) {
      expect((await editar(sesiones.dueña, id, { precio: 1 })).status).toBe(404)
    }
    expect(base.prisma.paqueteDeSesiones.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "pq-ajeno", businessId: NEGOCIO } })
    )
    expect(base.volcado()).toEqual(antes)
  })

  it("la escritura también lleva el negocio de la sesión", async () => {
    await editar(sesiones.dueña, "pq-color", { precio: 100000 })

    expect(base.prisma.paqueteDeSesiones.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "pq-color", businessId: NEGOCIO } })
    )
  })

  it("sesiones fuera de 2 a 50, precio en cero, vigencia de 40 meses o nada que cambiar: 400 y no cambia nada", async () => {
    const antes = base.volcado()
    for (const cuerpo of [
      { sesiones: 1 },
      { sesiones: 51 },
      { precio: 0 },
      { precio: -5 },
      { vigenciaMeses: 40 },
      { activo: "si" },
      // El servicio de un paquete no se cambia: lo único que trae este pedido se ignora, y no queda nada.
      { servicioId: "s-corte" },
      {},
      undefined,
    ]) {
      const res = await editar(sesiones.dueña, "pq-color", cuerpo)
      expect(res.status, JSON.stringify(cuerpo)).toBe(400)
    }
    expect(base.volcado()).toEqual(antes)
  })

  it("el precio y las sesiones se validan juntos aunque llegue uno solo: cada sesión tiene que valer algo", async () => {
    // 5 centavos entre 5 sesiones: 1 centavo cada una, lo mínimo que vale.
    expect((await editar(sesiones.dueña, "pq-color", { sesiones: 5, precio: 0.05 })).status).toBe(200)
    const antes = base.volcado()

    // Entre 6 quedaría en $0 cada una, aunque el pedido sólo traiga las sesiones.
    const res = await editar(sesiones.dueña, "pq-color", { sesiones: 6 })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/cada sesión/)
    expect(base.volcado()).toEqual(antes)
  })

  it("la profesional, la clínica dental y quien no tiene sesión: 401 sin tocar la base", async () => {
    const antes = base.volcado()
    for (const sesion of [sesiones.carla, sesiones.sinMiembro, dueñaDeUnaClinica, null]) {
      expect((await editar(sesion, "pq-color", { activo: false })).status).toBe(401)
    }
    expect(base.volcado()).toEqual(antes)
    expect(base.prisma.paqueteDeSesiones.findFirst).not.toHaveBeenCalled()
  })
})

describe("DELETE /api/configuracion/paquetes/[id]", () => {
  it("la dueña elimina la definición", async () => {
    const res = await eliminar(sesiones.dueña, "pq-color")

    expect(res.status).toBe(200)
    expect(guardado("pq-color")).toBeUndefined()
    expect(guardado("pq-ajeno")).toBeDefined()
  })

  it("el encargado también", async () => {
    expect((await eliminar(sesiones.encargado, "pq-color")).status).toBe(200)
  })

  it("el de otro negocio, o uno que no existe, es un 404 y no se borra: el borrado lleva el negocio de la sesión", async () => {
    const antes = base.volcado()

    for (const id of ["pq-ajeno", "pq-no-existe"]) {
      expect((await eliminar(sesiones.dueña, id)).status).toBe(404)
    }
    expect(base.prisma.paqueteDeSesiones.deleteMany).toHaveBeenCalledWith({ where: { id: "pq-ajeno", businessId: NEGOCIO } })
    expect(base.volcado()).toEqual(antes)
  })

  it("la profesional, la clínica dental y quien no tiene sesión: 401 y no se borra nada", async () => {
    const antes = base.volcado()
    for (const sesion of [sesiones.carla, sesiones.sinMiembro, dueñaDeUnaClinica, null]) {
      expect((await eliminar(sesion, "pq-color")).status).toBe(401)
    }
    expect(base.volcado()).toEqual(antes)
  })
})
