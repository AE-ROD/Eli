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
  const respuesta = await PUT(pedido("http://localhost/api/configuracion/nombre", cuerpo))
  return { status: respuesta.status, cuerpo: await respuesta.json() }
}

const negocio = (id: string) => base.buscar("business", { id })[0]

beforeEach(() => {
  vi.clearAllMocks()
  base.reiniciar(datosBase())
})

describe("PUT /api/configuracion/nombre", () => {
  it("la dueña cambia el nombre de su negocio, recortado, y el enlace de su página no cambia", async () => {
    const { status, cuerpo } = await guardar(sesiones.dueña, { nombre: "  Salón Ana Rosa  " })

    expect(status).toBe(200)
    expect(cuerpo).toEqual({ nombre: "Salón Ana Rosa" })
    expect(negocio(NEGOCIO).name).toBe("Salón Ana Rosa")
    expect(negocio(NEGOCIO).slug).toBe("salon-uno")
  })

  it("el encargado también, como con la página pública", async () => {
    expect((await guardar(sesiones.encargado, { nombre: "Salón del Bruno" })).status).toBe(200)
    expect(negocio(NEGOCIO).name).toBe("Salón del Bruno")
  })

  it("sólo toca el negocio de la sesión: el otro queda como estaba, aunque el cuerpo traiga su id", async () => {
    await guardar(sesiones.dueña, { nombre: "Nuevo nombre", id: OTRO_NEGOCIO, businessId: OTRO_NEGOCIO })

    expect(negocio(NEGOCIO).name).toBe("Nuevo nombre")
    expect(negocio(OTRO_NEGOCIO).name).toBe("Salón Dos")
  })

  it("la dueña del otro negocio cambia el suyo, nunca el 1", async () => {
    await guardar(sesiones.dueñoAjeno, { nombre: "Salón Tres" })

    expect(negocio(OTRO_NEGOCIO).name).toBe("Salón Tres")
    expect(negocio(NEGOCIO).name).toBe("Salón Uno")
  })

  it("el profesional recibe 401 y no cambia nada", async () => {
    expect((await guardar(sesiones.carla, { nombre: "Otro nombre" })).status).toBe(401)
    expect((await guardar(sesiones.sinMiembro, { nombre: "Otro nombre" })).status).toBe(401)
    expect(negocio(NEGOCIO).name).toBe("Salón Uno")
  })

  it("sin sesión, o con una sesión sin negocio, 401", async () => {
    expect((await guardar(null, { nombre: "Otro nombre" })).status).toBe(401)
    expect((await guardar({ user: { id: "u", role: "owner", businessId: "" } }, { nombre: "Otro nombre" })).status).toBe(401)
    expect(negocio(NEGOCIO).name).toBe("Salón Uno")
  })

  it.each([
    ["uno de 1 carácter", { nombre: "A" }, "al menos 2 caracteres"],
    ["uno de solo espacios", { nombre: "     " }, "al menos 2 caracteres"],
    ["uno vacío", { nombre: "" }, "al menos 2 caracteres"],
    ["uno de 81 caracteres", { nombre: "a".repeat(81) }, "hasta 80 caracteres"],
    ["un número", { nombre: 7 }, "no es válido"],
    ["sin el campo", {}, "Falta el nombre del negocio"],
    ["sin cuerpo", undefined, "Falta el nombre del negocio"],
    ["un texto suelto", '"Salón"', "Falta el nombre del negocio"],
  ])("rechaza %s con 400 y un mensaje claro, sin cambiar nada", async (_que, cuerpo, mensaje) => {
    const { status, cuerpo: respuesta } = await guardar(sesiones.dueña, cuerpo)

    expect(status).toBe(400)
    expect(respuesta.error).toContain(mensaje)
    expect(negocio(NEGOCIO).name).toBe("Salón Uno")
  })

  it("acepta justo 80 caracteres", async () => {
    const justo = "a".repeat(80)
    expect((await guardar(sesiones.dueña, { nombre: justo })).status).toBe(200)
    expect(negocio(NEGOCIO).name).toBe(justo)
  })

  it("un cuerpo demasiado grande, 413", async () => {
    const { status } = await guardar(sesiones.dueña, { nombre: "a".repeat(200 * 1024) })
    expect(status).toBe(413)
    expect(negocio(NEGOCIO).name).toBe("Salón Uno")
  })
})
