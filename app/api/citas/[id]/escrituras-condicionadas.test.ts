import { describe, it, expect, vi, beforeEach } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, atencion, conId, datosBase, pedido, sesiones } from "@/pruebas/datos"

/**
 * Lo que la agenda escribe con condiciones en la misma escritura, para que
 * una llegada al Tablero que entre entre la lectura y la escritura gane:
 * mover y marcar "No vino" (PUT) y borrar (DELETE). Además: mover limpia la
 * marca del recordatorio, un JSON roto es 400, y la respuesta no trae columnas
 * internas (hash del enlace, comisiones, marca del recordatorio).
 */

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

// Liberar una hora avisa a la lista de espera después de responder: acá no interesa.
vi.mock("@/lib/lista-de-espera", () => ({ programarAvisoDeHoraLiberada: vi.fn() }))

const base = crearBaseFalsa()

vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

const PASADA = { startTime: new Date("2026-10-20T13:00:00.000Z"), endTime: new Date("2026-10-20T14:00:00.000Z") }

const cita = (id: string, datos: Record<string, unknown> = {}) => ({
  id,
  businessId: NEGOCIO,
  customerId: "c-maria",
  memberId: "m-carla",
  title: "Corte",
  status: "pendiente",
  ...PASADA,
  ...datos,
})

function escenario() {
  base.reiniciar({
    ...datosBase(),
    appointment: [
      cita("c1", {
        manageTokenHash: "hash-del-enlace",
        reminderSentAt: new Date("2026-10-19T13:00:00.000Z"),
        commissionPercent: 40,
      }),
      cita("cancelada", { status: "cancelada" }),
      cita("llego"),
    ],
    visit: [atencion("v-llego", { appointmentId: "llego", status: "en-espera" })],
  })
}

async function put(sesion: unknown, id: string, cuerpo: unknown) {
  const { PUT } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  return PUT(pedido(`http://localhost/api/citas/${id}`, cuerpo), conId(id))
}

async function borrar(sesion: unknown, id: string) {
  const { DELETE } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  return DELETE(pedido(`http://localhost/api/citas/${id}`), conId(id))
}

const laCita = (id: string) => base.buscar("appointment", { id })[0]

/** El cliente llega al Tablero justo antes de que la escritura empiece (después de las revisiones). */
function llegaAntesDeEscribir(id: string) {
  const transaccionReal = base.prisma.$transaction.getMockImplementation()!
  base.prisma.$transaction.mockImplementationOnce(async (fn: unknown) => {
    await base.prisma.visit.create({ data: atencion(`v-${id}`, { appointmentId: id, status: "en-espera" }) })
    return transaccionReal(fn)
  })
}

const MOVER = {
  startTime: "2026-10-21T13:00:00.000Z",
  endTime: "2026-10-21T14:00:00.000Z",
  confirmarAdvertencias: true,
}

beforeEach(() => {
  vi.clearAllMocks()
  escenario()
})

describe("PUT /api/citas/[id]: mover y \"No vino\" no pisan una llegada", () => {
  it("si el cliente llega entre la revisión y la escritura, \"No vino\" no se guarda: 409", async () => {
    llegaAntesDeEscribir("c1")

    const res = await put(sesiones.dueña, "c1", { status: "no-asistio" })

    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/ya llegó/)
    expect(laCita("c1").status).toBe("pendiente")
  })

  it("y mover tampoco: 409 y la cita queda en su hora", async () => {
    llegaAntesDeEscribir("c1")

    const res = await put(sesiones.dueña, "c1", MOVER)

    expect(res.status).toBe(409)
    expect(laCita("c1").startTime).toEqual(PASADA.startTime)
  })

  it("sin llegada, mover escribe y limpia la marca del recordatorio: a la hora nueva le toca el suyo", async () => {
    const res = await put(sesiones.dueña, "c1", MOVER)

    expect(res.status).toBe(200)
    expect(laCita("c1")).toMatchObject({ startTime: new Date(MOVER.startTime), reminderSentAt: null })
  })

  it("cambiar sólo las notas no toca la marca del recordatorio", async () => {
    expect((await put(sesiones.dueña, "c1", { notes: "Trae su shampoo" })).status).toBe(200)
    expect(laCita("c1").reminderSentAt).toEqual(new Date("2026-10-19T13:00:00.000Z"))
  })
})

describe("respuestas de la cita al panel", () => {
  const INTERNAS = ["manageTokenHash", "reminderSentAt", "commissionPercent", "commissionAmount", "primeraVez", "sillonId"]

  it("GET y PUT no traen el hash del enlace, ni comisiones, ni la marca del recordatorio; en un salón, nada de la clínica", async () => {
    const { GET } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)
    const detalle = await (await GET(pedido("http://localhost/api/citas/c1"), conId("c1"))).json()
    const editada = await (await put(sesiones.dueña, "c1", { notes: "Nota" })).json()

    for (const respuesta of [detalle, editada]) {
      expect(respuesta).toMatchObject({ id: "c1", title: "Corte", customer: { id: "c-maria" } })
      for (const clave of INTERNAS) expect(respuesta).not.toHaveProperty(clave)
    }
  })
})

describe("un JSON roto es un pedido mal hecho: 400", () => {
  it("al editar una cita", async () => {
    const res = await put(sesiones.dueña, "c1", "{esto no es json")
    expect(res.status).toBe(400)
    expect(laCita("c1").status).toBe("pendiente")
  })

  it("al crear una cita", async () => {
    const { POST } = await import("../route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)
    const res = await POST(pedido("http://localhost/api/citas", "{esto no es json"))
    expect(res.status).toBe(400)
  })
})

describe("DELETE /api/citas/[id]", () => {
  it("la dueña borra una cita pendiente", async () => {
    expect((await borrar(sesiones.dueña, "c1")).status).toBe(200)
    expect(laCita("c1")).toBeUndefined()
  })

  it("el encargado también; el profesional no, ni la suya (401)", async () => {
    expect((await borrar(sesiones.carla, "c1")).status).toBe(401)
    expect(laCita("c1")).toBeDefined()
    expect((await borrar(sesiones.encargado, "c1")).status).toBe(200)
  })

  it("una cita cerrada no se borra: queda en el historial (409)", async () => {
    const res = await borrar(sesiones.dueña, "cancelada")
    expect(res.status).toBe(409)
    expect(laCita("cancelada")).toBeDefined()
  })

  it("una cita cuyo cliente está en el Tablero no se borra (409)", async () => {
    expect((await borrar(sesiones.dueña, "llego")).status).toBe(409)
    expect(laCita("llego")).toBeDefined()
  })
})
