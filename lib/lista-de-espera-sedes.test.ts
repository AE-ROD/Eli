import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"

/**
 * La lista de espera con sedes (etapa 9, plan Independiente): una inscripción
 * espera por la sede en que se anotó. Cuando se libera una hora, sólo se avisa a
 * quien espera por la sede donde se liberó (con dos o más sedes activas), y el
 * enlace del aviso deja esa sede elegida.
 */

const base = crearBaseFalsa()
vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

const enviarAviso = vi.fn()
vi.mock("@/lib/email", () => ({
  enviarAvisoListaDeEspera: (...args: unknown[]) => enviarAviso(...args),
}))

let m: typeof import("./lista-de-espera")
beforeAll(async () => {
  process.env.NEXTAUTH_SECRET = "secreto-de-prueba-de-la-lista-de-espera"
  process.env.NEXTAUTH_URL = "https://eli.test"
  m = await import("./lista-de-espera")
})

/** Miércoles 28 de octubre de 2026, 10:00 en Santiago (UTC-3). */
const AHORA = new Date("2026-10-28T13:00:00.000Z")
/** Lunes 2 de noviembre: Centro atiende de 9 a 11 y Ñuñoa de 14 a 16, dos horas de 60 minutos cada una. */
const LUNES = "2026-11-02"
const A_LAS_9 = new Date("2026-11-02T12:00:00.000Z")
const A_LAS_10 = new Date("2026-11-02T13:00:00.000Z")
const A_LAS_14 = new Date("2026-11-02T17:00:00.000Z")
const A_LAS_15 = new Date("2026-11-02T18:00:00.000Z")
const OK = { data: { id: "correo" }, error: null }

type Registro = Record<string, unknown>

const cita = (id: string, startTime: Date, sedeId: string) => ({
  id,
  businessId: "n1",
  title: "Corte",
  serviceId: "s1",
  sedeId,
  startTime,
  endTime: new Date(startTime.getTime() + 60 * 60_000),
})

const inscripcion = (id: string, extra: Registro = {}) => ({
  id,
  businessId: "n1",
  serviceId: "s1",
  fecha: LUNES,
  nombre: "Ana",
  apellido: "Soto",
  email: `${id}@correo.test`,
  tokenHash: `hash-${id}`,
  createdAt: new Date("2026-10-27T12:00:00.000Z"),
  ...extra,
})

/** El negocio 1 es Independiente, con sedes activas (las que se pidan) y los dos lunes llenos. */
function escenario({ sedes = ["centro", "nunoa"], inscripciones = [] as Registro[] } = {}) {
  base.reiniciar({
    user: [{ id: "u1", name: "Dueña Uno", email: "uno@test" }],
    business: [{ id: "n1", name: "Salón Uno", slug: "uno", userId: "u1", plan: "independiente" }],
    service: [{ id: "s1", businessId: "n1", name: "Corte", duration: 60 }],
    sede: [
      { id: "centro", businessId: "n1", nombre: "Centro", direccion: "Av. Italia 1234", comuna: "Providencia", orden: 0, activo: sedes.includes("centro") },
      { id: "nunoa", businessId: "n1", nombre: "Ñuñoa", direccion: "Irarrázaval 500", comuna: "Ñuñoa", orden: 1, activo: sedes.includes("nunoa") },
    ],
    workSchedule: [
      { id: "h-centro", businessId: "n1", memberId: null, sedeId: "centro", dayOfWeek: 1, startTime: "09:00", endTime: "11:00" },
      { id: "h-nunoa", businessId: "n1", memberId: null, sedeId: "nunoa", dayOfWeek: 1, startTime: "14:00", endTime: "16:00" },
    ],
    appointment: [cita("c9", A_LAS_9, "centro"), cita("c10", A_LAS_10, "centro"), cita("n14", A_LAS_14, "nunoa"), cita("n15", A_LAS_15, "nunoa")],
    inscripcionEnEspera: inscripciones,
  })
}

const liberar = (id: string) => base.prisma.appointment.updateMany({ where: { id }, data: { status: "cancelada" } })

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(AHORA)
  enviarAviso.mockResolvedValue(OK)
})

afterEach(() => {
  vi.useRealTimers()
})

describe("avisar cuando se libera una hora, con varias sedes", () => {
  it("avisa sólo a quien espera por la sede donde se liberó, y el enlace deja esa sede elegida", async () => {
    escenario({ inscripciones: [inscripcion("i-centro", { sedeId: "centro" }), inscripcion("i-nunoa", { sedeId: "nunoa" })] })

    await liberar("c9")
    const resumen = await m.avisarHoraLiberada({ businessId: "n1", inicio: A_LAS_9 }, AHORA)

    expect(resumen).toMatchObject({ enviados: 1, fallidos: 0 })
    expect(enviarAviso).toHaveBeenCalledTimes(1)
    const correo = enviarAviso.mock.calls[0][0]
    expect(correo).toMatchObject({ emailCliente: "i-centro@correo.test" })
    expect(correo.enlaceReservar).toBe(`https://eli.test/reservar/uno?servicio=s1&fecha=${LUNES}&sede=centro#reservar`)
  })

  it("lo mismo al revés: una hora de Ñuñoa avisa a quien espera por Ñuñoa", async () => {
    escenario({ inscripciones: [inscripcion("i-centro", { sedeId: "centro" }), inscripcion("i-nunoa", { sedeId: "nunoa" })] })

    await liberar("n14")
    await m.avisarHoraLiberada({ businessId: "n1", inicio: A_LAS_14 }, AHORA)

    expect(enviarAviso).toHaveBeenCalledTimes(1)
    expect(enviarAviso.mock.calls[0][0]).toMatchObject({ emailCliente: "i-nunoa@correo.test" })
    expect(enviarAviso.mock.calls[0][0].enlaceReservar).toContain("&sede=nunoa#reservar")
  })

  it("una inscripción de antes, sin sede, no cambia de comportamiento: se avisa por la hora de cualquier sede", async () => {
    escenario({ inscripciones: [inscripcion("i-vieja")] })

    await liberar("n14")
    await m.avisarHoraLiberada({ businessId: "n1", inicio: A_LAS_14 }, AHORA)

    expect(enviarAviso).toHaveBeenCalledTimes(1)
    expect(enviarAviso.mock.calls[0][0].enlaceReservar).toBe(`https://eli.test/reservar/uno?servicio=s1&fecha=${LUNES}#reservar`)
  })
})

describe("con una sola sede activa", () => {
  it("la lista de espera se comporta como siempre: la hora libre se busca en el horario vigente", async () => {
    // Ñuñoa se desactivó: sólo Centro está activa. La inscripción guarda su sede, pero con una sola no se filtra.
    escenario({ sedes: ["centro"], inscripciones: [inscripcion("i-centro", { sedeId: "centro" })] })

    await liberar("c9")
    await m.avisarHoraLiberada({ businessId: "n1", inicio: A_LAS_9 }, AHORA)

    expect(enviarAviso).toHaveBeenCalledTimes(1)
  })
})

describe("enlacesDelAviso", () => {
  const datos = { slug: "uno", esperaId: "i1", serviceId: "s1", memberId: null, fecha: LUNES }

  it("con sede, el enlace para reservar la deja elegida; sin sede, es el de siempre", () => {
    expect(m.enlacesDelAviso({ ...datos, sedeId: "centro" }).enlaceReservar).toBe(
      `https://eli.test/reservar/uno?servicio=s1&fecha=${LUNES}&sede=centro#reservar`
    )
    expect(m.enlacesDelAviso({ ...datos, sedeId: null }).enlaceReservar).toBe(
      `https://eli.test/reservar/uno?servicio=s1&fecha=${LUNES}#reservar`
    )
    expect(m.enlacesDelAviso(datos).enlaceReservar).toBe(`https://eli.test/reservar/uno?servicio=s1&fecha=${LUNES}#reservar`)
  })
})
