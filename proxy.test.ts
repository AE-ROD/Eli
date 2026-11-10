import { describe, it, expect, vi, beforeEach } from "vitest"
import type { NextRequest } from "next/server"

const mockGetToken = vi.fn()
const mockVerificarLimite = vi.fn()

vi.mock("next-auth/jwt", () => ({
  getToken: (...args: unknown[]) => mockGetToken(...args),
}))

vi.mock("@/lib/rate-limit", () => ({
  obtenerIp: () => "127.0.0.1",
  verificarLimite: (...args: unknown[]) => mockVerificarLimite(...args),
}))

const pedidoFalso = (pathname: string, method = "GET", cookies: string[] = []): NextRequest =>
  ({
    method,
    url: `http://localhost${pathname}`,
    nextUrl: { pathname },
    headers: new Headers(),
    cookies: { getAll: () => cookies.map((name) => ({ name, value: "x" })) },
  }) as unknown as NextRequest

describe("proxy — rate limit de los endpoints del panel", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetToken.mockResolvedValue({ id: "usuario-1", businessId: "negocio-1" })
    mockVerificarLimite.mockResolvedValue({ permitido: true, restantes: 100 })
  })

  it("responde 429 con un mensaje entendible cuando se pasa el límite", async () => {
    const { default: proxy } = await import("./proxy")

    mockVerificarLimite.mockResolvedValueOnce({ permitido: false, restantes: 0 })

    const res = await proxy(pedidoFalso("/api/clientes"))
    const data = await res.json()

    expect(res.status).toBe(429)
    expect(typeof data.error).toBe("string")
    expect(data.error.length).toBeGreaterThan(0)
    // Nada de un error crudo (stack, objeto de Upstash, etc.)
    expect(data.error).not.toMatch(/upstash|stack|ratelimit/i)
  })

  it("cuenta por sesión (usuario), no sólo por IP: usa el id del actor como clave", async () => {
    const { default: proxy } = await import("./proxy")

    mockGetToken.mockResolvedValueOnce({ id: "usuario-42", businessId: "negocio-1" })

    await proxy(pedidoFalso("/api/citas"))

    expect(mockVerificarLimite).toHaveBeenCalledWith("panelLectura", "usuario:usuario-42")
  })

  it("dos personas del mismo negocio (misma IP, distinta sesión) no comparten el cupo", async () => {
    const { default: proxy } = await import("./proxy")

    mockGetToken.mockResolvedValueOnce({ id: "empleado-a", businessId: "negocio-1" })
    await proxy(pedidoFalso("/api/citas"))

    mockGetToken.mockResolvedValueOnce({ id: "empleado-b", businessId: "negocio-1" })
    await proxy(pedidoFalso("/api/citas"))

    const claves = mockVerificarLimite.mock.calls.map((llamada) => llamada[1])
    expect(claves[0]).not.toBe(claves[1])
  })

  it("usa el límite de escritura (más bajo) en POST/PUT/DELETE y el de lectura en GET", async () => {
    const { default: proxy } = await import("./proxy")

    await proxy(pedidoFalso("/api/clientes", "GET"))
    expect(mockVerificarLimite).toHaveBeenLastCalledWith("panelLectura", expect.any(String))

    await proxy(pedidoFalso("/api/clientes", "POST"))
    expect(mockVerificarLimite).toHaveBeenLastCalledWith("panelEscritura", expect.any(String))
  })

  it("deja pasar cuando no se pasó el límite", async () => {
    const { default: proxy } = await import("./proxy")

    const res = await proxy(pedidoFalso("/api/equipo"))

    expect(res.status).not.toBe(429)
  })

  it.each([
    "/api/auth/registro",
    "/api/auth/recuperar-contrasena",
    "/api/auth/restablecer-contrasena",
    "/api/cron/recordatorios",
    "/api/reservar/mi-negocio/disponibilidad",
    "/api/equipo/invitacion/token-123",
    "/api/equipo/invitacion/token-123/aceptar",
    "/api/cron/correos-de-prueba",
    "/api/correos/baja",
    "/api/correos/baja-de-cliente",
  ])("no aplica el límite del panel a %s (tiene el suyo propio, o no corresponde)", async (ruta) => {
    const { default: proxy } = await import("./proxy")

    await proxy(pedidoFalso(ruta, "POST"))

    expect(mockVerificarLimite).not.toHaveBeenCalledWith("panelLectura", expect.anything())
    expect(mockVerificarLimite).not.toHaveBeenCalledWith("panelEscritura", expect.anything())
  })

  it.each([
    ["DELETE", "/api/equipo/pendientes/inv-1"],
    ["POST", "/api/equipo/pendientes/inv-1/reenviar"],
    ["PUT", "/api/clientes/c-1"],
    ["DELETE", "/api/clientes/c-1"],
  ])("%s %s lleva el límite de escritura del panel: no cae en la excepción de /api/equipo/invitacion", async (metodo, ruta) => {
    const { default: proxy } = await import("./proxy")

    mockVerificarLimite.mockResolvedValueOnce({ permitido: false, restantes: 0 })

    const res = await proxy(pedidoFalso(ruta, metodo))

    expect(mockVerificarLimite).toHaveBeenCalledWith("panelEscritura", "usuario:usuario-1")
    expect(res.status).toBe(429)
  })

  it.each(["/api/correos/bajas", "/api/correos/baja-otra-cosa", "/api/cronometro", "/api/reservaciones"])(
    "%s lleva el límite del panel: una excepción cubre su ruta y lo que cuelga de ella, no cualquier nombre que empiece igual",
    async (ruta) => {
      const { default: proxy } = await import("./proxy")

      await proxy(pedidoFalso(ruta, "POST"))

      expect(mockVerificarLimite).toHaveBeenCalledWith("panelEscritura", "usuario:usuario-1")
    }
  )

  it("POST /api/auth/session (update de la sesión) lleva el límite de escritura, por sesión (#49)", async () => {
    const { default: proxy } = await import("./proxy")

    mockVerificarLimite.mockResolvedValueOnce({ permitido: false, restantes: 0 })

    const res = await proxy(pedidoFalso("/api/auth/session", "POST"))

    expect(mockVerificarLimite).toHaveBeenCalledWith("panelEscritura", "usuario:usuario-1")
    expect(res.status).toBe(429)
  })

  it("POST /api/auth/session sin sesión cuenta por IP", async () => {
    const { default: proxy } = await import("./proxy")

    mockGetToken.mockResolvedValueOnce(null)

    const res = await proxy(pedidoFalso("/api/auth/session", "POST"))

    expect(mockVerificarLimite).toHaveBeenCalledWith("panelEscritura", "ip:127.0.0.1")
    expect(res.status).not.toBe(429)
  })

  it("GET /api/auth/session (el que NextAuth pide solo) sigue sin tope: cortarlo dejaría al panel sin sesión", async () => {
    const { default: proxy } = await import("./proxy")

    await proxy(pedidoFalso("/api/auth/session", "GET"))

    expect(mockVerificarLimite).not.toHaveBeenCalled()
  })

  it("sin sesión, cuenta por IP en vez de romper la petición", async () => {
    const { default: proxy } = await import("./proxy")

    mockGetToken.mockResolvedValueOnce(null)

    await proxy(pedidoFalso("/api/clientes"))

    expect(mockVerificarLimite).toHaveBeenCalledWith("panelLectura", "ip:127.0.0.1")
  })
})

describe("proxy — Content-Security-Policy con nonce", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetToken.mockResolvedValue({ id: "usuario-1", businessId: "negocio-1" })
    mockVerificarLimite.mockResolvedValue({ permitido: true, restantes: 100 })
  })

  const nonceDe = (csp: string | null) => csp?.match(/'nonce-([^']+)'/)?.[1]

  it.each(["/", "/iniciar-sesion", "/reservar/mi-negocio", "/dashboard", "/api/citas"])(
    "pone la CSP con nonce en la respuesta de %s",
    async (ruta) => {
      const { default: proxy } = await import("./proxy")
      const res = await proxy(pedidoFalso(ruta))
      const csp = res.headers.get("content-security-policy")
      expect(csp).toContain("frame-ancestors 'none'")
      expect(nonceDe(csp)).toBeTruthy()
    }
  )

  it("genera un nonce distinto en cada petición", async () => {
    const { default: proxy } = await import("./proxy")
    const a = await proxy(pedidoFalso("/"))
    const b = await proxy(pedidoFalso("/"))
    expect(nonceDe(a.headers.get("content-security-policy"))).not.toBe(
      nonceDe(b.headers.get("content-security-policy"))
    )
  })

  it("también va en las redirecciones y en los 429", async () => {
    const { default: proxy } = await import("./proxy")

    mockGetToken.mockResolvedValueOnce(null)
    const redireccion = await proxy(pedidoFalso("/dashboard"))
    expect(redireccion.status).toBe(307)
    expect(redireccion.headers.get("content-security-policy")).toContain("'nonce-")

    mockVerificarLimite.mockResolvedValueOnce({ permitido: false, restantes: 0 })
    const limitada = await proxy(pedidoFalso("/api/clientes"))
    expect(limitada.status).toBe(429)
    expect(limitada.headers.get("content-security-policy")).toContain("'nonce-")
  })

  it("las páginas públicas sólo suman la CSP: sin sesión no redirigen ni consultan el token", async () => {
    const { default: proxy } = await import("./proxy")
    mockGetToken.mockResolvedValue(null)

    for (const ruta of ["/", "/iniciar-sesion", "/crear-cuenta", "/reservar/mi-negocio", "/dashboardx", "/baja-de-correos/abc.def"]) {
      const res = await proxy(pedidoFalso(ruta))
      expect(res.headers.get("location")).toBeNull()
    }
    expect(mockGetToken).not.toHaveBeenCalled()
    expect(mockVerificarLimite).not.toHaveBeenCalled()
  })

  it("el panel sigue redirigiendo igual que antes", async () => {
    const { default: proxy } = await import("./proxy")

    mockGetToken.mockResolvedValueOnce(null)
    expect((await proxy(pedidoFalso("/dashboard/agenda"))).headers.get("location")).toBe(
      "http://localhost/iniciar-sesion"
    )

    mockGetToken.mockResolvedValueOnce({ id: "u", businessId: null })
    expect((await proxy(pedidoFalso("/dashboard"))).headers.get("location")).toBe(
      "http://localhost/completar-perfil"
    )

    mockGetToken.mockResolvedValueOnce({ id: "u", businessId: "n", role: "owner", tieneNegocioPropio: true })
    expect((await proxy(pedidoFalso("/completar-perfil"))).headers.get("location")).toBe(
      "http://localhost/dashboard"
    )
  })
})

/**
 * Una cuenta en varios negocios (PRODUCTO.md, sección 5): sin contexto
 * elegido no entra al panel; con algún negocio elige, sin ninguno completa el
 * perfil. Quien sólo es miembro puede crear su propio negocio.
 */
describe("proxy — contextos de la cuenta", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockVerificarLimite.mockResolvedValue({ permitido: true, restantes: 100 })
  })

  it("con varios contextos y ninguno elegido, el panel manda a elegir negocio (no a completar el perfil)", async () => {
    const { default: proxy } = await import("./proxy")
    mockGetToken.mockResolvedValueOnce({ id: "u", businessId: null, contextos: 2, tieneNegocioPropio: true })

    const res = await proxy(pedidoFalso("/dashboard/agenda"))

    expect(res.headers.get("location")).toBe("http://localhost/elegir-negocio")
  })

  it("con un contexto de miembro elegido entra al panel", async () => {
    const { default: proxy } = await import("./proxy")
    mockGetToken.mockResolvedValueOnce({ id: "u", businessId: "n", role: "worker", contextos: 1, tieneNegocioPropio: false })

    const res = await proxy(pedidoFalso("/dashboard"))

    expect(res.headers.get("location")).toBeNull()
  })

  it("quien sólo es miembro puede abrir completar-perfil para crear su propio negocio", async () => {
    const { default: proxy } = await import("./proxy")
    mockGetToken.mockResolvedValueOnce({ id: "u", businessId: "n", role: "worker", contextos: 1, tieneNegocioPropio: false })

    const res = await proxy(pedidoFalso("/completar-perfil"))

    expect(res.headers.get("location")).toBeNull()
  })

  it("quien ya es dueña de un negocio no vuelve a completar-perfil, aunque esté trabajando como profesional", async () => {
    const { default: proxy } = await import("./proxy")
    mockGetToken.mockResolvedValueOnce({ id: "u", businessId: "n", role: "worker", contextos: 2, tieneNegocioPropio: true })

    const res = await proxy(pedidoFalso("/completar-perfil"))

    expect(res.headers.get("location")).toBe("http://localhost/dashboard")
  })

  it("elegir negocio exige sesión, y sin ningún negocio manda a completar el perfil", async () => {
    const { default: proxy } = await import("./proxy")

    mockGetToken.mockResolvedValueOnce(null)
    expect((await proxy(pedidoFalso("/elegir-negocio"))).headers.get("location")).toBe("http://localhost/iniciar-sesion")

    mockGetToken.mockResolvedValueOnce({ id: "u", businessId: null, contextos: 0 })
    expect((await proxy(pedidoFalso("/elegir-negocio"))).headers.get("location")).toBe(
      "http://localhost/completar-perfil"
    )

    mockGetToken.mockResolvedValueOnce({ id: "u", businessId: null, contextos: 3 })
    expect((await proxy(pedidoFalso("/elegir-negocio"))).headers.get("location")).toBeNull()
  })
})

/**
 * La ruta se compara decodificada (A1 de la revisión): Next enruta
 * `/api/auth/callback/credential%73` a NextAuth igual que la ruta sin
 * codificar, y comparar la cruda dejaba saltarse el límite.
 */
describe("proxy — rutas codificadas", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetToken.mockResolvedValue({ id: "usuario-1", businessId: "negocio-1" })
    mockVerificarLimite.mockResolvedValue({ permitido: true, restantes: 100 })
  })

  it.each(["/api/auth/callback/credentials", "/api/auth/callback/credential%73", "/api/auth/callback/%63redentials", "/api/auth/c%61llback/credentials"])(
    "el login por %s lleva el límite de login y, al pasarse, responde 429 con la url que lee signIn",
    async (ruta) => {
      const { default: proxy } = await import("./proxy")
      mockVerificarLimite.mockResolvedValueOnce({ permitido: false, restantes: 0 })

      const res = await proxy(pedidoFalso(ruta, "POST"))
      const cuerpo = await res.json()

      expect(mockVerificarLimite).toHaveBeenCalledWith("login", "127.0.0.1")
      expect(res.status).toBe(429)
      expect(cuerpo.error).toMatch(/demasiados intentos/i)
      // `signIn` de next-auth hace `new URL(data.url)`: sin url lanzaba y el botón quedaba girando.
      expect(new URL(cuerpo.url).searchParams.get("error")).toBe("DemasiadosIntentos")
    }
  )

  it("POST /api/auth/sessio%6E (update codificado) lleva el límite de escritura por sesión", async () => {
    const { default: proxy } = await import("./proxy")
    mockVerificarLimite.mockResolvedValueOnce({ permitido: false, restantes: 0 })

    const res = await proxy(pedidoFalso("/api/auth/sessio%6E", "POST"))

    expect(mockVerificarLimite).toHaveBeenCalledWith("panelEscritura", "usuario:usuario-1")
    expect(res.status).toBe(429)
  })

  it("una página del panel con una letra codificada sigue exigiendo sesión", async () => {
    const { default: proxy } = await import("./proxy")
    mockGetToken.mockResolvedValueOnce(null)

    const res = await proxy(pedidoFalso("/dashboar%64/agenda"))

    expect(res.headers.get("location")).toBe("http://localhost/iniciar-sesion")
  })

  it("rutaDecodificada decodifica por segmento y deja como vino un segmento mal codificado", async () => {
    const { rutaDecodificada } = await import("./proxy")

    expect(rutaDecodificada("/api/auth/callback/credential%73")).toBe("/api/auth/callback/credentials")
    expect(rutaDecodificada("/api/a%2Fb/c")).toBe("/api/a/b/c")
    expect(rutaDecodificada("/api/%E0%A4%A/x")).toBe("/api/%E0%A4%A/x")
  })
})

/**
 * Una sesión revocada (usuario borrado, o sesiones cerradas por un
 * restablecimiento de contraseña) llega con token pero sin `id`: la
 * revalidación de `lib/auth.ts` se lo quita. Antes el proxy la mandaba a
 * completar-perfil, cuyo POST responde 401: el usuario quedaba atrapado.
 */
describe("proxy — sesión revocada", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockVerificarLimite.mockResolvedValue({ permitido: true, restantes: 100 })
  })

  /** Las cookies que la respuesta vence (Max-Age=0 o Expires en el pasado). */
  const cookiesBorradas = (res: Response) =>
    res.headers
      .getSetCookie()
      .filter((c) => /max-age=0|expires=thu, 01 jan 1970/i.test(c))
      .map((c) => c.split("=")[0])

  it.each(["/dashboard", "/dashboard/agenda", "/completar-perfil"])(
    "token sin id en %s: a iniciar sesión con el error SesionCerrada",
    async (ruta) => {
      const { default: proxy } = await import("./proxy")
      mockGetToken.mockResolvedValueOnce({ id: "", businessId: null })

      const res = await proxy(pedidoFalso(ruta))

      expect(res.status).toBe(307)
      expect(res.headers.get("location")).toBe("http://localhost/iniciar-sesion?error=SesionCerrada")
    }
  )

  it("borra las cookies de sesión de NextAuth, con y sin __Secure-, y sus pedazos", async () => {
    const { default: proxy } = await import("./proxy")
    mockGetToken.mockResolvedValueOnce({ businessId: null })

    const res = await proxy(
      pedidoFalso("/dashboard", "GET", [
        "__Secure-next-auth.session-token.0",
        "__Secure-next-auth.session-token.1",
        "otra-cookie",
      ])
    )
    const borradas = cookiesBorradas(res)

    expect(borradas).toEqual(
      expect.arrayContaining([
        "next-auth.session-token",
        "__Secure-next-auth.session-token",
        "__Secure-next-auth.session-token.0",
        "__Secure-next-auth.session-token.1",
      ])
    )
    expect(borradas).not.toContain("otra-cookie")
    // Una cookie __Secure- sólo se puede pisar desde una respuesta que la marque Secure
    for (const c of res.headers.getSetCookie().filter((c) => c.startsWith("__Secure-"))) {
      expect(c).toMatch(/;\s*secure/i)
    }
    expect(res.headers.get("content-security-policy")).toContain("'nonce-")
  })

  it("con id pero sin negocio (usuario nuevo de Google) sigue yendo a completar el perfil, sin borrar nada", async () => {
    const { default: proxy } = await import("./proxy")

    mockGetToken.mockResolvedValueOnce({ id: "u", businessId: null })
    const alDashboard = await proxy(pedidoFalso("/dashboard"))
    expect(alDashboard.headers.get("location")).toBe("http://localhost/completar-perfil")
    expect(cookiesBorradas(alDashboard)).toEqual([])

    mockGetToken.mockResolvedValueOnce({ id: "u", businessId: null })
    const enCompletar = await proxy(pedidoFalso("/completar-perfil"))
    expect(enCompletar.headers.get("location")).toBeNull()
    expect(cookiesBorradas(enCompletar)).toEqual([])
  })

  it("el rate limit del panel no cambia: un token sin id cuenta por IP y no redirige", async () => {
    const { default: proxy } = await import("./proxy")
    mockGetToken.mockResolvedValueOnce({ id: "", businessId: null })

    const res = await proxy(pedidoFalso("/api/clientes"))

    expect(mockVerificarLimite).toHaveBeenCalledWith("panelLectura", "ip:127.0.0.1")
    expect(res.headers.get("location")).toBeNull()
  })
})

describe("proxy — tope del cuerpo de la API (GHSA-mrhx-c7xc-m3w5)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetToken.mockResolvedValue({ id: "usuario-1", businessId: "negocio-1" })
    mockVerificarLimite.mockResolvedValue({ permitido: true, restantes: 100 })
  })

  const conLargo = (pathname: string, largo: number): NextRequest => {
    const pedido = pedidoFalso(pathname, "POST")
    pedido.headers.set("content-length", String(largo))
    return pedido
  }

  it("un Content-Length sobre el techo da 413 antes del rate limit, en el panel y en lo público", async () => {
    const { default: proxy } = await import("./proxy")

    for (const ruta of ["/api/clientes", "/api/reservar/salon-uno/confirmar"]) {
      const res = await proxy(conLargo(ruta, 6 * 1024 * 1024))
      expect(res.status).toBe(413)
      expect(await res.json()).toEqual({ error: "El pedido es demasiado grande." })
    }
    expect(mockVerificarLimite).not.toHaveBeenCalled()
  })

  it("bajo el techo deja pasar (el tope fino lo pone cada endpoint)", async () => {
    const { default: proxy } = await import("./proxy")

    const res = await proxy(conLargo("/api/clientes/importar", 3 * 1024 * 1024))

    expect(res.status).toBe(200)
  })
})
