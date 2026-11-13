import { createElement } from "react"
import { renderToString } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { RUBRO_DENTAL } from "@/lib/rubros"
import type { SedeParaElegir } from "./reglas-de-la-sede"

/*
 * La primera pintura del formulario con sedes (plan Independiente), la que llega
 * en el HTML del servidor: con dos o más sedes, el primer paso es "¿Dónde?" y el
 * indicador suma un paso; con `?sede=` ya llega elegida; con una sola o ninguna,
 * es la reserva de siempre. Se renderiza a texto (sin navegador): los efectos no
 * corren, así que lo que se ve es exactamente la primera pintura.
 */

let consulta = ""
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(consulta) }))

const servicio = (id: string, name: string) => ({ id, name, description: null, duration: 30, price: 10000, category: null })
const SERVICIOS = [servicio("s-corte", "Corte de pelo"), servicio("s-tinte", "Tinte")]

const sede = (id: string, nombre: string, direccion: string, comuna: string, dias: number[], horario: string[]): SedeParaElegir => ({
  id,
  nombre,
  direccion,
  comuna,
  dias,
  horario,
})
const CENTRO = sede("centro", "Centro", "Av. Italia 1234", "Providencia", [1, 3], ["Lun, Mié: 09:00–13:00"])
const NUNOA = sede("nunoa", "Ñuñoa", "Irarrázaval 500", "Ñuñoa", [2, 4], ["Mar, Jue: 14:00–18:00"])
const SIN_HORARIO = sede("maipu", "Maipú", "Pajaritos 1", "Maipú", [], [])

async function primeraPintura(
  parametros: string,
  extra: { sedes?: SedeParaElegir[] | null; rubro?: string | null } = {}
): Promise<string> {
  consulta = parametros
  const { FormularioReserva } = await import("./formulario-reserva")
  // Sin las marcas que React pone entre un texto y el siguiente (`<!-- -->`): así se lee el texto corrido.
  return renderToString(
    createElement(FormularioReserva, {
      slug: "salon-uno",
      nombreNegocio: "Salón Uno",
      rubro: extra.rubro,
      zona: "America/Santiago",
      servicios: SERVICIOS,
      equipo: [],
      horarios: [{ dayOfWeek: 1, startTime: "09:00", endTime: "18:00" }],
      listaDeEsperaActiva: false,
      plazoDeCambios: "Puedes cancelar o cambiar hasta 24 horas antes.",
      plazoDeCambiosHoras: 24,
      ...(extra.sedes === null ? {} : { sedes: extra.sedes ?? [CENTRO, NUNOA] }),
    })
  ).replaceAll("<!-- -->", "")
}

/** El texto de apertura de cada botón (`<button ...>`) y lo que lleva adentro, hasta el siguiente. */
const botones = (html: string) => html.split("<button").slice(1)
const botonDe = (html: string, texto: string) => botones(html).find((boton) => boton.includes(texto))
const abreCon = (html: string, texto: string) => botonDe(html, texto)?.split(">")[0] ?? ""
const estaElegido = (html: string, texto: string) => abreCon(html, texto).includes('aria-pressed="true"')
/** Los nombres del indicador de pasos, en orden. */
const pasos = (html: string) =>
  [...(html.match(/<ol aria-label="Pasos de la reserva"[\s\S]*?<\/ol>/)?.[0] ?? "").matchAll(/<span class="sr-only">Paso (\d): <\/span>([^<]+)/g)].map(([, numero, nombre]) => `${numero}:${nombre}`)

beforeEach(() => {
  consulta = ""
})

describe("FormularioReserva con varias sedes: el primer paso es '¿Dónde?'", () => {
  it("pregunta '¿Dónde?' antes del servicio, con cada sede, su dirección y sus días y horarios", async () => {
    const html = await primeraPintura("")

    expect(html).toContain("<span class=\"sr-only\">Paso 1 de 4: </span>¿Dónde?")
    expect(html).toContain("Elige la sede donde quieres reservar.")
    for (const texto of ["Centro", "Av. Italia 1234, Providencia", "Lun, Mié: 09:00–13:00", "Ñuñoa", "Irarrázaval 500, Ñuñoa", "Mar, Jue: 14:00–18:00"]) {
      expect(html).toContain(texto)
    }
    // Todavía no es el paso del servicio.
    expect(html).not.toContain("¿Qué servicio necesitas?")
    expect(html).not.toContain("Corte de pelo")
  })

  it("el indicador suma el paso: Dónde, Servicio, Día y hora, Tus datos, con el primero como actual", async () => {
    const html = await primeraPintura("")

    expect(pasos(html)).toEqual(["1:Dónde", "2:Servicio", "3:Día y hora", "4:Tus datos"])
    expect(html).toMatch(/aria-current="step"[^>]*>(?:(?!<\/li>)[\s\S])*?Paso 1: <\/span>Dónde/)
    expect(html).toContain("grid-cols-4")
  })

  it("las sedes son botones que dicen cuál está elegida (`aria-pressed`) y ninguna viene elegida", async () => {
    const html = await primeraPintura("")

    expect(estaElegido(html, "Centro")).toBe(false)
    expect(estaElegido(html, "Ñuñoa")).toBe(false)
    expect(abreCon(html, "Centro")).toContain('aria-pressed="false"')
    expect(html).toContain('role="group" aria-label="Sedes"')
  })

  it("sin sede elegida no se avanza: 'Continuar' viene deshabilitado", async () => {
    const html = await primeraPintura("")

    expect(abreCon(html, "Continuar")).toContain("disabled")
  })

  it("una sede sin ningún día cargado se ve, lo dice y no se puede elegir", async () => {
    const html = await primeraPintura("", { sedes: [CENTRO, NUNOA, SIN_HORARIO] })

    expect(abreCon(html, "Maipú")).toContain("disabled")
    expect(html).toContain("Todavía sin horario para reservar")
    expect(abreCon(html, "Centro")).not.toContain("disabled")
  })

  it("las palabras de la clínica dental no cambian el paso: sigue siendo '¿Dónde?' y el segundo paso es 'Motivo'", async () => {
    const html = await primeraPintura("", { rubro: RUBRO_DENTAL })

    expect(pasos(html)).toEqual(["1:Dónde", "2:Motivo", "3:Día y hora", "4:Tus datos"])
  })
})

describe("FormularioReserva con varias sedes y ?sede=", () => {
  it("una sede válida llega elegida: el formulario empieza en el servicio, con 'En Ñuñoa… · Cambiar' y 'Atrás'", async () => {
    const html = await primeraPintura("sede=nunoa")

    expect(html).toContain("<span class=\"sr-only\">Paso 2 de 4: </span>¿Qué servicio necesitas?")
    expect(html).toContain("<strong class=\"font-medium text-navy\">Ñuñoa</strong>, Irarrázaval 500, Ñuñoa")
    expect(abreCon(html, "Cambiar")).toContain('aria-label="Cambiar de sede: ahora en Ñuñoa"')
    expect(botonDe(html, "Atrás")).toBeDefined()
    expect(html).toContain("Corte de pelo")
    expect(html).not.toContain("¿Dónde?")
  })

  it("un id que no es de una sede de este negocio, o sin horario, se ignora: empieza preguntando '¿Dónde?'", async () => {
    for (const valor of ["ajena", "CENTRO", "maipu", "", "   "]) {
      const html = await primeraPintura(`sede=${encodeURIComponent(valor)}`, { sedes: [CENTRO, NUNOA, SIN_HORARIO] })

      expect(html).toContain("¿Dónde?")
      expect(html).not.toContain("¿Qué servicio necesitas?")
      expect(estaElegido(html, "Centro")).toBe(false)
    }
  })

  it("con ?servicio= y sin sede válida, primero pregunta '¿Dónde?'; con sede válida, va al día", async () => {
    expect(await primeraPintura("servicio=s-corte")).toContain("¿Dónde?")

    const html = await primeraPintura("servicio=s-corte&sede=centro")

    expect(html).toContain("<span class=\"sr-only\">Paso 3 de 4: </span>¿Cuándo quieres venir?")
    expect(html).toContain("En <strong class=\"font-medium text-navy\">Centro</strong>")
  })
})

describe("FormularioReserva con una sola sede, o sin sedes: la reserva de siempre", () => {
  it("sin `sedes`: empieza en el servicio, de 3 pasos, sin '¿Dónde?' ni 'Atrás'", async () => {
    const html = await primeraPintura("", { sedes: null })

    expect(html).toContain("<span class=\"sr-only\">Paso 1 de 3: </span>¿Qué servicio necesitas?")
    expect(pasos(html)).toEqual(["1:Servicio", "2:Día y hora", "3:Tus datos"])
    expect(html).toContain("grid-cols-3")
    expect(html).not.toContain("¿Dónde?")
    expect(html).not.toContain("grid-cols-4")
    expect(botonDe(html, "Atrás")).toBeUndefined()
  })

  it("con una sola sede, o con una lista vacía, es exactamente la misma pintura; el ?sede= se ignora", async () => {
    const deSiempre = await primeraPintura("", { sedes: null })

    expect(await primeraPintura("", { sedes: [] })).toBe(deSiempre)
    expect(await primeraPintura("", { sedes: [CENTRO] })).toBe(deSiempre)
    expect(await primeraPintura("sede=centro", { sedes: [CENTRO] })).toBe(deSiempre)
    expect(await primeraPintura("sede=centro", { sedes: null })).toBe(deSiempre)
  })
})
