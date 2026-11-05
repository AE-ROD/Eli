import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from "vitest"

vi.mock("@upstash/redis", () => ({
  Redis: vi.fn().mockImplementation(() => ({})),
}))

vi.mock("@upstash/ratelimit", () => {
  class Ratelimit {
    /** Cada limitador creado, para ver en qué balde y con qué ventana cuenta cada tipo. */
    static creados: Ratelimit[] = []
    static slidingWindow = vi.fn((tokens: number, ventana: string) => ({ tokens, ventana }))
    limit = vi.fn().mockRejectedValue(new Error("Upstash no responde"))
    getRemaining = vi.fn().mockRejectedValue(new Error("Upstash no responde"))
    constructor(readonly config: { prefix: string; limiter: unknown; timeout?: number }) {
      Ratelimit.creados.push(this)
    }
  }
  return { Ratelimit }
})

interface RatelimitFalso {
  creados: { config: { prefix: string; limiter: unknown; timeout?: number }; limit: Mock; getRemaining: Mock }[]
}

describe("verificarLimite cuando Upstash está configurado pero falla", () => {
  beforeEach(() => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://fake.upstash.io")
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "fake-token")
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each(["login", "auth", "reserva", "soporte", "acuseDeSoporte", "reenvioDeInvitacion", "importacionDeClientes", "gestionDeCita", "listaDeEspera", "listaDeEsperaPorEmail", "bajaPorToken", "filaVirtual", "filaVirtualPorNegocio", "posicionEnFila"] as const)(
    "falla CERRADO para %s si Upstash tira un error: lo que un anónimo puede abusar no queda sin tope",
    async (tipo) => {
      vi.spyOn(console, "error").mockImplementation(() => {})
      const { verificarLimite } = await import("./rate-limit")
      const resultado = await verificarLimite(tipo, "127.0.0.1")
      expect(resultado).toEqual({ permitido: false, restantes: 0 })
    },
  )

  it.each(["lecturaPublica", "panelLectura", "panelEscritura", "exportacion"] as const)(
    "falla abierto para %s si Upstash tira un error: ni una lectura ni una escritura con sesión se cortan por una caída del proveedor",
    async (tipo) => {
      vi.spyOn(console, "error").mockImplementation(() => {})
      const { verificarLimite } = await import("./rate-limit")
      const resultado = await verificarLimite(tipo, "127.0.0.1")
      expect(resultado.permitido).toBe(true)
    },
  )

  it("si Upstash no contesta a tiempo (reason: timeout) se trata como un error: login queda cerrado", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const { Ratelimit } = (await import("@upstash/ratelimit")) as unknown as { Ratelimit: RatelimitFalso }
    Ratelimit.creados.length = 0
    const { verificarLimite } = await import("./rate-limit")
    for (const limitador of Ratelimit.creados) {
      limitador.limit.mockResolvedValue({ success: true, remaining: 0, reason: "timeout" })
    }
    expect(await verificarLimite("login", "127.0.0.1")).toEqual({ permitido: false, restantes: 0 })
    expect((await verificarLimite("panelLectura", "127.0.0.1")).permitido).toBe(true)
  })

  it("configura un timeout corto en cada limitador, no los 5 s que trae la librería", async () => {
    const { Ratelimit } = (await import("@upstash/ratelimit")) as unknown as { Ratelimit: RatelimitFalso }
    Ratelimit.creados.length = 0
    await import("./rate-limit")
    expect(Ratelimit.creados.length).toBeGreaterThan(0)
    for (const limitador of Ratelimit.creados) {
      const { timeout } = limitador.config as { timeout?: number }
      expect(timeout).toBeGreaterThan(0)
      expect(timeout).toBeLessThanOrEqual(2000)
    }
  })

  it("la lectura pública cuenta en su propio balde, de 60 por minuto: no gasta el de las reservas (20 por hora)", async () => {
    const { Ratelimit } = (await import("@upstash/ratelimit")) as unknown as { Ratelimit: RatelimitFalso }
    Ratelimit.creados.length = 0
    const { verificarLimite } = await import("./rate-limit")

    await verificarLimite("lecturaPublica", "203.0.113.7")

    const usados = Ratelimit.creados.filter((limitador) => limitador.limit.mock.calls.length > 0)
    expect(usados).toHaveLength(1)
    expect(usados[0].config).toMatchObject({ prefix: "eli:lectura-publica", limiter: { tokens: 60, ventana: "1 m" } })
    expect(usados[0].limit).toHaveBeenCalledWith("203.0.113.7")
  })

  it("el reenvío de invitaciones cuenta en su propio balde, de 3 por hora", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const { Ratelimit } = (await import("@upstash/ratelimit")) as unknown as { Ratelimit: RatelimitFalso }
    Ratelimit.creados.length = 0
    const { verificarLimite } = await import("./rate-limit")

    await verificarLimite("reenvioDeInvitacion", "negocio-1:ana@x.com")

    const usados = Ratelimit.creados.filter((limitador) => limitador.limit.mock.calls.length > 0)
    expect(usados).toHaveLength(1)
    expect(usados[0].config).toMatchObject({ prefix: "eli:reenvio-invitacion", limiter: { tokens: 3, ventana: "1 h" } })
    expect(usados[0].limit).toHaveBeenCalledWith("negocio-1:ana@x.com")
  })
})

describe("los baldes del CSV de clientes", () => {
  beforeEach(() => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://fake.upstash.io")
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "fake-token")
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each([
    ["importacionDeClientes", "eli:importacion-clientes", 5],
    ["exportacion", "eli:exportacion", 20],
    ["gestionDeCita", "eli:gestion-cita", 60],
    ["listaDeEspera", "eli:lista-de-espera", 5],
    ["filaVirtual", "eli:fila-virtual", 10],
    ["filaVirtualPorNegocio", "eli:fila-virtual-negocio", 60],
    ["posicionEnFila", "eli:fila-posicion", 240],
  ] as const)("%s cuenta en su propio balde (%s), de %i por hora", async (tipo, prefijo, tokens) => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const { Ratelimit } = (await import("@upstash/ratelimit")) as unknown as { Ratelimit: RatelimitFalso }
    Ratelimit.creados.length = 0
    const { verificarLimite } = await import("./rate-limit")

    await verificarLimite(tipo, "negocio-1")

    const usados = Ratelimit.creados.filter((limitador) => limitador.limit.mock.calls.length > 0)
    expect(usados).toHaveLength(1)
    expect(usados[0].config).toMatchObject({ prefix: prefijo, limiter: { tokens, ventana: "1 h" } })
    expect(usados[0].limit).toHaveBeenCalledWith("negocio-1")
  })
})

describe("quedaLimite: preguntar si queda cupo sin descontar", () => {
  beforeEach(() => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://fake.upstash.io")
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "fake-token")
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  async function balde(prefijo: string) {
    const { Ratelimit } = (await import("@upstash/ratelimit")) as unknown as { Ratelimit: RatelimitFalso }
    Ratelimit.creados.length = 0
    const modulo = await import("./rate-limit")
    const limitador = Ratelimit.creados.find((creado) => creado.config.prefix === prefijo)
    if (!limitador) throw new Error(`sin balde ${prefijo}`)
    return { ...modulo, limitador }
  }

  it("lee lo que queda con getRemaining y nunca llama a limit", async () => {
    const { quedaLimite, limitador } = await balde("eli:fila-virtual-negocio")
    limitador.getRemaining.mockResolvedValue({ remaining: 3, reset: 0 })
    expect(await quedaLimite("filaVirtualPorNegocio", "negocio-1")).toEqual({ permitido: true, restantes: 3 })
    limitador.getRemaining.mockResolvedValue({ remaining: 0, reset: 0 })
    expect((await quedaLimite("filaVirtualPorNegocio", "negocio-1")).permitido).toBe(false)
    expect(limitador.getRemaining).toHaveBeenCalledWith("negocio-1")
    expect(limitador.limit).not.toHaveBeenCalled()
  })

  it("si Upstash falla, falla cerrado para la fila, como verificarLimite", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const { quedaLimite } = await balde("eli:fila-virtual-negocio")
    expect(await quedaLimite("filaVirtualPorNegocio", "negocio-1")).toEqual({ permitido: false, restantes: 0 })
  })

  it("si Upstash no contesta a tiempo, también cerrado", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    vi.useFakeTimers()
    try {
      const { quedaLimite, limitador } = await balde("eli:fila-virtual-negocio")
      limitador.getRemaining.mockReturnValue(new Promise(() => {}))
      const pendiente = quedaLimite("filaVirtualPorNegocio", "negocio-1")
      await vi.advanceTimersByTimeAsync(2000)
      expect(await pendiente).toEqual({ permitido: false, restantes: 0 })
    } finally {
      vi.useRealTimers()
    }
  })
})

describe("el balde de la lista de espera por email, en todos los negocios", () => {
  beforeEach(() => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://fake.upstash.io")
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "fake-token")
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("listaDeEsperaPorEmail cuenta en su propio balde, de 10 por día, separado del de por negocio", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const { Ratelimit } = (await import("@upstash/ratelimit")) as unknown as { Ratelimit: RatelimitFalso }
    Ratelimit.creados.length = 0
    const { verificarLimite } = await import("./rate-limit")

    await verificarLimite("listaDeEsperaPorEmail", "hash-del-email")

    const usados = Ratelimit.creados.filter((limitador) => limitador.limit.mock.calls.length > 0)
    expect(usados).toHaveLength(1)
    expect(usados[0].config).toMatchObject({ prefix: "eli:lista-de-espera-email", limiter: { tokens: 10, ventana: "24 h" } })
    expect(usados[0].limit).toHaveBeenCalledWith("hash-del-email")
  })
})

describe("el balde de las bajas por token", () => {
  beforeEach(() => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://fake.upstash.io")
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "fake-token")
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("bajaPorToken cuenta en su propio balde, de 30 por 10 minutos", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const { Ratelimit } = (await import("@upstash/ratelimit")) as unknown as { Ratelimit: RatelimitFalso }
    Ratelimit.creados.length = 0
    const { verificarLimite } = await import("./rate-limit")

    await verificarLimite("bajaPorToken", "203.0.113.7")

    const usados = Ratelimit.creados.filter((limitador) => limitador.limit.mock.calls.length > 0)
    expect(usados).toHaveLength(1)
    expect(usados[0].config).toMatchObject({ prefix: "eli:baja-por-token", limiter: { tokens: 30, ventana: "10 m" } })
  })
})

describe("verificarLimite sin Upstash configurado, en producción", () => {
  beforeEach(() => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "")
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "")
    vi.stubEnv("NODE_ENV", "production")
    vi.resetModules()
  })

  it("NO deja pasar (fail-closed): sin credenciales, en producción, se bloquea", async () => {
    const { verificarLimite } = await import("./rate-limit")
    const resultado = await verificarLimite("login", "127.0.0.1")
    expect(resultado.permitido).toBe(false)
    expect(resultado.restantes).toBe(0)
  })

  it("avisa con console.error, de forma inequívoca, que falta configuración", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    const { verificarLimite } = await import("./rate-limit")
    await verificarLimite("login", "127.0.0.1")
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("CONFIGURACIÓN FALTANTE"))
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("PRODUCCIÓN"))
    spy.mockRestore()
  })
})

describe("verificarLimite sin Upstash configurado, fuera de producción", () => {
  beforeEach(() => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "")
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "")
    vi.stubEnv("NODE_ENV", "development")
    vi.resetModules()
  })

  it("deja pasar (fail-open): sin credenciales, fuera de producción, no bloquea el desarrollo local", async () => {
    const { verificarLimite } = await import("./rate-limit")
    const resultado = await verificarLimite("login", "127.0.0.1")
    expect(resultado.permitido).toBe(true)
  })
})

describe("obtenerIp", () => {
  it("prefiere x-vercel-forwarded-for, que fija Vercel y el cliente no puede inyectar", async () => {
    const { obtenerIp } = await import("./rate-limit")
    const headers = new Headers({
      "x-vercel-forwarded-for": "8.8.4.4",
      "x-real-ip": "9.9.9.9",
      "x-forwarded-for": "1.2.3.4, 5.6.7.8",
    })
    expect(obtenerIp({ headers })).toBe("8.8.4.4")
  })

  it("sin x-vercel-forwarded-for usa x-real-ip antes que un x-forwarded-for que pudo venir del cliente", async () => {
    const { obtenerIp } = await import("./rate-limit")
    const headers = new Headers({ "x-real-ip": "9.9.9.9", "x-forwarded-for": "1.2.3.4, 5.6.7.8" })
    expect(obtenerIp({ headers })).toBe("9.9.9.9")
  })

  it("toma la primera IP de x-forwarded-for", async () => {
    const { obtenerIp } = await import("./rate-limit")
    const headers = new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" })
    expect(obtenerIp({ headers })).toBe("1.2.3.4")
  })

  it("usa x-real-ip si no hay x-forwarded-for", async () => {
    const { obtenerIp } = await import("./rate-limit")
    const headers = new Headers({ "x-real-ip": "9.9.9.9" })
    expect(obtenerIp({ headers })).toBe("9.9.9.9")
  })

  it("cae a un valor por defecto si no hay ningún header", async () => {
    const { obtenerIp } = await import("./rate-limit")
    const headers = new Headers()
    expect(obtenerIp({ headers })).toBe("127.0.0.1")
  })
})
