import { beforeEach, describe, expect, it, vi } from "vitest"

/*
 * La pestaña y la descripción al compartir el enlace hablan con las palabras
 * del rubro del negocio: "Reservar hora" en un salón o una clínica, "Reservar
 * cita" si el rubro no se conoce (como siempre).
 */

const { leerPagina } = vi.hoisted(() => ({ leerPagina: vi.fn() }))
vi.mock("./_pagina/datos-de-la-pagina", () => ({ leerPaginaDelNegocio: leerPagina }))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))

const pagina = (rubro: string | null, comuna: string | null = "Ñuñoa") => ({ nombre: "Casa Ana", comuna, rubro })

async function metadatos(rubro: string | null, comuna?: string | null) {
  leerPagina.mockResolvedValueOnce(pagina(rubro, comuna))
  const { generateMetadata } = await import("./page")
  return generateMetadata({ params: Promise.resolve({ slug: "casa-ana" }) })
}

beforeEach(() => {
  leerPagina.mockReset()
})

describe("generateMetadata de la página de reservas", () => {
  it("un rubro desconocido o sin rubro: 'Reservar cita', como siempre", async () => {
    for (const rubro of [null, "", "salud"]) {
      const datos = await metadatos(rubro)

      expect(datos.title).toBe("Reservar cita — Casa Ana · Ñuñoa")
      expect(datos.description).toBe("Reserva tu hora en Casa Ana, en Ñuñoa. Mira sus servicios, precios y horarios.")
    }
  })

  it("un salón, una barbería, un salón de uñas y una clínica: 'Reservar hora'", async () => {
    for (const rubro of ["salon", "barberia", "spa-de-unas", "odontologia"]) {
      expect((await metadatos(rubro)).title).toBe("Reservar hora — Casa Ana · Ñuñoa")
    }
  })

  it("una clínica ofrece prestaciones al compartir el enlace", async () => {
    expect((await metadatos("odontologia", null)).description).toBe(
      "Reserva tu hora en Casa Ana. Mira sus prestaciones, precios y horarios."
    )
  })

  it("un negocio que no existe", async () => {
    leerPagina.mockResolvedValueOnce(null)
    const { generateMetadata } = await import("./page")

    expect(await generateMetadata({ params: Promise.resolve({ slug: "no-existe" }) })).toEqual({ title: "Negocio no encontrado" })
  })
})
