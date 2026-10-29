import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { NextRequest } from "next/server"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, OTRO_NEGOCIO, datosBase } from "@/pruebas/datos"
import { generarToken } from "@/lib/tokens"

/**
 * Varios servicios por reserva (#89a): hasta 4, del mismo profesional y
 * seguidos. La duración y el precio son la suma, calculada en el servidor; el
 * profesional tiene que hacer todos; lo ajeno o inactivo es un 404 uniforme.
 * La cita guarda una fila por servicio, y el enlace de gestión mueve el
 * bloque entero.
 */

const mockVerificarLimite = vi.fn()

vi.mock("@/lib/rate-limit", () => ({
  obtenerIp: () => "203.0.113.7",
  verificarLimite: (...args: unknown[]) => mockVerificarLimite(...args),
}))

const correos = vi.hoisted(() => ({
  confirmacion: vi.fn(async (..._args: unknown[]) => null),
  aviso: vi.fn(async (..._args: unknown[]) => null),
  cambio: vi.fn(async (..._args: unknown[]) => null),
}))

vi.mock("@/lib/email", () => ({
  enviarConfirmacionCliente: correos.confirmacion,
  enviarAvisoProfesional: correos.aviso,
  enviarAvisoDeCambioDelCliente: correos.cambio,
}))

const base = crearBaseFalsa()

vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

/** El lunes 7 de enero de 2030; Santiago en enero está en UTC-3. */
const FECHA = "2030-01-07"
const LUNES = 1
const aLas = (hora: string, fecha = FECHA) => new Date(`${fecha}T${hora}:00.000-03:00`)

type Registro = Record<string, unknown>

/**
 * Corte 60 min ($8.000), Color 30 min ($25.000), Peinado 15 min (sin precio),
 * Brushing 20 min ($5.000). Carla hace todo; Pedro sólo corte. Se atiende de
 * 9 a 13, de lunes a domingo.
 */
function escenario(extra: { appointment?: Registro[]; appointmentService?: Registro[]; memberService?: Registro[] } = {}) {
  const datos = datosBase()
  const duraciones: Record<string, number> = { "s-corte": 60, "s-color": 30, "s-peinado": 15 }
  base.reiniciar({
    ...datos,
    service: [
      ...datos.service.map((servicio) => ({ ...servicio, duration: duraciones[servicio.id as string] ?? 30 })),
      { id: "s-brushing", businessId: NEGOCIO, name: "Brushing", price: 5000, duration: 20 },
    ],
    workSchedule: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
      id: `h-${dayOfWeek}`,
      businessId: NEGOCIO,
      memberId: null,
      dayOfWeek,
      startTime: "09:00",
      endTime: "13:00",
    })),
    memberService: extra.memberService ?? [{ id: "ms-1", businessId: NEGOCIO, memberId: "m-pedro", serviceId: "s-corte" }],
    appointment: extra.appointment ?? [],
    appointmentService: extra.appointmentService ?? [],
  })
}

const conSlug = (slug = "salon-uno") => ({ params: Promise.resolve({ slug }) })
const pedido = (url: string, cuerpo?: unknown) =>
  ({ url, headers: new Headers(), json: async () => cuerpo }) as unknown as NextRequest

async function horas(consulta: string, slug = "salon-uno") {
  const { GET } = await import("./disponibilidad/route")
  const respuesta = await GET(
    pedido(`http://localhost/api/reservar/${slug}/disponibilidad?fecha=${FECHA}&${consulta}`),
    conSlug(slug)
  )
  return { status: respuesta.status, cuerpo: await respuesta.json() }
}

async function confirmar(extra: Registro, slug = "salon-uno") {
  const { POST } = await import("./confirmar/route")
  const cuerpo = { fecha: FECHA, hora: "09:00", nombre: "Lucía", apellido: "Pérez", email: "lucia@correo.test", ...extra }
  const respuesta = await POST(pedido("http://localhost/x", cuerpo), conSlug(slug))
  return { status: respuesta.status, cuerpo: await respuesta.json() }
}

const reservasPublicas = () => base.buscar("appointment", { source: "reserva-publica" })
const filasDe = (appointmentId: string) =>
  base.buscar("appointmentService", { appointmentId }).sort((a, b) => (a.orden as number) - (b.orden as number))

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date("2030-01-01T12:00:00.000Z"))
  mockVerificarLimite.mockResolvedValue({ permitido: true, restantes: 9 })
})

afterEach(() => {
  vi.useRealTimers()
})

describe("disponibilidad con varios servicios", () => {
  it("las horas son de un bloque de la suma de las duraciones", async () => {
    escenario()
    // Corte + Color = 90 minutos: de 9 a 13 entran 9:00 y 10:30 (y 12:00 no).
    const { status, cuerpo } = await horas("servicioIds=s-corte,s-color&profesionalId=m-carla")
    expect(status).toBe(200)
    expect(cuerpo.slots).toEqual(["09:00", "10:30"])
  })

  it("servicioId suelto sigue valiendo: es uno solo", async () => {
    escenario()
    const { status, cuerpo } = await horas("servicioId=s-corte&profesionalId=m-carla")
    expect(status).toBe(200)
    expect(cuerpo.slots).toEqual(["09:00", "10:00", "11:00", "12:00"])
  })

  it("un profesional que no hace uno de los servicios queda fuera: elegido es 404", async () => {
    escenario()
    expect((await horas("servicioIds=s-corte,s-color&profesionalId=m-pedro")).status).toBe(404)
    // Sólo corte, Pedro sí.
    expect((await horas("servicioIds=s-corte&profesionalId=m-pedro")).status).toBe(200)
  })

  it("aislamiento: un servicio de otro negocio o inactivo, entre los pedidos, es el mismo 404", async () => {
    escenario()
    const ajeno = await horas("servicioIds=s-corte,s-ajeno")
    const inactivo = await horas("servicioIds=s-corte,s-viejo")
    const inventado = await horas("servicioIds=s-corte,s-no-existe")
    expect([ajeno.status, inactivo.status, inventado.status]).toEqual([404, 404, 404])
    expect(ajeno.cuerpo).toEqual(inactivo.cuerpo)
    expect(ajeno.cuerpo).toEqual(inventado.cuerpo)
    // Y el servicio propio pedido desde el otro negocio, también.
    expect((await horas("servicioIds=s-corte", "salon-dos")).status).toBe(404)
  })

  it("más de 4 servicios o uno repetido: 400", async () => {
    escenario()
    expect((await horas("servicioIds=s-corte,s-color,s-peinado,s-brushing,s-viejo")).status).toBe(400)
    expect((await horas("servicioIds=s-corte,s-corte")).status).toBe(400)
    expect((await horas("servicioIds=")).status).toBe(400)
    expect((await horas("servicioIds=s-corte&servicioId=s-color")).status).toBe(400)
  })
})

describe("confirmar con varios servicios", () => {
  it("una cita con la suma: endTime, precio, title con ' + ', serviceId el primero y una fila por servicio", async () => {
    escenario()
    const { status, cuerpo } = await confirmar({ servicioIds: ["s-color", "s-corte", "s-peinado"], profesionalId: "m-carla" })

    expect(status).toBe(201)
    const [cita] = reservasPublicas()
    expect(cita).toMatchObject({
      id: cuerpo.citaId,
      businessId: NEGOCIO,
      serviceId: "s-color",
      title: "Color + Corte + Peinado",
      memberId: "m-carla",
      // 30 + 60 + 15 minutos.
      startTime: aLas("09:00"),
      endTime: aLas("10:45"),
      // Peinado no tiene precio: se suma lo que hay.
      price: 33000,
    })
    expect(filasDe(cita.id as string).map(({ businessId, serviceId, serviceName, duration, price, orden }) => ({
      businessId,
      serviceId,
      serviceName,
      duration,
      price,
      orden,
    }))).toEqual([
      { businessId: NEGOCIO, serviceId: "s-color", serviceName: "Color", duration: 30, price: 25000, orden: 1 },
      { businessId: NEGOCIO, serviceId: "s-corte", serviceName: "Corte", duration: 60, price: 8000, orden: 2 },
      { businessId: NEGOCIO, serviceId: "s-peinado", serviceName: "Peinado", duration: 15, price: null, orden: 3 },
    ])
  })

  it("nunca confía en precio ni duración del cliente", async () => {
    escenario()
    const { status } = await confirmar({ servicioIds: ["s-corte", "s-color"], precio: 1, price: 1, duracion: 5, endTime: "x" })
    expect(status).toBe(201)
    const [cita] = reservasPublicas()
    expect(cita.price).toBe(33000)
    expect(cita.endTime).toEqual(aLas("10:30"))
  })

  it("los correos dicen todos los servicios y la duración total", async () => {
    escenario()
    await confirmar({ servicioIds: ["s-corte", "s-color"] })
    expect(correos.confirmacion).toHaveBeenCalledWith(expect.objectContaining({ servicio: "Corte + Color", duracion: 90 }))
    expect(correos.aviso).toHaveBeenCalledWith(expect.objectContaining({ servicio: "Corte + Color" }))
  })

  it("con cualquiera, va a quien hace todos: Pedro (sólo corte) queda fuera aunque tenga menos citas", async () => {
    escenario({
      appointment: [
        { id: "c-otra", businessId: NEGOCIO, memberId: "m-carla", title: "Corte", startTime: aLas("12:00"), endTime: aLas("13:00") },
      ],
    })
    const { status } = await confirmar({ servicioIds: ["s-corte", "s-color"] })
    expect(status).toBe(201)
    expect(reservasPublicas()[0].memberId).toBe("m-carla")
  })

  it("con el profesional elegido que no hace uno de los servicios: 404 y no crea nada", async () => {
    escenario()
    const { status } = await confirmar({ servicioIds: ["s-corte", "s-color"], profesionalId: "m-pedro" })
    expect(status).toBe(404)
    expect(reservasPublicas()).toHaveLength(0)
    expect(base.buscar("appointmentService")).toHaveLength(0)
  })

  it("el bloque entero tiene que estar libre: una cita a mitad del bloque lo rechaza", async () => {
    escenario({
      appointment: [
        { id: "c-otra", businessId: NEGOCIO, memberId: "m-carla", title: "Corte", startTime: aLas("10:00"), endTime: aLas("10:30") },
      ],
    })
    const { status } = await confirmar({ servicioIds: ["s-corte", "s-color"], profesionalId: "m-carla" })
    expect(status).toBe(409)
    expect(reservasPublicas()).toHaveLength(0)
  })

  it("aislamiento: un servicio de otro negocio o inactivo es el mismo 404 y no escribe nada", async () => {
    escenario()
    const antes = base.volcado()
    const ajeno = await confirmar({ servicioIds: ["s-corte", "s-ajeno"] })
    const inactivo = await confirmar({ servicioIds: ["s-corte", "s-viejo"] })
    expect([ajeno.status, inactivo.status]).toEqual([404, 404])
    expect(ajeno.cuerpo).toEqual(inactivo.cuerpo)
    expect(base.volcado()).toEqual(antes)
  })

  it("tope de 4: con 5 es 400; con 4 se reserva", async () => {
    escenario()
    const cinco = await confirmar({ servicioIds: ["s-corte", "s-color", "s-peinado", "s-brushing", "s-viejo"] })
    expect(cinco.status).toBe(400)
    expect(cinco.cuerpo.error).toMatch(/hasta 4/)
    const cuatro = await confirmar({ servicioIds: ["s-corte", "s-color", "s-peinado", "s-brushing"] })
    expect(cuatro.status).toBe(201)
    expect(filasDe(cuatro.cuerpo.citaId)).toHaveLength(4)
  })

  it("repetidos, vacío o los dos campos a la vez: 400 y no escribe nada", async () => {
    escenario()
    const antes = base.volcado()
    expect((await confirmar({ servicioIds: ["s-corte", "s-corte"] })).status).toBe(400)
    expect((await confirmar({ servicioIds: [] })).status).toBe(400)
    expect((await confirmar({})).status).toBe(400)
    expect((await confirmar({ servicioIds: ["s-corte"], servicioId: "s-color" })).status).toBe(400)
    expect(base.volcado()).toEqual(antes)
  })

  it("servicioId suelto (la página de antes) crea la cita de un servicio, con su fila", async () => {
    escenario()
    const { status, cuerpo } = await confirmar({ servicioId: "s-corte" })
    expect(status).toBe(201)
    expect(reservasPublicas()[0]).toMatchObject({ title: "Corte", serviceId: "s-corte", price: 8000, endTime: aLas("10:00") })
    expect(filasDe(cuerpo.citaId)).toHaveLength(1)
  })
})

describe("el enlace de gestión con varios servicios", () => {
  const { token: TOKEN, tokenHash: HASH } = generarToken()
  const params = { params: Promise.resolve({ slug: "salon-uno", token: TOKEN }) }

  /** Una cita de Corte + Color (90 min) el lunes a las 9, con sus filas. */
  function conCitaDeDos(filas: Registro[] = FILAS) {
    escenario({
      appointment: [
        {
          id: "c-lucia",
          businessId: NEGOCIO,
          serviceId: "s-corte",
          title: "Corte + Color",
          memberId: "m-carla",
          customerId: "c-maria",
          source: "reserva-publica",
          startTime: aLas("09:00"),
          endTime: aLas("10:30"),
          manageTokenHash: HASH,
        },
      ],
      appointmentService: filas,
    })
  }
  const FILAS: Registro[] = [
    { id: "as-1", appointmentId: "c-lucia", businessId: NEGOCIO, serviceId: "s-corte", serviceName: "Corte", duration: 60, price: 8000, orden: 1 },
    { id: "as-2", appointmentId: "c-lucia", businessId: NEGOCIO, serviceId: "s-color", serviceName: "Color", duration: 30, price: 25000, orden: 2 },
  ]

  it("muestra todos los servicios y la duración total", async () => {
    conCitaDeDos()
    const { GET } = await import("./cita/[token]/route")
    const cuerpo = await (await GET(pedido("http://localhost/x"), params)).json()
    expect(cuerpo.servicio).toEqual({ nombre: "Corte + Color", duracion: 90 })
    expect(cuerpo.sePuedeReagendar).toBe(true)
  })

  it("las horas para reagendar son del bloque entero, con la duración copiada al reservar", async () => {
    // Aunque el catálogo cambie después (Color pasa a 120 min), manda lo copiado.
    conCitaDeDos()
    await base.prisma.service.update({ where: { id: "s-color" }, data: { duration: 120 } })
    const { GET } = await import("./cita/[token]/disponibilidad/route")
    const cuerpo = await (await GET(pedido("http://localhost/x?fecha=2030-01-08"), params)).json()
    expect(cuerpo.slots).toEqual(["09:00", "10:30"])
  })

  it("reagendar mueve el bloque entero: endTime = inicio + la suma", async () => {
    conCitaDeDos()
    const { POST } = await import("./cita/[token]/reagendar/route")
    const respuesta = await POST(pedido("http://localhost/x", { fecha: "2030-01-08", hora: "10:30" }), params)
    expect(respuesta.status).toBe(200)
    const [cita] = base.buscar("appointment", { id: "c-lucia" })
    expect(cita.startTime).toEqual(aLas("10:30", "2030-01-08"))
    expect(cita.endTime).toEqual(aLas("12:00", "2030-01-08"))
    expect(correos.cambio).toHaveBeenCalledWith(expect.objectContaining({ servicio: "Corte + Color" }))
    // Las filas siguen siendo las mismas.
    expect(filasDe("c-lucia")).toHaveLength(2)
  })

  it("H4: si en el panel se alargó la cita, el bloque al reagendar es el de hoy, no la suma", async () => {
    // Las filas suman 90 min; la cita dura 2 horas (alargada en el panel).
    conCitaDeDos()
    await base.prisma.appointment.update({ where: { id: "c-lucia" }, data: { endTime: aLas("11:00") } })
    const { GET } = await import("./cita/[token]/disponibilidad/route")
    const cuerpo = await (await GET(pedido("http://localhost/x?fecha=2030-01-08"), params)).json()
    // De 9 a 13, en bloques de 120 min (con la suma serían 9:00 y 10:30).
    expect(cuerpo.slots).toEqual(["09:00", "11:00"])

    const { POST } = await import("./cita/[token]/reagendar/route")
    // 11:30 + 90 cabe antes de las 13:00; 11:30 + 120, no.
    expect((await POST(pedido("http://localhost/x", { fecha: "2030-01-08", hora: "11:30" }), params)).status).toBe(409)
    const respuesta = await POST(pedido("http://localhost/x", { fecha: "2030-01-08", hora: "09:00" }), params)
    expect(respuesta.status).toBe(200)
    const [cita] = base.buscar("appointment", { id: "c-lucia" })
    expect(cita.endTime).toEqual(aLas("11:00", "2030-01-08"))
  })

  it("si un servicio se desactivó o se borró, sólo se cancela", async () => {
    conCitaDeDos()
    await base.prisma.service.update({ where: { id: "s-color" }, data: { active: false } })
    const { POST } = await import("./cita/[token]/reagendar/route")
    expect((await POST(pedido("http://localhost/x", { fecha: "2030-01-08", hora: "09:00" }), params)).status).toBe(409)

    conCitaDeDos([FILAS[0], { ...FILAS[1], serviceId: null }])
    const { GET } = await import("./cita/[token]/route")
    expect((await (await GET(pedido("http://localhost/x"), params)).json()).sePuedeReagendar).toBe(false)
  })

  it("una cita de antes, sin filas, se reagenda como siempre: con la duración de su servicio", async () => {
    conCitaDeDos([])
    const { POST } = await import("./cita/[token]/reagendar/route")
    const respuesta = await POST(pedido("http://localhost/x", { fecha: "2030-01-08", hora: "11:00" }), params)
    expect(respuesta.status).toBe(200)
    const [cita] = base.buscar("appointment", { id: "c-lucia" })
    // Corte: 60 minutos.
    expect(cita.endTime).toEqual(aLas("12:00", "2030-01-08"))
  })
})

describe("aislamiento en la base falsa", () => {
  it("una fila con la cita o el servicio de otro negocio no se puede crear (FK compuesta y trigger)", async () => {
    escenario({
      appointment: [{ id: "c-uno", businessId: NEGOCIO, title: "Corte", startTime: aLas("09:00"), endTime: aLas("10:00") }],
    })
    await expect(
      base.prisma.appointmentService.create({
        data: { appointmentId: "c-uno", businessId: OTRO_NEGOCIO, serviceId: "s-ajeno", serviceName: "Corte", duration: 60, orden: 1 },
      })
    ).rejects.toMatchObject({ code: "P2003" })
    await expect(
      base.prisma.appointmentService.create({
        data: { appointmentId: "c-uno", businessId: NEGOCIO, serviceId: "s-ajeno", serviceName: "Corte", duration: 60, orden: 1 },
      })
    ).rejects.toMatchObject({ code: "P2003" })
  })
})
