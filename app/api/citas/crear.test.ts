import { describe, it, expect, vi, beforeEach } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, OTRO_NEGOCIO, datosBase, pedido, sesiones } from "@/pruebas/datos"

/**
 * Crear una cita desde el panel con algo en el camino: otra cita del
 * profesional, un bloqueo suyo o de todo el negocio, o fuera del horario. Como
 * al mover (`[id]/mover.test.ts`), no se impide: se responde 409 con las
 * advertencias y un segundo envío con `confirmarAdvertencias` guarda igual.
 */

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const base = crearBaseFalsa()

vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

/** Santiago en octubre de 2026 está en UTC-3. El 20 de octubre de 2026 es martes. */
const santiago = (fecha: string, hora: string) => new Date(`${fecha}T${hora}:00.000-03:00`)

function escenario() {
  base.reiniciar({
    ...datosBase(),
    appointment: [
      {
        id: "cita-carla",
        businessId: NEGOCIO,
        customerId: "c-beto",
        memberId: "m-carla",
        title: "Color",
        startTime: santiago("2026-10-20", "10:00"),
        endTime: santiago("2026-10-20", "11:00"),
      },
      {
        id: "cita-carla-no-vino",
        businessId: NEGOCIO,
        customerId: "c-beto",
        memberId: "m-carla",
        title: "Corte",
        status: "no-asistio",
        startTime: santiago("2026-10-20", "15:00"),
        endTime: santiago("2026-10-20", "16:00"),
      },
    ],
    timeBlock: [
      { id: "b-carla", businessId: NEGOCIO, memberId: "m-carla", startTime: santiago("2026-10-20", "13:00"), endTime: santiago("2026-10-20", "14:00"), motivo: "Almuerzo" },
      { id: "b-negocio", businessId: NEGOCIO, memberId: null, startTime: santiago("2026-10-21", "09:00"), endTime: santiago("2026-10-21", "19:00"), motivo: "Feriado" },
      // Dato sucio a propósito: un bloqueo de otro negocio con el profesional de éste.
      { id: "b-ajeno", businessId: OTRO_NEGOCIO, memberId: "m-carla", startTime: santiago("2026-10-20", "17:00"), endTime: santiago("2026-10-20", "18:00") },
    ],
    workSchedule: [1, 2, 3, 4, 5].map((dayOfWeek) => ({
      id: `h-${dayOfWeek}`,
      businessId: NEGOCIO,
      memberId: null,
      dayOfWeek,
      startTime: "09:00",
      endTime: "19:00",
    })),
  })
}

const nueva = (fecha: string, inicio: string, fin: string, extra: Record<string, unknown> = {}) => ({
  title: "Corte",
  customerId: "c-maria",
  memberId: "m-carla",
  startTime: santiago(fecha, inicio).toISOString(),
  endTime: santiago(fecha, fin).toISOString(),
  ...extra,
})

async function crear(sesion: unknown, cuerpo: unknown) {
  const { POST } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  return POST(pedido("http://localhost/api/citas", cuerpo))
}

const citasDeMaria = () => base.buscar("appointment", { customerId: "c-maria" })

describe("POST /api/citas: advertencias al crear", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    escenario()
  })

  it("sin nada en el camino, se crea", async () => {
    const res = await crear(sesiones.dueña, nueva("2026-10-20", "11:00", "12:00"))

    expect(res.status).toBe(201)
    expect(citasDeMaria()).toHaveLength(1)
  })

  it("choca con otra cita del profesional: 409 con la advertencia y no se crea", async () => {
    const res = await crear(sesiones.dueña, nueva("2026-10-20", "10:30", "11:30"))

    expect(res.status).toBe(409)
    expect((await res.json()).advertencias).toEqual([
      { tipo: "choque", mensaje: "Carla Profesional ya tiene una cita de 10:00 a 11:00." },
    ])
    expect(citasDeMaria()).toHaveLength(0)
  })

  it("con el segundo envío confirmado, se crea igual", async () => {
    const res = await crear(sesiones.dueña, nueva("2026-10-20", "10:30", "11:30", { confirmarAdvertencias: true }))

    expect(res.status).toBe(201)
    expect(citasDeMaria()).toHaveLength(1)
  })

  it("cae en un bloqueo del profesional: lo avisa con su motivo", async () => {
    const res = await crear(sesiones.dueña, nueva("2026-10-20", "13:30", "14:30"))

    expect(res.status).toBe(409)
    expect((await res.json()).advertencias).toEqual([
      { tipo: "bloqueo", mensaje: "Carla Profesional tiene bloqueado de 13:00 a 14:00 (Almuerzo)." },
    ])
  })

  it("cae en un bloqueo de todo el negocio: lo avisa aunque vaya sin asignar", async () => {
    const res = await crear(sesiones.dueña, nueva("2026-10-21", "10:00", "11:00", { memberId: null }))

    expect(res.status).toBe(409)
    expect((await res.json()).advertencias).toEqual([
      { tipo: "bloqueo", mensaje: "El negocio tiene bloqueado de 09:00 a 19:00 (Feriado)." },
    ])
  })

  it("fuera del horario de atención, también lo avisa", async () => {
    const res = await crear(sesiones.dueña, nueva("2026-10-20", "07:00", "08:00"))

    expect(res.status).toBe(409)
    expect((await res.json()).advertencias.map((a: { tipo: string }) => a.tipo)).toEqual(["fuera-de-horario"])
  })

  it("la cita de alguien que no vino libera su horario: no choca", async () => {
    const res = await crear(sesiones.dueña, nueva("2026-10-20", "15:00", "16:00"))

    expect(res.status).toBe(201)
  })

  it("el bloqueo de otro negocio no cuenta, aunque diga el mismo profesional", async () => {
    const res = await crear(sesiones.dueña, nueva("2026-10-20", "17:00", "18:00"))

    expect(res.status).toBe(201)
  })

  it("el profesional ve el choque con su propia cita, aunque pida otro profesional", async () => {
    const res = await crear(sesiones.carla, nueva("2026-10-20", "10:00", "10:30", { memberId: "m-pedro" }))

    expect(res.status).toBe(409)
    expect((await res.json()).advertencias[0].tipo).toBe("choque")
  })

  it("una cita que nace cancelada no ocupa el horario: no advierte", async () => {
    const res = await crear(sesiones.dueña, nueva("2026-10-20", "10:00", "11:00", { status: "cancelada" }))

    expect(res.status).toBe(201)
  })
})
