import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { nombreDePlan, PLANES } from "@/lib/planes"
import {
  DIAS_DE_PRUEBA,
  formatearPesos,
  PERSONAS_INCLUIDAS_EQUIPO,
  PRECIO_EQUIPO,
  PRECIO_INDEPENDIENTE,
  PRECIO_PERSONA_ADICIONAL,
} from "@/lib/precios"
import { RUBROS } from "@/lib/rubros"
import { vocabularioDe } from "@/lib/vocabulario"
import { detalleDePlan, NOTA_DE_LA_PRUEBA } from "./detalle-de-planes"
import { ElegirPlan } from "./elegir-plan"

const sinElegir = (props: Partial<Parameters<typeof ElegirPlan>[0]> = {}) =>
  renderToStaticMarkup(createElement(ElegirPlan, { plan: "", alElegir: () => {}, rubro: "", ...props }))

/** Los atributos de cada `<input type="radio">` del HTML, para mirar si está marcado. */
const radios = (html: string) => html.match(/<input[^>]*type="radio"[^>]*>/g) ?? []

describe("detalleDePlan", () => {
  const neutras = vocabularioDe(undefined).palabras

  it("los precios salen de lib/precios.ts, con el formato de pesos de toda la app", () => {
    expect(detalleDePlan("independiente", neutras).precio).toBe(formatearPesos(PRECIO_INDEPENDIENTE))
    expect(detalleDePlan("equipo", neutras).precio).toBe(formatearPesos(PRECIO_EQUIPO))
    expect(detalleDePlan("independiente", neutras).precio).toBe("$9.990")
    expect(detalleDePlan("equipo", neutras).precio).toBe("$34.990")
  })

  it.each(PLANES)("%s: nombre de lib/planes.ts y tres viñetas", (plan) => {
    const detalle = detalleDePlan(plan, neutras)
    expect(detalle.nombre).toBe(nombreDePlan(plan))
    expect(detalle.vinetas).toHaveLength(3)
  })

  it("Equipo dice cuántas personas incluye y cuánto cuesta cada una más; Independiente no habla de eso", () => {
    const equipo = detalleDePlan("equipo", neutras).vinetas.join(" ")
    expect(equipo).toContain(`${PERSONAS_INCLUIDAS_EQUIPO} personas`)
    expect(equipo).toContain(`+${formatearPesos(PRECIO_PERSONA_ADICIONAL)}`)
    expect(detalleDePlan("independiente", neutras).vinetas.join(" ")).not.toContain("$")
  })

  it("las viñetas de Equipo hablan con las palabras del rubro", () => {
    const clinica = detalleDePlan("equipo", vocabularioDe("odontologia").palabras).vinetas.join(" ")
    expect(clinica).toContain("Invita a tus odontólogos")
    expect(clinica).toContain("tu clínica")

    const sinRubro = detalleDePlan("equipo", neutras).vinetas.join(" ")
    expect(sinRubro).toContain("Invita a tus profesionales")
    expect(sinRubro).toContain("tu negocio")
  })

  it("Independiente habla de las sedes con su tope y de que no se invita a nadie", () => {
    const vinetas = detalleDePlan("independiente", neutras).vinetas.join(" ")
    expect(vinetas).toMatch(/Hasta \d+ sedes/)
    expect(vinetas).toMatch(/no puedes invitar/i)
  })

  it("la nota de la prueba usa los días de lib/precios.ts", () => {
    expect(NOTA_DE_LA_PRUEBA).toContain(`${DIAS_DE_PRUEBA} días gratis, sin tarjeta`)
  })
})

describe("ElegirPlan", () => {
  it("es un grupo de radios obligatorio con las dos tarjetas y ninguna marcada al empezar", () => {
    const html = sinElegir()

    expect(html).toContain('role="radiogroup"')
    expect(html).toContain('aria-required="true"')
    expect(radios(html)).toHaveLength(PLANES.length)
    expect(radios(html).every((radio) => !radio.includes("checked"))).toBe(true)
  })

  it("cada tarjeta muestra su nombre, su descripción, su precio al mes con IVA incluido y la prueba gratis", () => {
    const html = sinElegir()

    expect(html).toContain("Independiente")
    expect(html).toContain("Trabajas por tu cuenta")
    expect(html).toContain("Equipo")
    expect(html).toContain("Tienes una clínica o un equipo")
    expect(html).toContain(formatearPesos(PRECIO_INDEPENDIENTE))
    expect(html).toContain(formatearPesos(PRECIO_EQUIPO))
    expect(html).toContain("al mes")
    expect(html).toContain("IVA incluido")
    expect(html).toContain(NOTA_DE_LA_PRUEBA)
  })

  it.each(PLANES)("con el plan %s elegido, sólo su radio queda marcado", (plan) => {
    const marcados = radios(sinElegir({ plan })).filter((radio) => radio.includes("checked"))

    expect(marcados).toHaveLength(1)
    expect(marcados[0]).toContain(`value="${plan}"`)
  })

  it("sin error no marca el grupo como inválido; con error, lo marca y lo muestra debajo", () => {
    expect(sinElegir()).not.toContain("aria-invalid")

    const html = sinElegir({ error: "Elige un plan" })
    expect(html).toContain('aria-invalid="true"')
    expect(html).toContain("Elige un plan")
    // Cada radio también apunta al error, para el lector de pantalla que no lee la descripción del grupo.
    expect(radios(html).every((radio) => /aria-describedby="[^"]*-error"/.test(radio))).toBe(true)
  })

  it.each(RUBROS.map((rubro) => rubro.id))("con el rubro %s escribe con sus palabras", (rubro) => {
    const html = sinElegir({ rubro })
    const { palabras } = vocabularioDe(rubro)

    expect(html).toContain(`Invita a tus ${palabras.profesional.plural}`)
    expect(html).toContain(`tu ${palabras.negocio.singular}`)
  })

  it("cada radio se llama como su plan y lee el resto como descripción", () => {
    const html = sinElegir()

    // El nombre sale de la etiqueta (`<label for>`), que es sólo el nombre del plan.
    for (const plan of PLANES) {
      expect(html).toMatch(new RegExp(`<label for="[^"]*-${plan}"[^>]*>${nombreDePlan(plan)}</label>`))
    }
    expect(radios(html).every((radio) => /aria-describedby="[^"]*-detalle"/.test(radio))).toBe(true)
  })
})
