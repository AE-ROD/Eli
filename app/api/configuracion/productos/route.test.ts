import { describe, it, expect, vi, beforeEach } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, datosBase, pedido, sesiones } from "@/pruebas/datos"

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const base = crearBaseFalsa()

vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

const URL = "http://localhost/api/configuracion/productos"

beforeEach(() => {
  vi.clearAllMocks()
  base.reiniciar(datosBase())
})

async function listar(sesion: unknown) {
  const { GET } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  return GET()
}

async function crear(sesion: unknown, cuerpo: unknown) {
  const { POST } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  return POST(pedido(URL, cuerpo))
}

const cambiosDeComision = () => base.buscar("commissionChange", {})

describe("GET /api/configuracion/productos", () => {
  it("la dueña ve los del negocio, también los inactivos, con su % (null es sin configurar)", async () => {
    const res = await listar(sesiones.dueña)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([
      { id: "p-shampoo", nombre: "Shampoo", precio: 12000, activo: true, porcentaje: 10 },
      { id: "p-cera", nombre: "Cera", precio: 8000, activo: true, porcentaje: null },
      { id: "p-viejo", nombre: "Tónico", precio: 5000, activo: false, porcentaje: null },
    ])
  })

  it("el encargado los ve sin la clave del %: no la recibe ni en null", async () => {
    const res = await listar(sesiones.encargado)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.map((p: { id: string }) => p.id)).toEqual(["p-shampoo", "p-cera", "p-viejo"])
    for (const producto of data) expect(producto).not.toHaveProperty("porcentaje")
  })

  it("la profesional no gestiona el catálogo: 401", async () => {
    expect((await listar(sesiones.carla)).status).toBe(401)
  })

  it("sin sesión, 401", async () => {
    expect((await listar(null)).status).toBe(401)
  })
})

describe("POST /api/configuracion/productos", () => {
  it("el encargado crea un producto sin %: queda pendiente (null), nunca 0, y sin historial", async () => {
    const res = await crear(sesiones.encargado, { nombre: "  Gel  ", precio: 4990.5 })
    const data = await res.json()

    expect(res.status).toBe(201)
    expect(data).toEqual({ id: expect.any(String), nombre: "Gel", precio: 4990.5, activo: true })
    expect(base.buscar("producto", { id: data.id })[0]).toMatchObject({
      businessId: NEGOCIO,
      name: "Gel",
      priceCents: 499050,
      commissionPercent: null,
    })
    expect(cambiosDeComision()).toEqual([])
  })

  it("el % que manda el encargado se rechaza con 401 y no se crea nada: no se ignora en silencio", async () => {
    const antes = base.volcado()

    for (const porcentaje of [15, null]) {
      const res = await crear(sesiones.encargado, { nombre: "Gel", porcentaje })
      expect(res.status).toBe(401)
    }
    expect(base.volcado()).toEqual(antes)
  })

  it("la dueña lo crea con %: queda en el historial de comisiones, de null a 12,5, con quién lo cambió", async () => {
    const res = await crear(sesiones.dueña, { nombre: "Gel", precio: 5000, porcentaje: 12.5 })
    const data = await res.json()

    expect(res.status).toBe(201)
    expect(data).toMatchObject({ nombre: "Gel", porcentaje: 12.5 })
    expect(cambiosDeComision()).toEqual([
      expect.objectContaining({
        businessId: NEGOCIO,
        scope: "product",
        productId: data.id,
        productName: "Gel",
        memberId: null,
        memberName: "Todo el equipo",
        changedById: "u-duena",
        changedByName: "Ana Dueña",
        changedByEmail: "duena@uno.test",
        previousPercent: null,
        newPercent: 12.5,
      }),
    ])
  })

  it("un 0 % es una decisión, no 'sin configurar': se guarda 0 y se audita", async () => {
    const res = await crear(sesiones.dueña, { nombre: "Muestra", porcentaje: 0 })

    expect(res.status).toBe(201)
    expect(cambiosDeComision()).toEqual([expect.objectContaining({ previousPercent: null, newPercent: 0 })])
  })

  it("la dueña sin % no deja historial", async () => {
    expect((await crear(sesiones.dueña, { nombre: "Gel", porcentaje: null })).status).toBe(201)
    expect(cambiosDeComision()).toEqual([])
  })

  it("un % fuera de 0-100 o con más de dos decimales, o un precio negativo, es un 400 y no crea nada", async () => {
    const antes = base.volcado()
    for (const cuerpo of [
      { nombre: "Gel", porcentaje: 101 },
      { nombre: "Gel", porcentaje: -1 },
      { nombre: "Gel", porcentaje: 33.333 },
      { nombre: "Gel", precio: -5 },
      { nombre: "Gel", precio: 10.005 },
      { nombre: "G" },
      {},
    ]) {
      const res = await crear(sesiones.dueña, cuerpo)
      expect(res.status).toBe(400)
    }
    expect(base.volcado()).toEqual(antes)
  })

  it("la profesional no crea productos: 401", async () => {
    const antes = base.volcado()
    expect((await crear(sesiones.carla, { nombre: "Gel" })).status).toBe(401)
    expect(base.volcado()).toEqual(antes)
  })

  it("se crea en el negocio de la sesión, nunca en el que diga el cuerpo", async () => {
    const res = await crear(sesiones.encargado, { nombre: "Gel", businessId: "negocio-2", precio: 1 })
    const data = await res.json()

    expect(res.status).toBe(201)
    expect(base.buscar("producto", { id: data.id })[0]).toMatchObject({ businessId: NEGOCIO })
  })
})
