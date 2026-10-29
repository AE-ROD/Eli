import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { NextRequest } from "next/server"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, OTRO_NEGOCIO, datosBase } from "@/pruebas/datos"
import { generarToken } from "@/lib/tokens"

/**
 * Precios de hora valle en la reserva pública (#89c). Es opcional: apagada,
 * nada cambia. Encendida, la disponibilidad marca las horas con rebaja,
 * `confirmar` recalcula en el servidor y guarda los precios ya rebajados, y
 * reagendar por el enlace recalcula si la hora nueva tiene otro %.
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

const base = crearBaseFalsa()

vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

/** El lunes 7 de enero de 2030; Santiago en enero está en UTC-3. */
const FECHA = "2030-01-07"
const LUNES = 1
const aLas = (hora: string, fecha = FECHA) => new Date(`${fecha}T${hora}:00.000-03:00`)

type Registro = Record<string, unknown>

/**
 * Corte 60 min ($8.000), Color 60 min ($25.000, excluido de hora valle),
 * Peinado 60 min (sin precio). Se atiende de 9 a 13 todos los días. Hora
 * valle del negocio: lunes de 10:00 a 12:00, 20%. El otro negocio tiene una
 * franja del lunes de 9:00 a 10:00 con 50%: nunca tiene que contar acá.
 */
function escenario({ activa = true, appointment = [], appointmentService = [] }: { activa?: boolean; appointment?: Registro[]; appointmentService?: Registro[] } = {}) {
  const datos = datosBase()
  base.reiniciar({
    ...datos,
    business: datos.business.map((negocio) => ({ ...negocio, horaValleActiva: negocio.id === NEGOCIO ? activa : true })),
    service: datos.service.map((servicio) => ({
      ...servicio,
      duration: 60,
      excluidoDeHoraValle: servicio.id === "s-color",
    })),
    workSchedule: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
      id: `h-${dayOfWeek}`,
      businessId: NEGOCIO,
      memberId: null,
      dayOfWeek,
      startTime: "09:00",
      endTime: "13:00",
    })),
    franjaDeHoraValle: [
      { id: "f-1", businessId: NEGOCIO, dayOfWeek: LUNES, desde: "10:00", hasta: "12:00", porcentaje: 20 },
      { id: "f-ajena", businessId: OTRO_NEGOCIO, dayOfWeek: LUNES, desde: "09:00", hasta: "10:00", porcentaje: 50 },
    ],
    appointment,
    appointmentService,
  })
}

const conSlug = (slug = "salon-uno") => ({ params: Promise.resolve({ slug }) })
const pedido = (url: string, cuerpo?: unknown) =>
  ({ url, headers: new Headers(), json: async () => cuerpo }) as unknown as NextRequest

async function horas(consulta: string) {
  const { GET } = await import("./disponibilidad/route")
  const respuesta = await GET(pedido(`http://localhost/api/reservar/salon-uno/disponibilidad?fecha=${FECHA}&${consulta}`), conSlug())
  return { status: respuesta.status, cuerpo: await respuesta.json() }
}

async function confirmar(extra: Registro) {
  const { POST } = await import("./confirmar/route")
  const cuerpo = { fecha: FECHA, hora: "10:00", nombre: "Lucía", apellido: "Pérez", email: "lucia@correo.test", ...extra }
  const respuesta = await POST(pedido("http://localhost/x", cuerpo), conSlug())
  return { status: respuesta.status, cuerpo: await respuesta.json() }
}

const reservaPublica = () => base.buscar("appointment", { source: "reserva-publica" })[0]
const preciosDeLasFilas = (appointmentId: string) =>
  base
    .buscar("appointmentService", { appointmentId })
    .sort((a, b) => (a.orden as number) - (b.orden as number))
    .map((fila) => fila.price)

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date("2030-01-01T12:00:00.000Z"))
  mockVerificarLimite.mockResolvedValue({ permitido: true, restantes: 9 })
})

afterEach(() => {
  vi.useRealTimers()
})

describe("disponibilidad con hora valle", () => {
  it("apagada: la respuesta de siempre, sin `valle`", async () => {
    escenario({ activa: false })
    const { status, cuerpo } = await horas("servicioIds=s-corte")
    expect(status).toBe(200)
    expect(cuerpo).toEqual({ slots: ["09:00", "10:00", "11:00", "12:00"] })
  })

  it("encendida: `slots` igual y `valle` con las horas rebajadas y su precio", async () => {
    escenario()
    const { cuerpo } = await horas("servicioIds=s-corte")
    expect(cuerpo.slots).toEqual(["09:00", "10:00", "11:00", "12:00"])
    // La franja del otro negocio (9:00, 50%) no cuenta acá.
    expect(cuerpo.valle).toEqual([
      { hora: "10:00", precio: 6400, precioNormal: 8000, porcentaje: 20 },
      { hora: "11:00", precio: 6400, precioNormal: 8000, porcentaje: 20 },
    ])
  })

  it("un servicio excluido o sin precio no se rebaja: sin rebaja, sin `valle`", async () => {
    escenario()
    expect((await horas("servicioIds=s-color")).cuerpo.valle).toBeUndefined()
    expect((await horas("servicioIds=s-peinado")).cuerpo.valle).toBeUndefined()
    // Corte + Color (120 min, de 9:00 u 11:00): sólo baja el corte.
    const { cuerpo } = await horas("servicioIds=s-corte,s-color")
    expect(cuerpo.slots).toEqual(["09:00", "11:00"])
    expect(cuerpo.valle).toEqual([{ hora: "11:00", precio: 31400, precioNormal: 33000, porcentaje: 20 }])
  })
})

describe("confirmar con hora valle", () => {
  it("apagada: precio normal", async () => {
    escenario({ activa: false })
    const { status, cuerpo } = await confirmar({ servicioIds: ["s-corte", "s-color"] })
    expect(status).toBe(201)
    expect(reservaPublica().price).toBe(33000)
    expect(preciosDeLasFilas(cuerpo.citaId)).toEqual([8000, 25000])
  })

  it("en franja: la cita y cada fila con el precio ya rebajado (el excluido, entero)", async () => {
    escenario()
    const { status, cuerpo } = await confirmar({ servicioIds: ["s-corte", "s-color", "s-peinado"], hora: "10:00" })
    expect(status).toBe(201)
    expect(reservaPublica().price).toBe(6400 + 25000)
    expect(preciosDeLasFilas(cuerpo.citaId)).toEqual([6400, 25000, null])
  })

  it("fuera de franja: precio normal, aunque el otro negocio tenga franja a esa hora", async () => {
    escenario()
    await confirmar({ servicioIds: ["s-corte"], hora: "09:00" })
    expect(reservaPublica().price).toBe(8000)
  })

  it("ignora el precio que manda el cliente", async () => {
    escenario()
    await confirmar({ servicioIds: ["s-corte"], hora: "09:00", precio: 1, price: 1, rebaja: 90, porcentaje: 90 })
    expect(reservaPublica().price).toBe(8000)
  })
})

describe("reagendar por el enlace con hora valle", () => {
  const { token: TOKEN, tokenHash: HASH } = generarToken()
  const params = { params: Promise.resolve({ slug: "salon-uno", token: TOKEN }) }

  const cita = (hora: string, price: number): Registro => ({
    id: "c-lucia",
    businessId: NEGOCIO,
    serviceId: "s-corte",
    title: "Corte",
    customerId: "c-maria",
    source: "reserva-publica",
    startTime: aLas(hora),
    endTime: aLas(`${String(Number(hora.slice(0, 2)) + 1).padStart(2, "0")}:00`),
    price,
    manageTokenHash: HASH,
  })
  const fila = (price: number): Registro => ({
    id: "as-1",
    appointmentId: "c-lucia",
    businessId: NEGOCIO,
    serviceId: "s-corte",
    serviceName: "Corte",
    duration: 60,
    price,
    orden: 1,
  })

  async function horasParaReagendar() {
    const { GET } = await import("./cita/[token]/disponibilidad/route")
    return (await GET(pedido(`http://localhost/x?fecha=${FECHA}`), params)).json()
  }
  async function reagendar(hora: string) {
    const { POST } = await import("./cita/[token]/reagendar/route")
    const respuesta = await POST(pedido("http://localhost/x", { fecha: FECHA, hora }), params)
    return { status: respuesta.status, cuerpo: await respuesta.json() }
  }
  const laCita = () => base.buscar("appointment", { id: "c-lucia" })[0]

  it("la cita dice su precio de hoy", async () => {
    escenario({ appointment: [cita("09:00", 8000)], appointmentService: [fila(8000)] })
    const { GET } = await import("./cita/[token]/route")
    expect((await (await GET(pedido("http://localhost/x"), params)).json()).precio).toBe(8000)
  })

  it("las horas con otro precio vienen en `precios`, para mostrarlo antes de confirmar", async () => {
    escenario({ appointment: [cita("09:00", 8000)], appointmentService: [fila(8000)] })
    const cuerpo = await horasParaReagendar()
    expect(cuerpo.slots).toEqual(["09:00", "10:00", "11:00", "12:00"])
    expect(cuerpo.precios).toEqual([
      { hora: "10:00", precio: 6400, precioNormal: 8000, porcentaje: 20 },
      { hora: "11:00", precio: 6400, precioNormal: 8000, porcentaje: 20 },
    ])
  })

  it("de normal a valle baja, y de vuelta sube: la cita y su fila", async () => {
    escenario({ appointment: [cita("09:00", 8000)], appointmentService: [fila(8000)] })
    const aValle = await reagendar("10:00")
    expect(aValle.status).toBe(200)
    expect(aValle.cuerpo.precio).toBe(6400)
    expect(laCita().price).toBe(6400)
    expect(preciosDeLasFilas("c-lucia")).toEqual([6400])

    const aNormal = await reagendar("12:00")
    expect(aNormal.cuerpo.precio).toBe(8000)
    expect(laCita().price).toBe(8000)
    expect(preciosDeLasFilas("c-lucia")).toEqual([8000])
  })

  it("entre dos horas del mismo %: conserva el precio con que se reservó", async () => {
    escenario({ appointment: [cita("10:00", 6000)], appointmentService: [fila(6000)] })
    expect((await horasParaReagendar()).precios).toEqual([
      { hora: "09:00", precio: 8000, precioNormal: 6000, porcentaje: 0 },
      { hora: "12:00", precio: 8000, precioNormal: 6000, porcentaje: 0 },
    ])
    await reagendar("11:00")
    expect(laCita().price).toBe(6000)
    expect(preciosDeLasFilas("c-lucia")).toEqual([6000])
  })

  it("apagada: el precio no cambia y no hay `precios`", async () => {
    escenario({ activa: false, appointment: [cita("09:00", 7777)], appointmentService: [fila(7777)] })
    expect((await horasParaReagendar()).precios).toBeUndefined()
    await reagendar("10:00")
    expect(laCita().price).toBe(7777)
    expect(preciosDeLasFilas("c-lucia")).toEqual([7777])
  })

  it("una cita de antes, sin filas, se recalcula sobre su servicio de siempre", async () => {
    escenario({ appointment: [cita("09:00", 8000)] })
    expect((await reagendar("10:00")).status).toBe(200)
    expect(laCita().price).toBe(6400)
    expect(base.buscar("appointmentService")).toHaveLength(0)
  })
})
