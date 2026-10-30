import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest"
import type { NextRequest } from "next/server"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, OTRO_NEGOCIO, datosBase } from "@/pruebas/datos"
import { generarToken, hashDeToken } from "@/lib/tokens"

/**
 * La lista de espera de punta a punta (#74): inscribirse desde la reserva
 * pública, que una cancelación o un reagendar del cliente avise, que
 * confirmar la marque "reservó", y salir por el token del correo.
 */

const mockVerificarLimite = vi.fn()
vi.mock("@/lib/rate-limit", () => ({
  obtenerIp: () => "203.0.113.7",
  verificarLimite: (...args: unknown[]) => mockVerificarLimite(...args),
}))

const correos = vi.hoisted(() => ({
  aviso: vi.fn(async (..._args: unknown[]) => ({ data: { id: "correo" }, error: null })),
}))
vi.mock("@/lib/email", () => ({
  enviarConfirmacionCliente: vi.fn(async () => null),
  enviarAvisoProfesional: vi.fn(async () => null),
  enviarAvisoDeCambioDelCliente: vi.fn(async () => null),
  enviarAvisoListaDeEspera: correos.aviso,
}))

// `after` guarda la tarea: el test la corre cuando quiere, como Next después de responder.
const tareas = vi.hoisted(() => [] as Array<() => unknown>)
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  after: (tarea: () => unknown) => {
    tareas.push(tarea)
  },
}))

const base = crearBaseFalsa()
vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

beforeAll(() => {
  process.env.NEXTAUTH_SECRET = "secreto-de-prueba-de-la-lista-de-espera"
})

/** El lunes 7 de enero de 2030; Santiago en enero está en UTC-3. */
const LUNES = "2030-01-07"
const aLas = (hora: string, fecha = LUNES) => new Date(`${fecha}T${hora}:00.000-03:00`)
const AHORA = new Date("2030-01-02T12:00:00.000Z")
const { token: TOKEN_DE_GESTION, tokenHash: HASH_DE_GESTION } = generarToken()

type Registro = Record<string, unknown>

const cita = (id: string, hora: string, memberId: string, extra: Registro = {}) => ({
  id,
  businessId: NEGOCIO,
  serviceId: "s-corte",
  title: "Corte",
  memberId,
  source: "reserva-publica",
  startTime: aLas(hora),
  endTime: new Date(aLas(hora).getTime() + 3600_000),
  ...extra,
})

/** Carla y Pedro atienden de 9 a 11 todos los días; el lunes está lleno. */
function escenario({ negocio = {} as Registro, inscripciones = [] as Registro[], clientes = [] as Registro[] } = {}) {
  const datos = datosBase()
  base.reiniciar({
    ...datos,
    business: datos.business.map((b) => (b.id === NEGOCIO ? { ...b, ...negocio } : b)),
    service: datos.service.map((s) => (s.id === "s-corte" ? { ...s, duration: 60 } : s)),
    customer: [...datos.customer, ...clientes],
    workSchedule: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
      id: `h-${dayOfWeek}`,
      businessId: NEGOCIO,
      memberId: null,
      dayOfWeek,
      startTime: "09:00",
      endTime: "11:00",
    })),
    appointment: [
      cita("c9", "09:00", "m-carla", { customerId: "c-maria", manageTokenHash: HASH_DE_GESTION }),
      cita("c10", "10:00", "m-carla"),
      cita("p9", "09:00", "m-pedro"),
      cita("p10", "10:00", "m-pedro"),
    ],
    inscripcionEnEspera: inscripciones,
  })
}

const inscripcion = (id: string, extra: Registro = {}) => ({
  id,
  businessId: NEGOCIO,
  serviceId: "s-corte",
  fecha: LUNES,
  nombre: "Lucía",
  apellido: "Pérez",
  email: "lucia@correo.test",
  tokenHash: `hash-${id}`,
  ...extra,
})

const pedidoJson = (cuerpo: unknown) =>
  new Request("http://localhost/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(cuerpo),
  }) as unknown as NextRequest

async function inscribirse(extra: Registro = {}, slug = "salon-uno") {
  const { POST } = await import("./route")
  const cuerpo = { servicioId: "s-corte", fecha: LUNES, nombre: "Lucía", apellido: "Pérez", email: "Lucia@Correo.test", ...extra }
  const respuesta = await POST(pedidoJson(cuerpo), { params: Promise.resolve({ slug }) })
  return { status: respuesta.status, cuerpo: await respuesta.json() }
}

async function salir(token: string, slug = "salon-uno", cuerpo = "List-Unsubscribe=One-Click") {
  const { POST } = await import("./[token]/route")
  const pedido = new Request("http://localhost/x", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: cuerpo,
  }) as unknown as NextRequest
  const respuesta = await POST(pedido, { params: Promise.resolve({ slug, token }) })
  return { status: respuesta.status, cuerpo: await respuesta.json() }
}

async function confirmar(extra: Registro = {}) {
  const { POST } = await import("../confirmar/route")
  const cuerpo = { servicioId: "s-corte", fecha: LUNES, hora: "09:00", nombre: "Lucía", apellido: "Pérez", email: "LUCIA@correo.test", ...extra }
  const respuesta = await POST({ headers: new Headers(), json: async () => cuerpo } as unknown as NextRequest, {
    params: Promise.resolve({ slug: "salon-uno" }),
  })
  return { status: respuesta.status, cuerpo: await respuesta.json() }
}

const pedidoVacio = (cuerpo?: unknown) =>
  ({ url: "http://localhost/x", headers: new Headers(), json: async () => cuerpo }) as unknown as NextRequest
const gestion = { params: Promise.resolve({ slug: "salon-uno", token: TOKEN_DE_GESTION }) }

/** Corre lo que quedó programado con `after`. */
async function despuesDeResponder() {
  const pendientes = tareas.splice(0)
  for (const tarea of pendientes) await tarea()
}

const filas = (where?: Registro) => base.buscar("inscripcionEnEspera", where)

beforeEach(() => {
  vi.clearAllMocks()
  tareas.splice(0)
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(AHORA)
  mockVerificarLimite.mockResolvedValue({ permitido: true, restantes: 9 })
  escenario()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("inscribirse", () => {
  it("un día lleno: 201, y los dos límites (IP y negocio + email en hash)", async () => {
    const { status } = await inscribirse()
    expect(status).toBe(201)
    expect(filas()).toEqual([expect.objectContaining({ businessId: NEGOCIO, email: "lucia@correo.test", estado: "activa" })])
    expect(mockVerificarLimite).toHaveBeenCalledWith("reserva", "203.0.113.7")
    expect(mockVerificarLimite).toHaveBeenCalledWith("listaDeEspera", `${NEGOCIO}:${hashDeToken("lucia@correo.test")}`)
  })

  it("sin cupo en cualquiera de los límites: 429 y nada", async () => {
    const demasiadas = { status: 429, cuerpo: { error: "Demasiadas solicitudes, intenta más tarde" } }
    mockVerificarLimite.mockImplementation(async (tipo: string) => ({ permitido: tipo !== "listaDeEspera", restantes: 0 }))
    expect(await inscribirse()).toEqual(demasiadas)
    mockVerificarLimite.mockImplementation(async (tipo: string) => ({ permitido: tipo !== "reserva", restantes: 0 }))
    expect(await inscribirse()).toEqual(demasiadas)
    expect(filas()).toHaveLength(0)
  })

  it("negocio inexistente, lista apagada, servicio ajeno o profesional ajeno: el mismo 404", async () => {
    const respuestas = [
      await inscribirse({}, "no-existe"),
      await inscribirse({ servicioId: "s-ajeno" }),
      await inscribirse({ profesionalId: "m-ajeno" }),
    ]
    escenario({ negocio: { listaDeEsperaActiva: false } })
    respuestas.push(await inscribirse())
    for (const respuesta of respuestas) expect(respuesta).toEqual({ status: 404, cuerpo: { error: "No encontrado" } })
    expect(filas()).toHaveLength(0)
  })

  it("la cuarta inscripción activa del mismo email: el mismo 201 que un alta, sin crear la fila", async () => {
    const alta = await inscribirse()
    escenario({
      inscripciones: [
        inscripcion("i1", { fecha: "2030-01-08" }),
        inscripcion("i2", { fecha: "2030-01-09" }),
        inscripcion("i3", { fecha: "2030-01-10" }),
      ],
    })
    // No revela que ese email ya espera tres días en este negocio.
    expect(await inscribirse()).toEqual(alta)
    expect(filas()).toHaveLength(3)
  })

  it("el tope por email en todos los negocios (hash, sin negocio): el mismo 201 que un alta, sin crear la fila", async () => {
    const alta = await inscribirse()
    expect(mockVerificarLimite).toHaveBeenCalledWith("listaDeEsperaPorEmail", hashDeToken("lucia@correo.test"))
    escenario()
    mockVerificarLimite.mockImplementation(async (tipo: string) => ({ permitido: tipo !== "listaDeEsperaPorEmail", restantes: 0 }))
    expect(await inscribirse()).toEqual(alta)
    expect(filas()).toHaveLength(0)
  })

  it("sin email o con datos inválidos: 400", async () => {
    expect((await inscribirse({ email: "" })).status).toBe(400)
    expect((await inscribirse({ fecha: "mañana" })).status).toBe(400)
    expect(filas()).toHaveLength(0)
  })
})

describe("cuando se libera una hora", () => {
  it("el cliente cancela con su enlace: después de responder, se avisa a la lista", async () => {
    escenario({ inscripciones: [inscripcion("i1")] })
    const { POST } = await import("../cita/[token]/cancelar/route")
    expect((await POST(pedidoVacio(), gestion)).status).toBe(200)
    expect(correos.aviso).not.toHaveBeenCalled()

    await despuesDeResponder()
    expect(correos.aviso).toHaveBeenCalledTimes(1)
    expect(correos.aviso.mock.calls[0][0]).toMatchObject({ emailCliente: "lucia@correo.test", fecha: LUNES })
    expect(filas({ id: "i1" })[0]).toMatchObject({ avisos: 1 })
  })

  it("el cliente reagenda a otro día: se avisa por el día que dejó", async () => {
    escenario({ inscripciones: [inscripcion("i1")] })
    const { POST } = await import("../cita/[token]/reagendar/route")
    expect((await POST(pedidoVacio({ fecha: "2030-01-08", hora: "09:00" }), gestion)).status).toBe(200)
    await despuesDeResponder()
    expect(correos.aviso).toHaveBeenCalledTimes(1)
  })

  it("la cancelación en un negocio no avisa a la lista de otro", async () => {
    escenario({ inscripciones: [inscripcion("i-ajena", { businessId: OTRO_NEGOCIO, serviceId: "s-ajeno" })] })
    const { POST } = await import("../cita/[token]/cancelar/route")
    expect((await POST(pedidoVacio(), gestion)).status).toBe(200)
    await despuesDeResponder()
    expect(correos.aviso).not.toHaveBeenCalled()
  })

  it("confirmar con el mismo email y día la marca 'reservo'; quien llega segundo a la misma hora recibe 409", async () => {
    escenario({ inscripciones: [inscripcion("i1"), inscripcion("i2", { email: "otra@correo.test" })] })
    await base.prisma.appointment.updateMany({ where: { id: "c9" }, data: { status: "cancelada" } })

    expect((await confirmar({ profesionalId: "m-carla" })).status).toBe(201)
    expect(filas({ id: "i1" })[0]).toMatchObject({ estado: "reservo" })
    expect(filas({ id: "i2" })[0]).toMatchObject({ estado: "activa" })

    const segunda = await confirmar({ profesionalId: "m-carla", nombre: "Otra", email: "otra@correo.test" })
    expect(segunda).toEqual({ status: 409, cuerpo: { error: "El horario ya no está disponible" } })
    expect(filas({ id: "i2" })[0]).toMatchObject({ estado: "activa" })
  })
})

describe("confirmar: consentimiento de correos promocionales", () => {
  const MARTES = "2030-01-08"

  it("marcado, en un cliente nuevo con email: se guarda con fecha y origen", async () => {
    expect((await confirmar({ fecha: MARTES, correoPromoConsentimiento: true })).status).toBe(201)
    const [lucia] = base.buscar("customer", { name: "Lucía" })
    expect(lucia).toMatchObject({ correoPromoConsentAt: AHORA, correoPromoConsentSource: "reserva-publica" })
  })

  it("sin marcar, o sin email: no se guarda", async () => {
    await confirmar({ fecha: MARTES, correoPromoConsentimiento: false })
    await confirmar({ fecha: MARTES, hora: "10:00", nombre: "Sin", apellido: "Correo", email: "", correoPromoConsentimiento: true })
    expect(base.buscar("customer", { correoPromoConsentAt: { not: null } })).toHaveLength(0)
  })

  it("en un cliente existente reutilizado por email + nombre: no se escribe", async () => {
    escenario({ clientes: [{ id: "c-lucia", businessId: NEGOCIO, name: "Lucía", lastName: "Pérez", email: "lucia@correo.test" }] })
    expect((await confirmar({ fecha: MARTES, correoPromoConsentimiento: true })).status).toBe(201)
    expect(base.buscar("customer", { name: "Lucía" })).toEqual([
      expect.objectContaining({ id: "c-lucia", correoPromoConsentAt: null, correoPromoConsentSource: null }),
    ])
  })
})

describe("salir de la lista", () => {
  it("con el POST de un clic: sale, y la respuesta es la misma con un token inválido", async () => {
    const { tokenDeInscripcion } = await import("@/lib/lista-de-espera")
    const token = tokenDeInscripcion("i1")
    escenario({ inscripciones: [inscripcion("i1", { tokenHash: hashDeToken(token) })] })

    const valida = await salir(token)
    const repetida = await salir(token)
    const invalida = await salir("x".repeat(43))
    const otroNegocio = await salir(token, "salon-dos")
    expect(valida.status).toBe(200)
    for (const respuesta of [repetida, invalida, otroNegocio]) expect(respuesta).toEqual(valida)

    expect(filas({ id: "i1" })[0]).toMatchObject({ estado: "salio", email: "", nombre: "" })
    expect(mockVerificarLimite).toHaveBeenCalledWith("bajaPorToken", "lista-de-espera:203.0.113.7")
  })

  it("sin cupo en el límite: 429 y no saca a nadie", async () => {
    const { tokenDeInscripcion } = await import("@/lib/lista-de-espera")
    const token = tokenDeInscripcion("i1")
    escenario({ inscripciones: [inscripcion("i1", { tokenHash: hashDeToken(token) })] })
    mockVerificarLimite.mockResolvedValue({ permitido: false, restantes: 0 })
    expect((await salir(token)).status).toBe(429)
    expect(filas({ id: "i1" })[0]).toMatchObject({ estado: "activa" })
  })

  it("sólo existe POST: un GET (antivirus, vista previa) no saca a nadie", async () => {
    const ruta = await import("./[token]/route")
    expect(Object.keys(ruta)).toEqual(["POST"])
  })
})
