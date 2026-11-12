import { createElement } from "react"
import { renderToString } from "react-dom/server"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, OTRO_NEGOCIO, datosBase } from "@/pruebas/datos"
import { MiniPagina } from "./mini-pagina"

const base = crearBaseFalsa()
vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

/**
 * Coherencia con una sola sede: con EXACTAMENTE una sede activa (por ejemplo un
 * Independiente que desactivó las demás) la página pública dice la dirección y la
 * comuna de ESA sede, las mismas que llevan la cita y los correos
 * (`direccionDeLaCita`), y "Cómo llegar" lleva ahí. Sin sedes, la del negocio,
 * como siempre. Con dos o más, el bloque "Dónde atiendo" y no la del negocio.
 */

const DIRECCION_DEL_NEGOCIO = "Calle del Negocio 99"
const COMUNA_DEL_NEGOCIO = "Santiago"

type Registro = Record<string, unknown>

const sede = (id: string, businessId: string, nombre: string, extra: Registro = {}) => ({
  id,
  businessId,
  nombre,
  direccion: "Av. Italia 1234",
  comuna: "Providencia",
  ...extra,
})
const franja = (id: string, businessId: string, sedeId: string | null, dayOfWeek: number, startTime: string, endTime: string) => ({
  id,
  businessId,
  memberId: null,
  sedeId,
  dayOfWeek,
  startTime,
  endTime,
})

/** El negocio 1, con su propia dirección (distinta de la de cualquier sede) y las sedes y horarios que se pidan. */
function escenario(sedes: Registro[], workSchedule: Registro[], negocio: Registro = {}) {
  const datos = datosBase()
  base.reiniciar({
    ...datos,
    business: datos.business.map((fila) => ({
      ...fila,
      address: fila.id === NEGOCIO ? DIRECCION_DEL_NEGOCIO : "Otra Calle 1",
      comuna: fila.id === NEGOCIO ? COMUNA_DEL_NEGOCIO : "Maipú",
      whatsapp: null,
      instagram: null,
      color: null,
      logoUrl: null,
      coverUrl: null,
      mediosDePago: [],
      plan: "independiente",
      ...(fila.id === NEGOCIO ? negocio : {}),
    })),
    businessMember: [],
    service: datos.service.map((servicio) => ({ description: null, category: null, duration: 60, ...servicio })),
    sede: sedes,
    workSchedule,
  })
}

async function pagina(slug = "salon-uno") {
  const { leerPaginaDelNegocio } = await import("./datos-de-la-pagina")
  const datos = await leerPaginaDelNegocio(slug)
  if (!datos) throw new Error("el negocio de prueba no se encontró")
  return datos
}

const pintar = async (slug?: string) =>
  renderToString(createElement(MiniPagina, { pagina: await pagina(slug), ahora: new Date("2026-11-12T15:00:00Z") })).replaceAll(
    "<!-- -->",
    ""
  )

const HORARIO = [franja("h-a", NEGOCIO, "a", 1, "09:00", "13:00"), franja("h-g", NEGOCIO, null, 2, "09:00", "18:00")]

const UNA_SEDE_ACTIVA = [
  sede("a", NEGOCIO, "Centro"),
  // Las demás, desactivadas (como un Independiente que ya no las usa): no cuentan.
  sede("vieja", NEGOCIO, "Vieja", { activo: false, direccion: "Calle Vieja 1", comuna: "Recoleta" }),
  sede("ajena", OTRO_NEGOCIO, "Ajena", { direccion: "Otra 1", comuna: "Maipú" }),
]

beforeEach(() => {
  vi.clearAllMocks()
})

describe("con exactamente una sede activa", () => {
  it("la página dice la dirección y la comuna de esa sede, no las del negocio, y 'Cómo llegar' lleva ahí", async () => {
    escenario(UNA_SEDE_ACTIVA, HORARIO)

    const datos = await pagina()

    expect(datos.direccion).toBe("Av. Italia 1234")
    expect(datos.comuna).toBe("Providencia")
    expect(datos.mapas?.googleMaps).toContain("Av.%20Italia%201234%2C%20Providencia")
    expect(datos.mapas?.waze).toContain("Av.%20Italia%201234%2C%20Providencia")
    expect(JSON.stringify(datos.mapas)).not.toMatch(/Negocio|Santiago/)
    // Sigue siendo la página de siempre: sin el bloque de varias sedes.
    expect(datos.modoDeSedes).toBe("una")
  })

  it("es la misma dirección que la de la cita y los correos (`direccionDeLaCita`)", async () => {
    escenario(UNA_SEDE_ACTIVA, HORARIO)
    const { direccionDeLaCita } = await import("@/lib/sedes")

    const datos = await pagina()
    const dePagina = { direccion: datos.direccion, comuna: datos.comuna }
    const deLaCita = direccionDeLaCita({
      sede: { nombre: "Centro", direccion: "Av. Italia 1234", comuna: "Providencia" },
      negocio: { address: DIRECCION_DEL_NEGOCIO, comuna: COMUNA_DEL_NEGOCIO },
    })

    expect(dePagina).toEqual({ direccion: deLaCita.direccion, comuna: deLaCita.comuna })
  })

  it("la mini página muestra la ubicación de la sede, sin 'Dónde atiendo' ni la dirección del negocio", async () => {
    escenario(UNA_SEDE_ACTIVA, HORARIO)

    const html = await pintar()

    expect(html).toContain("Av. Italia 1234, Providencia")
    expect(html).toContain("Cómo llegar")
    expect(html).not.toContain("Dónde atiendo")
    expect(html).not.toContain(DIRECCION_DEL_NEGOCIO)
    expect(html).not.toContain("Recoleta")
    expect(html).not.toContain("Maipú")
  })

  it("el título y la descripción al compartir llevan la comuna de la sede", async () => {
    escenario(UNA_SEDE_ACTIVA, HORARIO)
    const { generateMetadata } = await import("../page")

    const metadatos = await generateMetadata({ params: Promise.resolve({ slug: "salon-uno" }) })

    expect(metadatos.openGraph?.title).toBe("Salón Uno · Providencia")
    expect(metadatos.description).toContain("Providencia")
    expect(JSON.stringify(metadatos)).not.toContain(COMUNA_DEL_NEGOCIO)
  })

  it("con la sede en blanco en un campo, ese campo queda vacío (no cae a la dirección del negocio)", async () => {
    // La dirección de la sede manda: si la comuna de la sede no se escribió, no se mezcla con la del negocio.
    escenario([sede("a", NEGOCIO, "Centro", { comuna: "  " })], HORARIO)

    const datos = await pagina()

    expect(datos.direccion).toBe("Av. Italia 1234")
    expect(datos.comuna).toBeNull()
  })

  it("el negocio con su dirección y sin sede activa de otro negocio: cada uno ve la suya", async () => {
    escenario(UNA_SEDE_ACTIVA, HORARIO)

    const delOtro = await pagina("salon-dos")

    // Su única sede activa es la suya.
    expect(delOtro.direccion).toBe("Otra 1")
    expect(delOtro.comuna).toBe("Maipú")
    expect(JSON.stringify(delOtro)).not.toMatch(/Av\. Italia|Providencia|Centro/)
  })
})

describe("sin sedes", () => {
  it("la página es la de siempre: la dirección y la comuna del negocio", async () => {
    escenario([], [franja("h-g", NEGOCIO, null, 1, "09:00", "18:00")])

    const datos = await pagina()

    expect(datos.direccion).toBe(DIRECCION_DEL_NEGOCIO)
    expect(datos.comuna).toBe(COMUNA_DEL_NEGOCIO)
    expect(datos.mapas?.googleMaps).toContain("Calle%20del%20Negocio%2099%2C%20Santiago")
  })

  it("la mini página muestra la ubicación del negocio", async () => {
    escenario([], [franja("h-g", NEGOCIO, null, 1, "09:00", "18:00")])

    const html = await pintar()

    expect(html).toContain(`${DIRECCION_DEL_NEGOCIO}, ${COMUNA_DEL_NEGOCIO}`)
    expect(html).not.toContain("Dónde atiendo")
  })

  it("una sola sede desactivada (ninguna activa) es como no tener sedes: la del negocio", async () => {
    escenario([sede("vieja", NEGOCIO, "Vieja", { activo: false, direccion: "Calle Vieja 1", comuna: "Recoleta" })], [])

    const datos = await pagina()

    expect(datos.direccion).toBe(DIRECCION_DEL_NEGOCIO)
    expect(datos.comuna).toBe(COMUNA_DEL_NEGOCIO)
  })
})

describe("con dos o más sedes activas", () => {
  const DOS = [sede("a", NEGOCIO, "Centro", { orden: 0 }), sede("b", NEGOCIO, "Ñuñoa", { orden: 1, direccion: "Irarrázaval 500", comuna: "Ñuñoa" })]
  const HORARIOS = [franja("h-a", NEGOCIO, "a", 1, "09:00", "13:00"), franja("h-b", NEGOCIO, "b", 2, "14:00", "18:00")]

  it("sigue el bloque 'Dónde atiendo' con cada sede, y no la dirección del negocio", async () => {
    escenario(DOS, HORARIOS)

    const datos = await pagina()
    const html = await pintar()

    expect(datos.modoDeSedes).toBe("varias")
    expect(html).toContain("Dónde atiendo")
    expect(html).toContain("Av. Italia 1234, Providencia")
    expect(html).toContain("Irarrázaval 500, Ñuñoa")
    expect(html).not.toContain(DIRECCION_DEL_NEGOCIO)
  })

  it("no elige una sede por el solo hecho de ser la primera: el negocio queda con los datos del negocio", async () => {
    escenario(DOS, HORARIOS)

    const datos = await pagina()

    expect(datos.direccion).toBe(DIRECCION_DEL_NEGOCIO)
    expect(datos.comuna).toBe(COMUNA_DEL_NEGOCIO)
  })
})
