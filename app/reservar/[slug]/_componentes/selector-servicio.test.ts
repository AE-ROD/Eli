import { createElement } from "react"
import { renderToString } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { RUBRO_DENTAL } from "@/lib/rubros"
import { frasesDelFormulario } from "../_frases"
import { SelectorServicio, type ServicioPublico } from "./selector-servicio"

/*
 * El primer paso de la reserva con los servicios ordenados por categoría: la
 * primera pintura (el HTML del servidor, sin navegador: los efectos no
 * corren). Con pocos servicios, o con una sola categoría, la salida es la de
 * siempre; con muchos y varias categorías, títulos, barra de filtros y, con más
 * de 12, la caja de búsqueda. La lógica del filtro está en
 * `lib/servicios-por-categoria.test.ts`.
 */

const servicio = (id: string, name: string, category: string | null, extra: Partial<ServicioPublico> = {}): ServicioPublico => ({
  id,
  name,
  description: null,
  duration: 30,
  price: 10000,
  category,
  ...extra,
})

/** `cantidad` servicios que reparten las categorías en orden: "Servicio 0", "Servicio 1"… */
const lista = (cantidad: number, categorias: (string | null)[]): ServicioPublico[] =>
  Array.from({ length: cantidad }, (_, i) => servicio(`s${i}`, `Servicio ${i}`, categorias[i % categorias.length]))

function pintar(
  servicios: ServicioPublico[],
  extra: Partial<Parameters<typeof SelectorServicio>[0]> = {}
): string {
  return renderToString(
    createElement(SelectorServicio, { servicios, seleccionados: [], onAlternar: () => {}, tope: 4, ...extra })
  )
}

/** Sin los dibujos de los íconos: la salida se compara por sus clases y su texto. */
const sinIconos = (html: string) => html.replace(/<svg[^>]*>.*?<\/svg>/g, "<svg/>")

/** El texto visible: sin etiquetas, para buscar frases enteras (React parte el texto con comentarios). */
const texto = (html: string) =>
  html
    .replace(/<!-- -->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")

const titulos = (html: string) => (html.match(/<h3[^>]*>.*?<\/h3>/g) ?? []).map((h3) => texto(h3).trim())
const botones = (html: string) => html.split("<button").slice(1)
const abreCon = (boton: string) => boton.split(">")[0]
/** Los botones de la barra de filtros: lo que hay entre su grupo y el primer título. */
const filtrosDe = (html: string) => botones(html.slice(html.indexOf('role="group"'), html.indexOf("<h3")))
/** Los botones de las tarjetas: todo lo que viene desde el primer título. */
const tarjetasDe = (html: string) => botones(html.slice(html.indexOf("<h3")))

// ─── La salida de antes de ordenar por categoría ────────────────────────────
// Capturada del componente anterior (commit 6384386) con estos servicios y estos
// elegidos. Si cambia a propósito, se regenera; si cambia sin querer, el test avisa.

const CORTE = servicio("a", "Corte de pelo", null, { description: "Lavado y secado incluidos", price: 15000, duration: 45 })
const TINTE = servicio("b", "Tinte", null, { price: null, duration: 90 })
const URGENCIA = servicio("c", "Urgencia dental", null, { esUrgencia: true })
const BARBA = servicio("d", "Barba", null)
const CUATRO = [CORTE, TINTE, URGENCIA, BARBA]

const ANTES_SIN_ELEGIR = [
  `<ul class="grid gap-3 @[40rem]:grid-cols-2">`,
  `<li class="flex min-w-0"><button type="button" aria-pressed="false" class="flex w-full flex-col rounded-boton-lg p-4 text-left text-navy squircle anillo-foco @[32rem]:p-5 transition-[background-color,box-shadow] duration-150 ease-suave bg-tarjeta inset-ring-1 inset-ring-texto-2 hover:bg-crema hover:inset-ring-navy"><span class="flex w-full items-start justify-between gap-3"><span class="min-w-0"><span class="block font-medium break-words">Corte de pelo</span><span class="mt-1 line-clamp-2 text-sm text-texto-2">Lavado y secado incluidos</span></span><span aria-hidden="true" class="grid size-6 shrink-0 place-items-center rounded-full transition-colors duration-150 ease-suave inset-ring-[1.5px] inset-ring-texto-2"></span></span><span class="mt-auto flex w-full items-center gap-4 pt-4 text-sm"><span class="flex items-center gap-1.5 text-texto-2"><svg/>45 min</span><span class="ml-auto font-medium tabular-nums">$15.000</span></span></button></li>`,
  `<li class="flex min-w-0"><button type="button" aria-pressed="false" class="flex w-full flex-col rounded-boton-lg p-4 text-left text-navy squircle anillo-foco @[32rem]:p-5 transition-[background-color,box-shadow] duration-150 ease-suave bg-tarjeta inset-ring-1 inset-ring-texto-2 hover:bg-crema hover:inset-ring-navy"><span class="flex w-full items-start justify-between gap-3"><span class="min-w-0"><span class="block font-medium break-words">Tinte</span></span><span aria-hidden="true" class="grid size-6 shrink-0 place-items-center rounded-full transition-colors duration-150 ease-suave inset-ring-[1.5px] inset-ring-texto-2"></span></span><span class="mt-auto flex w-full items-center gap-4 pt-4 text-sm"><span class="flex items-center gap-1.5 text-texto-2"><svg/>1h 30min</span></span></button></li>`,
  `<li class="flex min-w-0"><button type="button" aria-pressed="false" class="flex w-full flex-col rounded-boton-lg p-4 text-left text-navy squircle anillo-foco @[32rem]:p-5 transition-[background-color,box-shadow] duration-150 ease-suave bg-tarjeta inset-ring-1 inset-ring-texto-2 hover:bg-crema hover:inset-ring-navy"><span class="flex w-full items-start justify-between gap-3"><span class="min-w-0"><span class="block font-medium break-words">Urgencia dental</span></span><span aria-hidden="true" class="grid size-6 shrink-0 place-items-center rounded-full transition-colors duration-150 ease-suave inset-ring-[1.5px] inset-ring-texto-2"></span></span><span class="mt-auto flex w-full items-center gap-4 pt-4 text-sm"><span class="flex items-center gap-1.5 text-texto-2"><svg/>30 min</span><span class="rounded-sm bg-naranja-suave px-1.5 py-0.5 text-xs font-medium text-navy">Horas de hoy</span><span class="ml-auto font-medium tabular-nums">$10.000</span></span></button></li>`,
  `<li class="flex min-w-0"><button type="button" aria-pressed="false" class="flex w-full flex-col rounded-boton-lg p-4 text-left text-navy squircle anillo-foco @[32rem]:p-5 transition-[background-color,box-shadow] duration-150 ease-suave bg-tarjeta inset-ring-1 inset-ring-texto-2 hover:bg-crema hover:inset-ring-navy"><span class="flex w-full items-start justify-between gap-3"><span class="min-w-0"><span class="block font-medium break-words">Barba</span></span><span aria-hidden="true" class="grid size-6 shrink-0 place-items-center rounded-full transition-colors duration-150 ease-suave inset-ring-[1.5px] inset-ring-texto-2"></span></span><span class="mt-auto flex w-full items-center gap-4 pt-4 text-sm"><span class="flex items-center gap-1.5 text-texto-2"><svg/>30 min</span><span class="ml-auto font-medium tabular-nums">$10.000</span></span></button></li></ul>`,
].join("")

const ANTES_UNO_ELEGIDO_Y_UNO_SIN_COMBINACION = [
  `<ul class="grid gap-3 @[40rem]:grid-cols-2">`,
  `<li class="flex min-w-0"><button type="button" aria-pressed="true" class="flex w-full flex-col rounded-boton-lg p-4 text-left text-navy squircle anillo-foco @[32rem]:p-5 transition-[background-color,box-shadow] duration-150 ease-suave bg-azul-suave inset-ring-2 inset-ring-navy"><span class="flex w-full items-start justify-between gap-3"><span class="min-w-0"><span class="block font-medium break-words">Corte de pelo</span><span class="mt-1 line-clamp-2 text-sm text-navy/75">Lavado y secado incluidos</span></span><span aria-hidden="true" class="grid size-6 shrink-0 place-items-center rounded-full transition-colors duration-150 ease-suave bg-azul text-navy"><svg/></span></span><span class="mt-auto flex w-full items-center gap-4 pt-4 text-sm"><span class="flex items-center gap-1.5 text-navy/75"><svg/>45 min</span><span class="ml-auto font-medium tabular-nums">$15.000</span></span></button></li>`,
  `<li class="flex min-w-0"><button type="button" aria-pressed="false" disabled="" class="flex w-full flex-col rounded-boton-lg p-4 text-left text-navy squircle anillo-foco @[32rem]:p-5 transition-[background-color,box-shadow] duration-150 ease-suave cursor-not-allowed bg-superficie inset-ring-1 inset-ring-borde"><span class="flex w-full items-start justify-between gap-3"><span class="min-w-0"><span class="block font-medium break-words">Tinte</span></span><span aria-hidden="true" class="grid size-6 shrink-0 place-items-center rounded-full transition-colors duration-150 ease-suave inset-ring-[1.5px] inset-ring-texto-2"></span></span><span class="mt-auto flex w-full items-center gap-4 pt-4 text-sm"><span class="flex items-center gap-1.5 text-texto-2"><svg/>1h 30min</span></span><span class="mt-2 block text-sm font-medium text-navy">Nadie lo hace.</span></button></li>`,
  `<li class="flex min-w-0"><button type="button" aria-pressed="false" class="flex w-full flex-col rounded-boton-lg p-4 text-left text-navy squircle anillo-foco @[32rem]:p-5 transition-[background-color,box-shadow] duration-150 ease-suave bg-tarjeta inset-ring-1 inset-ring-texto-2 hover:bg-crema hover:inset-ring-navy"><span class="flex w-full items-start justify-between gap-3"><span class="min-w-0"><span class="block font-medium break-words">Urgencia dental</span></span><span aria-hidden="true" class="grid size-6 shrink-0 place-items-center rounded-full transition-colors duration-150 ease-suave inset-ring-[1.5px] inset-ring-texto-2"></span></span><span class="mt-auto flex w-full items-center gap-4 pt-4 text-sm"><span class="flex items-center gap-1.5 text-texto-2"><svg/>30 min</span><span class="rounded-sm bg-naranja-suave px-1.5 py-0.5 text-xs font-medium text-navy">Horas de hoy</span><span class="ml-auto font-medium tabular-nums">$10.000</span></span></button></li>`,
  `<li class="flex min-w-0"><button type="button" aria-pressed="false" class="flex w-full flex-col rounded-boton-lg p-4 text-left text-navy squircle anillo-foco @[32rem]:p-5 transition-[background-color,box-shadow] duration-150 ease-suave bg-tarjeta inset-ring-1 inset-ring-texto-2 hover:bg-crema hover:inset-ring-navy"><span class="flex w-full items-start justify-between gap-3"><span class="min-w-0"><span class="block font-medium break-words">Barba</span></span><span aria-hidden="true" class="grid size-6 shrink-0 place-items-center rounded-full transition-colors duration-150 ease-suave inset-ring-[1.5px] inset-ring-texto-2"></span></span><span class="mt-auto flex w-full items-center gap-4 pt-4 text-sm"><span class="flex items-center gap-1.5 text-texto-2"><svg/>30 min</span><span class="ml-auto font-medium tabular-nums">$10.000</span></span></button></li></ul>`,
].join("")

const ANTES_DOS_ELEGIDOS_Y_EL_TOPE_LLENO = [
  `<ul class="grid gap-3 @[40rem]:grid-cols-2">`,
  `<li class="flex min-w-0"><button type="button" aria-pressed="true" class="flex w-full flex-col rounded-boton-lg p-4 text-left text-navy squircle anillo-foco @[32rem]:p-5 transition-[background-color,box-shadow] duration-150 ease-suave bg-azul-suave inset-ring-2 inset-ring-navy"><span class="flex w-full items-start justify-between gap-3"><span class="min-w-0"><span class="block font-medium break-words">Corte de pelo</span><span class="mt-1 line-clamp-2 text-sm text-navy/75">Lavado y secado incluidos</span></span><span aria-hidden="true" class="grid size-6 shrink-0 place-items-center rounded-full transition-colors duration-150 ease-suave bg-azul text-navy"><span class="text-xs font-semibold tabular-nums">1</span></span></span><span class="mt-auto flex w-full items-center gap-4 pt-4 text-sm"><span class="flex items-center gap-1.5 text-navy/75"><svg/>45 min</span><span class="ml-auto font-medium tabular-nums">$15.000</span></span></button></li>`,
  `<li class="flex min-w-0"><button type="button" aria-pressed="false" disabled="" class="flex w-full flex-col rounded-boton-lg p-4 text-left text-navy squircle anillo-foco @[32rem]:p-5 transition-[background-color,box-shadow] duration-150 ease-suave cursor-not-allowed bg-tarjeta opacity-60 inset-ring-1 inset-ring-texto-2"><span class="flex w-full items-start justify-between gap-3"><span class="min-w-0"><span class="block font-medium break-words">Tinte</span></span><span aria-hidden="true" class="grid size-6 shrink-0 place-items-center rounded-full transition-colors duration-150 ease-suave inset-ring-[1.5px] inset-ring-texto-2"></span></span><span class="mt-auto flex w-full items-center gap-4 pt-4 text-sm"><span class="flex items-center gap-1.5 text-texto-2"><svg/>1h 30min</span></span></button></li>`,
  `<li class="flex min-w-0"><button type="button" aria-pressed="false" disabled="" class="flex w-full flex-col rounded-boton-lg p-4 text-left text-navy squircle anillo-foco @[32rem]:p-5 transition-[background-color,box-shadow] duration-150 ease-suave cursor-not-allowed bg-tarjeta opacity-60 inset-ring-1 inset-ring-texto-2"><span class="flex w-full items-start justify-between gap-3"><span class="min-w-0"><span class="block font-medium break-words">Urgencia dental</span></span><span aria-hidden="true" class="grid size-6 shrink-0 place-items-center rounded-full transition-colors duration-150 ease-suave inset-ring-[1.5px] inset-ring-texto-2"></span></span><span class="mt-auto flex w-full items-center gap-4 pt-4 text-sm"><span class="flex items-center gap-1.5 text-texto-2"><svg/>30 min</span><span class="rounded-sm bg-naranja-suave px-1.5 py-0.5 text-xs font-medium text-navy">Horas de hoy</span><span class="ml-auto font-medium tabular-nums">$10.000</span></span></button></li>`,
  `<li class="flex min-w-0"><button type="button" aria-pressed="true" class="flex w-full flex-col rounded-boton-lg p-4 text-left text-navy squircle anillo-foco @[32rem]:p-5 transition-[background-color,box-shadow] duration-150 ease-suave bg-azul-suave inset-ring-2 inset-ring-navy"><span class="flex w-full items-start justify-between gap-3"><span class="min-w-0"><span class="block font-medium break-words">Barba</span></span><span aria-hidden="true" class="grid size-6 shrink-0 place-items-center rounded-full transition-colors duration-150 ease-suave bg-azul text-navy"><span class="text-xs font-semibold tabular-nums">2</span></span></span><span class="mt-auto flex w-full items-center gap-4 pt-4 text-sm"><span class="flex items-center gap-1.5 text-navy/75"><svg/>30 min</span><span class="ml-auto font-medium tabular-nums">$10.000</span></span></button></li></ul>`,
].join("")


describe("pocos servicios (8 o menos), o una sola categoría: la grilla de siempre", () => {
  it("sin elegir, la salida es idéntica a la de antes", () => {
    expect(sinIconos(pintar(CUATRO))).toBe(ANTES_SIN_ELEGIR)
  })

  it("con uno elegido y otro que no se puede sumar, idéntica a la de antes", () => {
    const html = pintar(CUATRO, {
      seleccionados: [CORTE],
      sinCombinacion: new Set(["b"]),
      motivoSinCombinacion: "Nadie lo hace.",
    })

    expect(sinIconos(html)).toBe(ANTES_UNO_ELEGIDO_Y_UNO_SIN_COMBINACION)
  })

  it("con dos elegidos y el tope lleno, idéntica a la de antes", () => {
    expect(sinIconos(pintar(CUATRO, { seleccionados: [CORTE, BARBA], tope: 2 }))).toBe(ANTES_DOS_ELEGIDOS_Y_EL_TOPE_LLENO)
  })

  it("las categorías no cambian nada con 8 servicios o menos", () => {
    const conCategorias = lista(8, ["Corte", "Color", "Uñas"])
    const sinCategorias = conCategorias.map((s) => ({ ...s, category: null }))

    expect(pintar(conCategorias)).toBe(pintar(sinCategorias))
    expect(titulos(pintar(conCategorias))).toEqual([])
  })

  it.each([
    ["una sola categoría", lista(20, ["Corte"])],
    ["ninguna categoría", lista(20, [null])],
    ["'Color' y 'color ' (la misma)", lista(20, ["Color", "color "])],
  ])("20 servicios con %s: de corrido, sin títulos, sin barra y sin búsqueda", (_nombre, servicios) => {
    const html = pintar(servicios, { seleccionados: [servicios[0]] })

    expect(html.startsWith('<ul class="grid gap-3 @[40rem]:grid-cols-2">')).toBe(true)
    expect(html).not.toContain("<h3")
    expect(html).not.toContain('role="group"')
    expect(html).not.toContain("aria-live")
    expect(html).not.toContain('type="search"')
    expect(texto(html)).not.toContain("Elegiste")
    expect(html.match(/<li /g)).toHaveLength(20)
  })

  it("el catálogo del panel (la cita nueva de la Agenda), que no trae categorías, se ve como siempre", () => {
    const sinCategoria = lista(15, [null]).map(({ category: _category, ...resto }) => resto)

    expect(pintar(sinCategoria).startsWith('<ul class="grid gap-3 @[40rem]:grid-cols-2">')).toBe(true)
  })
})

describe("muchos servicios en varias categorías (9 a 12): títulos y barra de filtros, sin búsqueda", () => {
  // Corte 4, Color 3, Uñas 3, y 'Otros' 2.
  const DOCE = [
    ...lista(4, ["Corte"]).map((s, i) => ({ ...s, id: `c${i}`, name: `Corte ${i}` })),
    ...lista(3, ["Color"]).map((s, i) => ({ ...s, id: `k${i}`, name: `Color ${i}` })),
    ...lista(3, ["Uñas"]).map((s, i) => ({ ...s, id: `u${i}`, name: `Uñas ${i}` })),
    servicio("o1", "Masaje", null),
    servicio("o2", "Facial", "  "),
  ]

  it("cada categoría tiene su título (h3) con la cantidad, en el orden del catálogo y 'Otros' al final", () => {
    expect(titulos(pintar(DOCE))).toEqual(["Corte (4)", "Color (3)", "Uñas (3)", "Otros (2)"])
  })

  it("la barra: 'Todos' y una por categoría, con su cantidad, todo sin elegir salvo 'Todos'", () => {
    const html = pintar(DOCE)
    const filtros = filtrosDe(html)

    expect(html).toContain('aria-label="Filtrar por categoría"')
    expect(filtros.map((f) => texto(f.slice(f.indexOf(">") + 1, f.indexOf("</button>"))).trim())).toEqual([
      "Todos 12",
      "Corte 4",
      "Color 3",
      "Uñas 3",
      "Otros 2",
    ])
    expect(filtros.map((f) => abreCon(f).includes('aria-pressed="true"'))).toEqual([true, false, false, false, false])
  })

  it("los botones miden 44px de alto y la barra se desplaza de costado en el teléfono sin desbordar la página", () => {
    const html = pintar(DOCE)
    const barra = html.slice(html.lastIndexOf("<div", html.indexOf('role="group"')), html.indexOf('role="group"') + 400)

    expect(barra).toContain("overflow-x-auto")
    expect(barra).toContain("@[32rem]:flex-wrap")
    for (const boton of filtrosDe(html)) expect(abreCon(boton)).toContain("min-h-11")
  })

  it("hasta 12 servicios no hay caja de búsqueda", () => {
    const html = pintar(DOCE)

    expect(html).not.toContain('type="search"')
    expect(texto(html)).not.toContain("Buscar")
    expect(html).not.toContain("aria-live")
  })

  it("cada tarjeta está en el grupo de su categoría", () => {
    const html = pintar(DOCE)
    const grupos = html.split("<h3").slice(1)

    expect(grupos).toHaveLength(4)
    expect(texto(grupos[0])).toContain("Corte 0")
    expect(texto(grupos[0])).not.toContain("Color 0")
    expect(texto(grupos[3])).toContain("Masaje")
    expect(texto(grupos[3])).toContain("Facial")
    expect(html.match(/<li class="flex min-w-0">/g)).toHaveLength(12)
  })

  it("cada lista de tarjetas se nombra con el título de su categoría", () => {
    const html = pintar(DOCE)
    const idsDeTitulos = [...html.matchAll(/<h3 id="([^"]+)"/g)].map((m) => m[1])
    const listas = [...html.matchAll(/<ul aria-labelledby="([^"]+)" class="grid gap-3 @\[40rem\]:grid-cols-2 mt-3"/g)].map((m) => m[1])

    expect(idsDeTitulos).toHaveLength(4)
    expect(listas).toEqual(idsDeTitulos)
  })
})

describe("más de 12 servicios en varias categorías: además, la caja de búsqueda", () => {
  const CATALOGO = lista(14, ["Corte", "Color", "Uñas"])

  it("la caja 'Buscar servicio', con su etiqueta, y el aviso de resultados en una región viva", () => {
    const html = pintar(CATALOGO)

    expect(html).toContain('type="search"')
    expect(html).toMatch(/<label[^>]*>Buscar servicio<\/label>/)
    expect(html).toContain('aria-live="polite"')
    // Sin buscar nada, no hay nada que avisar.
    expect(texto(html)).not.toContain("encontrado")
    expect(texto(html)).not.toContain("Quitar filtros")
  })

  it("12 no la tienen y 13 sí", () => {
    expect(pintar(lista(12, ["Corte", "Color"]))).not.toContain('type="search"')
    expect(pintar(lista(13, ["Corte", "Color"]))).toContain('type="search"')
  })

  it("sigue habiendo títulos y barra, con 'Todos' con el total", () => {
    const html = pintar(CATALOGO)

    expect(titulos(html)).toEqual(["Corte (5)", "Color (5)", "Uñas (4)"])
    expect(texto(html)).toContain("Todos 14 Corte 5 Color 5 Uñas 4")
  })
})

describe("lo elegido nunca desaparece: la franja 'Elegiste:'", () => {
  const CATALOGO = lista(14, ["Corte", "Color", "Uñas"])

  it("sin elegir no hay franja", () => {
    expect(texto(pintar(CATALOGO))).not.toContain("Elegiste")
  })

  it("con elegidos, la franja los nombra, cada uno con su botón para quitarlo", () => {
    const html = pintar(CATALOGO, { seleccionados: [CATALOGO[4], CATALOGO[1]] })
    const franja = html.slice(html.indexOf("Elegiste:"), html.indexOf("<h3"))
    const quitar = botones(franja)

    expect(texto(franja)).toContain("Elegiste: Servicio 4 Servicio 1")
    expect(quitar.map((b) => /aria-label="([^"]+)"/.exec(abreCon(b))?.[1])).toEqual(["Quitar Servicio 4", "Quitar Servicio 1"])
    for (const boton of quitar) expect(abreCon(boton)).toContain("min-h-11")
  })

  it("las tarjetas siguen marcadas, con el número de orden", () => {
    const html = pintar(CATALOGO, { seleccionados: [CATALOGO[4], CATALOGO[1]] })
    const marcadas = tarjetasDe(html).filter((b) => abreCon(b).includes('aria-pressed="true"'))

    expect(marcadas).toHaveLength(2)
    expect(texto(marcadas[0])).toContain("Servicio 1")
    expect(texto(marcadas[1])).toContain("Servicio 4")
  })

  it("con el tope lleno, las demás tarjetas quedan deshabilitadas igual que antes (y quitar siempre se puede)", () => {
    const html = pintar(CATALOGO, { seleccionados: [CATALOGO[0], CATALOGO[1]], tope: 2 })
    const deshabilitados = tarjetasDe(html).filter((b) => abreCon(b).includes("disabled"))

    expect(deshabilitados).toHaveLength(12)
    for (const boton of botones(html).filter((b) => abreCon(b).includes("aria-label"))) expect(abreCon(boton)).not.toContain("disabled")
  })

  it("los que no se pueden sumar siguen deshabilitados, con su motivo a la vista en la tarjeta", () => {
    const html = pintar(CATALOGO, {
      seleccionados: [CATALOGO[0]],
      sinCombinacion: new Set(["s7", "s8"]),
      motivoSinCombinacion: "Nadie del equipo lo hace junto con lo que elegiste.",
    })

    const sinSumar = tarjetasDe(html).filter((b) => abreCon(b).includes("disabled"))
    expect(sinSumar).toHaveLength(2)
    for (const boton of sinSumar) expect(texto(boton)).toContain("Nadie del equipo lo hace junto con lo que elegiste.")
  })
})

describe("las palabras del rubro", () => {
  const CATALOGO = lista(14, ["Corte", "Color", "Uñas"])

  it.each([
    ["sin rubro: 'Buscar servicio'", null, "servicio"],
    ["un rubro desconocido: 'Buscar servicio'", "salud", "servicio"],
    ["un salón: 'Buscar servicio'", "salon", "servicio"],
    ["una barbería: 'Buscar servicio'", "barberia", "servicio"],
    ["un salón de uñas: 'Buscar servicio'", "spa-de-unas", "servicio"],
    ["una clínica dental: 'Buscar motivo'", RUBRO_DENTAL, "motivo"],
  ])("%s", (_nombre, rubro, palabra) => {
    const frases = frasesDelFormulario(rubro).paso1.catalogo
    const html = pintar(CATALOGO, { frases, seleccionados: [CATALOGO[0]] })

    expect(html).toMatch(new RegExp(`<label[^>]*>Buscar ${palabra}</label>`))
    expect(texto(html)).toContain("Todos 14")
    expect(texto(html)).toContain("Elegiste: Servicio 0")
    if (palabra === "motivo") expect(texto(html)).not.toContain("Buscar servicio")
  })

  it("sin frases del rubro, las de siempre", () => {
    expect(pintar(CATALOGO)).toMatch(/<label[^>]*>Buscar servicio<\/label>/)
  })
})
