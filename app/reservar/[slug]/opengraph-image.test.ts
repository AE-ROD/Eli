import { describe, it, expect, vi, beforeEach } from "vitest"
import { colorDelNegocio } from "@/lib/pagina-del-negocio"

const mockLeer = vi.fn()
const mockLimite = vi.fn()

vi.mock("./_pagina/datos-de-la-pagina", () => ({ leerPaginaDelNegocio: (...args: unknown[]) => mockLeer(...args) }))
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
