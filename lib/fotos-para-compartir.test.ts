import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import sharp from "sharp"
import { ponerAlmacenDeFotos } from "./almacenamiento-de-fotos"
import {
  LIMITE_DE_BYTES,
  MEDIDAS_DE_LA_IMAGEN,
  SIN_FOTOS,
  leerFotosParaCompartir,
  prepararFotoParaCompartir,
} from "./fotos-para-compartir"
import { crearAlmacenEnMemoria, jpegDePrueba, webpDePrueba, type AlmacenEnMemoria } from "@/pruebas/almacen-de-fotos"

const mockBuscarNegocio = vi.fn()
vi.mock("@/lib/prisma", () => ({ prisma: { business: { findUnique: (...args: unknown[]) => mockBuscarNegocio(...args) } } }))

const UUID = "0b8a7c1e-2d3f-4a5b-8c9d-0e1f2a3b4c5d"
const OTRO_UUID = "9f8e7d6c-5b4a-4c3d-8e2f-1a0b9c8d7e6f"
const CLAVE_LOGO = `negocios/negocio-1/logo-${UUID}.webp`
const CLAVE_PORTADA = `negocios/negocio-1/portada-${OTRO_UUID}.webp`

let almacen: AlmacenEnMemoria
let errores: ReturnType<typeof vi.spyOn>

/** Decodifica un data URL de imagen: su tipo, y los píxeles ya abiertos. */
async function abrir(dataUrl: string) {
  const [, tipo, base64] = /^data:(image\/[a-z]+);base64,(.+)$/.exec(dataUrl)!
  const { data, info } = await sharp(Buffer.from(base64, "base64")).raw().toBuffer({ resolveWithObject: true })
  const pixel = (x: number, y: number) => [...data.subarray((y * info.width + x) * info.channels, (y * info.width + x) * info.channels + info.channels)]
  return { tipo, ancho: info.width, alto: info.height, canales: info.channels, pixel }
}

const negocio = (parcial: Record<string, unknown> = {}) => ({
  id: "negocio-1",
  logoUrl: `/fotos/${CLAVE_LOGO}`,
  coverUrl: `/fotos/${CLAVE_PORTADA}`,
  ...parcial,
})

beforeEach(async () => {
  vi.clearAllMocks()
  errores = vi.spyOn(console, "error").mockImplementation(() => undefined)
  almacen = crearAlmacenEnMemoria({
    [CLAVE_LOGO]: { bytes: await webpDePrueba(300, 300), tipoMime: "image/webp" },
    [CLAVE_PORTADA]: { bytes: await webpDePrueba(1600, 400), tipoMime: "image/webp" },
  })
  ponerAlmacenDeFotos(almacen)
  mockBuscarNegocio.mockResolvedValue(negocio())
})
afterEach(() => {
  ponerAlmacenDeFotos(undefined)
  errores.mockRestore()
})

describe("prepararFotoParaCompartir: lo que satori sí decodifica, del tamaño con que se dibuja", () => {
  it("el logo sale PNG, cuadrado al doble de lo que se dibuja y recortado en círculo (esquinas transparentes, centro opaco)", async () => {
    const lado = MEDIDAS_DE_LA_IMAGEN.logo * 2
    const { tipo, ancho, alto, pixel } = await abrir(await prepararFotoParaCompartir(await webpDePrueba(512, 512), "logo"))

    expect(tipo).toBe("image/png")
    expect([ancho, alto]).toEqual([lado, lado])
    expect(pixel(0, 0)[3]).toBe(0)
    expect(pixel(lado - 1, lado - 1)[3]).toBe(0)
    // El verde de `webpDePrueba` (aprox., por la compresión con pérdida).
    const [r, g, b, a] = pixel(lado / 2, lado / 2)
    expect(a).toBe(255)
    expect(g).toBeGreaterThan(150)
    expect(r).toBeLessThan(80)
    expect(b).toBeLessThan(160)
  })

  it("un logo que no es cuadrado se recorta del centro, como `object-cover` en la página, sin deformarlo", async () => {
    const ancho = await sharp({ create: { width: 512, height: 200, channels: 3, background: "#00ff00" } })
      .composite([{ input: await sharp({ create: { width: 100, height: 200, channels: 3, background: "#ff0000" } }).png().toBuffer(), left: 0, top: 0 }])
      .webp({ lossless: true })
      .toBuffer()

    const { pixel } = await abrir(await prepararFotoParaCompartir(ancho, "logo"))

    // Cubre el cuadrado con la parte central (verde): el rojo de la punta izquierda queda afuera.
    expect(pixel(MEDIDAS_DE_LA_IMAGEN.logo, MEDIDAS_DE_LA_IMAGEN.logo).slice(0, 3)).toEqual([0, 255, 0])
    expect(pixel(40, MEDIDAS_DE_LA_IMAGEN.logo).slice(0, 3)).toEqual([0, 255, 0])
  })

  it("la portada sale JPEG de la banda (1200 × 210), recortada del centro, sin transparencia", async () => {
    const { tipo, ancho, alto, canales } = await abrir(await prepararFotoParaCompartir(await webpDePrueba(1600, 400), "portada"))

    expect(tipo).toBe("image/jpeg")
    expect([ancho, alto]).toEqual([MEDIDAS_DE_LA_IMAGEN.ancho, MEDIDAS_DE_LA_IMAGEN.banda])
    expect(canales).toBe(3)
  })

  it("una portada con transparencia se apoya sobre el fondo crema de la imagen", async () => {
    const transparente = await sharp({ create: { width: 800, height: 200, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .webp({ lossless: true })
      .toBuffer()

    const { pixel } = await abrir(await prepararFotoParaCompartir(transparente, "portada"))

    const [r, g, b] = pixel(600, 100)
    expect([r, g, b].every((canal, i) => Math.abs(canal - [0xfc, 0xfb, 0xf8][i]) <= 3)).toBe(true)
  })

  it("lo que no es una imagen, lo vacío y lo demasiado grande lanzan: quien llama lo toma como «sin foto»", async () => {
    await expect(prepararFotoParaCompartir(Buffer.from("no soy una imagen"), "logo")).rejects.toThrow()
    await expect(prepararFotoParaCompartir(new Uint8Array(), "portada")).rejects.toThrow()
    await expect(prepararFotoParaCompartir(new Uint8Array(LIMITE_DE_BYTES + 1), "portada")).rejects.toThrow("tamaño")
  })

  it("una «bomba de píxeles» (pocos bytes, millones de píxeles) no se decodifica", async () => {
    const bomba = await sharp({ create: { width: 4000, height: 4000, channels: 3, background: "#ffffff" } }).webp({ lossless: true }).toBuffer()
    expect(bomba.byteLength).toBeLessThan(LIMITE_DE_BYTES)

    await expect(prepararFotoParaCompartir(bomba, "portada")).rejects.toThrow()
  })
})

describe("leerFotosParaCompartir: el logo y la portada del negocio del slug, o nada", () => {
  it("devuelve las dos como data URL, buscando el negocio por el slug", async () => {
    const fotos = await leerFotosParaCompartir("salon-ana")

    expect(fotos.logo).toMatch(/^data:image\/png;base64,/)
    expect(fotos.portada).toMatch(/^data:image\/jpeg;base64,/)
    expect(mockBuscarNegocio).toHaveBeenCalledWith({ where: { slug: "salon-ana" }, select: { id: true, logoUrl: true, coverUrl: true } })
    // Lee directo del almacén, las dos claves y nada más.
    expect(almacen.operaciones.map((operacion) => operacion.clave).sort()).toEqual([CLAVE_LOGO, CLAVE_PORTADA].sort())
    expect(almacen.operaciones.every((operacion) => operacion.operacion === "leer")).toBe(true)
  })

  it("sólo con logo, o sólo con portada, devuelve esa y la otra queda en null sin pedirla", async () => {
    mockBuscarNegocio.mockResolvedValueOnce(negocio({ coverUrl: null }))
    const soloLogo = await leerFotosParaCompartir("salon-ana")
    expect(soloLogo.logo).not.toBeNull()
    expect(soloLogo.portada).toBeNull()
    expect(almacen.operaciones.map((operacion) => operacion.clave)).toEqual([CLAVE_LOGO])

    almacen.operaciones.length = 0
    mockBuscarNegocio.mockResolvedValueOnce(negocio({ logoUrl: null }))
    const soloPortada = await leerFotosParaCompartir("salon-ana")
    expect(soloPortada.logo).toBeNull()
    expect(soloPortada.portada).not.toBeNull()
    expect(almacen.operaciones.map((operacion) => operacion.clave)).toEqual([CLAVE_PORTADA])
  })

  it("una ruta de OTRO negocio en la fila no se lee: ni se toca el almacén (aunque el objeto exista)", async () => {
    const claveAjena = `negocios/negocio-2/logo-${UUID}.webp`
    almacen.objetos.set(claveAjena, { bytes: await jpegDePrueba(), tipoMime: "image/webp" })
    mockBuscarNegocio.mockResolvedValueOnce(negocio({ logoUrl: `/fotos/${claveAjena}`, coverUrl: `/fotos/negocios/negocio-2/portada-${OTRO_UUID}.webp` }))

    expect(await leerFotosParaCompartir("salon-ana")).toEqual(SIN_FOTOS)
    expect(almacen.operaciones).toEqual([])
  })

  it("lo que no tiene la forma de una clave nuestra (escapadas, otro sitio, otra extensión) no se lee", async () => {
    for (const url of [
      `/fotos/negocios/negocio-2/../negocio-1/logo-${UUID}.webp`,
      `/fotos/negocios/negocio-1/../../logo-${UUID}.webp`,
      "https://cdn.ejemplo.cl/logo.png",
      "//cdn.ejemplo.cl/logo.png",
      `/fotos/negocios/negocio-1/logo-${UUID}.png`,
      "/fotos/negocios/negocio-1/logo.webp",
      "/imagenes/logo.webp",
    ]) {
      mockBuscarNegocio.mockResolvedValueOnce(negocio({ logoUrl: url, coverUrl: url }))
      expect(await leerFotosParaCompartir("salon-ana")).toEqual(SIN_FOTOS)
    }
    expect(almacen.operaciones).toEqual([])
  })

  it("el negocio es el del slug: el id con que se valida sale de esa fila", async () => {
    mockBuscarNegocio.mockResolvedValueOnce(negocio({ id: "negocio-9" }))

    // Las claves son de `negocio-1`: no son de `negocio-9`.
    expect(await leerFotosParaCompartir("salon-ana")).toEqual(SIN_FOTOS)
    expect(almacen.operaciones).toEqual([])
  })

  it("un slug que no existe, o una base caída: sin fotos y sin lanzar", async () => {
    mockBuscarNegocio.mockResolvedValueOnce(null)
    expect(await leerFotosParaCompartir("no-existe")).toEqual(SIN_FOTOS)

    mockBuscarNegocio.mockRejectedValueOnce(new Error("base caída"))
    expect(await leerFotosParaCompartir("salon-ana")).toEqual(SIN_FOTOS)
    expect(almacen.operaciones).toEqual([])
  })

  it("sin almacén (producción sin R2): sin fotos y sin lanzar", async () => {
    ponerAlmacenDeFotos(null)
    expect(await leerFotosParaCompartir("salon-ana")).toEqual(SIN_FOTOS)

    // También si se lo pasan explícito.
    expect(await leerFotosParaCompartir("salon-ana", { almacen: null })).toEqual(SIN_FOTOS)
  })

  it("un objeto que no está: esa foto en null, la otra se sirve", async () => {
    almacen.objetos.delete(CLAVE_LOGO)

    const fotos = await leerFotosParaCompartir("salon-ana")

    expect(fotos.logo).toBeNull()
    expect(fotos.portada).not.toBeNull()
  })

  it("el almacén falla al leer: sin fotos, sin lanzar y sin volcar claves ni rutas al registro", async () => {
    almacen.fallar.leer = true

    expect(await leerFotosParaCompartir("salon-ana")).toEqual(SIN_FOTOS)

    const registrado = JSON.stringify(errores.mock.calls)
    expect(errores).toHaveBeenCalled()
    expect(registrado).not.toContain(CLAVE_LOGO)
    expect(registrado).not.toContain("negocio-1")
  })

  it("una lectura que no responde se da por perdida a los pocos segundos: sin fotos en vez de colgar la imagen", async () => {
    const colgado = { ...almacen, leer: () => new Promise<never>(() => undefined) }

    const inicio = Date.now()
    const fotos = await leerFotosParaCompartir("salon-ana", { almacen: colgado, esperaMaximaEnMs: 30 })

    expect(fotos).toEqual(SIN_FOTOS)
    expect(Date.now() - inicio).toBeLessThan(2_000)
  })

  it("un archivo enorme o ilegible en el almacén: esa foto en null (cae a las iniciales / al color)", async () => {
    almacen.objetos.set(CLAVE_LOGO, { bytes: new Uint8Array(LIMITE_DE_BYTES + 1), tipoMime: "image/webp" })
    almacen.objetos.set(CLAVE_PORTADA, { bytes: Uint8Array.from([1, 2, 3, 4]), tipoMime: "image/webp" })

    expect(await leerFotosParaCompartir("salon-ana")).toEqual(SIN_FOTOS)
  })
})
