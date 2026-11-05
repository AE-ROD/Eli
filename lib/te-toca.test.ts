import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import type { ContextoDeCorrida } from "@/lib/envios-a-clientes"

const base = crearBaseFalsa()
vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

const mockEnviarTeToca = vi.fn()
vi.mock("@/lib/email", () => ({ enviarTeToca: (...args: unknown[]) => mockEnviarTeToca(...args) }))

let ejecutarTeToca: typeof import("./te-toca").ejecutarTeToca
let envios: typeof import("./envios-a-clientes")
beforeAll(async () => {
  ejecutarTeToca = (await import("./te-toca")).ejecutarTeToca
  envios = await import("./envios-a-clientes")
})

/** 28 de octubre de 2026, 10:00 en Santiago (UTC-3): la hora del cron. */
const AHORA = new Date("2026-10-28T13:00:00.000Z")
const OK = { data: { id: "correo" }, error: null }
const CONSIENTE = { correoPromoConsentAt: new Date("2026-08-01"), correoPromoConsentSource: "reserva-publica" }

let siguiente = 1
/** Una atención finalizada a las 12:00 de Santiago de ese día, con un Corte. */
function visita(customerId: string, fecha: string, extra: Record<string, unknown> = {}) {
  return { id: `v-${siguiente++}`, businessId: "n1", customerId, status: "finalizada", arrivedAt: new Date(`${fecha}T15:00:00.000Z`), ...extra }
}

/** Tres visitas cada 21 días: ciclo propio de 21, vence el 28/10. */
const cadaTresSemanas = (customerId: string, extra: Record<string, unknown> = {}) => [
  visita(customerId, "2026-08-26", extra),
  visita(customerId, "2026-09-16", extra),
  visita(customerId, "2026-10-07", extra),
]

function escenario() {
  siguiente = 1
  const visitas = [
    ...cadaTresSemanas("c-maria"),
    ...cadaTresSemanas("c-beto"),
    ...cadaTresSemanas("c-baja"),
    ...cadaTresSemanas("c-con-cita"),
    ...cadaTresSemanas("c-sin-email"),
    // Una sola visita: sin ciclo propio, usa la frecuencia del Corte (30).
    visita("c-elena", "2026-09-28", { id: "v-elena" }),
    // Ciclo de 21, pero la última fue hace poco.
    visita("c-fede", "2026-09-08"),
    visita("c-fede", "2026-09-29"),
    visita("c-fede", "2026-10-20"),
    // Una sola visita sin servicio con frecuencia: sin ciclo.
    visita("c-gabi", "2026-01-10", { id: "v-gabi" }),
    // Anulada: no es una visita.
    visita("c-hugo", "2026-08-26", { status: "anulada" }),
    visita("c-hugo", "2026-09-16", { status: "anulada" }),
    visita("c-hugo", "2026-10-07", { status: "anulada" }),
    // Del otro negocio.
    ...cadaTresSemanas("c-ajeno", { businessId: "n2" }),
    // Dato roto: una atención del negocio 1 con un cliente del negocio 2.
    ...cadaTresSemanas("c-ajeno-cruzado"),
  ]
  return {
    user: [
      { id: "u1", name: "Ana", email: "a@test" },
      { id: "u2", name: "Otro", email: "o@test" },
    ],
    business: [
      { id: "n1", name: "Salón Uno", slug: "salon-uno", userId: "u1", avisoDeVueltaActivo: true },
      { id: "n2", name: "Salón Dos", slug: "salon-dos", userId: "u2", avisoDeVueltaActivo: false },
    ],
    service: [
      { id: "s-corte", businessId: "n1", name: "Corte", frecuenciaDias: 30 },
      { id: "s-color", businessId: "n1", name: "Color", frecuenciaDias: null },
      { id: "s-ajeno", businessId: "n2", name: "Corte", frecuenciaDias: 7 },
    ],
    customer: [
      { id: "c-maria", businessId: "n1", name: "María", email: "maria@test", ...CONSIENTE },
      { id: "c-beto", businessId: "n1", name: "Beto", email: "beto@test" },
      { id: "c-baja", businessId: "n1", name: "Bea", email: "bea@test", correoPromoBajaAt: new Date("2026-10-01") },
      { id: "c-con-cita", businessId: "n1", name: "Ceci", email: "ceci@test", ...CONSIENTE },
      { id: "c-sin-email", businessId: "n1", name: "Dani", ...CONSIENTE },
      { id: "c-elena", businessId: "n1", name: "Elena", email: "elena@test", ...CONSIENTE },
      { id: "c-fede", businessId: "n1", name: "Fede", email: "fede@test", ...CONSIENTE },
      { id: "c-gabi", businessId: "n1", name: "Gabi", email: "gabi@test", ...CONSIENTE },
      { id: "c-hugo", businessId: "n1", name: "Hugo", email: "hugo@test", ...CONSIENTE },
      { id: "c-ajeno", businessId: "n2", name: "Iván", email: "ivan@test", ...CONSIENTE },
      { id: "c-ajeno-cruzado", businessId: "n2", name: "Juan", email: "juan@test", ...CONSIENTE },
    ],
    visit: visitas,
    visitService: [
      { id: "l-elena", visitId: "v-elena", serviceId: "s-corte", serviceName: "Corte", professionalName: "Ana", priceCents: 800000 },
      { id: "l-gabi", visitId: "v-gabi", serviceId: "s-color", serviceName: "Color", professionalName: "Ana", priceCents: 800000 },
    ],
    appointment: [
      {
        id: "cita-futura",
        businessId: "n1",
        customerId: "c-con-cita",
        title: "Corte",
        status: "confirmada",
        startTime: new Date("2026-11-02T15:00:00.000Z"),
        endTime: new Date("2026-11-02T15:30:00.000Z"),
      },
      // Una cita futura cancelada no cuenta: a Fede igual no le toca, pero a nadie le quita el aviso.
      {
        id: "cita-cancelada",
        businessId: "n1",
        customerId: "c-maria",
        title: "Corte",
        status: "cancelada",
        startTime: new Date("2026-11-02T15:00:00.000Z"),
        endTime: new Date("2026-11-02T15:30:00.000Z"),
      },
    ],
  }
}

const contexto = (extra: Partial<ContextoDeCorrida> = {}): ContextoDeCorrida => ({
  ahora: AHORA,
  hasta: Date.now() + 60_000,
  cupo: { restantes: 100 },
  ...extra,
})

const destinatarios = () => mockEnviarTeToca.mock.calls.map(([datos]) => (datos as { emailCliente: string }).emailCliente).sort()

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv("NEXTAUTH_SECRET", "secreto-de-prueba-de-al-menos-32-caracteres")
  vi.stubEnv("NEXTAUTH_URL", "https://eli.test")
  vi.spyOn(console, "error").mockImplementation(() => {})
  base.reiniciar(escenario())
  mockEnviarTeToca.mockResolvedValue(OK)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe("ejecutarTeToca: a quién le sale", () => {
  it("sólo a los vencidos con consentimiento, email, sin cita futura y del negocio que lo encendió", async () => {
    const resumen = await ejecutarTeToca(contexto())

    // María (ciclo propio de 21) y Elena (Corte cada 30). Nadie más.
    expect(destinatarios()).toEqual(["elena@test", "maria@test"])
    expect(resumen).toMatchObject({ enviados: 2, fallidos: 0, incompleto: false })
  })

  it("el correo lleva el nombre del negocio, el último servicio, la reserva pública y la baja del cliente", async () => {
    await ejecutarTeToca(contexto())

    const elena = mockEnviarTeToca.mock.calls.map(([d]) => d).find((d) => d.emailCliente === "elena@test")
    expect(elena).toMatchObject({
      nombreCliente: "Elena",
      nombreNegocio: "Salón Uno",
      servicio: "Corte",
      enlaceReservar: "https://eli.test/reservar/salon-uno",
    })
    expect(elena.enlaceDeBaja).toMatch(/^https:\/\/eli\.test\/baja-de-correos\/cliente\//)
    expect(elena.enlaceDeBajaEnUnClic).toMatch(/^https:\/\/eli\.test\/api\/correos\/baja-de-cliente\?token=/)
  })

  it("registra el envío con la referencia customerId:fechaUltimaVisita", async () => {
    await ejecutarTeToca(contexto())

    const filas = base.buscar("envioAClientes").map((f) => f.referencia).sort()
    expect(filas).toEqual(["c-elena:2026-09-28", "c-maria:2026-10-07"])
    expect(base.buscar("envioAClientes")[0]).toMatchObject({ tipo: "te-toca", canal: "correo", categoria: "promocional", businessId: "n1" })
  })

  it("sin consentimiento no sale", async () => {
    await ejecutarTeToca(contexto())
    expect(destinatarios()).not.toContain("beto@test")
  })

  it("después de la baja no sale", async () => {
    await base.prisma.customer.updateMany({ where: { id: "c-maria" }, data: envios.datosDeBajaPromocional(AHORA) })

    await ejecutarTeToca(contexto())

    expect(destinatarios()).not.toContain("maria@test")
    expect(destinatarios()).not.toContain("bea@test")
  })

  it("con una cita futura en pie no sale; una cancelada no cuenta", async () => {
    await ejecutarTeToca(contexto())
    expect(destinatarios()).not.toContain("ceci@test")
    expect(destinatarios()).toContain("maria@test")
  })

  it("sin ciclo (ni propio ni del servicio) no sale, y las anuladas no son visitas", async () => {
    await ejecutarTeToca(contexto())
    expect(destinatarios()).not.toContain("gabi@test")
    expect(destinatarios()).not.toContain("hugo@test")
    expect(destinatarios()).not.toContain("fede@test")
  })

  it("con el negocio apagado no sale nada", async () => {
    await base.prisma.business.updateMany({ where: { id: "n1" }, data: { avisoDeVueltaActivo: false } })

    const resumen = await ejecutarTeToca(contexto())

    expect(mockEnviarTeToca).not.toHaveBeenCalled()
    expect(resumen.enviados).toBe(0)
  })
})

describe("ejecutarTeToca: no duplica", () => {
  it("correrlo dos veces el mismo día no manda nada nuevo", async () => {
    await ejecutarTeToca(contexto())
    mockEnviarTeToca.mockClear()

    const segunda = await ejecutarTeToca(contexto())

    expect(mockEnviarTeToca).not.toHaveBeenCalled()
    expect(segunda.enviados).toBe(0)
    expect(base.buscar("envioAClientes")).toHaveLength(2)
  })

  it("tampoco al día siguiente: es una vez por ciclo, hasta que vuelva", async () => {
    await ejecutarTeToca(contexto())
    mockEnviarTeToca.mockClear()

    await ejecutarTeToca(contexto({ ahora: new Date("2026-10-29T13:00:00.000Z") }))

    expect(mockEnviarTeToca).not.toHaveBeenCalled()
  })

  it("si el envío falla, se cuenta, se libera y la próxima corrida lo reintenta", async () => {
    mockEnviarTeToca.mockResolvedValue({ data: null, error: { name: "rate_limit_exceeded", message: "x" } })

    const primera = await ejecutarTeToca(contexto())
    expect(primera.fallidos).toBe(2)
    expect(base.buscar("envioAClientes")).toHaveLength(0)

    mockEnviarTeToca.mockResolvedValue(OK)
    const segunda = await ejecutarTeToca(contexto())
    expect(segunda.enviados).toBe(2)
  })
})

describe("ejecutarTeToca: el 'hoy' es el del negocio", () => {
  it("a las 23:00 del 27 en Santiago (ya 28 en UTC) todavía no le toca a María; a las 10:00 del 28 sí", async () => {
    await ejecutarTeToca(contexto({ ahora: new Date("2026-10-28T02:00:00.000Z") }))
    expect(destinatarios()).not.toContain("maria@test")

    await ejecutarTeToca(contexto({ ahora: AHORA }))
    expect(destinatarios()).toContain("maria@test")
  })

  it("con un negocio en otra zona, el día es el de esa zona", async () => {
    // 04:00 UTC del 28: en Santiago ya es el 28 (01:00), en Bogotá todavía el 27 (23:00).
    const madrugada = new Date("2026-10-28T04:00:00.000Z")
    await ejecutarTeToca(contexto({ ahora: madrugada }))
    expect(destinatarios()).toContain("maria@test")

    mockEnviarTeToca.mockClear()
    base.reiniciar(escenario())
    await base.prisma.business.updateMany({ where: { id: "n1" }, data: { timezone: "America/Bogota" } })
    await ejecutarTeToca(contexto({ ahora: madrugada }))
    expect(destinatarios()).not.toContain("maria@test")
  })
})

describe("ejecutarTeToca: aislamiento entre negocios", () => {
  it("una atención del negocio 1 con un cliente del negocio 2 no se usa: se cuenta en omitidas y no le sale nada", async () => {
    const resumen = await ejecutarTeToca(contexto())

    expect(destinatarios()).not.toContain("juan@test")
    expect(resumen.omitidas).toBe(3)
    expect(base.buscar("envioAClientes", { customerId: "c-ajeno-cruzado" })).toHaveLength(0)
  })

  it("cada negocio encendido avisa sólo a los suyos y con su nombre", async () => {
    await base.prisma.business.updateMany({ where: { id: "n2" }, data: { avisoDeVueltaActivo: true } })

    await ejecutarTeToca(contexto())

    const porEmail = new Map(mockEnviarTeToca.mock.calls.map(([d]) => [d.emailCliente, d.nombreNegocio]))
    expect(porEmail.get("ivan@test")).toBe("Salón Dos")
    expect(porEmail.get("maria@test")).toBe("Salón Uno")
    expect(base.buscar("envioAClientes", { customerId: "c-ajeno" })[0]).toMatchObject({ businessId: "n2" })
    // El del cruce sigue sin recibir: en su negocio no tiene visitas.
    expect(porEmail.has("juan@test")).toBe(false)
  })

  it("la frecuencia de un servicio de otro negocio no se usa", async () => {
    // Elena con un servicio del negocio 2 (frecuencia 7) en vez del Corte.
    await base.prisma.visitService.updateMany({ where: { id: "l-elena" }, data: { serviceId: "s-ajeno" } })

    await ejecutarTeToca(contexto())

    expect(destinatarios()).not.toContain("elena@test")
  })
})

describe("ejecutarTeToca: cupo y plazo de la corrida", () => {
  it("respeta el cupo: con 1 envío restante manda uno y dice incompleto", async () => {
    const ctx = contexto({ cupo: { restantes: 1 } })

    const resumen = await ejecutarTeToca(ctx)

    expect(mockEnviarTeToca).toHaveBeenCalledTimes(1)
    expect(ctx.cupo.restantes).toBe(0)
    expect(resumen.incompleto).toBe(true)
  })

  it("sin cupo no lee ni manda nada", async () => {
    const resumen = await ejecutarTeToca(contexto({ cupo: { restantes: 0 } }))
    expect(mockEnviarTeToca).not.toHaveBeenCalled()
    expect(resumen.incompleto).toBe(true)
  })

  it("pasado el plazo corta y dice incompleto", async () => {
    const resumen = await ejecutarTeToca(contexto({ hasta: Date.now() - 1 }))
    expect(mockEnviarTeToca).not.toHaveBeenCalled()
    expect(resumen.incompleto).toBe(true)
  })

  it("el tope diario de promocionales del negocio corta ese negocio sin cortar la corrida", async () => {
    const hoy = Array.from({ length: envios.TOPE_PROMOCIONALES_POR_NEGOCIO_Y_DIA }, (_, i) => ({
      id: `e-${i}`,
      businessId: "n1",
      tipo: "resena",
      canal: "correo",
      categoria: "promocional",
      referencia: `x:${i}`,
      enviadoAt: AHORA,
    }))
    for (const fila of hoy) await base.prisma.envioAClientes.create({ data: fila })
    await base.prisma.business.updateMany({ where: { id: "n2" }, data: { avisoDeVueltaActivo: true } })

    const resumen = await ejecutarTeToca(contexto())

    expect(destinatarios()).toEqual(["ivan@test"])
    expect(resumen.incompleto).toBe(false)
  })
})
