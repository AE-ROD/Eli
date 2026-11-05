import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"

const base = crearBaseFalsa()
vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

/**
 * El módulo se importa después de crear la base: `vi.mock` se iza arriba de
 * todo y su fábrica la necesita ya creada.
 */
let m: typeof import("./envios-a-clientes")
beforeAll(async () => {
  m = await import("./envios-a-clientes")
})

const ZONA = "America/Santiago"
/** 28 de octubre de 2026, 10:00 en Santiago (UTC-3). */
const AHORA = new Date("2026-10-28T13:00:00.000Z")
const OK = { data: { id: "correo-1" }, error: null } as never

const enviar = vi.fn()

function datos() {
  return {
    user: [
      { id: "u1", name: "Ana", email: "a@test" },
      { id: "u2", name: "Otro", email: "o@test" },
    ],
    business: [
      { id: "n1", name: "Uno", slug: "uno", userId: "u1" },
      { id: "n2", name: "Dos", slug: "dos", userId: "u2" },
    ],
    service: [
      { id: "s1", businessId: "n1", name: "Corte" },
      { id: "s2", businessId: "n2", name: "Corte" },
    ],
    customer: [
      { id: "c-maria", businessId: "n1", name: "María", email: "maria@test", correoPromoConsentAt: new Date("2026-10-01"), correoPromoConsentSource: "reserva-publica" },
      { id: "c-beto", businessId: "n1", name: "Beto", email: "beto@test" },
      { id: "c-ajeno", businessId: "n2", name: "María", email: "maria@test", correoPromoConsentAt: new Date("2026-10-01"), correoPromoConsentSource: "panel" },
    ],
    inscripcionEnEspera: [
      { id: "i-1", businessId: "n1", serviceId: "s1", fecha: "2026-10-30", nombre: "Ana", apellido: "Soto", email: "ana@test", tokenHash: "h1" },
      { id: "i-ajena", businessId: "n2", serviceId: "s2", fecha: "2026-10-30", nombre: "Ana", apellido: "Soto", email: "ana@test", tokenHash: "h2" },
    ],
  }
}

const teToca = (extra: Record<string, unknown> = {}) => ({
  businessId: "n1",
  zona: ZONA,
  tipo: "te-toca" as const,
  canal: "correo" as const,
  referencia: "c-maria:2026-09-20",
  customerId: "c-maria",
  enviar,
  ahora: AHORA,
  ...extra,
})

const aviso = (extra: Record<string, unknown> = {}) => ({
  businessId: "n1",
  zona: ZONA,
  tipo: "lista-de-espera" as const,
  canal: "correo" as const,
  referencia: "i-1:1",
  esperaId: "i-1",
  enviar,
  ahora: AHORA,
  ...extra,
})

const envios = () => base.buscar("envioAClientes")

beforeEach(() => {
  vi.clearAllMocks()
  base.reiniciar(datos())
  enviar.mockResolvedValue(OK)
})

describe("los topes de la decisión b", () => {
  it("son los acordados con el dueño", () => {
    expect(m.TOPE_PROMOCIONALES_POR_NEGOCIO_Y_DIA).toBe(50)
    expect(m.AVISOS_POR_EVENTO_LISTA_DE_ESPERA).toBe(10)
    expect(m.AVISOS_POR_INSCRIPCION).toBe(3)
    expect(m.DIAS_ENTRE_RESENAS).toBe(90)
    expect(m.TOPE_ENVIOS_POR_CORRIDA).toBeGreaterThan(0)
  })
})

describe("enviarAClientes: candado → enviar → registrar o liberar", () => {
  it("envía una vez y deja el registro, con la categoría que sale del tipo y sin datos personales", async () => {
    expect(await m.enviarAClientes(teToca())).toBe("enviado")

    expect(enviar).toHaveBeenCalledTimes(1)
    expect(envios()).toEqual([
      expect.objectContaining({
        businessId: "n1",
        customerId: "c-maria",
        esperaId: null,
        tipo: "te-toca",
        canal: "correo",
        categoria: "promocional",
        referencia: "c-maria:2026-09-20",
        enviadoAt: AHORA,
      }),
    ])
    expect(JSON.stringify(envios())).not.toMatch(/maria@|María/)
  })

  it("la lista de espera es de servicio", async () => {
    expect(await m.enviarAClientes(aviso())).toBe("enviado")
    expect(envios()[0]).toMatchObject({ categoria: "servicio", esperaId: "i-1" })
  })

  it("correrlo dos veces con la misma referencia no duplica: la segunda es 'ya-enviado' y no manda nada", async () => {
    expect(await m.enviarAClientes(teToca())).toBe("enviado")
    expect(await m.enviarAClientes(teToca())).toBe("ya-enviado")

    expect(enviar).toHaveBeenCalledTimes(1)
    expect(envios()).toHaveLength(1)
  })

  it("dos procesos a la vez sobre lo mismo (dos after()): el único deja pasar a uno solo", async () => {
    const resultados = await Promise.all([m.enviarAClientes(aviso()), m.enviarAClientes(aviso())])

    expect(resultados.sort()).toEqual(["enviado", "ya-enviado"])
    expect(enviar).toHaveBeenCalledTimes(1)
    expect(envios()).toHaveLength(1)
  })

  it.each([
    ["Resend responde un error", () => enviar.mockResolvedValueOnce({ data: null, error: { name: "validation_error", message: "x" } })],
    ["no hay RESEND_API_KEY (null)", () => enviar.mockResolvedValueOnce(null)],
    ["el envío lanza", () => enviar.mockRejectedValueOnce(new Error("se cayó"))],
  ])("si %s, libera el candado y la próxima corrida lo reintenta", async (_caso, preparar) => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    preparar()

    expect(await m.enviarAClientes(teToca())).toBe("fallido")
    expect(envios()).toEqual([])

    expect(await m.enviarAClientes(teToca())).toBe("enviado")
    expect(envios()).toHaveLength(1)
  })

  it("si no puede registrar (la base falla), no envía", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    vi.mocked(base.prisma.envioAClientes.create).mockRejectedValueOnce(new Error("conexión caída"))

    expect(await m.enviarAClientes(aviso())).toBe("fallido")
    expect(enviar).not.toHaveBeenCalled()
  })

  it("la misma referencia en otro negocio es otro envío", async () => {
    await m.enviarAClientes(aviso())
    expect(await m.enviarAClientes(aviso({ businessId: "n2", esperaId: "i-ajena" }))).toBe("enviado")
  })
})

describe("enviarAClientes: aislamiento entre negocios", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {})
  })

  it("un cliente de otro negocio se omite: ni se registra ni se envía", async () => {
    expect(await m.enviarAClientes(teToca({ customerId: "c-ajeno" }))).toBe("omitido")
    expect(enviar).not.toHaveBeenCalled()
    expect(envios()).toEqual([])
  })

  it("una inscripción de otro negocio se omite", async () => {
    expect(await m.enviarAClientes(aviso({ esperaId: "i-ajena" }))).toBe("omitido")
    expect(enviar).not.toHaveBeenCalled()
    expect(envios()).toEqual([])
  })

  it("un cliente que no existe se omite", async () => {
    expect(await m.enviarAClientes(teToca({ customerId: "c-fantasma" }))).toBe("omitido")
  })

  it("un pedido mal armado se omite sin tocar la base", async () => {
    const antes = base.volcado()
    expect(await m.enviarAClientes(teToca({ referencia: "" }))).toBe("omitido")
    expect(await m.enviarAClientes(teToca({ referencia: "x".repeat(201) }))).toBe("omitido")
    expect(await m.enviarAClientes(teToca({ enviar: undefined }))).toBe("omitido")
    expect(await m.enviarAClientes(teToca({ tipo: "otro" }))).toBe("omitido")
    expect(base.volcado()).toEqual(antes)
  })
})

describe("enviarAClientes: consentimiento y baja", () => {
  it("un promocional sin consentimiento no sale", async () => {
    expect(await m.enviarAClientes(teToca({ customerId: "c-beto", referencia: "c-beto:x" }))).toBe("sin-consentimiento")
    expect(await m.enviarAClientes(teToca({ tipo: "resena", customerId: "c-beto", referencia: "c-beto:x" }))).toBe("sin-consentimiento")
    expect(enviar).not.toHaveBeenCalled()
    expect(envios()).toEqual([])
  })

  it("un promocional sin cliente no sale", async () => {
    expect(await m.enviarAClientes(teToca({ customerId: null }))).toBe("sin-consentimiento")
  })

  it("después de la baja, ni 'te toca' ni la reseña salen; volver a marcar la casilla lo da de nuevo", async () => {
    await base.prisma.customer.update({ where: { id: "c-maria" }, data: m.datosDeBajaPromocional(AHORA) })

    expect(await m.enviarAClientes(teToca())).toBe("sin-consentimiento")
    expect(await m.enviarAClientes(teToca({ tipo: "resena", referencia: "c-maria:2026-10-27" }))).toBe("sin-consentimiento")
    expect(base.buscar("customer", { id: "c-maria" })[0]).toMatchObject({
      correoPromoConsentAt: null,
      correoPromoConsentSource: null,
      correoPromoBajaAt: AHORA,
    })

    const despues = new Date("2026-11-05T13:00:00.000Z")
    await base.prisma.customer.update({ where: { id: "c-maria" }, data: m.datosDeConsentimientoPromocional("reserva-publica", despues) })

    expect(base.buscar("customer", { id: "c-maria" })[0]).toMatchObject({
      correoPromoConsentAt: despues,
      correoPromoConsentSource: "reserva-publica",
    })
    expect(await m.enviarAClientes(teToca())).toBe("enviado")
  })

  it("el filtro de consentimiento vigente sólo deja a quien lo tiene", () => {
    expect(base.buscar("customer", { AND: [{ businessId: "n1" }, m.conConsentimientoPromocional] }).map((c) => c.id)).toEqual(["c-maria"])
  })

  it("la lista de espera (servicio) no pide consentimiento promocional", async () => {
    expect(await m.enviarAClientes(aviso())).toBe("enviado")
  })

  it("'Escribirle' manual se registra sin enviar y sin pedir consentimiento", async () => {
    const manual = { businessId: "n1", zona: ZONA, tipo: "contacto-manual" as const, canal: "manual" as const, referencia: "c-beto:2026-10-28", customerId: "c-beto", ahora: AHORA }

    expect(await m.enviarAClientes(manual)).toBe("enviado")
    expect(await m.enviarAClientes(manual)).toBe("ya-enviado")
    expect(envios()).toEqual([expect.objectContaining({ tipo: "contacto-manual", canal: "manual", categoria: "promocional" })])
  })
})

describe("enviarAClientes: topes", () => {
  /** `n` promocionales por correo del negocio 1 ya enviados en ese instante. */
  function yaEnviados(n: number, enviadoAt: Date, businessId = "n1") {
    base.reiniciar({
      ...datos(),
      envioAClientes: Array.from({ length: n }, (_, i) => ({
        id: `e-${businessId}-${i}`,
        businessId,
        tipo: "resena",
        canal: "correo",
        categoria: "promocional",
        referencia: `previo-${i}`,
        enviadoAt,
      })),
    })
  }

  it("el negocio que llegó al tope diario de promocionales no manda más hoy", async () => {
    yaEnviados(m.TOPE_PROMOCIONALES_POR_NEGOCIO_Y_DIA, new Date("2026-10-28T12:00:00.000Z"))

    expect(await m.enviarAClientes(teToca())).toBe("tope")
    expect(enviar).not.toHaveBeenCalled()
  })

  it("contar el tope e insertar el candado van en una transacción, bajo un candado del negocio", async () => {
    yaEnviados(m.TOPE_PROMOCIONALES_POR_NEGOCIO_Y_DIA - 1, new Date("2026-10-28T12:00:00.000Z"))
    expect(await m.enviarAClientes(teToca())).toBe("enviado")

    expect(base.prisma.$transaction).toHaveBeenCalledTimes(1)
    const [sql, llave] = base.prisma.$executeRaw.mock.calls[0] as [TemplateStringsArray, string]
    expect(sql.join("?")).toContain("pg_advisory_xact_lock(hashtext(")
    expect(llave).toBe("envios:n1")
    // Primero el candado, después contar, después insertar.
    const orden = (fn: { mock: { invocationCallOrder: number[] } }) => fn.mock.invocationCallOrder[0]
    expect(orden(base.prisma.$executeRaw)).toBeLessThan(orden(base.prisma.envioAClientes.count))
    expect(orden(base.prisma.envioAClientes.count)).toBeLessThan(orden(base.prisma.envioAClientes.create))
  })

  it("un promocional repetido choca dentro de la transacción y es 'ya-enviado', sin enviar", async () => {
    expect(await m.enviarAClientes(teToca())).toBe("enviado")
    expect(await m.enviarAClientes(teToca())).toBe("ya-enviado")
    expect(enviar).toHaveBeenCalledTimes(1)
    expect(envios()).toHaveLength(1)
  })

  it("la lista de espera (servicio) no cuenta el tope ni toma ese candado", async () => {
    expect(await m.enviarAClientes(aviso())).toBe("enviado")
    expect(base.prisma.$transaction).not.toHaveBeenCalled()
    expect(base.prisma.$executeRaw).not.toHaveBeenCalled()
  })

  it("uno menos del tope todavía pasa", async () => {
    yaEnviados(m.TOPE_PROMOCIONALES_POR_NEGOCIO_Y_DIA - 1, new Date("2026-10-28T12:00:00.000Z"))
    expect(await m.enviarAClientes(teToca())).toBe("enviado")
  })

  it("el día es el del negocio: lo de anoche a las 23:00 en Santiago (02:00 UTC de hoy) es de ayer", async () => {
    yaEnviados(m.TOPE_PROMOCIONALES_POR_NEGOCIO_Y_DIA, new Date("2026-10-28T02:00:00.000Z"))
    expect(await m.enviarAClientes(teToca())).toBe("enviado")
  })

  it("el tope es por negocio, y no frena la lista de espera (servicio)", async () => {
    yaEnviados(m.TOPE_PROMOCIONALES_POR_NEGOCIO_Y_DIA, new Date("2026-10-28T12:00:00.000Z"), "n2")
    expect(await m.enviarAClientes(teToca())).toBe("enviado")

    yaEnviados(m.TOPE_PROMOCIONALES_POR_NEGOCIO_Y_DIA, new Date("2026-10-28T12:00:00.000Z"))
    expect(await m.enviarAClientes(aviso())).toBe("enviado")
  })

  it("el cupo de la corrida se gasta en cada intento y, agotado, no manda más", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const cupo = { restantes: 2 }
    enviar.mockResolvedValueOnce(null)

    expect(await m.enviarAClientes(aviso({ cupo }))).toBe("fallido")
    expect(await m.enviarAClientes(aviso({ cupo }))).toBe("enviado")
    expect(await m.enviarAClientes(teToca({ cupo }))).toBe("tope")
    expect(cupo.restantes).toBe(0)
    expect(enviar).toHaveBeenCalledTimes(2)
  })

  it("'ya-enviado' no gasta cupo", async () => {
    const cupo = { restantes: 5 }
    await m.enviarAClientes(aviso({ cupo }))
    await m.enviarAClientes(aviso({ cupo }))
    expect(cupo.restantes).toBe(4)
  })
})

describe("contarEnviosDelMes", () => {
  const envio = (id: string, enviadoAt: string, extra: Record<string, unknown> = {}) => ({
    id,
    businessId: "n1",
    tipo: "te-toca",
    canal: "correo",
    categoria: "promocional",
    referencia: id,
    enviadoAt: new Date(enviadoAt),
    ...extra,
  })

  it("cuenta el mes calendario del negocio por categoría, tipo y canal; nada de otro negocio", async () => {
    base.reiniciar({
      ...datos(),
      envioAClientes: [
        // 30 de septiembre, 22:00 en Santiago: es de septiembre.
        envio("sept", "2026-10-01T01:00:00.000Z"),
        // 1 de octubre, 00:30 en Santiago.
        envio("oct-1", "2026-10-01T03:30:00.000Z"),
        envio("oct-2", "2026-10-15T15:00:00.000Z", { tipo: "lista-de-espera", categoria: "servicio" }),
        envio("oct-3", "2026-10-20T15:00:00.000Z", { tipo: "resena" }),
        envio("oct-4", "2026-10-21T15:00:00.000Z", { tipo: "contacto-manual", canal: "manual" }),
        // 31 de octubre, 23:30 en Santiago (UTC-3): sigue siendo octubre.
        envio("oct-5", "2026-11-01T02:30:00.000Z"),
        envio("nov", "2026-11-01T03:30:00.000Z"),
        envio("ajeno", "2026-10-15T15:00:00.000Z", { businessId: "n2" }),
      ],
    })

    expect(await m.contarEnviosDelMes("n1", ZONA, AHORA)).toEqual({
      mes: "2026-10",
      total: 5,
      porCategoria: { servicio: 1, promocional: 4 },
      porTipo: { "lista-de-espera": 1, "te-toca": 2, resena: 1, "contacto-manual": 1 },
      porCanal: { correo: 4, whatsapp: 0, manual: 1 },
    })
  })

  it("diciembre pasa al año siguiente sin romperse", async () => {
    const enDiciembre = new Date("2026-12-15T15:00:00.000Z")
    base.reiniciar({ ...datos(), envioAClientes: [envio("dic", "2026-12-31T15:00:00.000Z"), envio("ene", "2027-01-01T15:00:00.000Z")] })

    expect(await m.contarEnviosDelMes("n1", ZONA, enDiciembre)).toMatchObject({ mes: "2026-12", total: 1 })
  })
})
