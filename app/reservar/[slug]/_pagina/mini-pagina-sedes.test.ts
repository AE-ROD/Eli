import { createElement } from "react"
import { renderToString } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { colorDelNegocio, sedesParaLaPagina, type SedeDeLaPagina } from "@/lib/pagina-del-negocio"
import type { PaginaDelNegocio } from "./datos-de-la-pagina"
import { MiniPagina } from "./mini-pagina"

/*
 * La mini página con sedes (plan Independiente), tal como llega en el HTML del
 * servidor: con dos o más sedes activas, el bloque "Dónde atiendo" en vez del
 * horario y la ubicación del negocio; con una o ninguna, la página de siempre.
 */

const sede = (id: string, nombre: string, orden: number, extra: Record<string, unknown> = {}) => ({
  id,
  nombre,
  direccion: "Av. Italia 1234",
  comuna: "Providencia",
  telefono: null,
  orden,
  activo: true,
  ...extra,
})
const fila = (sedeId: string, dayOfWeek: number, startTime: string, endTime: string) => ({ sedeId, dayOfWeek, startTime, endTime })

const SEDES: SedeDeLaPagina[] = sedesParaLaPagina(
  [sede("a", "Centro", 0), sede("b", "Ñuñoa", 1, { direccion: "Irarrázaval 500", comuna: "Ñuñoa" })],
  [fila("a", 1, "09:00", "13:00"), fila("a", 3, "09:00", "13:00"), fila("b", 2, "14:00", "18:00"), fila("b", 4, "14:00", "18:00")]
)

function pagina(extra: Partial<PaginaDelNegocio> = {}): PaginaDelNegocio {
  return {
    nombre: "Salón Uno",
    slug: "salon-uno",
    rubro: "salon",
    zona: "America/Santiago",
    direccion: "Calle del Negocio 99",
    comuna: "Santiago",
    color: colorDelNegocio(null),
    logo: null,
    portada: null,
    whatsapp: null,
    instagram: null,
    mapas: { googleMaps: "https://maps.test/negocio", waze: "https://waze.test/negocio" },
    medios: [],
    equipo: [],
    servicios: [],
    horario: [
      { dayOfWeek: 1, startTime: "09:00", endTime: "18:00" },
      { dayOfWeek: 2, startTime: "09:00", endTime: "18:00" },
    ],
    plazoDeCambiosHoras: 24,
    horaValle: false,
    ...extra,
  }
}

const pintar = (datos: PaginaDelNegocio) =>
  renderToString(createElement(MiniPagina, { pagina: datos, ahora: new Date("2026-11-12T15:00:00Z") }))

describe("MiniPagina con varias sedes", () => {
  const html = pintar(pagina({ modoDeSedes: "varias", sedes: SEDES }))

  it("tiene el bloque 'Dónde atiendo' con cada sede: nombre, dirección con comuna y sus días y horarios", () => {
    expect(html).toContain("Dónde atiendo")
    for (const texto of ["Centro", "Av. Italia 1234, Providencia", "Lun, Mié: 09:00–13:00", "Ñuñoa", "Irarrázaval 500, Ñuñoa", "Mar, Jue: 14:00–18:00"]) {
      expect(html).toContain(texto)
    }
  })

  it("'Cómo llegar' lleva a la dirección de CADA sede, con su nombre para el lector de pantalla", () => {
    expect(html).toContain('aria-label="Cómo llegar a Centro con Google Maps"')
    expect(html).toContain("query=Av.%20Italia%201234%2C%20Providencia")
    expect(html).toContain('aria-label="Cómo llegar a Ñuñoa con Waze"')
    expect(html).toContain("waze.com/ul?q=Irarr%C3%A1zaval%20500%2C%20%C3%91u%C3%B1oa")
    // Ni la dirección ni los mapas del negocio: ya no es el lugar donde se atiende.
    expect(html).not.toContain("Calle del Negocio 99")
    expect(html).not.toContain("maps.test/negocio")
  })

  it("cada sede tiene su botón 'Reservar en esta sede', que deja la sede elegida en la dirección", () => {
    expect(html).toContain('href="?sede=a#reservar"')
    expect(html).toContain('href="?sede=b#reservar"')
    expect(html).toContain('aria-label="Reservar en Centro"')
    expect(html).toContain('aria-label="Reservar en Ñuñoa"')
    expect(html.match(/Reservar en esta sede/g)).toHaveLength(2)
  })

  it("el horario y la ubicación del negocio dan lugar a los de cada sede; 'Cómo llegar' de la cabecera baja a ellas", () => {
    expect(html).not.toContain("Ubicación")
    expect(html).not.toContain(">Horario<")
    expect(html).toContain('href="#ubicacion"')
    expect(html.match(/id="ubicacion"/g)).toHaveLength(1)
  })

  it("la cabecera dice las comunas donde atiende, no la del negocio", () => {
    expect(html).toContain("Providencia, Ñuñoa")
    expect(html).not.toContain("Santiago")
  })

  it("una sede sin ningún día cargado lo dice y no se puede reservar todavía", () => {
    const conUnaSinHorario = pintar(
      pagina({ modoDeSedes: "varias", sedes: [...SEDES, ...sedesParaLaPagina([sede("c", "Maipú", 2)], [])] })
    )

    expect(conUnaSinHorario).toContain("Todavía sin horario para reservar")
    expect(conUnaSinHorario).not.toContain('aria-label="Reservar en Maipú"')
    expect(conUnaSinHorario).toContain('aria-label="Reservar en Centro"')
  })
})

describe("MiniPagina con una sola sede, o sin sedes: la de siempre", () => {
  const deSiempre = pintar(pagina())

  it("tiene el horario y la ubicación del negocio, y ningún rastro de sedes", () => {
    expect(deSiempre).toContain("Ubicación")
    expect(deSiempre).toContain("Calle del Negocio 99, Santiago")
    expect(deSiempre).toContain("Horario")
    expect(deSiempre).not.toContain("Dónde atiendo")
    expect(deSiempre).not.toContain("Reservar en esta sede")
    expect(deSiempre).not.toContain("?sede=")
    expect(deSiempre).toContain('aria-label="Cómo llegar con Google Maps"')
  })

  it("con modo `una` y una sede (o ninguna) que viaja de más, es exactamente la misma página", () => {
    expect(pintar(pagina({ modoDeSedes: "una", sedes: SEDES.slice(0, 1) }))).toBe(deSiempre)
    expect(pintar(pagina({ modoDeSedes: "una", sedes: [] }))).toBe(deSiempre)
  })

  it("con modo `varias` pero sin sedes que mostrar no inventa el bloque", () => {
    expect(pintar(pagina({ modoDeSedes: "varias", sedes: [] }))).toBe(deSiempre)
  })
})
