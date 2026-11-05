import { describe, it, expect, vi, beforeEach } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { centavos, conId, datosBase, pedido, sesiones } from "@/pruebas/datos"

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const base = crearBaseFalsa()

vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

const URL = "http://localhost/api/configuracion/productos/x"

beforeEach(() => {
  vi.clearAllMocks()
  base.reiniciar(datosBase())
})

async function editar(sesion: unknown, id: string, cuerpo: unknown) {
  const { PUT } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  return PUT(pedido(URL, cuerpo), conId(id))
}

const producto = (id: string) => base.buscar("producto", { id })[0]
const cambiosDeComision = () => base.buscar("commissionChange", {})

describe("PUT /api/configuracion/productos/[id]", () => {
  it("un producto de otro negocio da 404 y no se toca: igual que uno que no existe", async () => {
    const antes = base.volcado()

    const ajeno = await editar(sesiones.dueña, "p-ajeno", { nombre: "Mío", porcentaje: 99 })
    const inexistente = await editar(sesiones.dueña, "p-no-existe", { nombre: "Mío" })

    expect(ajeno.status).toBe(404)
    expect(await ajeno.json()).toEqual(await inexistente.json())
    expect(base.volcado()).toEqual(antes)
  })

  it("el encargado cambia nombre, precio y activo, y recibe el producto sin %", async () => {
    const res = await editar(sesiones.encargado, "p-cera", { nombre: "Cera mate", precio: 8500, activo: false })
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data).toEqual({ id: "p-cera", nombre: "Cera mate", precio: 8500, activo: false })
    expect(producto("p-cera")).toMatchObject({ name: "Cera mate", priceCents: centavos(8500), active: false, commissionPercent: null })
  })

  it("el encargado no fija el %: 401 aunque mande el mismo valor o null, y nada cambia (falla cerrado)", async () => {
    const antes = base.volcado()

    for (const cuerpo of [{ porcentaje: 50 }, { porcentaje: 10 }, { porcentaje: null }, { nombre: "Shampoo 2", porcentaje: 20 }]) {
      const res = await editar(sesiones.encargado, "p-shampoo", cuerpo)
      expect(res.status).toBe(401)
    }
    expect(base.volcado()).toEqual(antes)
  })

  it("la dueña cambia el %: una fila de historial, de 10 a 12,5", async () => {
    const res = await editar(sesiones.dueña, "p-shampoo", { porcentaje: 12.5 })

    expect(res.status).toBe(200)
    expect((await res.json()).porcentaje).toBe(12.5)
    expect(producto("p-shampoo").commissionPercent).toBe(12.5)
    expect(cambiosDeComision()).toEqual([
      expect.objectContaining({ scope: "product", productId: "p-shampoo", productName: "Shampoo", previousPercent: 10, newPercent: 12.5 }),
    ])
  })

  it("sin cambio no hay historial: el mismo % otra vez no deja fila", async () => {
    expect((await editar(sesiones.dueña, "p-shampoo", { porcentaje: 10 })).status).toBe(200)
    expect(cambiosDeComision()).toEqual([])
  })

  it("de sin configurar a 0 sí es un cambio (null no es 0), y de 10 a sin configurar también", async () => {
    await editar(sesiones.dueña, "p-cera", { porcentaje: 0 })
    await editar(sesiones.dueña, "p-shampoo", { porcentaje: null })

    expect(cambiosDeComision().map((c) => [c.productId, c.previousPercent, c.newPercent])).toEqual([
      ["p-cera", null, 0],
      ["p-shampoo", 10, null],
    ])
    expect(producto("p-shampoo").commissionPercent).toBeNull()
  })

  it("editar el nombre sin mandar el % no audita nada", async () => {
    expect((await editar(sesiones.dueña, "p-shampoo", { nombre: "Shampoo sin sal" })).status).toBe(200)
    expect(cambiosDeComision()).toEqual([])
  })

  it("un % inválido o un pedido vacío es un 400 y nada cambia", async () => {
    const antes = base.volcado()
    for (const cuerpo of [{ porcentaje: 100.5 }, { porcentaje: 1.234 }, { precio: -1 }, {}]) {
      expect((await editar(sesiones.dueña, "p-shampoo", cuerpo)).status).toBe(400)
    }
    expect(base.volcado()).toEqual(antes)
  })

  it("la profesional no edita productos: 401", async () => {
    expect((await editar(sesiones.carla, "p-cera", { activo: false })).status).toBe(401)
    expect(producto("p-cera").active).toBe(true)
  })

  it("no hay DELETE: los productos se desactivan, no se borran", async () => {
    const modulo = await import("./route")
    expect("DELETE" in modulo).toBe(false)
  })
})
