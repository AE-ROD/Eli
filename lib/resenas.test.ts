import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"

const base = crearBaseFalsa()
vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

const mockEnviarPedirResena = vi.fn()
vi.mock("@/lib/email", () => ({ enviarPedirResena: (...args: unknown[]) => mockEnviarPedirResena(...args) }))

let m: typeof import("./resenas")
let envios: typeof import("./envios-a-clientes")
beforeAll(async () => {
  m = await import("./resenas")
  envios = await import("./envios-a-clientes")
})

/** 28 de octubre de 2026, 10:00 en Santiago (UTC-3): "ayer" es el 27. */
const AHORA = new Date("2026-10-28T13:00:00.000Z")
const OK = { data: { id: "correo-1" }, error: null }
const ENLACE = "https://g.page/r/salon-uno/review"
const CONSENTIDO = { correoPromoConsentAt: new Date("2026-10-01T12:00:00.000Z"), correoPromoConsentSource: "reserva-publica" }

const contexto = (extra: Partial<import("./envios-a-clientes").ContextoDeCorrida> = {}) => ({
  ahora: AHORA,
  hasta: Date.now() + 50_000,
  cupo: { restantes: 100 },
  ...extra,
})

let siguiente = 1
const atencion = (businessId: string, customerId: string | null, arrivedAt: string, status = "finalizada") => ({
  id: `v-${siguiente++}`,
  businessId,
  customerId,
  customerName: "Cliente",
  status,
  arrivedAt: new Date(arrivedAt),
})

function datos() {
  return {
    user: [
      { id: "u1", name: "Uno", email: "u1@test" },
      { id: "u2", name: "Dos", email: "u2@test" },
      { id: "u3", name: "Tres", email: "u3@test" },
    ],
    business: [
      { id: "n1", name: "Salón Uno", slug: "uno", userId: "u1", pideResenas: true, enlaceResenas: ENLACE },
      { id: "n2", name: "Salón Dos", slug: "dos", userId: "u2", pideResenas: true, enlaceResenas: "https://maps.app.goo.gl/Dos" },
      // Con enlace pero con el interruptor apagado.
      { id: "n3", name: "Salón Tres", slug: "tres", userId: "u3", pideResenas: false, enlaceResenas: ENLACE },
    ],
    customer: [
      { id: "c-maria", businessId: "n1", name: "María", email: "maria@test", ...CONSENTIDO },
      { id: "c-beto", businessId: "n1", name: "Beto", email: "beto@test" },
      { id: "c-sin-email", businessId: "n1", name: "Sin Email", ...CONSENTIDO },
      { id: "c-dos", businessId: "n2", name: "Dora", email: "dora@test", ...CONSENTIDO },
      { id: "c-tres", businessId: "n3", name: "Tere", email: "tere@test", ...CONSENTIDO },
    ],
    visit: [
      atencion("n1", "c-maria", "2026-10-27T15:00:00.000Z"),
      atencion("n1", "c-beto", "2026-10-27T15:00:00.000Z"),
      atencion("n1", "c-sin-email", "2026-10-27T15:00:00.000Z"),
      atencion("n1", null, "2026-10-27T16:00:00.000Z"),
      atencion("n2", "c-dos", "2026-10-27T18:00:00.000Z"),
      atencion("n3", "c-tres", "2026-10-27T18:00:00.000Z"),
    ],
  }
}

const enviosDeResena = () => base.buscar("envioAClientes", { tipo: "resena" })
const destinatarios = () => mockEnviarPedirResena.mock.calls.map(([datos]) => (datos as { emailCliente: string }).emailCliente).sort()

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv("NEXTAUTH_SECRET", "secreto-de-prueba")
  vi.stubEnv("NEXTAUTH_URL", "https://eli.test")
  base.reiniciar(datos())
  mockEnviarPedirResena.mockResolvedValue(OK)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("ejecutarResenas: a quién le sale", () => {
  it("al cliente con email y consentimiento cuya visita quedó finalizada ayer, con el enlace del negocio y la baja", async () => {
    const resumen = await m.ejecutarResenas(contexto())

    expect(destinatarios()).toEqual(["dora@test", "maria@test"])
    const [deMaria] = mockEnviarPedirResena.mock.calls.find(([datos]) => datos.emailCliente === "maria@test")!
    expect(deMaria).toMatchObject({
      nombreCliente: "María",
      nombreNegocio: "Salón Uno",
      enlaceResenas: ENLACE,
      enlaceDeBaja: expect.stringMatching(/^https:\/\/eli\.test\/baja-de-correos\/cliente\/.+/),
      enlaceDeBajaEnUnClic: expect.stringMatching(/^https:\/\/eli\.test\/api\/correos\/baja-de-cliente\?token=.+/),
    })
    expect(enviosDeResena()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ businessId: "n1", customerId: "c-maria", referencia: "c-maria:2026-10-27", categoria: "promocional", canal: "correo" }),
        expect.objectContaining({ businessId: "n2", customerId: "c-dos", referencia: "c-dos:2026-10-27" }),
      ])
    )
    expect(resumen).toMatchObject({ enviados: 2, fallidos: 0, incompleto: false })
  })

  it("sin interruptor no sale, aunque tenga enlace", async () => {
    await m.ejecutarResenas(contexto())
    expect(destinatarios()).not.toContain("tere@test")
  })

  it.each([
    ["sin enlace", null],
    ["con un enlace que no es de Google", "https://evil.com/maps"],
    ["con un enlace http", "http://g.page/r/salon-uno/review"],
  ])("%s no sale, aunque el interruptor esté encendido", async (_caso, enlace) => {
    await base.prisma.business.update({ where: { id: "n1" }, data: { enlaceResenas: enlace } })

    await m.ejecutarResenas(contexto())

    expect(destinatarios()).toEqual(["dora@test"])
  })

  it("sin consentimiento promocional no sale (Beto), y sin email tampoco", async () => {
    await m.ejecutarResenas(contexto())
    expect(destinatarios()).not.toContain("beto@test")
    expect(enviosDeResena().map((envio) => envio.customerId)).not.toContain("c-sin-email")
  })

  it("después de la baja no sale", async () => {
    await base.prisma.customer.update({ where: { id: "c-maria" }, data: envios.datosDeBajaPromocional(AHORA) })

    await m.ejecutarResenas(contexto())

    expect(destinatarios()).toEqual(["dora@test"])
  })

  it("una visita anulada no dispara, ni una que sigue abierta", async () => {
    base.reiniciar({
      ...datos(),
      visit: [
        atencion("n1", "c-maria", "2026-10-27T15:00:00.000Z", "anulada"),
        atencion("n2", "c-dos", "2026-10-27T15:00:00.000Z", "por-cobrar"),
      ],
    })

    const resumen = await m.ejecutarResenas(contexto())

    expect(mockEnviarPedirResena).not.toHaveBeenCalled()
    expect(resumen.enviados).toBe(0)
  })

  it("sólo las de ayer: ni las de hoy ni las de anteayer", async () => {
    base.reiniciar({
      ...datos(),
      visit: [
        // 27/10 00:00 en Santiago es 03:00 UTC: 02:59 es el 26.
        atencion("n1", "c-maria", "2026-10-27T02:59:00.000Z"),
        // 28/10 00:00 en Santiago: ya es hoy.
        atencion("n2", "c-dos", "2026-10-28T03:00:00.000Z"),
      ],
    })

    await m.ejecutarResenas(contexto())

    expect(mockEnviarPedirResena).not.toHaveBeenCalled()
  })

  it("varias visitas de ayer del mismo cliente piden una sola reseña", async () => {
    base.reiniciar({
      ...datos(),
      visit: [atencion("n1", "c-maria", "2026-10-27T13:00:00.000Z"), atencion("n1", "c-maria", "2026-10-27T20:00:00.000Z")],
    })

    await m.ejecutarResenas(contexto())

    expect(destinatarios()).toEqual(["maria@test"])
  })
})

describe("ejecutarResenas: una vez cada 90 días por cliente", () => {
  const pedidaEl = (enviadoAt: string) => ({
    id: "e-previo",
    businessId: "n1",
    customerId: "c-maria",
    tipo: "resena",
    canal: "correo",
    categoria: "promocional",
    referencia: "c-maria:previa",
    enviadoAt: new Date(enviadoAt),
  })

  it("una segunda visita antes de 90 días no pide otra", async () => {
    // Pedida el 31/7 a las 10:00 de Santiago: hoy (28/10) van 89 días, todavía no.
    base.reiniciar({ ...datos(), envioAClientes: [pedidaEl("2026-07-31T14:00:00.000Z")] })

    await m.ejecutarResenas(contexto())

    expect(destinatarios()).toEqual(["dora@test"])
  })

  it("a los 90 días calendario, sí", async () => {
    // Pedida el 30/7, 23:59 de Santiago (UTC-4 en julio): hoy (28/10) van 90 días.
    base.reiniciar({ ...datos(), envioAClientes: [pedidaEl("2026-07-31T03:59:00.000Z")] })

    await m.ejecutarResenas(contexto())

    expect(destinatarios()).toEqual(["dora@test", "maria@test"])
  })

  it("lo que se le pidió en otro negocio no cuenta: cada negocio pide la suya", async () => {
    base.reiniciar({ ...datos(), envioAClientes: [{ ...pedidaEl("2026-10-20T14:00:00.000Z"), businessId: "n2", customerId: "c-dos" }] })

    await m.ejecutarResenas(contexto())

    expect(destinatarios()).toEqual(["maria@test"])
  })

  it("correr dos veces el mismo día no duplica", async () => {
    await m.ejecutarResenas(contexto())
    const segunda = await m.ejecutarResenas(contexto())

    expect(mockEnviarPedirResena).toHaveBeenCalledTimes(2)
    expect(enviosDeResena()).toHaveLength(2)
    expect(segunda.enviados).toBe(0)
  })

  it("si el envío falla, no queda registrado y la próxima corrida lo reintenta", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mockEnviarPedirResena.mockResolvedValueOnce({ data: null, error: { name: "validation_error", message: "x" } })

    const primera = await m.ejecutarResenas(contexto())
    expect(primera.fallidos).toBe(1)
    expect(enviosDeResena()).toHaveLength(1)

    await m.ejecutarResenas(contexto())
    expect(enviosDeResena()).toHaveLength(2)
  })
})

describe("ejecutarResenas: 'ayer' en la zona del negocio, con cambio de hora", () => {
  const clientes = ["c-a", "c-b", "c-c", "c-d"].map((id) => ({ id, businessId: "n1", name: id, email: `${id}@test`, ...CONSENTIDO }))

  it("el día que empieza el horario de verano (6/9/2026, 23 horas)", async () => {
    // Corrida del 7/9 a las 13:00 UTC = 10:00 en Santiago (UTC-3): ayer es el 6/9,
    // que va de 04:00 UTC (00:00 UTC-4, que salta a 01:00) a 03:00 UTC del 7/9.
    base.reiniciar({
      ...datos(),
      customer: clientes,
      visit: [
        atencion("n1", "c-a", "2026-09-06T03:30:00.000Z"), // 5/9 23:30: no
        atencion("n1", "c-b", "2026-09-06T04:30:00.000Z"), // 6/9 01:30: sí
        atencion("n1", "c-c", "2026-09-07T02:59:00.000Z"), // 6/9 23:59: sí
        atencion("n1", "c-d", "2026-09-07T03:00:00.000Z"), // 7/9 00:00: no
      ],
    })

    await m.ejecutarResenas(contexto({ ahora: new Date("2026-09-07T13:00:00.000Z") }))

    expect(destinatarios()).toEqual(["c-b@test", "c-c@test"])
    expect(enviosDeResena().map((envio) => envio.referencia).sort()).toEqual(["c-b:2026-09-06", "c-c:2026-09-06"])
  })

  it("el día que termina el horario de verano (4/4/2026, 25 horas)", async () => {
    // Ayer es el 4/4: de 03:00 UTC (00:00 UTC-3) a 04:00 UTC del 5/4 (00:00 UTC-4).
    base.reiniciar({
      ...datos(),
      customer: clientes,
      visit: [
        atencion("n1", "c-a", "2026-04-04T02:59:00.000Z"), // 3/4 23:59: no
        atencion("n1", "c-b", "2026-04-04T03:00:00.000Z"), // 4/4 00:00: sí
        atencion("n1", "c-c", "2026-04-05T03:30:00.000Z"), // 4/4 23:30, la segunda vez: sí
        atencion("n1", "c-d", "2026-04-05T04:00:00.000Z"), // 5/4 00:00: no
      ],
    })

    await m.ejecutarResenas(contexto({ ahora: new Date("2026-04-05T13:00:00.000Z") }))

    expect(destinatarios()).toEqual(["c-b@test", "c-c@test"])
  })

  it("el día del salto mismo, la corrida mira el día anterior completo", async () => {
    base.reiniciar({
      ...datos(),
      customer: clientes,
      visit: [atencion("n1", "c-a", "2026-09-06T03:30:00.000Z"), atencion("n1", "c-b", "2026-09-06T04:30:00.000Z")],
    })

    await m.ejecutarResenas(contexto({ ahora: new Date("2026-09-06T13:00:00.000Z") }))

    expect(destinatarios()).toEqual(["c-a@test"])
  })
})

describe("ejecutarResenas: aislamiento entre negocios", () => {
  it("una visita de un negocio con un cliente de otro no dispara nada", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    base.reiniciar({ ...datos(), visit: [atencion("n1", "c-dos", "2026-10-27T15:00:00.000Z")] })

    await m.ejecutarResenas(contexto())

    expect(mockEnviarPedirResena).not.toHaveBeenCalled()
    expect(enviosDeResena()).toEqual([])
  })

  it("cada cliente recibe el nombre y el enlace de su negocio, y el envío queda en ese negocio", async () => {
    await m.ejecutarResenas(contexto())

    const deDora = mockEnviarPedirResena.mock.calls.find(([datos]) => datos.emailCliente === "dora@test")![0]
    expect(deDora).toMatchObject({ nombreNegocio: "Salón Dos", enlaceResenas: "https://maps.app.goo.gl/Dos" })
    expect(enviosDeResena().find((envio) => envio.customerId === "c-dos")).toMatchObject({ businessId: "n2" })
  })

  it("cada negocio usa su zona horaria para 'ayer'", async () => {
    // n2 en Lima (UTC-5): el 27/10 va de 05:00 UTC del 27 a 05:00 UTC del 28.
    const inicial = datos()
    base.reiniciar({
      ...inicial,
      business: inicial.business.map((negocio) => (negocio.id === "n2" ? { ...negocio, timezone: "America/Lima" } : negocio)),
      visit: [
        atencion("n1", "c-maria", "2026-10-28T04:00:00.000Z"), // Santiago: 28/10 01:00, hoy
        atencion("n2", "c-dos", "2026-10-28T04:00:00.000Z"), // Lima: 27/10 23:00, ayer
      ],
    })

    await m.ejecutarResenas(contexto())

    expect(destinatarios()).toEqual(["dora@test"])
  })
})

describe("ejecutarResenas: cupo y plazo de la corrida", () => {
  it("sin cupo corta y dice incompleto", async () => {
    const cupo = { restantes: 1 }

    const resumen = await m.ejecutarResenas(contexto({ cupo }))

    expect(mockEnviarPedirResena).toHaveBeenCalledTimes(1)
    expect(cupo.restantes).toBe(0)
    expect(resumen).toMatchObject({ enviados: 1, incompleto: true })
  })

  it("pasado el plazo no manda nada y dice incompleto", async () => {
    const resumen = await m.ejecutarResenas(contexto({ hasta: Date.now() - 1 }))

    expect(mockEnviarPedirResena).not.toHaveBeenCalled()
    expect(resumen.incompleto).toBe(true)
  })

  it("el negocio en su tope diario de promocionales no manda, pero los demás sí", async () => {
    const hoy = new Date("2026-10-28T12:00:00.000Z")
    base.reiniciar({
      ...datos(),
      envioAClientes: Array.from({ length: envios.TOPE_PROMOCIONALES_POR_NEGOCIO_Y_DIA }, (_, i) => ({
        id: `e-${i}`,
        businessId: "n1",
        tipo: "te-toca",
        canal: "correo",
        categoria: "promocional",
        referencia: `previo-${i}`,
        enviadoAt: hoy,
      })),
    })

    const resumen = await m.ejecutarResenas(contexto())

    expect(destinatarios()).toEqual(["dora@test"])
    expect(resumen.incompleto).toBe(false)
  })

  it("sin NEXTAUTH_SECRET no hay enlace de baja: no sale ninguno", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    vi.stubEnv("NEXTAUTH_SECRET", "")

    const resumen = await m.ejecutarResenas(contexto())

    expect(mockEnviarPedirResena).not.toHaveBeenCalled()
    expect(enviosDeResena()).toEqual([])
    expect(resumen).toMatchObject({ fallidos: 1, incompleto: true })
  })
})
