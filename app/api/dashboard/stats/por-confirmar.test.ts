import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { NextRequest } from "next/server"
import { NEGOCIO, atencion, datosBase, sesiones } from "@/pruebas/datos"
import { sigueSinConfirmar } from "@/lib/por-confirmar"
import { crearBaseDeEstadisticas } from "./_pruebas/base-de-estadisticas"

/**
 * "Por confirmar" en el inicio (#136): una reserva por confirmar cuyo cliente
 * ya llegó (tiene una atención no anulada en el Tablero) está resuelta, igual
 * que en la agenda. El endpoint dice `conAtencion` sin exponer la atención.
 */

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const base = crearBaseDeEstadisticas()

vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

/** 15 de octubre de 2026, 12:00 en Santiago (UTC-3). */
const AHORA = new Date("2026-10-15T15:00:00.000Z")

const porConfirmar = (id: string, hora: string) => ({
  id,
  businessId: NEGOCIO,
  customerId: "c-maria",
  memberId: "m-carla",
  title: "Corte",
  status: "pendiente",
  confirmacionPorFaltas: true,
  startTime: new Date(`2026-10-15T${hora}:00.000Z`),
  endTime: new Date(`2026-10-15T${hora}:30.000Z`),
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(AHORA)
  base.reiniciar({
    ...datosBase(),
    appointment: [porConfirmar("cita-llego", "15:00"), porConfirmar("cita-anulada", "16:00"), porConfirmar("cita-espera", "17:00")],
    visit: [
      atencion("v-llego", { appointmentId: "cita-llego" }),
      atencion("v-anulada", { appointmentId: "cita-anulada", status: "anulada" }),
    ],
  })
})

afterEach(() => vi.useRealTimers())

describe("GET /api/dashboard/stats: citas por confirmar de hoy", () => {
  it("dice si el cliente ya llegó; una atención anulada no cuenta; la atención no viaja", async () => {
    const { GET } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)

    const data = await (await GET({ url: "http://localhost/api/dashboard/stats" } as unknown as NextRequest)).json()

    const lista = data.citasHoyLista as { id: string; status: string; confirmacionPorFaltas: boolean; conAtencion: boolean }[]
    expect(Object.fromEntries(lista.map((c) => [c.id, c.conAtencion]))).toEqual({
      "cita-llego": true,
      "cita-anulada": false,
      "cita-espera": false,
    })
    // Lo que dibuja el inicio: sólo las que siguen esperando dicen "Por confirmar".
    expect(lista.filter(sigueSinConfirmar).map((c) => c.id)).toEqual(["cita-anulada", "cita-espera"])
    expect(JSON.stringify(data)).not.toMatch(/"visit"|v-llego|en-espera/)
  })
})
