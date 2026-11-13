import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from "vitest"
import { createElement } from "react"
import { ImageResponse } from "next/og"
import sharp from "sharp"
import { ponerAlmacenDeFotos } from "@/lib/almacenamiento-de-fotos"
import { colorDelNegocio, iniciales } from "@/lib/pagina-del-negocio"
import { crearAlmacenEnMemoria, type AlmacenEnMemoria } from "@/pruebas/almacen-de-fotos"
import { lineaDeLaImagen } from "./_frases"

const mockLeer = vi.fn()
const mockLimite = vi.fn()
const mockBuscarNegocio = vi.fn()

vi.mock("./_pagina/datos-de-la-pagina", () => ({ leerPaginaDelNegocio: (...args: unknown[]) => mockLeer(...args) }))
vi.mock("@/lib/prisma", () => ({ prisma: { business: { findUnique: (...args: unknown[]) => mockBuscarNegocio(...args) } } }))
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-real-ip": "203.0.113.7" }) }))
vi.mock("@/lib/rate-limit", () => ({
  obtenerIp: (pedido: { headers: Headers }) => pedido.headers.get("x-real-ip"),
  verificarLimite: (...args: unknown[]) => mockLimite(...args),
}))

const params = (slug: string) => ({ params: Promise.resolve({ slug }) })

beforeEach(() => {
  vi.clearAllMocks()
  mockLimite.mockResolvedValue({ permitido: true, restantes: 10 })
})

describe("opengraph-image de la página del negocio", () => {
  it("genera un PNG con el nombre del negocio", async () => {
    const { default: Imagen } = await import("./opengraph-image")
    mockLeer.mockResolvedValueOnce({ nombre: "Salón Ñandú", comuna: "Ñuñoa", color: colorDelNegocio("noche") })

    const respuesta = await Imagen(params("salon-nandu"))

    expect(respuesta.status).toBe(200)
    expect(respuesta.headers.get("content-type")).toBe("image/png")
    const bytes = new Uint8Array(await respuesta.arrayBuffer())
    // Firma de un PNG.
    expect([...bytes.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47])
    expect(mockLeer).toHaveBeenCalledWith("salon-nandu")
  }, 20_000)

  it("con el rubro del negocio (`rubro`), también genera el PNG: la palabra de la reserva sale de su vocabulario", async () => {
    const { default: Imagen } = await import("./opengraph-image")
    for (const rubro of ["salon", "odontologia", "salud"]) {
      mockLeer.mockResolvedValueOnce({ nombre: "Casa Ana", comuna: null, rubro, color: colorDelNegocio(null) })

      const respuesta = await Imagen(params("casa-ana"))

      expect(respuesta.status).toBe(200)
      expect(respuesta.headers.get("content-type")).toBe("image/png")
    }
  }, 30_000)

  it("un slug que no existe da 404", async () => {
    const { default: Imagen } = await import("./opengraph-image")
    mockLeer.mockResolvedValueOnce(null)

    expect((await Imagen(params("no-existe"))).status).toBe(404)
  })

  it("cuenta por IP con el límite de lectura pública y, al pasarse, 429 sin leer la base", async () => {
    const { default: Imagen } = await import("./opengraph-image")
    mockLimite.mockResolvedValueOnce({ permitido: false, restantes: 0 })

    const respuesta = await Imagen(params("salon"))

    expect(respuesta.status).toBe(429)
    expect(mockLimite).toHaveBeenCalledWith("lecturaPublica", "203.0.113.7")
    expect(mockLeer).not.toHaveBeenCalled()
  })
})

// ─── Con el logo y la portada del negocio ────────────────────────────────────

const UUID_LOGO = "0b8a7c1e-2d3f-4a5b-8c9d-0e1f2a3b4c5d"
const UUID_PORTADA = "9f8e7d6c-5b4a-4c3d-8e2f-1a0b9c8d7e6f"
const CLAVE_LOGO = `negocios/negocio-1/logo-${UUID_LOGO}.webp`
const CLAVE_PORTADA = `negocios/negocio-1/portada-${UUID_PORTADA}.webp`

/** Una foto de un solo color, como las que guarda `procesarFoto` (WebP). */
const solida = (ancho: number, alto: number, color: string) =>
  sharp({ create: { width: ancho, height: alto, channels: 3, background: color } }).webp({ lossless: true }).toBuffer()

/** Los píxeles de la imagen generada: [r, g, b, a] en (x, y). */
async function pixeles(respuesta: Response) {
  const { data, info } = await sharp(Buffer.from(await respuesta.arrayBuffer())).raw().toBuffer({ resolveWithObject: true })
  return {
    ancho: info.width,
    alto: info.height,
    en: (x: number, y: number) => [...data.subarray((y * info.width + x) * info.channels, (y * info.width + x) * info.channels + 4)],
  }
}

/** ±`margen` por canal: las fotos pasan por un JPEG. */
const esCasi = (obtenido: number[], esperado: number[], margen = 12) => esperado.every((canal, i) => Math.abs(obtenido[i] - canal) <= margen)

const paginaCon = (parcial: Record<string, unknown> = {}) => ({
  nombre: "Salón Ñandú",
  comuna: "Ñuñoa",
  rubro: "salon",
  color: colorDelNegocio("noche"),
  logo: null,
  portada: null,
  ...parcial,
})
const conFotos = { logo: `/fotos/${CLAVE_LOGO}`, portada: `/fotos/${CLAVE_PORTADA}` }

// El centro del círculo del logo y un punto de la banda lejos de él.
const CENTRO_DEL_LOGO = [164, 210] as const
const EN_LA_BANDA = [900, 100] as const
// Dentro del círculo, a la izquierda de las iniciales.
const EN_EL_CIRCULO_SIN_LETRAS = [100, 212] as const
// Bajo la banda, donde va el texto.
const DEBAJO_DE_LA_BANDA = [1100, 330] as const

const NOCHE = [0x07, 0x1a, 0x31]
const CREMA = [0xfc, 0xfb, 0xf8]
const ROJO = [0xd0, 0x20, 0x30]
const AZUL = [0x20, 0x50, 0xd0]

describe("opengraph-image con el logo y la portada del negocio", () => {
  let almacen: AlmacenEnMemoria
  let fetchEspiado: MockInstance<typeof fetch>

  beforeEach(async () => {
    almacen = crearAlmacenEnMemoria({
      [CLAVE_LOGO]: { bytes: await solida(512, 512, "#d02030"), tipoMime: "image/webp" },
      [CLAVE_PORTADA]: { bytes: await solida(1600, 400, "#2050d0"), tipoMime: "image/webp" },
    })
    ponerAlmacenDeFotos(almacen)
    mockBuscarNegocio.mockResolvedValue({ id: "negocio-1", logoUrl: conFotos.logo, coverUrl: conFotos.portada })
    // Las fotos se leen del almacén, no pidiéndole la ruta pública a nuestro propio dominio.
    fetchEspiado = vi.spyOn(globalThis, "fetch")
    vi.spyOn(console, "error").mockImplementation(() => undefined)
  })
  afterEach(() => {
    ponerAlmacenDeFotos(undefined)
    vi.restoreAllMocks()
  })

  it("con logo, el círculo muestra el logo en vez de las iniciales, y la portada es la banda de arriba", async () => {
    const { default: Imagen } = await import("./opengraph-image")
    mockLeer.mockResolvedValueOnce(paginaCon(conFotos))

    const respuesta = await Imagen(params("salon-nandu"))
    expect(respuesta.status).toBe(200)
    expect(respuesta.headers.get("content-type")).toBe("image/png")
    const imagen = await pixeles(respuesta)

    expect([imagen.ancho, imagen.alto]).toEqual([1200, 630])
    expect(esCasi(imagen.en(...CENTRO_DEL_LOGO), ROJO)).toBe(true)
    expect(esCasi(imagen.en(...EN_EL_CIRCULO_SIN_LETRAS), ROJO)).toBe(true)
    expect(esCasi(imagen.en(...EN_LA_BANDA), AZUL)).toBe(true)
    // El logo es redondo: la esquina del cuadrado que lo contiene se ve crema (el borde), no el logo.
    expect(esCasi(imagen.en(88, 134), ROJO)).toBe(false)
    expect(fetchEspiado).not.toHaveBeenCalled()
    expect(mockBuscarNegocio).toHaveBeenCalledWith(expect.objectContaining({ where: { slug: "salon-nandu" } }))
    // Leyó directo del almacén las dos fotos de este negocio.
    expect(almacen.operaciones.map((operacion) => operacion.clave).sort()).toEqual([CLAVE_LOGO, CLAVE_PORTADA].sort())
  })

  it("el texto no va sobre la portada: bajo la banda sigue el fondo crema, así que el contraste del navy no depende de la foto", async () => {
    const { default: Imagen } = await import("./opengraph-image")
    mockLeer.mockResolvedValueOnce(paginaCon(conFotos))

    const imagen = await pixeles(await Imagen(params("salon-nandu")))

    expect(imagen.en(...DEBAJO_DE_LA_BANDA).slice(0, 3)).toEqual(CREMA)
    expect(imagen.en(600, 211).slice(0, 3)).toEqual(CREMA)
    expect(imagen.en(600, 209)[2]).toBeGreaterThan(150) // y la banda llega hasta el 210
  })

  it("sólo con portada: la banda es la portada y el círculo sigue con las iniciales en el color del negocio", async () => {
    const { default: Imagen } = await import("./opengraph-image")
    mockBuscarNegocio.mockResolvedValueOnce({ id: "negocio-1", logoUrl: null, coverUrl: conFotos.portada })
    mockLeer.mockResolvedValueOnce(paginaCon({ portada: conFotos.portada }))

    const imagen = await pixeles(await Imagen(params("salon-nandu")))

    expect(esCasi(imagen.en(...EN_LA_BANDA), AZUL)).toBe(true)
    expect(esCasi(imagen.en(...EN_EL_CIRCULO_SIN_LETRAS), NOCHE, 3)).toBe(true)
  })

  it("sólo con logo: el color del negocio sigue siendo la banda y el logo va en el círculo", async () => {
    const { default: Imagen } = await import("./opengraph-image")
    mockBuscarNegocio.mockResolvedValueOnce({ id: "negocio-1", logoUrl: conFotos.logo, coverUrl: null })
    mockLeer.mockResolvedValueOnce(paginaCon({ logo: conFotos.logo }))

    const imagen = await pixeles(await Imagen(params("salon-nandu")))

    expect(esCasi(imagen.en(...EN_LA_BANDA), NOCHE, 3)).toBe(true)
    expect(esCasi(imagen.en(...CENTRO_DEL_LOGO), ROJO)).toBe(true)
  })

  it("sin logo ni portada ni siquiera va a la base o al almacén, y la imagen es la de siempre", async () => {
    const { default: Imagen } = await import("./opengraph-image")
    mockLeer.mockResolvedValueOnce(paginaCon())

    const respuesta = await Imagen(params("salon-nandu"))

    expect(respuesta.status).toBe(200)
    expect(mockBuscarNegocio).not.toHaveBeenCalled()
    expect(almacen.operaciones).toEqual([])
    const imagen = await pixeles(respuesta)
    expect(esCasi(imagen.en(...EN_LA_BANDA), NOCHE, 3)).toBe(true)
    expect(esCasi(imagen.en(...EN_EL_CIRCULO_SIN_LETRAS), NOCHE, 3)).toBe(true)
  })

  it("sin logo ni portada, sale byte a byte igual al diseño de antes de las fotos (iniciales sobre el color, nombre y comuna)", async () => {
    const { default: Imagen } = await import("./opengraph-image")
    const casos = [
      paginaCon(),
      paginaCon({ nombre: "Clínica Dental Sonrisa Perfecta y Asociados Limitada de Providencia", comuna: null, rubro: "odontologia", color: colorDelNegocio("durazno") }),
      paginaCon({ nombre: "Casa Ana", comuna: "Providencia", rubro: "salud", color: colorDelNegocio(null) }),
    ]
    for (const pagina of casos) {
      mockLeer.mockResolvedValueOnce(pagina)
      const nueva = Buffer.from(await (await Imagen(params("x"))).arrayBuffer())

      const anterior = Buffer.from(await new ImageResponse(disenoDeAntes(pagina), { width: 1200, height: 630 }).arrayBuffer())

      expect(nueva.equals(anterior)).toBe(true)
    }
  }, 30_000)

  it("si las fotos no se pueden leer (sin almacén, objeto que no está, almacén caído, archivo ilegible) la imagen sale igual que la de iniciales, sin romperse", async () => {
    const { default: Imagen } = await import("./opengraph-image")
    mockLeer.mockResolvedValueOnce(paginaCon())
    const sinFotos = Buffer.from(await (await Imagen(params("x"))).arrayBuffer())

    const fallas: [string, () => void][] = [
      ["sin almacén", () => ponerAlmacenDeFotos(null)],
      ["objetos que no están", () => almacen.objetos.clear()],
      ["almacén caído", () => (almacen.fallar.leer = true)],
      [
        "archivos ilegibles",
        () => {
          almacen.objetos.set(CLAVE_LOGO, { bytes: Uint8Array.from([1, 2, 3]), tipoMime: "image/webp" })
          almacen.objetos.set(CLAVE_PORTADA, { bytes: Uint8Array.from([4, 5, 6]), tipoMime: "image/webp" })
        },
      ],
    ]
    for (const [motivo, provocar] of fallas) {
      provocar()
      mockLeer.mockResolvedValueOnce(paginaCon(conFotos))

      const respuesta = await Imagen(params("x"))

      expect(respuesta.status, motivo).toBe(200)
      expect(Buffer.from(await respuesta.arrayBuffer()).equals(sinFotos), motivo).toBe(true)
      // Lo siguiente parte de cero.
      ponerAlmacenDeFotos(almacen)
      almacen.fallar.leer = false
      almacen.objetos.clear()
    }
  }, 60_000)

  it("si la fila trae la ruta de una foto de OTRO negocio, no la lee ni la muestra", async () => {
    const { default: Imagen } = await import("./opengraph-image")
    const claveAjena = `negocios/negocio-2/logo-${UUID_LOGO}.webp`
    almacen.objetos.set(claveAjena, { bytes: await solida(512, 512, "#d02030"), tipoMime: "image/webp" })
    mockBuscarNegocio.mockResolvedValueOnce({ id: "negocio-1", logoUrl: `/fotos/${claveAjena}`, coverUrl: null })
    mockLeer.mockResolvedValueOnce(paginaCon({ logo: `/fotos/${claveAjena}` }))

    const imagen = await pixeles(await Imagen(params("salon-nandu")))

    expect(almacen.operaciones).toEqual([])
    expect(esCasi(imagen.en(...EN_EL_CIRCULO_SIN_LETRAS), NOCHE, 3)).toBe(true)
  })

  it("un nombre larguísimo sin espacios se parte y se corta con «…» sin salirse de la imagen ni del borde de abajo", async () => {
    const { default: Imagen } = await import("./opengraph-image")
    mockLeer.mockResolvedValueOnce(paginaCon({ ...conFotos, nombre: "M".repeat(120), comuna: "W".repeat(120) }))

    const respuesta = await Imagen(params("salon-nandu"))

    expect(respuesta.status).toBe(200)
    const imagen = await pixeles(respuesta)
    // Margen derecho (x ≥ 1120) y fila de abajo del todo: sólo el fondo crema.
    for (const [x, y] of [
      [1150, 330],
      [1150, 400],
      [1150, 480],
      [1150, 560],
      [600, 629],
      [100, 629],
    ]) {
      expect(imagen.en(x, y).slice(0, 3), `(${x}, ${y})`).toEqual(CREMA)
    }
  }, 20_000)
})

/**
 * El diseño de la imagen tal como era antes de las fotos (sin logo ni portada),
 * armado a mano: la referencia contra la que se compara la de ahora.
 */
function disenoDeAntes(pagina: ReturnType<typeof paginaCon>) {
  const CREMA_ = "#fcfbf8"
  const NAVY_ = "#071a31"
  const TEXTO_2_ = "#5f6d77"
  const { fondo, texto } = pagina.color
  const nombre = pagina.nombre as string
  const comuna = pagina.comuna as string | null
  const linea = lineaDeLaImagen(pagina.rubro as string)
  const div = (style: Record<string, unknown>, ...hijos: unknown[]) => createElement("div", { style }, ...(hijos as never[]))
  return div(
    { width: "100%", height: "100%", display: "flex", flexDirection: "column", background: CREMA_ },
    div({ display: "flex", height: 210, background: fondo }),
    div(
      { display: "flex", flexDirection: "column", padding: "0 80px", flexGrow: 1 },
      div(
        { display: "flex", alignItems: "center", justifyContent: "center", width: 168, height: 168, marginTop: -84, borderRadius: 84, border: `10px solid ${CREMA_}`, background: fondo, color: texto, fontSize: 64, fontWeight: 600 },
        iniciales(nombre)
      ),
      div({ display: "flex", marginTop: 28, fontSize: nombre.length > 28 ? 64 : 84, fontWeight: 600, color: NAVY_, letterSpacing: -2, lineHeight: 1.05 }, nombre.slice(0, 60)),
      div({ display: "flex", marginTop: 16, fontSize: 36, color: TEXTO_2_ }, comuna ? `${comuna.slice(0, 60)} · ${linea}` : linea)
    )
  )
}
