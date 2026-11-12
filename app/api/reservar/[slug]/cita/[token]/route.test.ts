import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { NextRequest } from "next/server"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, OTRO_NEGOCIO, atencion, datosBase } from "@/pruebas/datos"
import { generarToken, hashDeToken } from "@/lib/tokens"
import { cuerpoDePrueba } from "@/pruebas/pedidos"

/**
 * El enlace para cancelar o reagendar sin cuenta (P6): lo crea confirmar,
 * se compara por hash, todo lo inválido es el mismo 404, el plazo del
 * negocio manda, y hay límite por IP y por token.
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

const { token: TOKEN, tokenHash: HASH } = generarToken()

type Registro = Record<string, unknown>

function escenario({ cita = {}, otras = [] as Registro[], negocio = {} as Registro } = {}) {
  const datos = datosBase()
  base.reiniciar({
    ...datos,
    business: datos.business.map((b) => (b.id === NEGOCIO ? { ...b, ...negocio } : b)),
    service: datos.service.map((s) => (s.id === "s-corte" ? { ...s, duration: 60 } : s)),
    workSchedule: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
      id: `h-${dayOfWeek}`,
      businessId: NEGOCIO,
      memberId: null,
      dayOfWeek,
      startTime: "09:00",
      endTime: "12:00",
    })),
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

const params = (token = TOKEN, slug = "salon-uno") => ({ params: Promise.resolve({ slug, token }) })
const pedido = (url = "http://localhost/x", cuerpo?: unknown) =>
  ({ url, headers: new Headers(), body: cuerpoDePrueba(cuerpo) }) as unknown as NextRequest

async function ver(token = TOKEN, slug = "salon-uno") {
  const { GET } = await import("./route")
  const respuesta = await GET(pedido(), params(token, slug))
  return { status: respuesta.status, cuerpo: await respuesta.json() }
}

async function cancelar(token = TOKEN, slug = "salon-uno") {
  const { POST } = await import("./cancelar/route")
  const respuesta = await POST(pedido(), params(token, slug))
  return { status: respuesta.status, cuerpo: await respuesta.json() }
}

async function reagendar(fecha: string, hora: string, token = TOKEN, slug = "salon-uno") {
  const { POST } = await import("./reagendar/route")
  const respuesta = await POST(pedido("http://localhost/x", { fecha, hora }), params(token, slug))
  return { status: respuesta.status, cuerpo: await respuesta.json() }
}

async function horas(fecha: string, token = TOKEN) {
  const { GET } = await import("./disponibilidad/route")
  const respuesta = await GET(pedido(`http://localhost/x?fecha=${fecha}`), params(token))
  return { status: respuesta.status, cuerpo: await respuesta.json() }
}

const laCita = () => base.buscar("appointment", { id: "c-lucia" })[0]

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

describe("confirmar crea el enlace", () => {
  it("guarda sólo el hash y manda el enlace con el token en el correo", async () => {
    escenario()
    const { POST } = await import("../../confirmar/route")
    const cuerpo = { servicioId: "s-corte", fecha: "2030-01-08", hora: "09:00", nombre: "Ana", apellido: "Ríos", email: "ana@correo.test" }
    const respuesta = await POST({ headers: new Headers(), body: cuerpoDePrueba(cuerpo) } as unknown as NextRequest, {
      params: Promise.resolve({ slug: "salon-uno" }),
    })
    expect(respuesta.status).toBe(201)
    const { enlaceDeGestion, citaId } = await respuesta.json()

    const token = enlaceDeGestion.match(/^\/reservar\/salon-uno\/cita\/([A-Za-z0-9_-]+)$/)?.[1]
    expect(token).toBeTruthy()
    const guardada = base.buscar("appointment", { id: citaId })[0]
    expect(guardada.manageTokenHash).toBe(hashDeToken(token!))
    expect(JSON.stringify(base.volcado())).not.toContain(token)

    const datosDelCorreo = correos.confirmacion.mock.calls[0][0] as { enlaceDeGestion: string; plazoHoras: number }
    expect(datosDelCorreo.enlaceDeGestion).toMatch(new RegExp(`/reservar/salon-uno/cita/${token}$`))
    expect(datosDelCorreo.plazoHoras).toBe(24)
  })
})

describe("GET: ver la cita", () => {
  it("muestra la cita en el reloj del negocio, sin ids ni contacto", async () => {
    escenario()
    const { status, cuerpo } = await ver()
    expect(status).toBe(200)
    expect(cuerpo).toEqual({
      negocio: { nombre: "Salón Uno" },
      servicio: { nombre: "Corte", duracion: 60 },
      // El precio de la cita (#89c); ésta no tiene.
      precio: null,
      profesional: "Carla Profesional",
      fecha: FECHA,
      hora: "10:00",
      zona: "America/Santiago",
      plazoHoras: 24,
      sePuedeCambiar: true,
      sePuedeReagendar: true,
      // El negocio atiende todos los días y Carla no cargó horario propio.
      diasConAtencion: [0, 1, 2, 3, 4, 5, 6],
      // Con dos profesionales que hacen el servicio hay a quién elegir al reagendar:
      // sólo lo que ya publica la reserva, y `actual` en quien la atiende hoy.
      profesionales: [
        { id: "m-carla", nombre: "Carla Profesional", especialidad: null, fotoUrl: null, diasConAtencion: [0, 1, 2, 3, 4, 5, 6], actual: true },
        { id: "m-pedro", nombre: "Pedro Profesional", especialidad: null, fotoUrl: null, diasConAtencion: [0, 1, 2, 3, 4, 5, 6] },
      ],
    })
  })

  it("QA#19: dice qué días se pueden elegir al reagendar: no los cerrados del negocio ni los que su profesional no atiende", async () => {
    escenario()
    // Domingo cerrado (no hay franja del domingo).
    base.reiniciar({ ...base.volcado(), workSchedule: base.volcado().workSchedule.filter((fila) => fila.dayOfWeek !== 0) })
    expect((await ver()).cuerpo.diasConAtencion).toEqual([1, 2, 3, 4, 5, 6])

    // Carla cargó horario propio sólo lunes y miércoles: manda el suyo.
    base.reiniciar({
      ...base.volcado(),
      workSchedule: [
        ...base.volcado().workSchedule,
        { id: "h-carla-1", businessId: NEGOCIO, memberId: "m-carla", dayOfWeek: 1, startTime: "14:00", endTime: "20:00" },
        { id: "h-carla-3", businessId: NEGOCIO, memberId: "m-carla", dayOfWeek: 3, startTime: "14:00", endTime: "20:00" },
        // El horario de otro negocio no cuenta.
        { id: "h-ajeno", businessId: OTRO_NEGOCIO, memberId: null, dayOfWeek: 0, startTime: "09:00", endTime: "12:00" },
      ],
    })
    expect((await ver()).cuerpo.diasConAtencion).toEqual([1, 3])
  })

  it("fuera de plazo se ve, pero dice que ya no se puede cambiar", async () => {
    escenario()
    relojEn("2030-01-07T00:00:00.000Z")
    expect((await ver()).cuerpo.sePuedeCambiar).toBe(false)
  })

  it.each([
    ["un token que no existe", () => ({ token: generarToken().token })],
    ["un token sin forma de token", () => ({ token: "x" })],
    ["el slug de otro negocio", () => ({ slug: "salon-dos" })],
    ["una cita cancelada", () => ({ cita: { status: "cancelada" } })],
    ["una cita completada", () => ({ cita: { status: "completada" } })],
    ["una cita que ya pasó", () => ({ cita: { startTime: aLas("10:00", "2030-01-01"), endTime: aLas("11:00", "2030-01-01") } })],
  ])("%s: el mismo 404", async (_caso, armar) => {
    const { token = TOKEN, slug = "salon-uno", cita = {} } = armar() as { token?: string; slug?: string; cita?: Registro }
    escenario({ cita })
    const respuestas = [await ver(token, slug), await cancelar(token, slug), await reagendar("2030-01-08", "09:00", token, slug)]
    for (const respuesta of respuestas) {
      // El negocio del escenario es un salón: la reserva se llama "hora".
      expect(respuesta).toEqual({ status: 404, cuerpo: { error: "Este enlace no es válido o la hora ya no se puede cambiar" } })
    }
  })

  it.each([
    ["una clínica dental", "odontologia", "Este enlace no es válido o la hora ya no se puede cambiar"],
    ["un salón", "salon", "Este enlace no es válido o la hora ya no se puede cambiar"],
    ["un rubro viejo", "salud", "Este enlace no es válido o la cita ya no se puede cambiar"],
  ])("%s: el 404 dice la palabra de la reserva del negocio, igual para todo lo que no sirve", async (_caso, type, mensaje) => {
    escenario({ negocio: { type } })
    const sinToken = generarToken().token
    const respuestas = [
      await ver(sinToken),
      await cancelar(sinToken),
      await reagendar("2030-01-08", "09:00", sinToken),
      await horas("2030-01-08", sinToken),
    ]
    for (const respuesta of respuestas) {
      expect(respuesta).toEqual({ status: 404, cuerpo: { error: mensaje } })
    }
  })

  it("un slug que no existe: el 404 de siempre, con las palabras de siempre", async () => {
    escenario({ negocio: { type: "odontologia" } })

    expect(await ver(TOKEN, "no-existe")).toEqual({
      status: 404,
      cuerpo: { error: "Este enlace no es válido o la cita ya no se puede cambiar" },
    })
  })

  it("una cita de otro negocio con el mismo hash no se encuentra por este slug", async () => {
    escenario({ cita: { businessId: OTRO_NEGOCIO, serviceId: "s-ajeno", memberId: "m-ajeno", customerId: "c-ajeno" } })
    expect((await ver()).status).toBe(404)
  })

  it("límite por IP y por token: pasado cualquiera de los dos, 429 sin leer la cita", async () => {
    escenario()
    mockVerificarLimite.mockImplementation(async (tipo: string) => ({ permitido: tipo !== "gestionDeCita", restantes: 0 }))
    expect((await ver()).status).toBe(429)
    mockVerificarLimite.mockImplementation(async (tipo: string) => ({ permitido: tipo !== "lecturaPublica", restantes: 0 }))
    expect((await ver()).status).toBe(429)
    expect(base.prisma.appointment.findFirst).not.toHaveBeenCalled()
    // El límite por token se cuenta por el hash, nunca por el token en claro.
    const claves = mockVerificarLimite.mock.calls.map((llamada) => String(llamada[1]))
    expect(claves).toContain(`token:${HASH}`)
    expect(claves.join()).not.toContain(TOKEN)
  })

  it("cambiar usa el límite de la reserva por IP", async () => {
    escenario()
    await cancelar()
    expect(mockVerificarLimite.mock.calls.map((llamada) => llamada[0]).sort()).toEqual(["gestionDeCita", "reserva"])
  })
})

describe("cancelar", () => {
  it("dentro del plazo: queda cancelada por el cliente, con la hora, y se avisa al negocio", async () => {
    escenario()
    const { status } = await cancelar()
    expect(status).toBe(200)
    expect(laCita()).toMatchObject({
      status: "cancelada",
      canceladaPor: "cliente",
      canceladaEn: new Date("2030-01-02T12:00:00.000Z"),
    })
    expect(correos.cambio).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: "cancelo", emailNegocio: "duena@uno.test", fecha: FECHA, hora: "10:00" })
    )
    // Ya cancelada, el enlace deja de servir.
    expect((await ver()).status).toBe(404)
  })

  it("fuera del plazo: 409 con el motivo, sin tocar la cita", async () => {
    escenario({ negocio: { cancelacionHorasAntes: 48 } })
    relojEn("2030-01-05T14:00:00.000Z")
    const { status, cuerpo } = await cancelar()
    expect(status).toBe(409)
    // El negocio del escenario es un salón: el motivo nombra al lugar con la palabra de su rubro.
    expect(cuerpo.error).toMatch(/48 horas antes.*Contacta al salón/)
    expect(laCita().status).toBe("pendiente")
    expect(correos.cambio).not.toHaveBeenCalled()
  })

  it.each([
    ["salud", "Contacta al local"],
    ["odontologia", "Contacta a la clínica"],
  ])("fuera del plazo, el motivo habla con las palabras del rubro %s", async (type, contacto) => {
    escenario({ negocio: { cancelacionHorasAntes: 48, type } })
    relojEn("2030-01-05T14:00:00.000Z")
    const { status, cuerpo } = await cancelar()
    expect(status).toBe(409)
    expect(cuerpo.error).toContain(contacto)
  })
})

describe("el aviso del cambio llega también al profesional (#104)", () => {
  const destinatarios = () => correos.cambio.mock.calls.map((llamada) => (llamada[0] as { emailNegocio: string }).emailNegocio).sort()

  it("al cancelar: a la dueña y a la profesional de la cita, un correo a cada una", async () => {
    escenario()
    expect((await cancelar()).status).toBe(200)
    expect(destinatarios()).toEqual(["carla@uno.test", "duena@uno.test"])
  })

  it("al reagendar con la misma profesional: a la dueña y a ella, una vez", async () => {
    escenario()
    expect((await reagendar("2030-01-08", "11:00")).status).toBe(200)
    expect(destinatarios()).toEqual(["carla@uno.test", "duena@uno.test"])
  })

  it("una cita sin profesional que al reagendar queda con uno: a la dueña y al nuevo", async () => {
    escenario({ cita: { memberId: null } })
    expect((await reagendar("2030-01-08", "11:00")).status).toBe(200)
    const nuevo = laCita().memberId === "m-carla" ? "carla@uno.test" : "pedro@uno.test"
    expect(destinatarios()).toEqual([nuevo, "duena@uno.test"].sort())
  })

  it("sin profesional: sólo a la dueña", async () => {
    escenario({ cita: { memberId: null } })
    expect((await cancelar()).status).toBe(200)
    expect(destinatarios()).toEqual(["duena@uno.test"])
  })

  it("un memberId de otro negocio no da correo", async () => {
    escenario({ cita: { memberId: "m-ajeno" } })
    expect((await cancelar()).status).toBe(200)
    expect(destinatarios()).toEqual(["duena@uno.test"])
  })
})

describe("cancelar: la hora es la de la base (#152)", () => {
  // La cita es el 7 a las 10:00 en Santiago (13:00Z); con 48 horas de plazo,
  // el límite es el 5 a las 13:00Z. El reloj de esta instancia y el de la base
  // quedan a un par de segundos, uno a cada lado del límite.
  const laBaseDice = (instante: string) => {
    const ahora = new Date(instante)
    base.prisma.$queryRaw.mockImplementationOnce(async () => [{ ahora }])
    return ahora
  }

  it("guarda como `canceladaEn` la hora de la base, no la de esta instancia", async () => {
    escenario()
    const deLaBase = laBaseDice("2030-01-02T12:00:07.000Z")

    expect((await cancelar()).status).toBe(200)

    expect(laCita()).toMatchObject({ status: "cancelada", canceladaPor: "cliente", canceladaEn: deLaBase })
    const [partes] = base.prisma.$queryRaw.mock.calls[0]
    expect(partes.join("?")).toBe("SELECT clock_timestamp() AS ahora")
    expect(base.prisma.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      base.prisma.appointment.updateMany.mock.invocationCallOrder[0]
    )
  })

  it("el plazo se decide con la misma hora de la base: si para ella ya pasó, 409 aunque esta instancia diga que no", async () => {
    escenario({ negocio: { cancelacionHorasAntes: 48 } })
    relojEn("2030-01-05T12:59:58.000Z")
    laBaseDice("2030-01-05T13:00:01.000Z")

    const { status, cuerpo } = await cancelar()

    expect(status).toBe(409)
    expect(cuerpo.error).toMatch(/48 horas antes/)
    expect(laCita().status).toBe("pendiente")
  })

  it("y si para la base sigue dentro del plazo, se cancela con esa hora aunque esta instancia vaya adelantada", async () => {
    escenario({ negocio: { cancelacionHorasAntes: 48 } })
    relojEn("2030-01-05T13:00:01.000Z")
    const deLaBase = laBaseDice("2030-01-05T12:59:58.000Z")

    expect((await cancelar()).status).toBe(200)

    expect(laCita()).toMatchObject({ status: "cancelada", canceladaPor: "cliente", canceladaEn: deLaBase })
  })

  it("#154: reagendar decide el plazo con la hora de la base, no con la de esta instancia", async () => {
    escenario({ negocio: { cancelacionHorasAntes: 48 } })
    relojEn("2030-01-05T12:59:58.000Z")
    laBaseDice("2030-01-05T13:00:01.000Z")

    const { status, cuerpo } = await reagendar("2030-01-08", "09:00")

    expect(status).toBe(409)
    expect(cuerpo.error).toMatch(/48 horas antes/)
    expect(laCita().startTime).toEqual(aLas("10:00"))
  })

  it("#154: y si para la base sigue dentro del plazo, reagenda aunque esta instancia vaya adelantada", async () => {
    escenario({ negocio: { cancelacionHorasAntes: 48 } })
    relojEn("2030-01-05T13:00:01.000Z")
    laBaseDice("2030-01-05T12:59:58.000Z")

    expect((await reagendar("2030-01-08", "09:00")).status).toBe(200)
    expect(laCita().startTime).toEqual(aLas("09:00", "2030-01-08"))
  })

  it("#154: ver la cita y sus horas también usan la hora de la base", async () => {
    escenario({ negocio: { cancelacionHorasAntes: 48 } })
    relojEn("2030-01-05T12:59:58.000Z")
    laBaseDice("2030-01-05T13:00:01.000Z")
    expect((await ver()).cuerpo.sePuedeCambiar).toBe(false)
    laBaseDice("2030-01-05T13:00:01.000Z")
    expect((await horas("2030-01-08")).cuerpo.slots).toEqual([])
  })
})

describe("reagendar", () => {
  it("a una hora libre del mismo profesional: mueve la cita y avisa al negocio", async () => {
    escenario()
    const { status, cuerpo } = await reagendar("2030-01-08", "11:00")
    expect(status).toBe(200)
    expect(cuerpo).toMatchObject({ fecha: "2030-01-08", hora: "11:00", profesional: "Carla Profesional" })
    expect(laCita()).toMatchObject({ startTime: aLas("11:00", "2030-01-08"), endTime: aLas("12:00", "2030-01-08"), memberId: "m-carla", status: "pendiente" })
    expect(correos.cambio).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: "reagendo", fechaAnterior: FECHA, horaAnterior: "10:00", fecha: "2030-01-08", hora: "11:00" })
    )
  })

  it("su propia hora no la ocupa: se puede correr media franja dentro de su tramo", async () => {
    escenario()
    expect((await horas(FECHA)).cuerpo.slots).toContain("10:00")
    expect((await reagendar(FECHA, "09:00")).status).toBe(200)
  })

  it("no ofrece ni acepta una hora ocupada del mismo profesional, aunque otro esté libre", async () => {
    escenario({
      otras: [{ id: "c-otra", businessId: NEGOCIO, title: "Color", memberId: "m-carla", startTime: aLas("09:00", "2030-01-08"), endTime: aLas("10:00", "2030-01-08") }],
    })
    expect((await horas("2030-01-08")).cuerpo.slots).toEqual(["10:00", "10:30", "11:00"])
    expect((await reagendar("2030-01-08", "09:00")).status).toBe(409)
    expect(laCita().startTime).toEqual(aLas("10:00"))
  })

  it("respeta los bloqueos del profesional y del negocio", async () => {
    escenario()
    base.reiniciar({
      ...base.volcado(),
      timeBlock: [{ id: "b", businessId: NEGOCIO, memberId: null, startTime: aLas("09:00", "2030-01-08"), endTime: aLas("12:00", "2030-01-08") }],
    })
    expect((await horas("2030-01-08")).cuerpo.slots).toEqual([])
    expect((await reagendar("2030-01-08", "09:00")).status).toBe(409)
  })

  it("fuera del horario: 409", async () => {
    escenario()
    expect((await reagendar("2030-01-08", "15:00")).status).toBe(409)
  })

  it("#46: una hora que cabe pero que la disponibilidad no ofrece (09:17): 409 sin mover la cita", async () => {
    escenario()
    expect((await horas("2030-01-08")).cuerpo.slots).not.toContain("09:17")
    expect((await reagendar("2030-01-08", "09:17")).status).toBe(409)
    expect(laCita().startTime).toEqual(aLas("10:00"))
  })

  it("fuera del plazo: ni horas ni cambio", async () => {
    escenario()
    relojEn("2030-01-07T00:00:00.000Z")
    expect((await horas("2030-01-08")).cuerpo.slots).toEqual([])
    expect((await reagendar("2030-01-08", "09:00")).status).toBe(409)
  })

  it("datos inválidos: 400", async () => {
    escenario()
    expect((await reagendar("mañana", "09:00")).status).toBe(400)
  })
})

describe("el enlace y la llegada: con una atención viva en el Tablero, gana la llegada (PRODUCTO.md §6)", () => {
  /** María ya llegó: su atención está viva en el Tablero, ligada a la cita. */
  function conAtencion(status = "en-espera") {
    escenario()
    base.reiniciar({ ...base.volcado(), visit: [atencion("v-lucia", { appointmentId: "c-lucia", status })] })
  }

  it("la cita no se ve por el enlace, ni se cancela, ni se reagenda: el mismo 404, sin tocarla", async () => {
    conAtencion()
    const antes = laCita()

    expect((await ver()).status).toBe(404)
    expect((await cancelar()).status).toBe(404)
    expect((await reagendar("2030-01-08", "09:00")).status).toBe(404)
    expect((await horas("2030-01-08")).status).toBe(404)
    expect(laCita()).toEqual(antes)
  })

  it("con la atención anulada, el enlace vuelve a servir", async () => {
    conAtencion("anulada")

    expect((await ver()).status).toBe(200)
    expect((await cancelar()).status).toBe(200)
    expect(laCita().status).toBe("cancelada")
  })

  it("si el cliente llega entre que se leyó la cita y se escribe, cancelar no la pisa", async () => {
    escenario()
    const transaccionReal = base.prisma.$transaction.getMockImplementation()!
    base.prisma.$transaction.mockImplementationOnce(async (fn: unknown) => {
      await base.prisma.visit.create({ data: atencion("v-lucia", { appointmentId: "c-lucia" }) })
      return transaccionReal(fn)
    })

    expect((await cancelar()).status).toBe(404)
    expect(laCita().status).toBe("pendiente")
  })

  it("y reagendar tampoco la mueve", async () => {
    escenario()
    const transaccionReal = base.prisma.$transaction.getMockImplementation()!
    base.prisma.$transaction.mockImplementationOnce(async (fn: unknown, ...resto: unknown[]) => {
      await base.prisma.visit.create({ data: atencion("v-lucia", { appointmentId: "c-lucia" }) })
      return (transaccionReal as (...args: unknown[]) => unknown)(fn, ...resto)
    })

    expect((await reagendar("2030-01-08", "09:00")).status).toBe(404)
    expect(laCita().startTime).toEqual(aLas("10:00"))
  })
})

describe("reagendar y el recordatorio", () => {
  it("una cita movida a otra hora vuelve a recibir su recordatorio: reminderSentAt queda vacío", async () => {
    escenario({ cita: { reminderSentAt: new Date("2030-01-06T13:00:00.000Z") } })

    expect((await reagendar("2030-01-08", "09:00")).status).toBe(200)
    expect(laCita().reminderSentAt).toBeNull()
  })
})
