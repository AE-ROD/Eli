import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { NextRequest } from "next/server"
import { Prisma } from "@prisma/client"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, datosBase } from "@/pruebas/datos"
import { cuerpoDePrueba } from "@/pruebas/pedidos"
import { generarToken } from "@/lib/tokens"
import { MENSAJE_URGENCIA_SOLO_HOY } from "@/lib/reserva-publica"

/**
 * El enlace para cancelar o reagendar sin cuenta, en una clínica dental:
 *
 * - Cancelar suelta lo clínico de la cita en la misma transacción: las
 *   prestaciones del plan agendadas en ella vuelven a "por agendar".
 * - Reagendar conserva el sillón que asignó la clínica; si a la hora nueva
 *   está ocupado, 409 sin nombrar el sillón, y la disponibilidad ya no ofrece
 *   esas horas.
 * - Una urgencia sólo se mueve a otra hora de hoy.
 *
 * En un salón, todo como siempre.
 */

const mockVerificarLimite = vi.fn()

vi.mock("@/lib/rate-limit", () => ({
  obtenerIp: () => "203.0.113.7",
  verificarLimite: (...args: unknown[]) => mockVerificarLimite(...args),
}))

vi.mock("@/lib/email", () => ({
  enviarConfirmacionCliente: vi.fn(async () => null),
  enviarAvisoProfesional: vi.fn(async () => null),
  enviarAvisoDeCambioDelCliente: vi.fn(async () => null),
}))

// Liberar una hora avisa a la lista de espera después de responder: acá no interesa.
vi.mock("@/lib/lista-de-espera", () => ({ programarAvisoDeHoraLiberada: vi.fn() }))

const base = crearBaseFalsa()

vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

/** El lunes 7 de enero de 2030 (escrito a mano); Santiago en enero está en UTC-3. */
const LUNES = "2030-01-07"
const MARTES = "2030-01-08"
const santiago = (fecha: string, hora: string) => new Date(`${fecha}T${hora}:00.000-03:00`)

const { token: TOKEN, tokenHash: HASH } = generarToken()

type Rubro = "odontologia" | "salon"
type Registro = Record<string, unknown>

/**
 * La cita de Lucía (María en la base) con Carla, el lunes de 10:00 a 11:00,
 * una limpieza de 60 minutos, en el Sillón 1 si es una clínica. Pedro tiene
 * otra cita en el Sillón 1 de 11:00 a 12:00: Carla está libre a esa hora,
 * el sillón no. Atiende todos los días de 09:00 a 13:00.
 */
function escenario(rubro: Rubro, { cita = {} as Registro, negocio = {} as Registro } = {}) {
  const datos = datosBase()
  const clinica = rubro === "odontologia"
  base.reiniciar({
    ...datos,
    business: datos.business.map((b) => (b.id === NEGOCIO ? { ...b, type: rubro, ...negocio } : b)),
    service: [
      ...datos.service,
      { id: "s-limpieza", businessId: NEGOCIO, name: "Limpieza", duration: 60, price: 35000 },
      { id: "s-urgencia", businessId: NEGOCIO, name: "Urgencia dental", duration: 30, price: 40000, esUrgencia: true },
    ],
    sillon: clinica ? [{ id: "sl-1", businessId: NEGOCIO, nombre: "Sillón 1", orden: 1 }] : [],
    workSchedule: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
      id: `h-${dayOfWeek}`,
      businessId: NEGOCIO,
      memberId: null,
      dayOfWeek,
      startTime: "09:00",
      endTime: "13:00",
    })),
    appointment: [
      {
        id: "c-lucia",
        businessId: NEGOCIO,
        serviceId: "s-limpieza",
        title: "Limpieza",
        memberId: "m-carla",
        customerId: "c-maria",
        source: "reserva-publica",
        startTime: santiago(LUNES, "10:00"),
        endTime: santiago(LUNES, "11:00"),
        manageTokenHash: HASH,
        sillonId: clinica ? "sl-1" : null,
        ...cita,
      },
      {
        id: "c-pedro",
        businessId: NEGOCIO,
        serviceId: "s-limpieza",
        title: "Limpieza",
        memberId: "m-pedro",
        customerId: "c-beto",
        startTime: santiago(LUNES, "11:00"),
        endTime: santiago(LUNES, "12:00"),
        sillonId: clinica ? "sl-1" : null,
      },
    ],
    ...(clinica && {
      evolucion: [
        { id: "ev-1", businessId: NEGOCIO, customerId: "c-maria", texto: "Sarro", autorNombre: "Carla", appointmentId: "c-lucia" },
      ],
      planDeTratamiento: [{ id: "plan-1", businessId: NEGOCIO, customerId: "c-maria", version: 1, creadoPorNombre: "Carla" }],
      etapaDelPlan: [{ id: "et-1", businessId: NEGOCIO, planId: "plan-1", orden: 1, nombre: "Higiene" }],
      prestacionDelPlan: [
        {
          id: "pr-agendada",
          businessId: NEGOCIO,
          etapaId: "et-1",
          orden: 1,
          nombre: "Destartraje",
          valorCents: 3_500_000,
          estado: "agendada",
          appointmentId: "c-lucia",
        },
        {
          id: "pr-realizada",
          businessId: NEGOCIO,
          etapaId: "et-1",
          orden: 2,
          nombre: "Profilaxis",
          valorCents: 2_000_000,
          estado: "realizada",
          appointmentId: "c-lucia",
          realizadaEn: santiago("2030-01-01", "10:30"),
        },
      ],
    }),
  })
}

const params = { params: Promise.resolve({ slug: "salon-uno", token: TOKEN }) }
const pedido = (url = "http://localhost/x", cuerpo?: unknown) =>
  ({ url, headers: new Headers(), body: cuerpoDePrueba(cuerpo) }) as unknown as NextRequest

async function ver() {
  const { GET } = await import("./route")
  const respuesta = await GET(pedido(), params)
  return { status: respuesta.status, cuerpo: await respuesta.json() }
}

async function cancelar() {
  const { POST } = await import("./cancelar/route")
  const respuesta = await POST(pedido(), params)
  return { status: respuesta.status, cuerpo: await respuesta.json() }
}

async function reagendar(fecha: string, hora: string) {
  const { POST } = await import("./reagendar/route")
  const respuesta = await POST(pedido("http://localhost/x", { fecha, hora }), params)
  return { status: respuesta.status, cuerpo: await respuesta.json() }
}

async function horas(fecha: string) {
  const { GET } = await import("./disponibilidad/route")
  const respuesta = await GET(pedido(`http://localhost/x?fecha=${fecha}`), params)
  return { status: respuesta.status, cuerpo: await respuesta.json() }
}

const laCita = () => base.buscar("appointment", { id: "c-lucia" })[0]
const fila = (modelo: "prestacionDelPlan" | "evolucion", id: string) => base.buscar(modelo, { id })[0]

function relojEn(instante: string) {
  vi.setSystemTime(new Date(instante))
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ["Date"] })
  // Cinco días antes de la cita.
  relojEn("2030-01-02T12:00:00.000Z")
  mockVerificarLimite.mockResolvedValue({ permitido: true, restantes: 9 })
})

afterEach(() => {
  vi.useRealTimers()
})

describe("POST cancelar por el enlace, clínica dental", () => {
  it("la prestación agendada en la cita vuelve a por agendar, en la misma transacción", async () => {
    escenario("odontologia")

    const { status } = await cancelar()

    expect(status).toBe(200)
    expect(laCita()).toMatchObject({ status: "cancelada", canceladaPor: "cliente" })
    expect(fila("prestacionDelPlan", "pr-agendada")).toMatchObject({ estado: "por-agendar", appointmentId: null })
    expect(base.prisma.$transaction).toHaveBeenCalledTimes(1)
  })

  it("lo realizado y las evoluciones conservan la cita: cancelar se puede deshacer", async () => {
    escenario("odontologia")

    await cancelar()

    expect(fila("prestacionDelPlan", "pr-realizada")).toMatchObject({ estado: "realizada", appointmentId: "c-lucia" })
    expect(fila("evolucion", "ev-1").appointmentId).toBe("c-lucia")
  })

  it("si la cita ya no se puede cancelar (fuera de plazo), no se suelta nada", async () => {
    escenario("odontologia")
    // A 12 horas de la cita, con plazo de 24.
    relojEn("2030-01-07T01:00:00.000Z")

    const { status } = await cancelar()

    expect(status).toBe(409)
    expect(fila("prestacionDelPlan", "pr-agendada")).toMatchObject({ estado: "agendada", appointmentId: "c-lucia" })
  })
})

describe("POST reagendar por el enlace, clínica dental: el sillón", () => {
  it("a una hora con el sillón ocupado (aunque la odontóloga esté libre): 409 claro, sin tocar la cita", async () => {
    escenario("odontologia")
    const antes = base.volcado()

    const { status, cuerpo } = await reagendar(LUNES, "11:00")

    expect(status).toBe(409)
    expect(cuerpo.error).toMatch(/^Esa hora ya no está disponible/)
    // No nombra el sillón ni la otra cita.
    expect(cuerpo.error).not.toMatch(/Sillón|sillón|11:00/)
    expect(base.volcado().appointment).toEqual(antes.appointment)
    // Se revisó con el candado del sillón, dentro de la transacción.
    expect(base.prisma.$executeRaw).toHaveBeenCalledWith(
      expect.arrayContaining([expect.stringContaining("pg_advisory_xact_lock")]),
      `sillon:${NEGOCIO}:sl-1`
    )
  })

  it("la carrera con el panel: si la clínica guardó otra cita en el sillón mientras reagendar esperaba, se reintenta y la ve (409)", async () => {
    escenario("odontologia")
    const transaccionReal = base.prisma.$transaction.getMockImplementation()!
    // Primer intento: mientras la transacción `Serializable` de reagendar
    // esperaba el candado, el panel (Read Committed) guardó una cita de 12:00
    // a 13:00 en el Sillón 1 y confirmó. La foto de reagendar es de antes, así
    // que no la ve; lo que Postgres hace es rechazar el `UPDATE` de la fila del
    // sillón (tocada por el panel después de la foto) con un 40001, que Prisma
    // entrega como P2010.
    base.prisma.$transaction.mockImplementationOnce(async () => {
      await base.prisma.appointment.create({
        data: {
          id: "c-del-panel",
          businessId: NEGOCIO,
          title: "Control",
          memberId: "m-pedro",
          customerId: "c-beto",
          startTime: santiago(LUNES, "12:00"),
          endTime: santiago(LUNES, "13:00"),
          sillonId: "sl-1",
        },
      })
      throw new Prisma.PrismaClientKnownRequestError("Raw query failed. Code: `40001`.", {
        code: "P2010",
        clientVersion: "prueba",
        meta: { code: "40001", message: "could not serialize access due to concurrent update" },
      })
    })
    base.prisma.$transaction.mockImplementation(transaccionReal)

    const { status, cuerpo } = await reagendar(LUNES, "12:00")

    // El reintento, con una foto nueva, ve la cita del panel: no quedan dos en el sillón.
    expect(status).toBe(409)
    expect(cuerpo.error).toMatch(/^Esa hora ya no está disponible/)
    expect(base.prisma.$transaction).toHaveBeenCalledTimes(2)
    expect(laCita().startTime).toEqual(santiago(LUNES, "10:00"))
    // Y el candado deja una versión nueva de la fila del sillón, que es lo que hace saltar el conflicto.
    expect(base.prisma.$executeRaw).toHaveBeenCalledWith(
      expect.arrayContaining([expect.stringContaining('UPDATE "sillones" SET "orden" = "orden"')]),
      "sl-1",
      NEGOCIO
    )
  })

  it("a una hora libre: se mueve y conserva el sillón", async () => {
    escenario("odontologia")

    const { status } = await reagendar(LUNES, "12:00")

    expect(status).toBe(200)
    expect(laCita()).toMatchObject({
      startTime: santiago(LUNES, "12:00"),
      endTime: santiago(LUNES, "13:00"),
      sillonId: "sl-1",
    })
  })

  it("sin sillón asignado, el choque de sillón no aplica", async () => {
    escenario("odontologia", { cita: { sillonId: null } })

    expect((await reagendar(LUNES, "11:00")).status).toBe(200)
    expect(laCita().sillonId).toBeNull()
  })

  it("la disponibilidad para reagendar no ofrece las horas con el sillón ocupado", async () => {
    escenario("odontologia")

    const { status, cuerpo } = await horas(LUNES)

    expect(status).toBe(200)
    // Carla está libre de 09:00 a 13:00; el sillón, no de 11:00 a 12:00.
    expect(cuerpo.slots).toEqual(["09:00", "09:30", "10:00", "12:00"])
  })
})

describe("enlace de una urgencia, clínica dental: sólo se mueve a hoy", () => {
  // El lunes a las 08:00 de Santiago, con plazo 0 para poder cambiarla el mismo día.
  beforeEach(() => relojEn("2030-01-07T11:00:00.000Z"))

  const urgencia = {
    cita: { serviceId: "s-urgencia", title: "Urgencia dental", startTime: santiago(LUNES, "12:00"), endTime: santiago(LUNES, "12:30"), sillonId: null },
    negocio: { cancelacionHorasAntes: 0 },
  }

  it("la cita dice que sólo se puede elegir hoy", async () => {
    escenario("odontologia", urgencia)

    const { status, cuerpo } = await ver()

    expect(status).toBe(200)
    expect(cuerpo.soloHoy).toBe(true)
    // Nada del sillón ni de lo clínico.
    expect(cuerpo).not.toHaveProperty("sillon")
    expect(cuerpo).not.toHaveProperty("sillonId")
  })

  it("a otro día: 400 con el motivo, sin moverla; la disponibilidad de otro día no ofrece horas", async () => {
    escenario("odontologia", urgencia)

    const { status, cuerpo } = await reagendar(MARTES, "10:00")
    expect(status).toBe(400)
    expect(cuerpo.error).toBe(MENSAJE_URGENCIA_SOLO_HOY)
    expect(laCita().startTime).toEqual(santiago(LUNES, "12:00"))

    expect((await horas(MARTES)).cuerpo).toEqual({ slots: [], mensaje: MENSAJE_URGENCIA_SOLO_HOY })
  })

  it("a otra hora de hoy: se mueve", async () => {
    escenario("odontologia", urgencia)

    expect((await reagendar(LUNES, "09:30")).status).toBe(200)
    expect(laCita().startTime).toEqual(santiago(LUNES, "09:30"))
  })
})

describe("el enlace en un salón: nada cambia", () => {
  it("la cita no trae soloHoy, aunque el servicio esté marcado como urgencia", async () => {
    relojEn("2030-01-07T11:00:00.000Z")
    escenario("salon", {
      cita: { serviceId: "s-urgencia", startTime: santiago(LUNES, "12:00"), endTime: santiago(LUNES, "12:30") },
      negocio: { cancelacionHorasAntes: 0 },
    })

    const { cuerpo } = await ver()
    expect(cuerpo).not.toHaveProperty("soloHoy")
    expect((await reagendar(MARTES, "10:00")).status).toBe(200)
  })

  it("reagendar no mira sillones y la disponibilidad ofrece lo de siempre", async () => {
    escenario("salon")

    expect((await horas(LUNES)).cuerpo.slots).toEqual(["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00"])
    expect((await reagendar(LUNES, "11:00")).status).toBe(200)
    expect(base.prisma.$executeRaw).not.toHaveBeenCalled()
  })

  it("cancelar: igual que siempre", async () => {
    escenario("salon")

    expect((await cancelar()).status).toBe(200)
    expect(laCita()).toMatchObject({ status: "cancelada", canceladaPor: "cliente" })
  })
})
