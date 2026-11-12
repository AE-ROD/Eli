import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { NextRequest } from "next/server"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, OTRO_NEGOCIO, datosBase } from "@/pruebas/datos"
import { generarToken } from "@/lib/tokens"
import { cuerpoDePrueba } from "@/pruebas/pedidos"

/**
 * Cambiar de profesional al reagendar por el enlace: quien tiene el enlace de su
 * hora, además de mover el día y la hora, puede pasarla a OTRO profesional del
 * negocio ("Cualquiera" incluido). Sólo se ofrecen (y se aceptan) los que atienden
 * en la reserva pública, hacen TODOS los servicios de la cita y atienden en su sede.
 * El servidor revalida todo, en la misma transacción que la hora.
 */

const mockVerificarLimite = vi.fn()

vi.mock("@/lib/rate-limit", () => ({
  obtenerIp: () => "203.0.113.7",
  verificarLimite: (...args: unknown[]) => mockVerificarLimite(...args),
}))

const correos = vi.hoisted(() => ({
  cambio: vi.fn(async (..._args: unknown[]) => null),
}))

vi.mock("@/lib/email", () => ({
  enviarConfirmacionCliente: vi.fn(async () => null),
  enviarAvisoProfesional: vi.fn(async () => null),
  enviarAvisoDeCambioDelCliente: correos.cambio,
}))

// Sin pedido de Next no hay "después de responder": el aviso a la lista de espera no corre en estas pruebas.
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  after: () => undefined,
}))

const base = crearBaseFalsa()

vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

/** El lunes 7 de enero de 2030 y el martes siguiente; Santiago en enero está en UTC-3. */
const LUNES = "2030-01-07"
const MARTES = "2030-01-08"
const aLas = (hora: string, fecha = LUNES) => new Date(`${fecha}T${hora}:00.000-03:00`)

const CENTRO = "sede-centro"
const PROVIDENCIA = "sede-providencia"

const { token: TOKEN, tokenHash: HASH } = generarToken()

type Registro = Record<string, unknown>

const general = (id: string, dayOfWeek: number, sedeId: string | null = null, extra: Registro = {}) => ({
  id,
  businessId: NEGOCIO,
  memberId: null,
  sedeId,
  dayOfWeek,
  startTime: "09:00",
  endTime: "12:00",
  ...extra,
})

const SIN_SEDES = [0, 1, 2, 3, 4, 5, 6].map((dia) => general(`h-${dia}`, dia))

/**
 * Salón Uno: Carla y Pedro hacen todo; Diana sólo Color (no el Corte); el
 * encargado no atiende; y Ajena es de otro negocio. La cita es un Corte de 60
 * minutos el lunes a las 10:00, con Carla (o con quien se pida).
 */
function escenario({
  cita = {},
  otras = [] as Registro[],
  workSchedule = SIN_SEDES as Registro[],
  sede = [] as Registro[],
  carlaSoloColor = false,
} = {}) {
  const datos = datosBase()
  base.reiniciar({
    ...datos,
    user: [...datos.user, { id: "u-diana", name: "Diana Profesional", email: "diana@uno.test" }],
    business: datos.business.map((negocio) => ({ ...negocio, plan: "independiente" })),
    businessMember: [
      ...datos.businessMember,
      { id: "m-diana", businessId: NEGOCIO, userId: "u-diana", role: "worker", createdAt: new Date("2026-01-04") },
    ],
    memberService: [
      { id: "ms-diana", businessId: NEGOCIO, memberId: "m-diana", serviceId: "s-color" },
      ...(carlaSoloColor ? [{ id: "ms-carla", businessId: NEGOCIO, memberId: "m-carla", serviceId: "s-color" }] : []),
    ],
    service: datos.service.map((servicio) => (servicio.id === "s-corte" ? { ...servicio, duration: 60 } : servicio)),
    sede,
    workSchedule,
    appointment: [
      {
        id: "c-lucia",
        businessId: NEGOCIO,
        serviceId: "s-corte",
        title: "Corte",
        memberId: "m-carla",
        customerId: "c-maria",
        source: "reserva-publica",
        startTime: aLas("10:00"),
        endTime: aLas("11:00"),
        manageTokenHash: HASH,
        ...cita,
      },
      ...otras,
    ],
  })
}

const sedeDelNegocio = (id: string, nombre: string, orden: number) => ({
  id,
  businessId: NEGOCIO,
  nombre,
  direccion: "Av. Italia 1234",
  comuna: "Providencia",
  orden,
})

const params = (token = TOKEN, slug = "salon-uno") => ({ params: Promise.resolve({ slug, token }) })
const pedido = (url = "http://localhost/x", cuerpo?: unknown) =>
  ({ url, headers: new Headers(), body: cuerpoDePrueba(cuerpo) }) as unknown as NextRequest

async function ver() {
  const { GET } = await import("./route")
  const respuesta = await GET(pedido(), params())
  return { status: respuesta.status, cuerpo: await respuesta.json() }
}

/** `quien`: sin dar, el mismo; `""`, cualquiera; o el id. */
async function horas(fecha: string, quien?: string) {
  const { GET } = await import("./disponibilidad/route")
  const consulta = `fecha=${fecha}${quien === undefined ? "" : `&profesionalId=${encodeURIComponent(quien)}`}`
  const respuesta = await GET(pedido(`http://localhost/x?${consulta}`), params())
  return { status: respuesta.status, cuerpo: await respuesta.json() }
}

/** `quien`: sin dar, el mismo; `null`, cualquiera; o el id. */
async function reagendar(fecha: string, hora: string, quien?: unknown) {
  const { POST } = await import("./reagendar/route")
  const cuerpo = quien === undefined ? { fecha, hora } : { fecha, hora, profesionalId: quien }
  const respuesta = await POST(pedido("http://localhost/x", cuerpo), params())
  return { status: respuesta.status, cuerpo: await respuesta.json() }
}

const laCita = () => base.buscar("appointment", { id: "c-lucia" })[0]
const ocupa = (id: string, memberId: string, hora: string, fecha = MARTES): Registro => ({
  id,
  businessId: NEGOCIO,
  title: "Color",
  memberId,
  startTime: aLas(hora, fecha),
  endTime: aLas(`${String(Number(hora.slice(0, 2)) + 1).padStart(2, "0")}:${hora.slice(3)}`, fecha),
})
const destinatarios = () => correos.cambio.mock.calls.map((llamada) => (llamada[0] as { emailNegocio: string }).emailNegocio).sort()

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ["Date"] })
  // Cinco días antes de la cita.
  vi.setSystemTime(new Date("2030-01-02T12:00:00.000Z"))
  mockVerificarLimite.mockResolvedValue({ permitido: true, restantes: 9 })
})

afterEach(() => {
  vi.useRealTimers()
})

describe("GET de la cita: a quién se puede pasar", () => {
  it("los que atienden y hacen todos los servicios de la cita, con quién la atiende hoy marcado", async () => {
    escenario()

    const { status, cuerpo } = await ver()

    expect(status).toBe(200)
    // Ni Diana (no hace el Corte), ni el encargado (no atiende), ni la profesional de otro negocio.
    expect(cuerpo.profesionales.map((profesional: Registro) => profesional.id)).toEqual(["m-carla", "m-pedro"])
    expect(cuerpo.profesionales[0]).toMatchObject({ id: "m-carla", actual: true })
    expect(cuerpo.profesionales[1]).not.toHaveProperty("actual")
    // Sólo lo que ya publica la reserva: nada de correos, roles ni comisiones.
    expect(Object.keys(cuerpo.profesionales[1]).sort()).toEqual(["diasConAtencion", "especialidad", "fotoUrl", "id", "nombre"])
    expect(JSON.stringify(cuerpo)).not.toMatch(/@|worker|admin|commission|Diana|Bruno|m-ajeno/)
  })

  it("con un solo profesional posible no hay a quién elegir: no viene la lista", async () => {
    escenario()
    // Pedro sólo hace Color: queda Carla sola.
    base.reiniciar({ ...base.volcado(), memberService: [...base.volcado().memberService, { id: "ms-pedro", businessId: NEGOCIO, memberId: "m-pedro", serviceId: "s-color" }] })

    expect((await ver()).cuerpo).not.toHaveProperty("profesionales")
  })

  it("una cita sin profesional y un solo profesional posible: 'cualquiera' ya es él, no se pregunta", async () => {
    escenario({ cita: { memberId: null } })
    base.reiniciar({ ...base.volcado(), memberService: [...base.volcado().memberService, { id: "ms-pedro", businessId: NEGOCIO, memberId: "m-pedro", serviceId: "s-color" }] })

    expect((await ver()).cuerpo).not.toHaveProperty("profesionales")
  })

  it("si quien la atiende ya no hace el servicio y queda un solo profesional, ése es la salida: se ofrece, sin nadie marcado", async () => {
    escenario({ carlaSoloColor: true })

    const { cuerpo } = await ver()

    expect(cuerpo.profesionales.map((profesional: Registro) => profesional.id)).toEqual(["m-pedro"])
    expect(cuerpo.profesionales[0]).not.toHaveProperty("actual")
  })

  it("un negocio sin profesionales (el carril único de siempre): no viene la lista", async () => {
    escenario({ cita: { memberId: null } })
    base.reiniciar({ ...base.volcado(), businessMember: [] })

    expect((await ver()).cuerpo).not.toHaveProperty("profesionales")
  })

  it("fuera del plazo no se ofrece cambiar nada", async () => {
    escenario()
    vi.setSystemTime(new Date("2030-01-07T00:00:00.000Z"))

    const { cuerpo } = await ver()

    expect(cuerpo.sePuedeCambiar).toBe(false)
    expect(cuerpo).not.toHaveProperty("profesionales")
  })

  it("con sede: los días de cada uno son los de ESA sede, y sin horario en la sede no hay a quién elegir", async () => {
    escenario({
      sede: [sedeDelNegocio(CENTRO, "Centro", 0), sedeDelNegocio(PROVIDENCIA, "Providencia", 1)],
      // Centro atiende el lunes y el martes; Carla, en su propio horario de Centro, sólo el martes.
      workSchedule: [
        general("h-c-lun", 1, CENTRO),
        general("h-c-mar", 2, CENTRO),
        general("h-carla-mar", 2, CENTRO, { memberId: "m-carla" }),
        general("h-p-jue", 4, PROVIDENCIA),
      ],
      cita: { sedeId: CENTRO },
    })

    const { cuerpo } = await ver()

    expect(cuerpo.profesionales.map((profesional: Registro) => [profesional.id, profesional.diasConAtencion])).toEqual([
      ["m-carla", [2]],
      ["m-pedro", [1, 2]],
    ])

    // Una sede sin ningún horario: nadie atiende ahí, nada que elegir.
    escenario({
      sede: [sedeDelNegocio(CENTRO, "Centro", 0), sedeDelNegocio(PROVIDENCIA, "Providencia", 1)],
      workSchedule: [general("h-p-jue", 4, PROVIDENCIA)],
      cita: { sedeId: CENTRO },
    })
    expect((await ver()).cuerpo).not.toHaveProperty("profesionales")
  })
})

describe("disponibilidad con otro profesional", () => {
  it("con un id: las horas de ESA persona, no las de quien atiende hoy", async () => {
    // Carla tiene ocupadas las 09:00 del martes; Pedro, las 10:00.
    escenario({ otras: [ocupa("c-carla", "m-carla", "09:00"), ocupa("c-pedro", "m-pedro", "10:00")] })

    expect((await horas(MARTES)).cuerpo.slots).toEqual(["10:00", "10:30", "11:00"])
    expect((await horas(MARTES, "m-pedro")).cuerpo.slots).toEqual(["09:00", "11:00"])
    // Elegir a quien ya la atiende es lo mismo que no mandar nada.
    expect((await horas(MARTES, "m-carla")).cuerpo.slots).toEqual((await horas(MARTES)).cuerpo.slots)
  })

  it("'cualquiera' (profesionalId vacío): la hora que tenga libre alguno de los que pueden", async () => {
    escenario({
      otras: [
        ocupa("c-carla", "m-carla", "09:00"),
        ocupa("c-pedro", "m-pedro", "09:00"),
        ocupa("c-pedro-2", "m-pedro", "10:00"),
        // Diana no hace el Corte: ocupada o libre, no cuenta.
      ],
    })

    // A las 09:00 no hay nadie; a las 10:00 está libre Carla; a las 11:00 los dos.
    expect((await horas(MARTES, "")).cuerpo.slots).toEqual(["10:00", "10:30", "11:00"])
  })

  it.each([
    ["una profesional de otro negocio", "m-ajeno"],
    ["el encargado (no atiende)", "m-encargado"],
    ["alguien que no hace el servicio de la cita", "m-diana"],
    ["un id que no existe", "m-no-existe"],
  ])("%s: el mismo 404, sin decir por qué", async (_caso, id) => {
    escenario()
    const esperada = await horas(MARTES, "m-ajeno")

    const { status, cuerpo } = await horas(MARTES, id)

    expect(status).toBe(404)
    expect(cuerpo).toEqual(esperada.cuerpo)
    expect(JSON.stringify(cuerpo)).not.toContain(id)
  })

  it("un profesional que no atiende en la sede de la cita: 404, como si no existiera", async () => {
    // Centro no tiene ningún horario: sólo Providencia atiende. La cita es de Centro.
    escenario({
      sede: [sedeDelNegocio(CENTRO, "Centro", 0), sedeDelNegocio(PROVIDENCIA, "Providencia", 1)],
      workSchedule: [general("h-p-mar", 2, PROVIDENCIA)],
      cita: { sedeId: CENTRO },
    })

    expect((await horas(MARTES, "m-pedro")).status).toBe(404)
  })

  it("un id que no es un texto razonable: 400", async () => {
    escenario()

    expect((await horas(MARTES, "x".repeat(65))).status).toBe(400)
  })
})

describe("reagendar con otro profesional", () => {
  it("a otro día y hora con otro profesional: la cita queda con él, en la misma escritura, y se avisa a la dueña y a los dos", async () => {
    escenario()

    const { status, cuerpo } = await reagendar(MARTES, "11:00", "m-pedro")

    expect(status).toBe(200)
    expect(cuerpo).toMatchObject({ fecha: MARTES, hora: "11:00", profesional: "Pedro Profesional" })
    expect(laCita()).toMatchObject({ memberId: "m-pedro", startTime: aLas("11:00", MARTES), endTime: aLas("12:00", MARTES) })
    // Al de antes se le liberó la hora y al de ahora le llegó la cita.
    expect(destinatarios()).toEqual(["carla@uno.test", "duena@uno.test", "pedro@uno.test"])
    expect(correos.cambio).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: "reagendo", profesional: "Pedro Profesional", profesionalAnterior: "Carla Profesional", fechaAnterior: LUNES, horaAnterior: "10:00", fecha: MARTES, hora: "11:00" })
    )
  })

  it("sólo el profesional, con la misma fecha y hora: es un reagendo más (queda con él, y el recordatorio vuelve a salir)", async () => {
    escenario({ cita: { reminderSentAt: new Date("2030-01-06T13:00:00.000Z") } })

    const { status, cuerpo } = await reagendar(LUNES, "10:00", "m-pedro")

    expect(status).toBe(200)
    expect(cuerpo).toMatchObject({ fecha: LUNES, hora: "10:00", profesional: "Pedro Profesional" })
    expect(laCita()).toMatchObject({ memberId: "m-pedro", startTime: aLas("10:00"), endTime: aLas("11:00"), reminderSentAt: null })
  })

  it("el mismo plazo que cualquier cambio: fuera del plazo del negocio, 409 y la cita no se toca", async () => {
    escenario()
    base.reiniciar({ ...base.volcado(), business: base.volcado().business.map((negocio) => ({ ...negocio, cancelacionHorasAntes: 48 })) })
    vi.setSystemTime(new Date("2030-01-05T14:00:00.000Z"))

    const { status, cuerpo } = await reagendar(LUNES, "10:00", "m-pedro")

    expect(status).toBe(409)
    expect(cuerpo.error).toMatch(/48 horas antes/)
    expect(laCita().memberId).toBe("m-carla")
    expect(correos.cambio).not.toHaveBeenCalled()
  })

  it("sin `profesionalId` (o con quien ya la atiende) no cambia nada de eso: sigue con Carla", async () => {
    escenario()
    expect((await reagendar(MARTES, "11:00")).status).toBe(200)
    expect(laCita().memberId).toBe("m-carla")

    escenario()
    correos.cambio.mockClear()
    const { cuerpo } = await reagendar(MARTES, "11:00", "m-carla")
    expect(cuerpo.profesional).toBe("Carla Profesional")
    expect(laCita().memberId).toBe("m-carla")
    expect(destinatarios()).toEqual(["carla@uno.test", "duena@uno.test"])
    // Quien la atiende no cambió: el correo no trae "profesional anterior".
    for (const llamada of correos.cambio.mock.calls) expect(llamada[0]).not.toHaveProperty("profesionalAnterior")
  })

  it("'cualquiera' (`profesionalId: null`): con el criterio de la reserva, el que tenga menos citas ese día, y el id menor si empatan", async () => {
    // El martes nadie tiene citas: empatan y gana el de id menor (Carla).
    escenario()
    expect((await reagendar(MARTES, "11:00", null)).status).toBe(200)
    expect(laCita().memberId).toBe("m-carla")

    // Carla ya tiene una cita ese martes y Pedro ninguna: Pedro.
    escenario({ otras: [ocupa("c-carla", "m-carla", "09:00")] })
    const { cuerpo } = await reagendar(MARTES, "11:00", null)
    expect(cuerpo.profesional).toBe("Pedro Profesional")
    expect(laCita().memberId).toBe("m-pedro")
  })

  it("'cualquiera' sólo asigna a quien tiene libre esa hora: nunca a quien no hace el servicio", async () => {
    // Carla y Pedro ocupados a las 11:00; Diana (que no hace el Corte) está libre.
    escenario({ otras: [ocupa("c-carla", "m-carla", "11:00"), ocupa("c-pedro", "m-pedro", "11:00")] })

    const { status, cuerpo } = await reagendar(MARTES, "11:00", null)

    expect(status).toBe(409)
    expect(cuerpo.error).toBe("El horario ya no está disponible")
    expect(laCita()).toMatchObject({ memberId: "m-carla", startTime: aLas("10:00") })
  })

  it("lo que la disponibilidad ofrece con ese profesional, reagendar lo acepta; y lo que no ofrece, no", async () => {
    escenario({ otras: [ocupa("c-pedro", "m-pedro", "10:00")] })
    const { slots } = (await horas(MARTES, "m-pedro")).cuerpo
    expect(slots).toContain("09:00")
    expect(slots).not.toContain("10:00")

    expect((await reagendar(MARTES, "10:00", "m-pedro")).status).toBe(409)
    expect(laCita().memberId).toBe("m-carla")
    expect((await reagendar(MARTES, "09:00", "m-pedro")).status).toBe(200)
    expect(laCita()).toMatchObject({ memberId: "m-pedro", startTime: aLas("09:00", MARTES) })
  })

  it.each([
    ["una profesional de otro negocio", "m-ajeno"],
    ["el encargado (no atiende)", "m-encargado"],
    ["alguien que no hace el servicio de la cita", "m-diana"],
    ["un id que no existe", "m-no-existe"],
  ])("%s: el mismo 404, sin tocar la cita ni avisar a nadie", async (_caso, id) => {
    escenario()
    const antes = laCita()
    const esperada = await reagendar(MARTES, "11:00", "m-ajeno")

    const { status, cuerpo } = await reagendar(MARTES, "11:00", id)

    expect(status).toBe(404)
    expect(cuerpo).toEqual(esperada.cuerpo)
    expect(JSON.stringify(cuerpo)).not.toContain(id)
    expect(laCita()).toEqual(antes)
    expect(correos.cambio).not.toHaveBeenCalled()
  })

  it("un profesional que no atiende en la sede de la cita: 404, sin tocar la cita", async () => {
    escenario({
      sede: [sedeDelNegocio(CENTRO, "Centro", 0), sedeDelNegocio(PROVIDENCIA, "Providencia", 1)],
      workSchedule: [general("h-p-mar", 2, PROVIDENCIA)],
      cita: { sedeId: CENTRO },
    })

    expect((await reagendar(MARTES, "11:00", "m-pedro")).status).toBe(404)
    expect(laCita()).toMatchObject({ memberId: "m-carla", sedeId: CENTRO })
  })

  it("con sede, la hora nueva sigue siendo de ESA sede aunque cambie el profesional, y la cita conserva su sede", async () => {
    escenario({
      sede: [sedeDelNegocio(CENTRO, "Centro", 0), sedeDelNegocio(PROVIDENCIA, "Providencia", 1)],
      // Centro atiende lunes y martes de 09 a 12; Providencia, el jueves.
      workSchedule: [general("h-c-lun", 1, CENTRO), general("h-c-mar", 2, CENTRO), general("h-p-jue", 4, PROVIDENCIA)],
      cita: { sedeId: CENTRO },
    })

    expect((await reagendar("2030-01-10", "10:00", "m-pedro")).status).toBe(409)
    expect((await reagendar(MARTES, "10:00", "m-pedro")).status).toBe(200)
    expect(laCita()).toMatchObject({ memberId: "m-pedro", sedeId: CENTRO })
  })

  it.each([
    ["un número", 123],
    ["un objeto", { id: "m-pedro" }],
    ["un texto enorme", "m".repeat(65)],
  ])("`profesionalId` como %s: 400, sin tocar la cita", async (_caso, valor) => {
    escenario()

    expect((await reagendar(MARTES, "11:00", valor)).status).toBe(400)
    expect(laCita()).toMatchObject({ memberId: "m-carla", startTime: aLas("10:00") })
  })

  it("carrera por la misma hora: si entretanto se toma la hora de ese profesional, 409 y la cita sigue donde estaba", async () => {
    escenario()
    const transaccionReal = base.prisma.$transaction.getMockImplementation()!
    base.prisma.$transaction.mockImplementationOnce(async (fn: unknown, ...resto: unknown[]) => {
      // Entre que se leyó la disponibilidad y se escribe, otra reserva toma las 11:00 de Pedro.
      await base.prisma.appointment.create({ data: ocupa("c-otra", "m-pedro", "11:00") })
      return (transaccionReal as (...args: unknown[]) => unknown)(fn, ...resto)
    })

    const { status, cuerpo } = await reagendar(MARTES, "11:00", "m-pedro")

    expect(status).toBe(409)
    expect(cuerpo.error).toBe("El horario ya no está disponible")
    expect(laCita()).toMatchObject({ memberId: "m-carla", startTime: aLas("10:00") })
    expect(correos.cambio).not.toHaveBeenCalled()
  })

  it("si el local la pasó a otro profesional entretanto, este reagendo no lo deshace: el mismo 404 del enlace", async () => {
    escenario()
    const transaccionReal = base.prisma.$transaction.getMockImplementation()!
    base.prisma.$transaction.mockImplementationOnce(async (fn: unknown, ...resto: unknown[]) => {
      await base.prisma.appointment.updateMany({ where: { id: "c-lucia" }, data: { memberId: "m-pedro" } })
      return (transaccionReal as (...args: unknown[]) => unknown)(fn, ...resto)
    })

    const { status } = await reagendar(MARTES, "11:00")

    expect(status).toBe(404)
    expect(laCita()).toMatchObject({ memberId: "m-pedro", startTime: aLas("10:00") })
  })

  it("un token de otro negocio no deja elegir a los profesionales de éste: el enlace sólo ve su negocio", async () => {
    // La cita es del otro negocio y el slug es el de éste: ni se encuentra.
    escenario({ cita: { businessId: OTRO_NEGOCIO, serviceId: "s-ajeno", memberId: "m-ajeno", customerId: "c-ajeno" } })

    expect((await reagendar(MARTES, "11:00", "m-pedro")).status).toBe(404)
    expect((await ver()).status).toBe(404)
  })
})
