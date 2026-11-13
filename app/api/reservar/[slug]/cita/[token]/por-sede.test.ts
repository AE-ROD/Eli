import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { NextRequest } from "next/server"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, OTRO_NEGOCIO, datosBase } from "@/pruebas/datos"
import { generarToken } from "@/lib/tokens"
import { cuerpoDePrueba } from "@/pruebas/pedidos"

/**
 * El enlace para cancelar o reagendar con sedes (etapa 9, plan Independiente): la
 * cita de una sede muestra su nombre y dirección, y reagendar ofrece y acepta
 * sólo horas de ESA sede (no cambia de sede: para eso se cancela y se reserva de
 * nuevo). Una cita sin sede (la de un negocio de antes) es la de siempre.
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
const AJENA = "sede-ajena"

const { token: TOKEN, tokenHash: HASH } = generarToken()
const { token: TOKEN_AJENO, tokenHash: HASH_AJENO } = generarToken()

type Registro = Record<string, unknown>

const franja = (id: string, businessId: string, sedeId: string, dayOfWeek: number, startTime: string, endTime: string) => ({
  id,
  businessId,
  memberId: null,
  sedeId,
  dayOfWeek,
  startTime,
  endTime,
})

/**
 * Un negocio Independiente (sin equipo) con dos sedes: Centro (lunes 09–12) y
 * Providencia (lunes y martes 14–18). Una cita del lunes a las 10:00 en la sede
 * que se pida (o sin sede). Corte de 60 minutos.
 */
function escenario({ sedeId = CENTRO as string | null } = {}) {
  const datos = datosBase()
  base.reiniciar({
    ...datos,
    business: datos.business.map((negocio) => ({ ...negocio, plan: "independiente" })),
    businessMember: [],
    service: datos.service.map((servicio) => (servicio.id === "s-corte" ? { ...servicio, duration: 60 } : servicio)),
    sede: [
      { id: CENTRO, businessId: NEGOCIO, nombre: "Centro", direccion: "Av. Italia 1234", comuna: "Providencia", telefono: "+56912345678", orden: 0 },
      { id: PROVIDENCIA, businessId: NEGOCIO, nombre: "Ñuñoa", direccion: "Irarrázaval 500", comuna: "Ñuñoa", orden: 1 },
      { id: AJENA, businessId: OTRO_NEGOCIO, nombre: "Ajena", direccion: "Otra 1", comuna: "Maipú" },
    ],
    workSchedule: [
      franja("h-centro", NEGOCIO, CENTRO, 1, "09:00", "12:00"),
      franja("h-prov-lun", NEGOCIO, PROVIDENCIA, 1, "14:00", "18:00"),
      franja("h-prov-mar", NEGOCIO, PROVIDENCIA, 2, "14:00", "18:00"),
      franja("h-ajena", OTRO_NEGOCIO, AJENA, 1, "09:00", "12:00"),
    ],
    appointment: [
      {
        id: "c-lucia",
        businessId: NEGOCIO,
        serviceId: "s-corte",
        title: "Corte",
        memberId: null,
        customerId: "c-maria",
        source: "reserva-publica",
        startTime: aLas("10:00"),
        endTime: aLas("11:00"),
        manageTokenHash: HASH,
        ...(sedeId ? { sedeId } : {}),
      },
      {
        id: "c-ajena",
        businessId: OTRO_NEGOCIO,
        title: "Corte",
        memberId: null,
        sedeId: AJENA,
        startTime: aLas("10:00"),
        endTime: aLas("11:00"),
        manageTokenHash: HASH_AJENO,
      },
    ] satisfies Registro[],
  })
}

const params = (token = TOKEN, slug = "salon-uno") => ({ params: Promise.resolve({ slug, token }) })
const pedido = (url = "http://localhost/x", cuerpo?: unknown) =>
  ({ url, headers: new Headers(), body: cuerpoDePrueba(cuerpo) }) as unknown as NextRequest

async function ver(token = TOKEN, slug = "salon-uno") {
  const { GET } = await import("./route")
  const respuesta = await GET(pedido(), params(token, slug))
  return { status: respuesta.status, cuerpo: await respuesta.json() }
}

async function cancelar() {
  const { POST } = await import("./cancelar/route")
  const respuesta = await POST(pedido(), params())
  return { status: respuesta.status, cuerpo: await respuesta.json() }
}

async function reagendar(fecha: string, hora: string) {
  const { POST } = await import("./reagendar/route")
  const respuesta = await POST(pedido("http://localhost/x", { fecha, hora }), params())
  return { status: respuesta.status, cuerpo: await respuesta.json() }
}

async function horas(fecha: string) {
  const { GET } = await import("./disponibilidad/route")
  const respuesta = await GET(pedido(`http://localhost/x?fecha=${fecha}`), params())
  return { status: respuesta.status, cuerpo: await respuesta.json() }
}

const laCita = () => base.buscar("appointment", { id: "c-lucia" })[0]

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

const LUGAR_DEL_CENTRO = { nombre: "Centro", direccion: "Av. Italia 1234", comuna: "Providencia" }

describe("GET: ver una cita con sede", () => {
  it("dice la sede, su dirección y cómo llegar a ESA dirección, y los días son los de la sede", async () => {
    escenario()

    const { status, cuerpo } = await ver()

    expect(status).toBe(200)
    expect(cuerpo.sede).toEqual({
      ...LUGAR_DEL_CENTRO,
      mapas: {
        googleMaps: "https://www.google.com/maps/search/?api=1&query=Av.%20Italia%201234%2C%20Providencia",
        waze: "https://waze.com/ul?q=Av.%20Italia%201234%2C%20Providencia",
      },
    })
    // Centro sólo atiende los lunes; el martes de Providencia no se ofrece.
    expect(cuerpo.diasConAtencion).toEqual([1])
    // Ni ids ni el teléfono de la sede ni nada de otro negocio.
    expect(JSON.stringify(cuerpo)).not.toMatch(/sede-|\+569|Ajena/)
  })

  it("una cita de otra sede muestra la suya, no la del negocio entero", async () => {
    escenario({ sedeId: PROVIDENCIA })

    const { cuerpo } = await ver()

    expect(cuerpo.sede).toMatchObject({ nombre: "Ñuñoa", direccion: "Irarrázaval 500", comuna: "Ñuñoa" })
    expect(cuerpo.diasConAtencion).toEqual([1, 2])
  })

  it("una cita sin sede es la de siempre: sin `sede` y con los días vigentes del negocio", async () => {
    escenario({ sedeId: null })

    const { cuerpo } = await ver()

    expect(cuerpo).not.toHaveProperty("sede")
    expect(cuerpo.diasConAtencion).toEqual([1, 2])
  })

  it("el enlace es del negocio del slug: con otro slug, el mismo 404 de siempre", async () => {
    escenario()

    expect((await ver(TOKEN, "salon-dos")).status).toBe(404)
    expect((await ver(TOKEN_AJENO, "salon-uno")).status).toBe(404)
    // El de la otra cita, con su slug, muestra SU sede.
    expect((await ver(TOKEN_AJENO, "salon-dos")).cuerpo.sede).toMatchObject({ nombre: "Ajena" })
  })
})

describe("disponibilidad y reagendar: sólo horas de la sede de la cita", () => {
  it("ofrece las horas de esa sede (la propia cita no se ocupa a sí misma) y ninguna de otra", async () => {
    escenario()

    expect((await horas(LUNES)).cuerpo).toEqual({ slots: ["09:00", "09:30", "10:00", "10:30", "11:00"] })
    // El martes sólo atiende Providencia: la cita es del Centro, no hay horas.
    expect((await horas(MARTES)).cuerpo).toEqual({ slots: [], mensaje: "No hay atención ese día" })
  })

  it("reagenda a otra hora de la misma sede y la cita conserva su sede", async () => {
    escenario()

    const { status, cuerpo } = await reagendar(LUNES, "11:00")

    expect(status).toBe(200)
    expect(cuerpo).toMatchObject({ fecha: LUNES, hora: "11:00" })
    expect(laCita()).toMatchObject({ sedeId: CENTRO, startTime: aLas("11:00"), endTime: aLas("12:00") })
  })

  it.each([
    ["una hora que sólo atiende otra sede, el mismo día", LUNES, "14:00"],
    ["un día en que sólo atiende otra sede", MARTES, "14:00"],
  ])("rechaza %s: 409 y la cita no se mueve ni cambia de sede", async (_caso, fecha, hora) => {
    escenario()

    const { status, cuerpo } = await reagendar(fecha, hora)

    expect(status).toBe(409)
    expect(cuerpo.error).toMatch(/fuera de la atención/)
    expect(laCita()).toMatchObject({ sedeId: CENTRO, startTime: aLas("10:00") })
  })

  it("una cita sin sede reagenda como siempre: con el horario vigente de todas las sedes", async () => {
    escenario({ sedeId: null })

    expect((await horas(LUNES)).cuerpo.slots).toContain("14:00")
    expect((await reagendar(LUNES, "14:00")).status).toBe(200)
    expect(laCita().sedeId ?? null).toBeNull()
  })
})

describe("los avisos al negocio dicen dónde es", () => {
  it("cancelar pasa la sede de la cita", async () => {
    escenario()

    expect((await cancelar()).status).toBe(200)
    expect(correos.cambio).toHaveBeenCalledWith(expect.objectContaining({ tipo: "cancelo", lugar: LUGAR_DEL_CENTRO }))
  })

  it("reagendar pasa la sede de la cita", async () => {
    escenario()

    expect((await reagendar(LUNES, "11:00")).status).toBe(200)
    expect(correos.cambio).toHaveBeenCalledWith(expect.objectContaining({ tipo: "reagendo", lugar: LUGAR_DEL_CENTRO }))
  })

  it("una cita sin sede no lleva `lugar`: el correo es el de siempre", async () => {
    escenario({ sedeId: null })

    await cancelar()

    expect(correos.cambio).toHaveBeenCalledWith(expect.not.objectContaining({ lugar: expect.anything() }))
  })
})
