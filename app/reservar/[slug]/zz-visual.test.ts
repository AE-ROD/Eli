import { it, vi } from "vitest"
import sharp from "sharp"
import { writeFileSync } from "node:fs"
import { colorDelNegocio } from "@/lib/pagina-del-negocio"
import { ponerAlmacenDeFotos } from "@/lib/almacenamiento-de-fotos"
import { crearAlmacenEnMemoria } from "@/pruebas/almacen-de-fotos"
const OUT = "/tmp/claude-0/-home-user-Eli/ba6d8d51-55a4-58a8-a74d-1f3be87bd0b1/scratchpad"
const mockLeer = vi.fn()
const mockNegocio = vi.fn()
vi.mock("./_pagina/datos-de-la-pagina", () => ({ leerPaginaDelNegocio: (...a: unknown[]) => mockLeer(...a) }))
vi.mock("@/lib/prisma", () => ({ prisma: { business: { findUnique: (...a: unknown[]) => mockNegocio(...a) } } }))
vi.mock("next/headers", () => ({ headers: async () => new Headers() }))
vi.mock("@/lib/rate-limit", () => ({ obtenerIp: () => "1.1.1.1", verificarLimite: async () => ({ permitido: true, restantes: 5 }) }))
const UUID = "0b8a7c1e-2d3f-4a5b-8c9d-0e1f2a3b4c5d"
async function foto(ancho: number, alto: number) {
  // Un paisaje "fotográfico": ruido suave + degradados + formas.
  const ruido = Buffer.alloc(ancho * alto * 3)
  for (let i = 0; i < ruido.length; i++) ruido[i] = (Math.random() * 255) | 0
  const base = await sharp(ruido, { raw: { width: ancho, height: alto, channels: 3 } }).blur(3).modulate({ saturation: 2.2 }).png().toBuffer()
  const svg = Buffer.from(`<svg width="${ancho}" height="${alto}"><defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#e08a3c"/><stop offset="1" stop-color="#2a6f97"/></linearGradient></defs><rect width="${ancho}" height="${alto}" fill="url(#g)" opacity="0.7"/><circle cx="${ancho * 0.7}" cy="${alto * 0.4}" r="${alto * 0.3}" fill="#fff" opacity="0.5"/></svg>`)
  return sharp(base).composite([{ input: svg }]).webp({ quality: 82 }).toBuffer()
}
it("visual", async () => {
  const { default: Imagen } = await import("./opengraph-image")
  const portada = await foto(1600, 400)
  const logo = await sharp({ create: { width: 512, height: 300, channels: 4, background: { r: 200, g: 30, b: 60, alpha: 1 } } })
    .composite([{ input: Buffer.from(`<svg width="512" height="300"><text x="40" y="200" font-size="160" fill="white">Ab</text></svg>`) }]).webp().toBuffer()
  const almacen = crearAlmacenEnMemoria({
    [`negocios/n1/logo-${UUID}.webp`]: { bytes: logo, tipoMime: "image/webp" },
    [`negocios/n1/portada-${UUID}.webp`]: { bytes: portada, tipoMime: "image/webp" },
  })
  ponerAlmacenDeFotos(almacen)
  mockNegocio.mockResolvedValue({ id: "n1", logoUrl: `/fotos/negocios/n1/logo-${UUID}.webp`, coverUrl: `/fotos/negocios/n1/portada-${UUID}.webp` })
  const casos = [
    ["ambas", { nombre: "Salón Ñandú", comuna: "Ñuñoa", rubro: "salon", color: colorDelNegocio("noche"), logo: "/x", portada: "/y" }],
    ["largo", { nombre: "Clínica Dental Sonrisa Perfecta y Asociados Limitada de Providencia Norte", comuna: "Providencia", rubro: "odontologia", color: colorDelNegocio("durazno"), logo: "/x", portada: "/y" }],
    ["sinespacios", { nombre: "M".repeat(80), comuna: "B".repeat(80), rubro: "salon", color: colorDelNegocio("cielo"), logo: null, portada: null }],
  ] as const
  for (const [n, c] of casos) {
    mockLeer.mockResolvedValueOnce(c)
    const r = await Imagen({ params: Promise.resolve({ slug: "x" }) })
    const b = Buffer.from(await r.arrayBuffer())
    writeFileSync(`${OUT}/og-${n}.png`, b)
    console.log("SIZE", n, b.length)
  }
  ponerAlmacenDeFotos(undefined)
}, 60000)
