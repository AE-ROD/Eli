import { createElement } from "react"
import { renderToString } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { colorDelNegocio } from "@/lib/pagina-del-negocio"
import { TEXTO_HACE_TODOS, TEXTO_SIN_SERVICIOS } from "@/lib/servicios-del-profesional"
import type { PaginaDelNegocio, ProfesionalPublico, ServicioDeLaPagina } from "./datos-de-la-pagina"
import { MiniPagina } from "./mini-pagina"

/*
 * El bloque Equipo de la mini página, tal como llega en el HTML del servidor:
 * qué dice cada tarjeta y si lleva "Reservar con …". Se renderiza a texto, sin
 * navegador.
 */

const servicio = (id: string, name: string): ServicioDeLaPagina => ({
  id,
  name,
  description: null,
  duration: 30,
  price: 10000,
  category: null,
})

const persona = (id: string, nombre: string, servicioIds: string[] | null): ProfesionalPublico => ({
  id,
  nombre,
  especialidad: null,
  foto: null,
  servicioIds,
})

function pagina(equipo: ProfesionalPublico[], servicios: ServicioDeLaPagina[]): PaginaDelNegocio {
  return {
    nombre: "Salón Uno",
    slug: "salon-uno",
    zona: "America/Santiago",
    direccion: null,
    comuna: null,
    color: colorDelNegocio(null),
    logo: null,
    portada: null,
    whatsapp: null,
    instagram: null,
    mapas: null,
    medios: [],
    equipo,
    servicios,
    horario: [],
    plazoDeCambiosHoras: 24,
    horaValle: false,
  }
}

const pintar = (datos: PaginaDelNegocio) =>
  renderToString(createElement(MiniPagina, { pagina: datos, ahora: new Date("2026-11-12T15:00:00Z") }))

describe("MiniPagina: el bloque Equipo", () => {
  const CARLA = persona("m-carla", "Carla Soto", ["s-corte"])
  const NINA = persona("m-nina", "Nina Paz", null)
  const ZOE = persona("m-zoe", "Zoe Vidal", [])

  it("cada tarjeta dice qué hace y lleva 'Reservar con …' a quien se puede reservar", () => {
    const html = pintar(pagina([CARLA, NINA], [servicio("s-corte", "Corte"), servicio("s-barba", "Barba")]))

    expect(html).toContain("Hace: Corte")
    expect(html).toContain(TEXTO_HACE_TODOS)
    expect(html).toContain('aria-label="Reservar con Carla Soto"')
    expect(html).toContain('aria-label="Reservar con Nina Paz"')
  })

  it("quien tiene servicios pero ninguno activo dice 'Sin servicios para reservar por ahora' y no lleva botón", () => {
    const html = pintar(pagina([ZOE], [servicio("s-corte", "Corte")]))

    expect(html).toContain(TEXTO_SIN_SERVICIOS)
    expect(html).not.toContain("Reservar con")
  })

  it("negocio sin ningún servicio activo: ni quien 'hace todos' promete nada ni lleva botón", () => {
    const html = pintar(pagina([NINA, CARLA, ZOE], []))

    expect(html).toContain("Equipo")
    expect(html).not.toContain(TEXTO_HACE_TODOS)
    expect(html).toContain(TEXTO_SIN_SERVICIOS)
    expect(html).not.toContain("Reservar con")
  })

  it("las tarjetas pueden encogerse: un nombre de servicio largo y sin espacios no ensancha la columna del teléfono", () => {
    const largo = "Tratamientoultraespecializadodeinmersionprofundaenqueratina"
    const html = pintar(pagina([persona("m-ana", "Ana Ruiz", ["s-largo"])], [servicio("s-largo", largo), servicio("s-otro", "Otro")]))

    const tarjeta = html.split("<li").find((li) => li.includes("Ana Ruiz")) ?? ""
    expect(tarjeta).toContain(largo)
    expect(tarjeta.split(">")[0]).toContain("min-w-0")
  })

  it("el 'Reservar con' mide 44px de alto en el teléfono, no los 36px del botón sm", () => {
    const html = pintar(pagina([NINA], [servicio("s-corte", "Corte")]))

    const enlace = html.split("<a ").find((a) => a.includes("Reservar con Nina Paz")) ?? ""
    expect(enlace.split(">")[0]).toContain("max-sm:min-h-11")
  })
})
