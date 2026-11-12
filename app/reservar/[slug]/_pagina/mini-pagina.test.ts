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

function pagina(equipo: ProfesionalPublico[], servicios: ServicioDeLaPagina[], rubro = "salon"): PaginaDelNegocio {
  return {
    nombre: "Salón Uno",
    slug: "salon-uno",
    rubro,
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

describe("MiniPagina: las palabras del rubro", () => {
  const CARLA = persona("m-carla", "Carla Soto", ["s-corte"])
  const NINA = persona("m-nina", "Nina Paz", null)
  const SERVICIOS = [servicio("s-corte", "Corte"), servicio("s-barba", "Barba")]

  /** El texto visible, sin etiquetas ni los comentarios con que React separa los textos. */
  const texto = (html: string) => html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")

  it("sin rubro, o con uno desconocido, es la página de siempre: 'Servicios' y 'Hace todos los servicios'", () => {
    for (const rubro of ["", "salud", "otro"]) {
      const visible = texto(pintar(pagina([NINA], SERVICIOS, rubro)))

      expect(visible).toContain("Servicios")
      expect(visible).toContain("Hace todos los servicios")
    }
  })

  it("un salón ofrece servicios", () => {
    const visible = texto(pintar(pagina([NINA], SERVICIOS, "salon")))

    expect(visible).toContain("Servicios")
    expect(visible).toContain("Hace todos los servicios")
    expect(visible).not.toContain("Prestaciones")
  })

  it("una clínica dental ofrece prestaciones, y 'todas' concuerda con ellas", () => {
    const visible = texto(pintar(pagina([NINA, CARLA], SERVICIOS, "odontologia")))

    expect(visible).toContain("Prestaciones")
    expect(visible).toContain("Hace todas las prestaciones")
    expect(visible).toContain("Hace: Corte")
    expect(visible).not.toContain("Hace todos los")
  })

  it("una clínica sin ninguna prestación activa: 'Sin prestaciones para reservar por ahora'", () => {
    const visible = texto(pintar(pagina([NINA], [], "odontologia")))

    expect(visible).toContain("Sin prestaciones para reservar por ahora")
  })

  it("el plazo para cancelar o cambiar, sin plazo, no dice 'el momento de la hora' en un salón", () => {
    const sinPlazo = (rubro: string) => texto(pintar({ ...pagina([NINA], SERVICIOS, rubro), plazoDeCambiosHoras: 0 }))

    expect(sinPlazo("salon")).toContain("Puedes cancelar o cambiar tu hora hasta que llegue la hora.")
    expect(sinPlazo("")).toContain("Puedes cancelar o cambiar tu hora hasta el momento de la cita.")
  })
})
