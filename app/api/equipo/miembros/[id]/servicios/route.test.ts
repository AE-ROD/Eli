import { describe, it, expect, vi, beforeEach } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, OTRO_NEGOCIO, conId, datosBase, pedido, sesiones } from "@/pruebas/datos"

/**
 * Los servicios que hace un profesional: leer y definir. Sin filas = hace
 * todos. Dueño y encargado; el miembro y los servicios, del negocio de la
 * sesión (lo ajeno es 404 y no escribe nada).
 */

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const base = crearBaseFalsa()

vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

const URL = (id: string) => `http://localhost/api/equipo/miembros/${id}/servicios`

function escenario() {
  base.reiniciar({
    ...datosBase(),
    memberService: [
      { id: "ms-1", businessId: NEGOCIO, memberId: "m-pedro", serviceId: "s-corte" },
      { id: "ms-ajeno", businessId: OTRO_NEGOCIO, memberId: "m-ajeno", serviceId: "s-ajeno" },
    ],
  })
}

async function leer(sesion: unknown, id: string) {
  const { GET } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  const respuesta = await GET(pedido(URL(id)), conId(id))
  return { status: respuesta.status, cuerpo: await respuesta.json() }
}

async function definir(sesion: unknown, id: string, cuerpo: unknown) {
  const { PUT } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  const respuesta = await PUT(pedido(URL(id), cuerpo), conId(id))
  return { status: respuesta.status, cuerpo: await respuesta.json() }
}

const filasDe = (memberId: string) => base.buscar("memberService", { memberId }).map((fila) => fila.serviceId).sort()

beforeEach(() => {
  vi.clearAllMocks()
  escenario()
})

describe("GET /api/equipo/miembros/[id]/servicios", () => {
  it("sin filas, hace todos", async () => {
    expect(await leer(sesiones.dueña, "m-carla")).toEqual({ status: 200, cuerpo: { todos: true, serviceIds: [] } })
  })

  it("con filas, devuelve cuáles", async () => {
    expect(await leer(sesiones.encargado, "m-pedro")).toEqual({
      status: 200,
      cuerpo: { todos: false, serviceIds: ["s-corte"] },
    })
  })

  it("un miembro de otro negocio es 404", async () => {
    expect((await leer(sesiones.dueña, "m-ajeno")).status).toBe(404)
  })

  it("el profesional y sin sesión: 401", async () => {
    expect((await leer(sesiones.carla, "m-carla")).status).toBe(401)
    expect((await leer(null, "m-carla")).status).toBe(401)
  })
})

describe("PUT /api/equipo/miembros/[id]/servicios", () => {
  it("define cuáles hace, sin repetir", async () => {
    const { status, cuerpo } = await definir(sesiones.dueña, "m-carla", {
      todos: false,
      serviceIds: ["s-color", "s-corte", "s-color"],
    })
    expect(status).toBe(200)
    expect(cuerpo.todos).toBe(false)
    expect(filasDe("m-carla")).toEqual(["s-color", "s-corte"])
    expect(base.buscar("memberService", { memberId: "m-carla" })[0].businessId).toBe(NEGOCIO)
  })

  it("reemplaza lo que había", async () => {
    await definir(sesiones.encargado, "m-pedro", { todos: false, serviceIds: ["s-peinado"] })
    expect(filasDe("m-pedro")).toEqual(["s-peinado"])
  })

  it("\"Todos\" borra las filas", async () => {
    const { status, cuerpo } = await definir(sesiones.dueña, "m-pedro", { todos: true })
    expect(status).toBe(200)
    expect(cuerpo).toEqual({ todos: true, serviceIds: [] })
    expect(filasDe("m-pedro")).toEqual([])
  })

  it("un servicio de otro negocio es 404 y no escribe nada", async () => {
    const antes = base.volcado()
    const { status } = await definir(sesiones.dueña, "m-pedro", { todos: false, serviceIds: ["s-color", "s-ajeno"] })
    expect(status).toBe(404)
    expect(base.volcado()).toEqual(antes)
  })

  it("un servicio que no existe es 404", async () => {
    expect((await definir(sesiones.dueña, "m-pedro", { todos: false, serviceIds: ["no-existe"] })).status).toBe(404)
  })

  it("un miembro de otro negocio es 404 y no escribe nada", async () => {
    const antes = base.volcado()
    expect((await definir(sesiones.dueña, "m-ajeno", { todos: true })).status).toBe(404)
    expect((await definir(sesiones.dueñoAjeno, "m-pedro", { todos: true })).status).toBe(404)
    expect(base.volcado()).toEqual(antes)
  })

  it("el profesional no define los suyos: 401", async () => {
    expect((await definir(sesiones.carla, "m-carla", { todos: true })).status).toBe(401)
  })

  it.each([
    ["lista vacía", { todos: false, serviceIds: [] }],
    ["sin decir todos", { serviceIds: ["s-corte"] }],
    ["sin cuerpo", undefined],
  ])("datos inválidos (%s): 400", async (_caso, cuerpo) => {
    const { status, cuerpo: respuesta } = await definir(sesiones.dueña, "m-carla", cuerpo)
    expect(status).toBe(400)
    expect(typeof respuesta.error).toBe("string")
  })
})
