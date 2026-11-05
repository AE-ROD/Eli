import { describe, it, expect, vi, beforeEach } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, OTRO_NEGOCIO, datosBase, pedido, sesiones } from "@/pruebas/datos"

/** La lista de espera en el panel: sólo gestión, sólo su negocio. */

const mockSesion = vi.fn()
vi.mock("next-auth", () => ({ getServerSession: (...args: unknown[]) => mockSesion(...args) }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const base = crearBaseFalsa()
vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

const LUNES = "2030-01-07"

const inscripcion = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  businessId: NEGOCIO,
  serviceId: "s-corte",
  fecha: LUNES,
  nombre: "Lucía",
  apellido: "Pérez",
  email: `${id}@correo.test`,
  tokenHash: `hash-${id}`,
  ...extra,
})

beforeEach(() => {
  vi.clearAllMocks()
  base.reiniciar({
    ...datosBase(),
    inscripcionEnEspera: [
      inscripcion("i1", { memberId: "m-carla", telefono: "+56912345678", whatsappConsentAt: new Date("2029-12-01"), createdAt: new Date("2029-12-01") }),
      inscripcion("i2", { createdAt: new Date("2029-12-02") }),
      inscripcion("i-reservo", { estado: "reservo" }),
      inscripcion("i-otro-dia", { fecha: "2030-01-08" }),
      inscripcion("i-ajena", { businessId: OTRO_NEGOCIO, serviceId: "s-ajeno" }),
    ],
  })
})

async function leer(fecha = LUNES) {
  const { GET } = await import("./route")
  const respuesta = await GET(pedido(`http://localhost/api/lista-de-espera?fecha=${fecha}`))
  return { status: respuesta.status, cuerpo: await respuesta.json() }
}

async function quitar(id: string) {
  const { DELETE } = await import("./route")
  const respuesta = await DELETE(pedido(`http://localhost/api/lista-de-espera?id=${id}`))
  return { status: respuesta.status, cuerpo: await respuesta.json() }
}

describe("GET", () => {
  it.each([["dueña"], ["encargado"]] as const)("%s ve las activas del día de su negocio, por orden de llegada", async (quien) => {
    mockSesion.mockResolvedValue(sesiones[quien])
    const { status, cuerpo } = await leer()
    expect(status).toBe(200)
    expect(cuerpo.inscripciones.map((fila: { id: string }) => fila.id)).toEqual(["i1", "i2"])
    expect(cuerpo.inscripciones[0]).toMatchObject({
      nombre: "Lucía Pérez",
      email: "i1@correo.test",
      telefono: "+56912345678",
      whatsapp: true,
      servicio: "Corte",
      profesional: "Carla Profesional",
      avisos: 0,
    })
  })

  it("el profesional y sin sesión: 401", async () => {
    mockSesion.mockResolvedValue(sesiones.carla)
    expect((await leer()).status).toBe(401)
    mockSesion.mockResolvedValue(null)
    expect((await leer()).status).toBe(401)
  })

  it("la dueña de otro negocio no ve nada de este", async () => {
    mockSesion.mockResolvedValue(sesiones.dueñoAjeno)
    const { cuerpo } = await leer()
    expect(cuerpo.inscripciones.map((fila: { id: string }) => fila.id)).toEqual(["i-ajena"])
  })

  it("fecha inválida: 400", async () => {
    mockSesion.mockResolvedValue(sesiones.dueña)
    expect((await leer("2030-02-30")).status).toBe(400)
  })
})

describe("DELETE", () => {
  it("la encargada quita una de su negocio", async () => {
    mockSesion.mockResolvedValue(sesiones.encargado)
    expect((await quitar("i1")).status).toBe(200)
    expect(base.buscar("inscripcionEnEspera", { id: "i1" })).toHaveLength(0)
  })

  it("la de otro negocio: 404 y no se borra", async () => {
    mockSesion.mockResolvedValue(sesiones.dueña)
    expect((await quitar("i-ajena")).status).toBe(404)
    expect(base.buscar("inscripcionEnEspera", { id: "i-ajena" })).toHaveLength(1)
  })

  it("el profesional: 401 y no se borra", async () => {
    mockSesion.mockResolvedValue(sesiones.carla)
    expect((await quitar("i1")).status).toBe(401)
    expect(base.buscar("inscripcionEnEspera", { id: "i1" })).toHaveLength(1)
  })
})
