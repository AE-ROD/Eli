import { describe, it, expect, vi, beforeEach } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, OTRO_NEGOCIO, datosBase, pedido, sesiones } from "@/pruebas/datos"
import { datosDeLaClinica, sesionesDentales } from "@/pruebas/clinica-con-sillones"
import { MENSAJE_NOMBRE_REPETIDO } from "@/lib/sillones"

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const base = crearBaseFalsa()

vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

const URL = "http://localhost/api/configuracion/sillones"

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

const sillonesDelNegocio = () => base.buscar("sillon", { businessId: NEGOCIO })

beforeEach(() => {
  vi.clearAllMocks()
  base.reiniciar(datosDeLaClinica())
})

describe("GET /api/configuracion/sillones", () => {
  it.each([
    ["la dueña", sesionesDentales.dueña],
    ["el encargado", sesionesDentales.encargado],
    ["una odontóloga", sesionesDentales.carla],
  ])("%s ve los sillones de su clínica, activos e inactivos, en orden", async (_quien, sesion) => {
    const res = await listar(sesion)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([
      { id: "sl-1", nombre: "Sillón 1", orden: 1, activo: true },
      { id: "sl-2", nombre: "Sillón 2", orden: 2, activo: true },
      { id: "sl-viejo", nombre: "Sillón 3", orden: 3, activo: false },
    ])
  })

  it("la otra clínica sólo ve los suyos", async () => {
    const res = await listar(sesionesDentales.dueñoAjeno)

    expect((await res.json()).map((sillon: { id: string }) => sillon.id)).toEqual(["sl-ajeno"])
  })

  it("sin sesión, 401", async () => {
    expect((await listar(null)).status).toBe(401)
  })

  it("en un salón no existen: 404", async () => {
    expect((await listar(sesiones.dueña)).status).toBe(404)
  })
})

describe("POST /api/configuracion/sillones", () => {
  it("la dueña agrega uno: recortado y al final", async () => {
    const res = await crear(sesionesDentales.dueña, { nombre: "  Sillón 4 " })

    expect(res.status).toBe(201)
    expect(await res.json()).toMatchObject({ nombre: "Sillón 4", orden: 4, activo: true })
    expect(sillonesDelNegocio()).toHaveLength(4)
  })

  it("el encargado también, con el orden que diga", async () => {
    const res = await crear(sesionesDentales.encargado, { nombre: "Box de urgencia", orden: 0 })

    expect(res.status).toBe(201)
    expect(await res.json()).toMatchObject({ nombre: "Box de urgencia", orden: 0 })
  })

  it("la odontóloga no: 401 y no se escribe nada", async () => {
    const antes = base.volcado()
    const res = await crear(sesionesDentales.carla, { nombre: "Sillón 4" })

    expect(res.status).toBe(401)
    expect(base.volcado()).toEqual(antes)
  })

  it("un nombre que ya existe en la clínica, aunque cambien las mayúsculas, es 409", async () => {
    for (const nombre of ["Sillón 1", "sillón 1", "SILLÓN 3"]) {
      const res = await crear(sesionesDentales.dueña, { nombre })
      expect(res.status).toBe(409)
      expect(await res.json()).toEqual({ error: MENSAJE_NOMBRE_REPETIDO })
    }
    expect(sillonesDelNegocio()).toHaveLength(3)
  })

  it("el mismo nombre que un sillón de otra clínica sí se puede", async () => {
    const res = await crear(sesionesDentales.dueñoAjeno, { nombre: "Sillón 2" })

    expect(res.status).toBe(201)
    expect(base.buscar("sillon", { businessId: OTRO_NEGOCIO })).toHaveLength(2)
  })

  it("si el único de la base salta (dos altas a la vez), 409", async () => {
    base.prisma.sillon.findFirst.mockResolvedValueOnce(null)
    const res = await crear(sesionesDentales.dueña, { nombre: "Sillón 1", orden: 5 })

    expect(res.status).toBe(409)
  })

  it.each([
    ["sin nombre", {}],
    ["un nombre vacío", { nombre: "   " }],
    ["un orden fuera de rango", { nombre: "S", orden: 1000 }],
  ])("rechaza %s con 400", async (_caso, cuerpo) => {
    const res = await crear(sesionesDentales.dueña, cuerpo)

    expect(res.status).toBe(400)
    expect(sillonesDelNegocio()).toHaveLength(3)
  })

  it("en un salón, 404 antes de mirar el cuerpo", async () => {
    base.reiniciar(datosBase())
    const res = await crear(sesiones.dueña, { nombre: "Sillón 1" })

    expect(res.status).toBe(404)
    expect(base.buscar("sillon")).toHaveLength(0)
  })
})
