import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { NextRequest } from "next/server"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, datosBase } from "@/pruebas/datos"
import { MENSAJE_URGENCIA_SIN_HORAS, MENSAJE_URGENCIA_SOLO_HOY } from "@/lib/reserva-publica"

/**
 * La disponibilidad de la reserva pública en una clínica dental: la primera
 * vez suma 15 minutos (lo calcula el servidor, no el navegador), y una
 * urgencia sólo ofrece horas de hoy en el reloj de la clínica. En un salón,
 * nada de eso existe: `primeraVez` se ignora y ningún servicio es urgencia.
 */

const mockVerificarLimite = vi.fn()

vi.mock("@/lib/rate-limit", () => ({
  obtenerIp: () => "203.0.113.7",
  verificarLimite: (...args: unknown[]) => mockVerificarLimite(...args),
}))

const base = crearBaseFalsa()

vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

/** El lunes 7 de enero de 2030 (escrito a mano); Santiago en enero está en UTC-3. */
const LUNES = "2030-01-07"
const MARTES = "2030-01-08"

/** Seis días antes del lunes: ninguna hora del lunes ya pasó. */
const SEMANA_ANTES = "2030-01-01T12:00:00.000Z"
/** El lunes a las 08:00 de Santiago: "hoy" es el lunes. */
const LUNES_A_LAS_8 = "2030-01-07T11:00:00.000Z"

type Rubro = "odontologia" | "salon"

/**
 * El negocio 1 con el rubro pedido y tres servicios de la clínica: limpieza
 * de 45 minutos, urgencia de 30 (marcada como urgencia) y control de 30.
 * Atiende el lunes y el martes de 09:00 a 10:15: con 45 minutos entran las
 * 09:00 y las 09:30; con 60 (primera vez), sólo las 09:00.
 */
function escenario(rubro: Rubro, { citas = [] as Record<string, unknown>[] } = {}) {
  const datos = datosBase()
  base.reiniciar({
    ...datos,
    business: datos.business.map((negocio) => (negocio.id === NEGOCIO ? { ...negocio, type: rubro } : negocio)),
    service: [
      ...datos.service,
      { id: "s-limpieza", businessId: NEGOCIO, name: "Limpieza", duration: 45, price: 35000 },
      { id: "s-urgencia", businessId: NEGOCIO, name: "Urgencia dental", duration: 30, price: 40000, esUrgencia: true },
      { id: "s-control", businessId: NEGOCIO, name: "Control", duration: 30, price: 20000 },
    ],
    workSchedule: [1, 2].map((dayOfWeek) => ({
      id: `h-${dayOfWeek}`,
      businessId: NEGOCIO,
      memberId: null,
      dayOfWeek,
      startTime: "09:00",
      endTime: "10:15",
    })),
    appointment: citas,
  })
}

async function disponibilidad(consulta: string) {
  const { GET } = await import("./route")
  const pedido = {
    url: `http://localhost/api/reservar/salon-uno/disponibilidad?${consulta}`,
    headers: new Headers(),
  } as unknown as NextRequest
  const respuesta = await GET(pedido, { params: Promise.resolve({ slug: "salon-uno" }) })
  return { status: respuesta.status, cuerpo: await respuesta.json() }
}

function relojEn(instante: string) {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date(instante))
}

beforeEach(() => {
  vi.clearAllMocks()
  mockVerificarLimite.mockResolvedValue({ permitido: true, restantes: 9 })
})

afterEach(() => {
  vi.useRealTimers()
})

describe("GET disponibilidad, clínica dental: la primera vez suma 15 minutos", () => {
  beforeEach(() => relojEn(SEMANA_ANTES))

  it("ya se atendió (o sin decirlo): las horas de 45 minutos", async () => {
    escenario("odontologia")

    expect((await disponibilidad(`fecha=${LUNES}&servicioId=s-limpieza&primeraVez=0`)).cuerpo.slots).toEqual(["09:00", "09:30"])
    expect((await disponibilidad(`fecha=${LUNES}&servicioId=s-limpieza`)).cuerpo.slots).toEqual(["09:00", "09:30"])
  })

  it("primera vez: las horas de 60 minutos; las 09:30 ya no entran antes de las 10:15", async () => {
    escenario("odontologia")

    const { status, cuerpo } = await disponibilidad(`fecha=${LUNES}&servicioId=s-limpieza&primeraVez=1`)

    expect(status).toBe(200)
    expect(cuerpo.slots).toEqual(["09:00"])
  })

  it("con varios motivos, los 15 minutos se suman al total", async () => {
    escenario("odontologia")

    // Control (30) + urgencia no: control + limpieza = 75; con primera vez, 90: no cabe en 09:00–10:15.
    expect((await disponibilidad(`fecha=${LUNES}&servicioIds=s-control,s-limpieza&primeraVez=0`)).cuerpo.slots).toEqual(["09:00"])
    expect((await disponibilidad(`fecha=${LUNES}&servicioIds=s-control,s-limpieza&primeraVez=1`)).cuerpo.slots).toEqual([])
  })

  it("una cita que se pisa con los 15 minutos de más deja fuera la hora", async () => {
    // Una cita de 09:50 a 10:15: con 45 minutos las 09:00 entran (terminan 09:45); con 60, chocan.
    escenario("odontologia", {
      citas: [
        {
          id: "c-otra",
          businessId: NEGOCIO,
          title: "Control",
          status: "pendiente",
          startTime: new Date("2030-01-07T12:50:00.000Z"),
          endTime: new Date("2030-01-07T13:15:00.000Z"),
        },
      ],
    })

    expect((await disponibilidad(`fecha=${LUNES}&servicioId=s-limpieza&primeraVez=0`)).cuerpo.slots).toEqual(["09:00"])
    expect((await disponibilidad(`fecha=${LUNES}&servicioId=s-limpieza&primeraVez=1`)).cuerpo.slots).toEqual([])
  })

  it("un valor que no es 0 ni 1 es un 400", async () => {
    escenario("odontologia")

    const { status, cuerpo } = await disponibilidad(`fecha=${LUNES}&servicioId=s-limpieza&primeraVez=si`)

    expect(status).toBe(400)
    expect(cuerpo.error).toMatch(/primeraVez/)
  })
})

describe("GET disponibilidad, clínica dental: la urgencia sólo ofrece horas de hoy", () => {
  beforeEach(() => relojEn(LUNES_A_LAS_8))

  it("hoy: las horas de siempre", async () => {
    escenario("odontologia")

    const { status, cuerpo } = await disponibilidad(`fecha=${LUNES}&servicioId=s-urgencia`)

    expect(status).toBe(200)
    expect(cuerpo.slots).toEqual(["09:00", "09:30"])
  })

  it("otro día: sin horas, con el motivo y sin lista de espera, aunque la clínica atienda", async () => {
    escenario("odontologia")

    const { status, cuerpo } = await disponibilidad(`fecha=${MARTES}&servicioId=s-urgencia`)

    expect(status).toBe(200)
    expect(cuerpo).toEqual({ slots: [], mensaje: MENSAJE_URGENCIA_SOLO_HOY, sinListaDeEspera: true })
    // Sin la urgencia, el martes sí tiene horas.
    expect((await disponibilidad(`fecha=${MARTES}&servicioId=s-control`)).cuerpo.slots).toEqual(["09:00", "09:30"])
  })

  it("basta con que uno de los motivos sea urgencia", async () => {
    escenario("odontologia")

    expect((await disponibilidad(`fecha=${MARTES}&servicioIds=s-control,s-urgencia`)).cuerpo.slots).toEqual([])
    expect((await disponibilidad(`fecha=${LUNES}&servicioIds=s-control,s-urgencia`)).cuerpo.slots).toEqual(["09:00"])
  })

  it("hoy sin horas libres: lo dice claro", async () => {
    // Las dos profesionales ocupadas toda la mañana.
    const ocupada = (id: string, memberId: string) => ({
      id,
      businessId: NEGOCIO,
      memberId,
      title: "Control",
      status: "confirmada",
      startTime: new Date("2030-01-07T12:00:00.000Z"),
      endTime: new Date("2030-01-07T13:15:00.000Z"),
    })
    escenario("odontologia", { citas: [ocupada("c-1", "m-carla"), ocupada("c-2", "m-pedro")] })

    const { status, cuerpo } = await disponibilidad(`fecha=${LUNES}&servicioId=s-urgencia`)

    expect(status).toBe(200)
    expect(cuerpo.slots).toEqual([])
    expect(cuerpo.mensaje).toBe(MENSAJE_URGENCIA_SIN_HORAS)
  })
})

describe("GET disponibilidad, salón: nada cambia", () => {
  it("primeraVez se ignora: las mismas horas con o sin ella", async () => {
    relojEn(SEMANA_ANTES)
    escenario("salon")

    const sin = await disponibilidad(`fecha=${LUNES}&servicioId=s-limpieza`)
    const con = await disponibilidad(`fecha=${LUNES}&servicioId=s-limpieza&primeraVez=1`)

    expect(sin.cuerpo).toEqual({ slots: ["09:00", "09:30"] })
    expect(con.cuerpo).toEqual(sin.cuerpo)
  })

  it("un servicio marcado como urgencia no limita a hoy", async () => {
    relojEn(LUNES_A_LAS_8)
    escenario("salon")

    const { status, cuerpo } = await disponibilidad(`fecha=${MARTES}&servicioId=s-urgencia`)

    expect(status).toBe(200)
    expect(cuerpo).toEqual({ slots: ["09:00", "09:30"] })
  })
})
