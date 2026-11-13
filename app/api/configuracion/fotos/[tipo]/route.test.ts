import sharp from "sharp"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ponerAlmacenDeFotos } from "@/lib/almacenamiento-de-fotos"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, OTRO_NEGOCIO, datosBase, sesiones } from "@/pruebas/datos"
import {
  crearAlmacenEnMemoria,
  jpegDePrueba,
  pedidoDeFoto,
  pngDePrueba,
  type AlmacenEnMemoria,
} from "@/pruebas/almacen-de-fotos"

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const mockVerificarLimite = vi.fn(async (..._args: unknown[]) => ({ permitido: true, restantes: 19 }))
vi.mock("@/lib/rate-limit", () => ({
  verificarLimite: (...args: unknown[]) => mockVerificarLimite(...args),
}))

const base = crearBaseFalsa()
vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

const UUID_VIEJO = "0b8a7c1e-2d3f-4a5b-8c9d-0e1f2a3b4c5d"
const LOGO_VIEJO = `negocios/${NEGOCIO}/logo-${UUID_VIEJO}.webp`
const PORTADA_VIEJA = `negocios/${NEGOCIO}/portada-${UUID_VIEJO}.webp`
const AJENO = `negocios/${OTRO_NEGOCIO}/logo-${UUID_VIEJO}.webp`
const WEBP_VIEJO = { bytes: Uint8Array.from([1, 2, 3]), tipoMime: "image/webp" }

const URL_DE_LOGO = "http://localhost/api/configuracion/fotos/logo"
const contexto = (tipo: string) => ({ params: Promise.resolve({ tipo }) })

let almacen: AlmacenEnMemoria

const negocio = (id = NEGOCIO) => base.buscar("business", { id })[0]

async function subir(sesion: unknown, tipo: string, bytes?: Uint8Array, opciones?: Parameters<typeof pedidoDeFoto>[2]) {
  const { PUT } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  const respuesta = await PUT(pedidoDeFoto(URL_DE_LOGO, bytes, opciones), contexto(tipo))
  return { status: respuesta.status, cuerpo: await respuesta.json(), respuesta }
}

async function quitar(sesion: unknown, tipo: string) {
  const { DELETE } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  const respuesta = await DELETE(pedidoDeFoto(URL_DE_LOGO, undefined, { metodo: "DELETE", tipo: null }), contexto(tipo))
  return { status: respuesta.status, cuerpo: await respuesta.json() }
}

/** Todos los objetos que hay en el almacén, por clave. */
const claves = () => [...almacen.objetos.keys()].sort()

beforeEach(() => {
  vi.clearAllMocks()
  mockVerificarLimite.mockResolvedValue({ permitido: true, restantes: 19 })
  base.reiniciar(datosBase())
  almacen = crearAlmacenEnMemoria()
  ponerAlmacenDeFotos(almacen)
})

afterEach(() => {
  ponerAlmacenDeFotos(undefined)
  vi.restoreAllMocks()
})

describe("PUT /api/configuracion/fotos/[tipo]: quién y sobre qué", () => {
  it("la dueña sube el logo: queda en una clave nueva del negocio y la columna apunta a ella", async () => {
    const { status, cuerpo } = await subir(sesiones.dueña, "logo", await jpegDePrueba())

    expect(status).toBe(200)
    expect(cuerpo.url).toMatch(new RegExp(`^/fotos/negocios/${NEGOCIO}/logo-[0-9a-f-]{36}\\.webp$`))
    expect(negocio().logoUrl).toBe(cuerpo.url)
    expect(negocio().coverUrl).toBeNull()
    expect(claves()).toEqual([cuerpo.url.slice("/fotos/".length)])
  })

  it("lo guardado es WebP reducido por el servidor, no los bytes que mandó el navegador", async () => {
    const original = await jpegDePrueba(3000, 2000)
    const { cuerpo } = await subir(sesiones.dueña, "logo", original)

    const objeto = almacen.objetos.get(cuerpo.url.slice("/fotos/".length))!
    expect(objeto.tipoMime).toBe("image/webp")
    const medidas = await sharp(objeto.bytes).metadata()
    expect(medidas.format).toBe("webp")
    expect([medidas.width, medidas.height]).toEqual([512, 341])
    expect(objeto.bytes.byteLength).toBeLessThan(original.byteLength)
  })

  it("el encargado sube la portada (1600 × 400) en su columna", async () => {
    const { status, cuerpo } = await subir(sesiones.encargado, "portada", await pngDePrueba(1000, 1000), { tipo: "image/png" })

    expect(status).toBe(200)
    expect(cuerpo.url).toMatch(new RegExp(`^/fotos/negocios/${NEGOCIO}/portada-[0-9a-f-]{36}\\.webp$`))
    expect(negocio().coverUrl).toBe(cuerpo.url)
    expect(negocio().logoUrl).toBeNull()
    const medidas = await sharp(almacen.objetos.get(cuerpo.url.slice("/fotos/".length))!.bytes).metadata()
    expect([medidas.width, medidas.height]).toEqual([1600, 400])
  })

  it("el profesional recibe 401 y no se escribe nada", async () => {
    const antes = base.volcado()

    expect((await subir(sesiones.carla, "logo", await jpegDePrueba())).status).toBe(401)
    expect((await subir(sesiones.sinMiembro, "logo", await jpegDePrueba())).status).toBe(401)

    expect(base.volcado()).toEqual(antes)
    expect(almacen.operaciones).toEqual([])
    expect(mockVerificarLimite).not.toHaveBeenCalled()
  })

  it("sin sesión, 401", async () => {
    expect((await subir(null, "logo", await jpegDePrueba())).status).toBe(401)
    expect(almacen.operaciones).toEqual([])
  })

  it("siempre sobre el negocio de la sesión: la dueña del otro negocio no toca el primero", async () => {
    const { status, cuerpo } = await subir(sesiones.dueñoAjeno, "logo", await jpegDePrueba())

    expect(status).toBe(200)
    expect(cuerpo.url).toContain(`/fotos/negocios/${OTRO_NEGOCIO}/`)
    expect(negocio(OTRO_NEGOCIO).logoUrl).toBe(cuerpo.url)
    expect(negocio(NEGOCIO).logoUrl).toBeNull()
  })

  it.each(["miembro", "Logo", "cover", "../logo", "logo%2F..", ""])("un tipo inválido (%j) da 400 y no escribe nada", async (tipo) => {
    const antes = base.volcado()

    const { status, cuerpo } = await subir(sesiones.dueña, tipo, await jpegDePrueba())

    expect(status).toBe(400)
    expect(cuerpo.error).toMatch(/logo y la portada/)
    expect(base.volcado()).toEqual(antes)
    expect(almacen.operaciones).toEqual([])
  })

  it("el permiso se pregunta antes que el tipo: sin permiso, ni siquiera se sabe si el tipo existe", async () => {
    expect((await subir(sesiones.carla, "miembro", await jpegDePrueba())).status).toBe(401)
  })
})

describe("PUT /api/configuracion/fotos/[tipo]: el pedido", () => {
  it("el tipo de contenido que no es JPEG, PNG o WebP da 400, sin leer el cuerpo", async () => {
    const antes = base.volcado()
    for (const tipo of ["text/plain", "image/svg+xml", "image/gif", "multipart/form-data; boundary=x", "application/json", "", null]) {
      const { status, cuerpo } = await subir(sesiones.dueña, "logo", await jpegDePrueba(), { tipo })
      expect(status, String(tipo)).toBe(400)
      expect(cuerpo.error).toMatch(/JPG, PNG o WebP/)
    }
    expect(base.volcado()).toEqual(antes)
    expect(almacen.operaciones).toEqual([])
  })

  it("acepta el tipo en mayúsculas o con parámetros", async () => {
    expect((await subir(sesiones.dueña, "logo", await jpegDePrueba(), { tipo: "IMAGE/JPEG" })).status).toBe(200)
    expect((await subir(sesiones.dueña, "logo", await jpegDePrueba(), { tipo: "image/jpeg; charset=binary" })).status).toBe(200)
  })

  it("un Content-Length declarado sobre 5 MB da 413 sin leer el cuerpo", async () => {
    const { status, cuerpo } = await subir(sesiones.dueña, "logo", await jpegDePrueba(), {
      cabeceras: { "content-length": String(6 * 1024 * 1024) },
    })

    expect(status).toBe(413)
    expect(cuerpo.error).toMatch(/5 MB/)
    expect(almacen.operaciones).toEqual([])
    expect(negocio().logoUrl).toBeNull()
  })

  it("un cuerpo de más de 5 MB da 413 aunque no lo declare (ni mienta) en la cabecera", async () => {
    const grande = new Uint8Array(5 * 1024 * 1024 + 1)

    const { status } = await subir(sesiones.dueña, "logo", grande, { cabeceras: { "content-length": "100" } })

    expect(status).toBe(413)
    expect(almacen.operaciones).toEqual([])
  })

  it.each([
    ["texto con extensión de imagen", Buffer.from("esto es un texto: foto.jpg")],
    ["un SVG que dice ser PNG", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')],
    ["un cuerpo vacío", new Uint8Array(0)],
  ])("%s da 400 con el motivo, y no se guarda nada", async (_caso, bytes) => {
    const antes = base.volcado()

    const { status, cuerpo } = await subir(sesiones.dueña, "logo", bytes, { tipo: "image/png" })

    expect(status).toBe(400)
    expect(cuerpo.error).toMatch(/JPG, PNG o WebP/)
    expect(base.volcado()).toEqual(antes)
    expect(almacen.operaciones).toEqual([])
  })

  it("una imagen truncada da 400", async () => {
    const entera = await jpegDePrueba(1200, 900)

    const { status, cuerpo } = await subir(sesiones.dueña, "logo", entera.subarray(0, 200))

    expect(status).toBe(400)
    expect(cuerpo.error).toMatch(/dañada o incompleta/)
    expect(almacen.operaciones).toEqual([])
  })

  it("el tipo real lo decide el contenido: un PNG declarado como JPEG se acepta, y sale WebP", async () => {
    const { status, cuerpo } = await subir(sesiones.dueña, "logo", await pngDePrueba(), { tipo: "image/jpeg" })

    expect(status).toBe(200)
    expect((await sharp(almacen.objetos.get(cuerpo.url.slice("/fotos/".length))!.bytes).metadata()).format).toBe("webp")
  })
})

describe("PUT /api/configuracion/fotos/[tipo]: límite y almacén", () => {
  it("pasado el límite de la sesión, 429 y no se hace nada; el balde es `fotos`, por usuario", async () => {
    mockVerificarLimite.mockResolvedValueOnce({ permitido: false, restantes: 0 })

    const { status, cuerpo } = await subir(sesiones.dueña, "logo", await jpegDePrueba())

    expect(status).toBe(429)
    expect(cuerpo.error).toMatch(/Espera un rato/)
    expect(mockVerificarLimite).toHaveBeenCalledWith("fotos", "usuario:u-duena")
    expect(almacen.operaciones).toEqual([])
    expect(negocio().logoUrl).toBeNull()
  })

  it("el límite cuenta por sesión: dos personas del mismo negocio no se gastan el cupo entre sí", async () => {
    await subir(sesiones.dueña, "logo", await jpegDePrueba())
    await subir(sesiones.encargado, "portada", await jpegDePrueba())

    expect(mockVerificarLimite.mock.calls.map(([, clave]) => clave)).toEqual(["usuario:u-duena", "usuario:u-encargado"])
  })

  it("sin almacén (producción sin R2_*): 503 con un mensaje claro, sin gastar el cupo ni tocar la base", async () => {
    ponerAlmacenDeFotos(null)
    const antes = base.volcado()

    const { status, cuerpo } = await subir(sesiones.dueña, "logo", await jpegDePrueba())

    expect(status).toBe(503)
    expect(cuerpo.error).toMatch(/todavía no están disponibles/)
    expect(base.volcado()).toEqual(antes)
    expect(mockVerificarLimite).not.toHaveBeenCalled()
  })

  it("si el almacén falla al guardar: 502, y la foto de antes sigue en su lugar", async () => {
    base.reiniciar({ ...datosBase(), business: [{ id: NEGOCIO, name: "Salón Uno", slug: "salon-uno", userId: "u-duena", logoUrl: `/fotos/${LOGO_VIEJO}` }] })
    almacen.objetos.set(LOGO_VIEJO, WEBP_VIEJO)
    almacen.fallar.guardar = true
    vi.spyOn(console, "error").mockImplementation(() => {})

    const { status, cuerpo } = await subir(sesiones.dueña, "logo", await jpegDePrueba())

    expect(status).toBe(502)
    expect(cuerpo.error).toMatch(/No pudimos guardar/)
    expect(negocio().logoUrl).toBe(`/fotos/${LOGO_VIEJO}`)
    expect(claves()).toEqual([LOGO_VIEJO])
  })
})

describe("PUT /api/configuracion/fotos/[tipo]: reemplazar", () => {
  beforeEach(() => {
    base.reiniciar({
      ...datosBase(),
      business: [
        { id: NEGOCIO, name: "Salón Uno", slug: "salon-uno", userId: "u-duena", logoUrl: `/fotos/${LOGO_VIEJO}`, coverUrl: `/fotos/${PORTADA_VIEJA}` },
        { id: OTRO_NEGOCIO, name: "Salón Dos", slug: "salon-dos", userId: "u-otro" },
      ],
    })
    almacen.objetos.set(LOGO_VIEJO, WEBP_VIEJO)
    almacen.objetos.set(PORTADA_VIEJA, WEBP_VIEJO)
  })

  it("primero guarda el nuevo, después apunta la columna, recién entonces borra el anterior", async () => {
    const { status, cuerpo } = await subir(sesiones.dueña, "logo", await jpegDePrueba())

    expect(status).toBe(200)
    const nueva = cuerpo.url.slice("/fotos/".length)
    expect(nueva).not.toBe(LOGO_VIEJO)
    expect(nueva.startsWith(`negocios/${NEGOCIO}/`)).toBe(true)
    expect(almacen.operaciones).toEqual([
      { operacion: "guardar", clave: nueva },
      { operacion: "borrar", clave: LOGO_VIEJO },
    ])
    expect(negocio().logoUrl).toBe(cuerpo.url)
    // La portada no se tocó.
    expect(negocio().coverUrl).toBe(`/fotos/${PORTADA_VIEJA}`)
    expect(claves()).toEqual([nueva, PORTADA_VIEJA].sort())
  })

  it("si la columna no se puede escribir: borra el objeto NUEVO y deja el anterior", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    base.prisma.business.updateMany.mockRejectedValueOnce(new Error("la base se cayó"))

    const { status } = await subir(sesiones.dueña, "logo", await jpegDePrueba())

    expect(status).toBe(500)
    expect(negocio().logoUrl).toBe(`/fotos/${LOGO_VIEJO}`)
    expect(claves()).toEqual([LOGO_VIEJO, PORTADA_VIEJA].sort())
    const [guardado, borrado] = almacen.operaciones
    expect(guardado.operacion).toBe("guardar")
    expect(borrado).toEqual({ operacion: "borrar", clave: guardado.clave })
  })

  it("si borrar el anterior falla, igual responde 200: queda un huérfano que nadie ve", async () => {
    const registro = vi.spyOn(console, "error").mockImplementation(() => {})
    almacen.fallar.borrar = true

    const { status, cuerpo } = await subir(sesiones.dueña, "logo", await jpegDePrueba())

    expect(status).toBe(200)
    expect(negocio().logoUrl).toBe(cuerpo.url)
    expect(registro).toHaveBeenCalled()
    // El registro no lleva la clave ni el mensaje del almacén, sólo el nombre del error.
    expect(JSON.stringify(registro.mock.calls)).not.toContain(LOGO_VIEJO)
  })

  it.each([
    ["una foto de OTRO negocio", `/fotos/${AJENO}`],
    ["una dirección externa", "https://cdn.ejemplo.cl/logo.png"],
    ["una ruta con ..", `/fotos/negocios/${NEGOCIO}/../${OTRO_NEGOCIO}/logo-${UUID_VIEJO}.webp`],
    ["una ruta de otro lugar del sitio", "/publico/logo.png"],
    ["una ruta sin forma de clave", `/fotos/negocios/${NEGOCIO}/cualquier-cosa.webp`],
  ])("NUNCA borra por lo que diga la base si no es una foto de este negocio: %s", async (_caso, urlGuardada) => {
    base.reiniciar({
      ...datosBase(),
      business: [{ id: NEGOCIO, name: "Salón Uno", slug: "salon-uno", userId: "u-duena", logoUrl: urlGuardada }],
    })
    almacen.objetos.set(AJENO, WEBP_VIEJO)

    const { status } = await subir(sesiones.dueña, "logo", await jpegDePrueba())

    expect(status).toBe(200)
    expect(almacen.operaciones.filter((op) => op.operacion === "borrar")).toEqual([])
    expect(almacen.objetos.has(AJENO)).toBe(true)
  })
})

describe("DELETE /api/configuracion/fotos/[tipo]", () => {
  beforeEach(() => {
    base.reiniciar({
      ...datosBase(),
      business: [
        { id: NEGOCIO, name: "Salón Uno", slug: "salon-uno", userId: "u-duena", logoUrl: `/fotos/${LOGO_VIEJO}`, coverUrl: `/fotos/${PORTADA_VIEJA}` },
        { id: OTRO_NEGOCIO, name: "Salón Dos", slug: "salon-dos", userId: "u-otro" },
      ],
    })
    almacen.objetos.set(LOGO_VIEJO, WEBP_VIEJO)
    almacen.objetos.set(PORTADA_VIEJA, WEBP_VIEJO)
  })

  it("la dueña quita el logo: la columna queda en null, el objeto se borra y la portada no se toca", async () => {
    const { status, cuerpo } = await quitar(sesiones.dueña, "logo")

    expect(status).toBe(200)
    expect(cuerpo).toEqual({ url: null })
    expect(negocio().logoUrl).toBeNull()
    expect(negocio().coverUrl).toBe(`/fotos/${PORTADA_VIEJA}`)
    expect(claves()).toEqual([PORTADA_VIEJA])
  })

  it("el encargado quita la portada", async () => {
    expect((await quitar(sesiones.encargado, "portada")).status).toBe(200)
    expect(negocio().coverUrl).toBeNull()
    expect(claves()).toEqual([LOGO_VIEJO])
  })

  it("sin foto, quitar igual responde 200 con url null y no borra nada", async () => {
    await quitar(sesiones.dueña, "logo")
    almacen.operaciones.length = 0

    expect(await quitar(sesiones.dueña, "logo")).toEqual({ status: 200, cuerpo: { url: null } })
    expect(almacen.operaciones).toEqual([])
  })

  it("el profesional y sin sesión: 401 sin cambiar nada", async () => {
    const antes = base.volcado()
    expect((await quitar(sesiones.carla, "logo")).status).toBe(401)
    expect((await quitar(null, "logo")).status).toBe(401)
    expect(base.volcado()).toEqual(antes)
    expect(claves()).toEqual([LOGO_VIEJO, PORTADA_VIEJA].sort())
  })

  it("un tipo inválido da 400", async () => {
    expect((await quitar(sesiones.dueña, "miembro")).status).toBe(400)
    expect(negocio().logoUrl).toBe(`/fotos/${LOGO_VIEJO}`)
  })

  it("sólo el negocio de la sesión: la dueña del otro negocio no quita nada del primero", async () => {
    expect(await quitar(sesiones.dueñoAjeno, "logo")).toEqual({ status: 200, cuerpo: { url: null } })
    expect(negocio(NEGOCIO).logoUrl).toBe(`/fotos/${LOGO_VIEJO}`)
    expect(claves()).toEqual([LOGO_VIEJO, PORTADA_VIEJA].sort())
  })

  it("no borra un objeto si la columna apunta a otro negocio", async () => {
    base.reiniciar({
      ...datosBase(),
      business: [{ id: NEGOCIO, name: "Salón Uno", slug: "salon-uno", userId: "u-duena", logoUrl: `/fotos/${AJENO}` }],
    })
    almacen.objetos.set(AJENO, WEBP_VIEJO)

    expect((await quitar(sesiones.dueña, "logo")).status).toBe(200)

    expect(negocio().logoUrl).toBeNull()
    expect(almacen.objetos.has(AJENO)).toBe(true)
  })

  it("si borrar el objeto falla, igual responde 200: la foto ya no se ve", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    almacen.fallar.borrar = true

    expect((await quitar(sesiones.dueña, "logo")).status).toBe(200)
    expect(negocio().logoUrl).toBeNull()
  })

  it("pasado el límite: 429; sin almacén: 503; en ninguno cambia nada", async () => {
    const antes = base.volcado()

    mockVerificarLimite.mockResolvedValueOnce({ permitido: false, restantes: 0 })
    expect((await quitar(sesiones.dueña, "logo")).status).toBe(429)

    ponerAlmacenDeFotos(null)
    expect((await quitar(sesiones.dueña, "logo")).status).toBe(503)

    expect(base.volcado()).toEqual(antes)
  })
})
