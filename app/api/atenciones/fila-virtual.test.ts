import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, atencion, conId, datosBase, linea, pedido, sesiones } from "@/pruebas/datos"

/**
 * La fila virtual en el Tablero (#85): quien se anotó entra como una atención
 * "en espera" más, con su número de turno, y se atiende o se anula igual que
 * las demás. Cuando deja de esperar, se programa el aviso al que sigue.
 */

const mockGetServerSession = vi.fn()
vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const correos = vi.hoisted(() => ({
  aviso: vi.fn(async (..._args: unknown[]): Promise<unknown> => ({ data: { id: "correo" }, error: null })),
}))
vi.mock("@/lib/email", () => ({ enviarAvisoFilaVirtual: correos.aviso }))

const tareas = vi.hoisted(() => [] as Array<() => unknown>)
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  after: (tarea: () => unknown) => {
    tareas.push(tarea)
  },
}))

const base = crearBaseFalsa()
vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

/** Lunes 7 de enero de 2030, 12:00 en Santiago. */
const HOY = "2030-01-07"
const AHORA = new Date("2030-01-07T15:00:00.000Z")
const URL_DEL_DIA = "http://localhost/api/atenciones?desde=2030-01-07T03:00:00.000Z&hasta=2030-01-08T03:00:00.000Z"

type Registro = Record<string, unknown>

const deLaFila = (id: string, numero: number, extra: Registro = {}) =>
  atencion(id, {
    customerId: null,
    customerName: `Persona ${numero}`,
    arrivedAt: AHORA,
    origen: "fila",
    filaTokenHash: `hash-${id}`,
    filaFecha: HOY,
    filaNumero: numero,
    ...extra,
  })

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(AHORA)
  tareas.length = 0
  const datos = datosBase()
  base.reiniciar({
    ...datos,
    business: datos.business.map((b) => (b.id === NEGOCIO ? { ...b, filaVirtualActiva: true } : b)),
    visit: [
      deLaFila("f1", 1),
      deLaFila("f2", 2),
      deLaFila("f3", 3, { filaEmail: "tres@correo.test" }),
      atencion("del-tablero", { arrivedAt: AHORA }),
    ],
    visitService: [linea("l-f1", "f1"), linea("l-tablero", "del-tablero")],
  })
})

afterEach(() => {
  vi.useRealTimers()
})

async function correrTareas() {
  for (const tarea of tareas.splice(0)) await tarea()
}

describe("la fila virtual en el Tablero", () => {
  it("las de la fila aparecen en espera con su número de turno; la dueña ve que la fila está encendida", async () => {
    const { GET } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)
    const tablero = await (await GET(pedido(URL_DEL_DIA))).json()

    const turnos = Object.fromEntries(tablero.atenciones.map((a: { id: string; turno: number | null }) => [a.id, a.turno]))
    expect(turnos).toEqual({ f1: 1, f2: 2, f3: 3, "del-tablero": null })
    expect(tablero.atenciones.every((a: { estado: string }) => a.estado === "en-espera")).toBe(true)
    expect(tablero.filaVirtual).toBe(true)
  })

  it("al profesional no se le dice si la fila está encendida (no puede abrir la pantalla)", async () => {
    const { GET } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.carla)
    const tablero = await (await GET(pedido(URL_DEL_DIA))).json()
    expect(tablero.filaVirtual).toBe(false)
  })

  it("empezar a atender a uno de la fila funciona y avisa al que quedó con 1 adelante", async () => {
    const { POST } = await import("./[id]/estado/route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)
    const respuesta = await POST(pedido("http://localhost/x", { estado: "en-atencion" }), conId("f1"))
    expect(respuesta.status).toBe(200)
    expect(base.buscar("visit", { id: "f1" })[0].status).toBe("en-atencion")

    expect(tareas).toHaveLength(1)
    await correrTareas()
    expect(correos.aviso).toHaveBeenCalledTimes(1)
    expect(correos.aviso.mock.calls[0][0]).toMatchObject({ emailCliente: "tres@correo.test", numero: 3 })
  })

  it("anular a uno de la fila que esperaba funciona y programa el aviso", async () => {
    const { POST } = await import("./[id]/anulacion/route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.encargado)
    const respuesta = await POST(pedido("http://localhost/x", { motivo: "No vino" }), conId("f2"))
    expect(respuesta.status).toBe(200)
    expect(base.buscar("visit", { id: "f2" })[0]).toMatchObject({ status: "anulada", voidReason: "No vino" })
    expect(tareas).toHaveLength(1)
  })

  it("mover o anular a alguien que no es de la fila no programa nada", async () => {
    const { POST: mover } = await import("./[id]/estado/route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)
    expect((await mover(pedido("http://localhost/x", { estado: "en-atencion" }), conId("del-tablero"))).status).toBe(200)
    const { POST: anular } = await import("./[id]/anulacion/route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)
    expect((await anular(pedido("http://localhost/x", {}), conId("del-tablero"))).status).toBe(200)
    expect(tareas).toHaveLength(0)
  })
})
