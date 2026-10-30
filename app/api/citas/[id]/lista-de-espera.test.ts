import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { NextRequest } from "next/server"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, OTRO_NEGOCIO, datosBase, sesiones } from "@/pruebas/datos"

/**
 * El panel también libera horas (#74): cancelar o mover una cita con PUT, y
 * borrarla con DELETE, programan el aviso a la lista de espera con el inicio
 * que tenía la cita. Lo que no libera nada no avisa.
 */

const mockSesion = vi.fn()
vi.mock("next-auth", () => ({ getServerSession: (...args: unknown[]) => mockSesion(...args) }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const programar = vi.fn()
vi.mock("@/lib/lista-de-espera", () => ({
  programarAvisoDeHoraLiberada: (...args: unknown[]) => programar(...args),
}))

const base = crearBaseFalsa()
vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

const AHORA = new Date("2030-01-01T12:00:00.000Z")
const INICIO = new Date("2030-01-07T13:00:00.000Z")
const FIN = new Date("2030-01-07T14:00:00.000Z")

function escenario(cita: Record<string, unknown> = {}) {
  base.reiniciar({
    ...datosBase(),
    appointment: [
      { id: "c1", businessId: NEGOCIO, title: "Corte", serviceId: "s-corte", startTime: INICIO, endTime: FIN, ...cita },
      { id: "c-ajena", businessId: OTRO_NEGOCIO, title: "Corte", startTime: INICIO, endTime: FIN },
    ],
  })
}

const pedido = (cuerpo?: unknown) => ({ headers: new Headers(), json: async () => cuerpo }) as unknown as NextRequest
const conId = (id: string) => ({ params: Promise.resolve({ id }) })

async function put(id: string, cuerpo: unknown) {
  const { PUT } = await import("./route")
  return (await PUT(pedido(cuerpo), conId(id))).status
}
async function borrar(id: string) {
  const { DELETE } = await import("./route")
  return (await DELETE(pedido(), conId(id))).status
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(AHORA)
  mockSesion.mockResolvedValue(sesiones.dueña)
  escenario()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("PUT", () => {
  it("cancelar avisa con el inicio de la cita y el negocio de la sesión", async () => {
    expect(await put("c1", { status: "cancelada" })).toBe(200)
    expect(programar).toHaveBeenCalledWith({ businessId: NEGOCIO, inicio: INICIO })
  })

  it("mover avisa con el inicio de antes", async () => {
    const despues = new Date("2030-01-08T13:00:00.000Z")
    const status = await put("c1", {
      startTime: despues.toISOString(),
      endTime: new Date(despues.getTime() + 3600_000).toISOString(),
      confirmarAdvertencias: true,
    })
    expect(status).toBe(200)
    expect(programar).toHaveBeenCalledWith({ businessId: NEGOCIO, inicio: INICIO })
  })

  it("confirmar, cambiar notas o el precio no libera nada", async () => {
    expect(await put("c1", { status: "confirmada" })).toBe(200)
    expect(await put("c1", { notes: "trae foto" })).toBe(200)
    expect(programar).not.toHaveBeenCalled()
  })

  it("una cita que ya estaba cancelada no vuelve a avisar", async () => {
    escenario({ status: "cancelada" })
    expect(await put("c1", { status: "cancelada" })).toBe(200)
    expect(programar).not.toHaveBeenCalled()
  })

  it("la cita de otro negocio: 404 y nada", async () => {
    expect(await put("c-ajena", { status: "cancelada" })).toBe(404)
    expect(programar).not.toHaveBeenCalled()
  })
})

describe("DELETE", () => {
  it("borrar una cita activa avisa", async () => {
    expect(await borrar("c1")).toBe(200)
    expect(programar).toHaveBeenCalledWith({ businessId: NEGOCIO, inicio: INICIO })
  })

  it("borrar una cancelada no avisa (su hora ya estaba libre)", async () => {
    escenario({ status: "cancelada" })
    expect(await borrar("c1")).toBe(200)
    expect(programar).not.toHaveBeenCalled()
  })

  it("la de otro negocio: 404 y nada", async () => {
    expect(await borrar("c-ajena")).toBe(404)
    expect(programar).not.toHaveBeenCalled()
  })
})

describe("PUT: quién canceló y cuándo (#121)", () => {
  const cita = () => base.buscar("appointment", { id: "c1" })[0]

  it("cancelar desde el panel guarda que la canceló el negocio, con la hora", async () => {
    expect(await put("c1", { status: "cancelada" })).toBe(200)
    expect(cita()).toMatchObject({ status: "cancelada", canceladaPor: "negocio", canceladaEn: AHORA })
  })

  it("re-enviar «cancelada» no pisa quién ni cuándo la canceló primero", async () => {
    const antes = new Date("2029-12-31T10:00:00.000Z")
    escenario({ status: "cancelada", canceladaPor: "cliente", canceladaEn: antes })

    expect(await put("c1", { status: "cancelada" })).toBe(200)
    expect(cita()).toMatchObject({ canceladaPor: "cliente", canceladaEn: antes })
  })

  it("confirmar no escribe cancelación", async () => {
    expect(await put("c1", { status: "confirmada" })).toBe(200)
    expect(cita().canceladaPor ?? null).toBeNull()
    expect(cita().canceladaEn ?? null).toBeNull()
  })

  it("la cita de otro negocio: 404 y no se escribe", async () => {
    expect(await put("c-ajena", { status: "cancelada" })).toBe(404)
    expect(base.buscar("appointment", { id: "c-ajena" })[0].canceladaPor ?? null).toBeNull()
  })
})
