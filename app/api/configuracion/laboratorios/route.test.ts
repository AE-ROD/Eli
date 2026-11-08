import { beforeEach, describe, expect, it, vi } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { pedido } from "@/pruebas/datos"
import { MENSAJE_LABORATORIO_REPETIDO } from "@/lib/edicion-de-protesis"
import { CLINICA, conParams, sesionesDentales as sesiones } from "@/app/api/clientes/_pruebas/clinica-dental"
import { escenarioDeProtesis } from "@/app/api/clientes/_pruebas/protesis"

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const base = crearBaseFalsa()

vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

const URL = "http://localhost/api/configuracion/laboratorios"

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

async function editar(sesion: unknown, id: string, cuerpo: unknown) {
  const { PATCH } = await import("./[id]/route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  return PATCH(pedido(`${URL}/${id}`, cuerpo), conParams({ id }))
}

const deLaClinica = () => base.buscar("laboratorio", { businessId: CLINICA })

beforeEach(() => {
  vi.clearAllMocks()
  base.reiniciar(escenarioDeProtesis())
})

describe("GET /api/configuracion/laboratorios", () => {
  it("la dueña ve los de su clínica, activos e inactivos, por nombre", async () => {
    const res = await listar(sesiones.dueña)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([
      { id: "lab-sur", nombre: "Laboratorio Sur", contacto: "+56 9 1111 2222", activo: true },
      { id: "lab-viejo", nombre: "Técnico Rivas", contacto: null, activo: false },
    ])
  })

  it("la otra clínica sólo ve los suyos", async () => {
    expect((await (await listar(sesiones.dueñaAjena)).json()).map((l: { id: string }) => l.id)).toEqual(["lab-ajeno"])
  })

  it.each([
    ["el encargado", sesiones.encargado],
    ["un odontólogo", sesiones.perez],
  ])("%s: 401 (los gestiona sólo la dueña)", async (_quien, sesion) => {
    expect((await listar(sesion)).status).toBe(401)
  })

  it("fuera de una clínica dental, 404; sin sesión, 401", async () => {
    expect((await listar(sesiones.salon)).status).toBe(404)
    expect((await listar(sesiones.sinRubro)).status).toBe(404)
    expect((await listar(null)).status).toBe(401)
  })
})

describe("POST /api/configuracion/laboratorios", () => {
  it("la dueña agrega uno, recortado; contacto vacío es sin contacto", async () => {
    const res = await crear(sesiones.dueña, { nombre: "  Dental Norte ", contacto: "  " })

    expect(res.status).toBe(201)
    expect(await res.json()).toMatchObject({ nombre: "Dental Norte", contacto: null, activo: true })
    expect(deLaClinica()).toHaveLength(3)
  })

  it("un nombre que ya existe en la clínica, sin distinguir mayúsculas, es 409; en otra clínica no choca", async () => {
    const res = await crear(sesiones.dueña, { nombre: "LABORATORIO SUR" })
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: MENSAJE_LABORATORIO_REPETIDO })
    expect((await crear(sesiones.dueñaAjena, { nombre: "Técnico Rivas" })).status).toBe(201)
  })

  it.each([
    ["sin nombre", {}],
    ["nombre vacío", { nombre: "   " }],
    ["nombre larguísimo", { nombre: "x".repeat(81) }],
    ["contacto larguísimo", { nombre: "Otro", contacto: "x".repeat(201) }],
  ])("%s: 400", async (_caso, cuerpo) => {
    expect((await crear(sesiones.dueña, cuerpo)).status).toBe(400)
    expect(deLaClinica()).toHaveLength(2)
  })

  it.each([
    ["el encargado", sesiones.encargado, 401],
    ["un odontólogo", sesiones.perez, 401],
    ["fuera de una clínica dental", sesiones.salon, 404],
    ["sin sesión", null, 401],
  ])("%s: %i y no crea nada", async (_quien, sesion, status) => {
    expect((await crear(sesion, { nombre: "Otro" })).status).toBe(status)
    expect(base.buscar("laboratorio")).toHaveLength(3)
  })
})

describe("PATCH /api/configuracion/laboratorios/[id]", () => {
  it("la dueña lo renombra, cambia el contacto o lo desactiva", async () => {
    const res = await editar(sesiones.dueña, "lab-sur", { nombre: "Laboratorio Sur Ltda.", contacto: null, activo: false })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: "lab-sur", nombre: "Laboratorio Sur Ltda.", contacto: null, activo: false })
  })

  it("renombrarlo como otro de la clínica es 409; como sí mismo con otras mayúsculas, no", async () => {
    expect((await editar(sesiones.dueña, "lab-sur", { nombre: "técnico rivas" })).status).toBe(409)
    expect((await editar(sesiones.dueña, "lab-sur", { nombre: "LABORATORIO SUR" })).status).toBe(200)
  })

  it("las prótesis que lo tienen siguen nombrándolo como estaba (copia)", async () => {
    await editar(sesiones.dueña, "lab-sur", { nombre: "Otro nombre", activo: false })
    expect(base.buscar("protesis", { id: "pt-removible" })[0]).toMatchObject({ laboratorioId: "lab-sur", laboratorioNombre: "Laboratorio Sur" })
  })

  it.each([
    ["uno de otra clínica", sesiones.dueña, "lab-ajeno", 404],
    ["uno que no existe", sesiones.dueña, "lab-nada", 404],
    ["el encargado (no los ve)", sesiones.encargado, "lab-sur", 404],
    ["un odontólogo (los ve, no los gestiona)", sesiones.perez, "lab-sur", 401],
    ["fuera de una clínica dental", sesiones.salon, "lab-sur", 404],
    ["sin sesión", null, "lab-sur", 401],
  ])("%s: %i y no cambia nada", async (_caso, sesion, id, status) => {
    const antes = base.volcado()
    expect((await editar(sesion, id, { activo: false })).status).toBe(status)
    expect(base.volcado()).toEqual(antes)
  })

  it("sin nada que cambiar, 400", async () => {
    expect((await editar(sesiones.dueña, "lab-sur", {})).status).toBe(400)
  })
})
