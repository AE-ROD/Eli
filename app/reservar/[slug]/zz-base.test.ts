import { it, vi } from "vitest"
import { createHash } from "node:crypto"
import { colorDelNegocio } from "@/lib/pagina-del-negocio"
const mockLeer = vi.fn()
vi.mock("./_pagina/datos-de-la-pagina", () => ({ leerPaginaDelNegocio: (...a: unknown[]) => mockLeer(...a) }))
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-real-ip": "203.0.113.7" }) }))
vi.mock("@/lib/rate-limit", () => ({ obtenerIp: () => "1.1.1.1", verificarLimite: async () => ({ permitido: true, restantes: 5 }) }))
it("base", async () => {
  const { default: Imagen } = await import("./opengraph-image")
  const casos = [
    { nombre: "Salón Ñandú", comuna: "Ñuñoa", rubro: "salon", color: colorDelNegocio("noche") },
    { nombre: "Clínica Dental Sonrisa Perfecta y Asociados Limitada de Providencia", comuna: null, rubro: "odontologia", color: colorDelNegocio("durazno") },
    { nombre: "Casa Ana", comuna: "Providencia", rubro: "salud", color: colorDelNegocio(null) },
  ]
  for (const c of casos) {
    mockLeer.mockResolvedValueOnce(c)
    const r = await Imagen({ params: Promise.resolve({ slug: "x" }) })
    const b = Buffer.from(await r.arrayBuffer())
    console.log("HASH", c.nombre.slice(0, 12), createHash("sha256").update(b).digest("hex"), b.length)
  }
}, 30000)
