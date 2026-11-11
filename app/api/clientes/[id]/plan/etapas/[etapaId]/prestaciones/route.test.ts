import { beforeEach, describe, expect, it, vi } from "vitest"
import { Prisma } from "@prisma/client"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { pedido } from "@/pruebas/datos"
import { MENSAJE_ETAPA_APROBADA, MENSAJE_VERSION_NO_VIGENTE } from "@/lib/edicion-del-plan"
import { CLINICA, conParams, escenarioDental, sesionesDentales as sesiones } from "../../../../../_pruebas/clinica-dental"

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const base = crearBaseFalsa()

vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

const url = (id: string, etapaId: string) => `http://localhost/api/clientes/${id}/plan/etapas/${etapaId}/prestaciones`

beforeEach(() => {
  vi.clearAllMocks()
  base.reiniciar(escenarioDental())
})

async function agregar(sesion: unknown, id: string, etapaId: string, cuerpo: unknown) {
  const { POST } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  return POST(pedido(url(id, etapaId), cuerpo), conParams({ id, etapaId }))
}

/** Lo que quedó escrito como tercera prestación de la etapa por aprobar de Camila. */
const nueva = () => base.buscar("prestacionDelPlan", { etapaId: "et-rehabilitacion", orden: 3 })[0]

describe("POST /api/clientes/[id]/plan/etapas/[etapaId]/prestaciones", () => {
  it("con un servicio: copia su nombre y su precio, ordena las caras y queda al final, por agendar", async () => {
    const res = await agregar(sesiones.perez, "p-camila", "et-rehabilitacion", {
      pieza: 16,
      caras: ["M", "O"],
      serviceId: "s-resina",
      memberId: "m-nunez",
    })

    expect(res.status).toBe(201)
    const { plan } = await res.json()
    expect(plan.etapas[1].prestaciones[2]).toMatchObject({
      orden: 3,
      pieza: 16,
      caras: ["O", "M"],
      serviceId: "s-resina",
      nombre: "Restauración resina compuesta",
      valorCents: 4_800_000,
      memberId: "m-nunez",
      profesionalNombre: "Laura Núñez",
      estado: "por-agendar",
      appointmentId: null,
    })
    expect(nueva()).toMatchObject({ businessId: CLINICA, caras: ["O", "M"] })
  })

  it("lo escrito gana sobre el servicio; boca completa sin caras; el dueño como profesional", async () => {
    const res = await agregar(sesiones.dueña, "p-camila", "et-rehabilitacion", {
      pieza: null,
      serviceId: "s-destartraje",
      nombre: "Destartraje con ultrasonido",
      valorCents: 4_000_000,
      delDueño: true,
    })

    expect(res.status).toBe(201)
    expect(nueva()).toMatchObject({
      pieza: null,
      caras: [],
      serviceId: "s-destartraje",
      nombre: "Destartraje con ultrasonido",
      valorCents: 4_000_000,
      memberId: null,
      profesionalNombre: "Valentina Soto",
    })
  })

  it("sin servicio: nombre escrito y valor 0 si no viene; sin profesional", async () => {
    await agregar(sesiones.dueña, "p-camila", "et-rehabilitacion", { pieza: 36, caras: ["L"], nombre: "Sellante" })

    expect(nueva()).toMatchObject({ serviceId: null, nombre: "Sellante", valorCents: 0, memberId: null, profesionalNombre: null })
  })

  it.each([
    ["boca completa con caras", { pieza: null, caras: ["O"], nombre: "x" }, "Una prestación de boca completa no lleva caras."],
    ["una pieza que no existe", { pieza: 19, nombre: "x" }, "Esa pieza no existe en el odontograma."],
    ["palatina en la mandíbula", { pieza: 36, caras: ["P"], nombre: "x" }, "Esas caras no son de la pieza 36."],
    ["una cara repetida", { pieza: 16, caras: ["O", "O"], nombre: "x" }, "Una cara está repetida."],
    ["sin pieza", { nombre: "x" }, "Elige la pieza, o boca completa"],
    ["sin nombre ni servicio", { pieza: 16 }, "Escribe qué prestación es o elige un servicio"],
    ["un valor negativo", { pieza: 16, nombre: "x", valorCents: -100 }, "El valor no puede ser negativo"],
    ["un valor sobre el tope", { pieza: 16, nombre: "x", valorCents: 2_000_000_001 }, "El valor es demasiado alto"],
  ])("rechaza %s con un 400 legible y no escribe nada", async (_caso, cuerpo, mensaje) => {
    const antes = base.volcado()

    const res = await agregar(sesiones.dueña, "p-camila", "et-rehabilitacion", cuerpo)

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: mensaje })
    expect(base.volcado()).toEqual(antes)
  })

  it.each([
    ["un servicio de otra clínica", { pieza: 16, serviceId: "s-ajeno" }, "Servicio no encontrado"],
    ["un servicio inactivo", { pieza: 16, serviceId: "s-viejo" }, "Servicio no encontrado"],
    ["un profesional de otra clínica", { pieza: 16, nombre: "x", memberId: "m-ajeno" }, "Profesional no encontrado"],
  ])("con %s: 404 y no escribe nada (la FK cruzada no llega a intentarse)", async (_caso, cuerpo, mensaje) => {
    const antes = base.volcado()

    const res = await agregar(sesiones.dueña, "p-camila", "et-rehabilitacion", cuerpo)

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: mensaje })
    expect(base.volcado()).toEqual(antes)
  })

  it("si una FK compuesta falla igual (el profesional se fue entre la verificación y la escritura): 409, no 500", async () => {
    base.prisma.prestacionDelPlan.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("Foreign key constraint violated", { code: "P2003", clientVersion: "test" })
    )
    const antes = base.volcado()

    const res = await agregar(sesiones.dueña, "p-camila", "et-rehabilitacion", { pieza: 16, nombre: "x", memberId: "m-nunez" })

    expect(res.status).toBe(409)
    expect(base.volcado()).toEqual(antes)
  })

  it("en una etapa aprobada no se agrega: cambiaría lo que el paciente aceptó (409)", async () => {
    const res = await agregar(sesiones.dueña, "p-camila", "et-higiene", { pieza: 11, nombre: "x" })

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: MENSAJE_ETAPA_APROBADA })
  })

  it("en una etapa de una versión vieja: 409", async () => {
    const res = await agregar(sesiones.dueña, "p-camila", "et-vieja", { pieza: 11, nombre: "x" })

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: MENSAJE_VERSION_NO_VIGENTE })
  })

  it.each([
    ["la etapa de otro paciente de la misma clínica", sesiones.dueña, "p-camila", "et-beto", 404],
    ["una etapa de otra clínica", sesiones.dueña, "p-camila", "et-ajena", 404],
    ["la etapa ajena, por su propio paciente", sesiones.dueña, "p-ajena", "et-ajena", 404],
    ["la dueña de otra clínica", sesiones.dueñaAjena, "p-camila", "et-rehabilitacion", 404],
    ["un salón", sesiones.salon, "p-salon", "et-rehabilitacion", 404],
    ["el encargado", sesiones.encargado, "p-camila", "et-rehabilitacion", 401],
    ["sin sesión", null, "p-camila", "et-rehabilitacion", 401],
  ] as const)("%s: 404 (o 401 sin permiso) y nada escrito", async (_caso, sesion, id, etapaId, status) => {
    const antes = base.volcado()

    const res = await agregar(sesion, id, etapaId, { pieza: 11, nombre: "x" })

    expect(res.status).toBe(status)
    expect(base.volcado()).toEqual(antes)
  })
})
