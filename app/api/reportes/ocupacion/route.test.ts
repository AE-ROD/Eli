import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, OTRO_NEGOCIO, atencion, datosBase, pedido, sesiones } from "@/pruebas/datos"

/**
 * "Llenar horas" (#72): sólo dueña y encargado, todo del negocio de la
 * sesión, en su zona, sin divisiones por cero.
 */

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const base = crearBaseFalsa()

vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

/** Santiago en octubre de 2026 es UTC-3. 19/10 es lunes. */
const s = (fecha: string, hora: string) => new Date(`${fecha}T${hora}:00.000-03:00`)
let siguiente = 0
const cita = (memberId: string | null, fecha: string, inicio: string, fin: string, status = "confirmada", negocio = NEGOCIO) => ({
  id: `cita-${++siguiente}`,
  businessId: negocio,
  title: "Corte",
  memberId,
  status,
  startTime: s(fecha, inicio),
  endTime: s(fecha, fin),
})

function escenario() {
  base.reiniciar({
    ...datosBase(),
    workSchedule: [1, 2, 3, 4, 5].map((dayOfWeek) => ({
      id: `h-${dayOfWeek}`,
      businessId: NEGOCIO,
      memberId: null,
      dayOfWeek,
      startTime: "09:00",
      endTime: "19:00",
    })),
    timeBlock: [
      // El negocio cierra el martes de 9 a 14: descuenta a todos.
      { id: "b-1", businessId: NEGOCIO, memberId: null, startTime: s("2026-10-20", "09:00"), endTime: s("2026-10-20", "14:00") },
      // Un bloqueo del otro negocio no descuenta nada acá.
      { id: "b-ajeno", businessId: OTRO_NEGOCIO, memberId: null, startTime: s("2026-10-19", "09:00"), endTime: s("2026-10-19", "19:00") },
    ],
    appointment: [
      cita("m-carla", "2026-10-19", "10:00", "12:00"),
      cita("m-carla", "2026-10-19", "15:00", "16:00", "no-asistio"),
      cita("m-pedro", "2026-10-20", "15:00", "16:00", "completada"),
      cita("m-pedro", "2026-10-20", "17:00", "18:00", "cancelada"),
      // Período anterior (12 y 13/10, lunes y martes).
      cita("m-carla", "2026-10-12", "10:00", "11:00", "no-asistio"),
      cita("m-carla", "2026-10-13", "10:00", "11:00", "completada"),
      // Del otro negocio, con el mismo memberId que no existe acá: nunca suma.
      cita("m-ajeno", "2026-10-19", "10:00", "18:00", "confirmada", OTRO_NEGOCIO),
    ],
    visit: [
      // María ya venía (septiembre); Beto viene por primera vez.
      atencion("v-maria-antes", { status: "finalizada", paidAt: s("2026-09-10", "12:00") }),
      atencion("v-maria", { status: "finalizada", paidAt: s("2026-10-19", "12:00") }),
      atencion("v-beto", { customerId: "c-beto", customerName: "Beto", status: "finalizada", paidAt: s("2026-10-20", "16:00") }),
      atencion("v-sin-ficha", { customerId: null, customerName: "Paso", status: "finalizada", paidAt: s("2026-10-20", "17:00") }),
      atencion("v-anulada", { customerId: "c-beto", status: "anulada", paidAt: s("2026-10-19", "12:00") }),
      // Período anterior: María, que ya venía desde septiembre.
      atencion("v-maria-anterior", { status: "finalizada", paidAt: s("2026-10-13", "12:00") }),
      atencion("v-ajena", {
        businessId: OTRO_NEGOCIO,
        customerId: "c-ajeno",
        status: "finalizada",
        paidAt: s("2026-10-19", "12:00"),
      }),
    ],
  })
}

async function pedir(sesion: unknown, consulta: string) {
  const { GET } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  return GET(pedido(`http://localhost/api/reportes/ocupacion${consulta}`))
}

describe("GET /api/reportes/ocupacion", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(s("2026-10-21", "12:00"))
    escenario()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it.each([
    ["un profesional", sesiones.carla],
    ["sin miembro", sesiones.sinMiembro],
    ["sin sesión", null],
  ])("%s: 401", async (_quien, sesion) => {
    expect((await pedir(sesion, "?desde=2026-10-19&hasta=2026-10-20")).status).toBe(401)
  })

  it("calcula ocupación, clientes, inasistencia y la comparación, sólo con lo del negocio", async () => {
    const res = await pedir(sesiones.encargado, "?desde=2026-10-19&hasta=2026-10-20")
    expect(res.status).toBe(200)
    const cuerpo = await res.json()

    expect(cuerpo.periodo).toEqual({ desde: "2026-10-19", hasta: "2026-10-20", dias: 2 })
    expect(cuerpo.periodoAnterior).toEqual({ desde: "2026-10-17", hasta: "2026-10-18" })

    // 600 min el lunes + 300 el martes (bloqueo de 9 a 14) para cada uno.
    const carla = cuerpo.ocupacion.porProfesional.find((p: { id: string }) => p.id === "m-carla")
    const pedro = cuerpo.ocupacion.porProfesional.find((p: { id: string }) => p.id === "m-pedro")
    const encargado = cuerpo.ocupacion.porProfesional.find((p: { id: string }) => p.id === "m-encargado")
    expect(carla).toMatchObject({ minutosDisponibles: 900, minutosOcupados: 120 })
    expect(pedro).toMatchObject({ minutosDisponibles: 900, minutosOcupados: 60 })
    expect(encargado).toMatchObject({ minutosDisponibles: 900, minutosOcupados: 0, ocupacion: 0 })
    expect(cuerpo.ocupacion.porProfesional.map((p: { id: string }) => p.id)).not.toContain("m-ajeno")
    expect(cuerpo.ocupacion.total).toMatchObject({ minutosDisponibles: 2700, minutosOcupados: 180 })

    expect(cuerpo.clientes).toEqual({ nuevos: 1, recurrentes: 1, sinFicha: 1 })
    expect(cuerpo.inasistencia.total).toEqual({ citas: 3, noVino: 1, tasa: 1 / 3 })

    // El período anterior (sábado y domingo) no tenía horario: no hay contra qué comparar.
    expect(cuerpo.comparacion.ocupacion).toMatchObject({ anterior: null, cambio: null })
    expect(cuerpo.comparacion.clientesNuevos).toMatchObject({ actual: 1, anterior: 0, cambio: null })
    expect(cuerpo.truncado).toBe(false)
    expect(JSON.stringify(cuerpo)).not.toContain("NaN")
  })

  it("compara con el período anterior de igual largo", async () => {
    // Semana del 19 al 25 contra la del 12 al 18.
    const cuerpo = await (await pedir(sesiones.dueña, "?desde=2026-10-19&hasta=2026-10-25")).json()
    expect(cuerpo.periodoAnterior).toEqual({ desde: "2026-10-12", hasta: "2026-10-18" })
    // Antes: 2 citas pasadas (una no vino) → 50 %; ahora 1 de 3.
    expect(cuerpo.comparacion.inasistencia.anterior).toBe(0.5)
    expect(cuerpo.comparacion.inasistencia.cambio).toBeCloseTo(1 / 3 - 0.5)
    // Antes María ya era recurrente; ahora 1 recurrente (María): 0 % de cambio.
    expect(cuerpo.comparacion.clientesRecurrentes).toEqual({ actual: 1, anterior: 1, cambio: 0 })
    // Antes sólo ocupó la completada del 13 (la del 12 no vino y libera el horario).
    expect(cuerpo.comparacion.ocupacion.anterior).toBeCloseTo(60 / (3 * 600 * 5))
  })

  it("un período sin nada: 0 % y null, nunca NaN", async () => {
    const cuerpo = await (await pedir(sesiones.dueña, "?desde=2027-01-04&hasta=2027-01-04")).json()
    expect(cuerpo.ocupacion.total.ocupacion).toBe(0)
    expect(cuerpo.inasistencia.total.tasa).toBeNull()
    expect(cuerpo.clientes).toEqual({ nuevos: 0, recurrentes: 0, sinFicha: 0 })
    expect(JSON.stringify(cuerpo)).not.toContain("NaN")
  })

  it("el dueño de otro negocio no ve nada de éste", async () => {
    const cuerpo = await (await pedir(sesiones.dueñoAjeno, "?desde=2026-10-19&hasta=2026-10-20")).json()
    expect(cuerpo.ocupacion.porProfesional.map((p: { id: string }) => p.id)).toEqual(["m-ajeno"])
    expect(cuerpo.clientes).toEqual({ nuevos: 1, recurrentes: 0, sinFicha: 0 })
  })

  it.each([
    ["sin fechas", ""],
    ["fecha inválida", "?desde=2026-02-30&hasta=2026-03-01"],
    ["hasta antes que desde", "?desde=2026-10-20&hasta=2026-10-19"],
    ["más de 366 días", "?desde=2025-01-01&hasta=2026-01-02"],
  ])("%s: 400", async (_caso, consulta) => {
    expect((await pedir(sesiones.dueña, consulta)).status).toBe(400)
  })

  it("366 días se aceptan", async () => {
    expect((await pedir(sesiones.dueña, "?desde=2025-01-01&hasta=2026-01-01")).status).toBe(200)
  })
})
