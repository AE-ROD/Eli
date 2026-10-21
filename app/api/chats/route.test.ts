import { describe, it, expect, vi, beforeEach } from "vitest"
import { conId, pedido, sesiones } from "@/pruebas/datos"

/**
 * Chats está escondido hasta que exista WhatsApp (PRODUCTO.md, sección 10):
 * los mensajes no le llegan a nadie. La API tampoco existe para nadie, y
 * responde 404 para no revelar que está ahí. Cubre las tres rutas.
 */

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const conversacion = { id: "conv-1", businessId: "negocio-1", customerName: "María", customerPhone: null, messages: [] }

const prismaMock = {
  conversation: {
    findMany: vi.fn(async () => [conversacion]),
    findFirst: vi.fn(async () => conversacion),
    create: vi.fn(async () => conversacion),
    update: vi.fn(async () => conversacion),
  },
  message: { create: vi.fn(async () => ({ id: "msg-1", content: "hola" })) },
  $transaction: vi.fn(async (operaciones: unknown[]) => Promise.all(operaciones)),
}

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))

const URL_CHATS = "http://localhost/api/chats"

const roles = [
  ["la dueña", sesiones.dueña],
  ["el encargado", sesiones.encargado],
  ["la profesional", sesiones.carla],
] as const

/** Ninguna ruta de chats toca la base mientras estén escondidos. */
function noTocoLaBase() {
  expect(prismaMock.conversation.findMany).not.toHaveBeenCalled()
  expect(prismaMock.conversation.findFirst).not.toHaveBeenCalled()
  expect(prismaMock.conversation.create).not.toHaveBeenCalled()
  expect(prismaMock.message.create).not.toHaveBeenCalled()
  expect(prismaMock.$transaction).not.toHaveBeenCalled()
}

beforeEach(() => vi.clearAllMocks())

describe("API de chats escondida", () => {
  it.each(roles)("GET /api/chats: %s recibe 404", async (_quien, sesion) => {
    const { GET } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesion)

    const respuesta = await GET()

    expect(respuesta.status).toBe(404)
    noTocoLaBase()
  })

  it.each(roles)("POST /api/chats: %s recibe 404 y no crea nada", async (_quien, sesion) => {
    const { POST } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesion)

    const respuesta = await POST(pedido(URL_CHATS, { customerName: "María" }))

    expect(respuesta.status).toBe(404)
    noTocoLaBase()
  })

  it.each(roles)("GET /api/chats/[id]: %s recibe 404", async (_quien, sesion) => {
    const { GET } = await import("./[id]/route")
    mockGetServerSession.mockResolvedValueOnce(sesion)

    const respuesta = await GET(pedido(`${URL_CHATS}/conv-1`), conId("conv-1"))

    expect(respuesta.status).toBe(404)
    noTocoLaBase()
  })

  it.each(roles)("POST /api/chats/[id]/mensajes: %s recibe 404 y no escribe", async (_quien, sesion) => {
    const { POST } = await import("./[id]/mensajes/route")
    mockGetServerSession.mockResolvedValueOnce(sesion)

    const respuesta = await POST(pedido(`${URL_CHATS}/conv-1/mensajes`, { content: "hola" }), conId("conv-1"))

    expect(respuesta.status).toBe(404)
    noTocoLaBase()
  })

  it("una ruta escondida responde igual que una que no existe: no se puede averiguar que está", async () => {
    const { GET } = await import("./[id]/route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)

    const respuesta = await GET(pedido(`${URL_CHATS}/conv-1`), conId("conv-1"))

    expect(await respuesta.json()).toEqual({ error: "No encontrado" })
  })

  it("sin sesión también es 404: ni siquiera se distingue la ruta de una inexistente", async () => {
    const { GET } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(null)

    const respuesta = await GET()

    expect(respuesta.status).toBe(404)
    noTocoLaBase()
  })
})
