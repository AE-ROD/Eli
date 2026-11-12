import { describe, expect, it } from "vitest"
import {
  agruparPorCategoria,
  ajustarFiltro,
  CATEGORIA_SIN_NOMBRE,
  claveDeCategoria,
  contarPorCategoria,
  filtrarServicios,
  formaDelCatalogo,
  MAXIMO_SIN_AGRUPAR,
  MAXIMO_SIN_BUSCADOR,
  normalizarParaBuscar,
  SIN_FILTRO,
  vistaDelCatalogo,
} from "./servicios-por-categoria"

/*
 * Cómo se ordena el catálogo para quien reserva: una sola regla para la mini
 * página y el primer paso de la reserva. Nada se muta.
 */

const servicio = (id: string, name: string, category: string | null, description: string | null = null) => ({
  id,
  name,
  description,
  category,
})

/** 15 servicios en 5 grupos de 3: Corte, Color ("color " es el mismo), Depilación, Uñas y Otros (null y "  "). */
const CATALOGO = [
  servicio("1", "Corte de pelo", "Corte"),
  servicio("2", "Corte y barba", "Corte"),
  servicio("3", "Corte niño", "Corte", "Hasta 12 años"),
  servicio("4", "Tinte completo", "Color"),
  servicio("5", "Mechas", "Color", "Balayage y californianas"),
  servicio("6", "Baño de color", "color "),
  servicio("7", "Depilación axilas", "Depilación"),
  servicio("8", "Depilacion piernas", "Depilación"),
  servicio("9", "Depilación láser", "Depilación", "Zona a elección"),
  servicio("10", "Manicure", "Uñas"),
  servicio("11", "Pedicure", "Uñas", "Incluye pestañas de las uñas"),
  servicio("12", "Uñas acrílicas", "Uñas"),
  servicio("13", "Masaje relajante", null),
  servicio("14", "Limpieza facial", "  "),
  servicio("15", "Peinado", null),
]

const ids = (servicios: readonly { id: string }[]) => servicios.map((s) => s.id)

const DOS = ["Corte", "Color"]

/** Una lista de `cantidad` servicios que reparte las categorías en orden, para probar los umbrales. */
const lista = (cantidad: number, categorias: (string | null)[]) =>
  Array.from({ length: cantidad }, (_, i) => servicio(String(i), `Servicio ${i}`, categorias[i % categorias.length]))

/** Congela la lista y cada servicio: si algo intenta mutarlos, el test se cae. */
function congelada<T extends object>(servicios: T[]): T[] {
  servicios.forEach((s) => Object.freeze(s))
  return Object.freeze(servicios) as T[]
}

describe("normalizarParaBuscar", () => {
  it.each([
    ["", ""],
    ["   ", ""],
    ["Corte", "corte"],
    ["CORTE DE PELO", "corte de pelo"],
    ["  Corte   de \t pelo  ", "corte de pelo"],
    ["Depilación", "depilacion"],
    ["depilacion", "depilacion"],
    ["Lifting de pestañas", "lifting de pestanas"],
    ["ÑANDÚ", "nandu"],
    ["Pingüino", "pinguino"],
  ])("%j → %j", (entrada, esperado) => {
    expect(normalizarParaBuscar(entrada)).toBe(esperado)
  })
})

describe("claveDeCategoria", () => {
  it.each([
    [null, "otros"],
    [undefined, "otros"],
    ["", "otros"],
    ["   ", "otros"],
    ["Color", "color"],
    ["  COLOR ", "color"],
    ["Otros", "otros"],
    ["OTROS ", "otros"],
    ["Depilación", "depilación"],
  ])("%j → %j", (entrada, esperada) => {
    expect(claveDeCategoria(entrada)).toBe(esperada)
  })
})

describe("agruparPorCategoria", () => {
  it("sin servicios no hay grupos", () => {
    expect(agruparPorCategoria([])).toEqual([])
  })

  it("en el orden en que aparece cada categoría, con los sin categoría al final en 'Otros'", () => {
    const grupos = agruparPorCategoria(CATALOGO)

    expect(grupos.map((g) => g.categoria)).toEqual(["Corte", "Color", "Depilación", "Uñas", CATEGORIA_SIN_NOMBRE])
    expect(grupos.map((g) => g.clave)).toEqual(["corte", "color", "depilación", "uñas", "otros"])
    expect(grupos.map((g) => ids(g.servicios))).toEqual([
      ["1", "2", "3"],
      ["4", "5", "6"],
      ["7", "8", "9"],
      ["10", "11", "12"],
      ["13", "14", "15"],
    ])
  })

  it("'Otros' va al final aunque el primer servicio no tenga categoría", () => {
    const grupos = agruparPorCategoria([servicio("a", "A", null), servicio("b", "B", "Color"), servicio("c", "C", "Corte")])

    expect(grupos.map((g) => g.categoria)).toEqual(["Color", "Corte", "Otros"])
  })

  it("'Color' y 'color ' son la misma categoría, con el nombre como la escribió el primero", () => {
    const grupos = agruparPorCategoria([servicio("a", "A", "color "), servicio("b", "B", "Color"), servicio("c", "C", "COLOR")])

    expect(grupos).toHaveLength(1)
    expect(grupos[0].categoria).toBe("color")
    expect(ids(grupos[0].servicios)).toEqual(["a", "b", "c"])
  })

  it("una categoría escrita 'Otros' es la misma que la de los sin categoría: un solo grupo, al final", () => {
    const grupos = agruparPorCategoria([
      servicio("a", "A", "Otros"),
      servicio("b", "B", "Color"),
      servicio("c", "C", null),
      servicio("d", "D", " otros "),
    ])

    expect(grupos.map((g) => g.categoria)).toEqual(["Color", "Otros"])
    expect(ids(grupos[1].servicios)).toEqual(["a", "c", "d"])
  })

  it("una categoría que falta del todo (undefined) es como no tener", () => {
    const grupos = agruparPorCategoria([{ id: "a" }, { id: "b", category: "Color" }])

    expect(grupos.map((g) => g.categoria)).toEqual(["Color", "Otros"])
  })

  it("no muta la entrada y conserva los mismos objetos, en el orden del catálogo", () => {
    const entrada = congelada(CATALOGO.map((s) => ({ ...s })))
    const copia = JSON.stringify(entrada)

    const grupos = agruparPorCategoria(entrada)

    expect(JSON.stringify(entrada)).toBe(copia)
    expect(grupos[0].servicios[0]).toBe(entrada[0])
    expect(grupos.flatMap((g) => g.servicios)).toHaveLength(entrada.length)
  })
})

describe("contarPorCategoria", () => {
  it("cuenta por clave, con 'otros' para los sin categoría", () => {
    expect([...contarPorCategoria(CATALOGO)]).toEqual([
      ["corte", 3],
      ["color", 3],
      ["depilación", 3],
      ["uñas", 3],
      ["otros", 3],
    ])
  })

  it("una categoría sin servicios no aparece; sin servicios, nada", () => {
    expect([...contarPorCategoria(CATALOGO.slice(0, 4))]).toEqual([
      ["corte", 3],
      ["color", 1],
    ])
    expect(contarPorCategoria([]).size).toBe(0)
  })
})

describe("filtrarServicios", () => {
  it.each([
    ["sin filtro", {}, ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"]],
    ["texto vacío", { texto: "" }, ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"]],
    ["texto de puros espacios", { texto: "   " }, ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"]],
    ["por nombre", { texto: "corte" }, ["1", "2", "3"]],
    ["sin distinguir mayúsculas", { texto: "CORTE" }, ["1", "2", "3"]],
    ["una parte del nombre", { texto: "cur" }, ["10", "11"]],
    ["sin tilde, aunque el nombre la lleve", { texto: "depilacion" }, ["7", "8", "9"]],
    ["con tilde, aunque el nombre no la lleve", { texto: "depilación" }, ["7", "8", "9"]],
    ["la ñ vale como n", { texto: "unas" }, ["11", "12"]],
    ["la n vale como ñ", { texto: "pestañas" }, ["11"]],
    ["por descripción", { texto: "balayage" }, ["5"]],
    ["por descripción, sin tilde", { texto: "eleccion" }, ["9"]],
    ["varias palabras: todas, en cualquier orden", { texto: "barba corte" }, ["2"]],
    ["varias palabras entre el nombre y la descripción", { texto: "niño hasta" }, ["3"]],
    ["espacios de más entre las palabras", { texto: "  corte    barba " }, ["2"]],
    ["la categoría no se busca como texto", { texto: "color" }, ["6"]],
    ["sin coincidencias", { texto: "zzz" }, []],
    ["una categoría", { categoria: "color" }, ["4", "5", "6"]],
    ["los sin categoría", { categoria: "otros" }, ["13", "14", "15"]],
    ["una categoría que no existe", { categoria: "no-existe" }, []],
    ["categoría y texto", { categoria: "corte", texto: "barba" }, ["2"]],
    ["categoría y texto sin coincidencias en ella", { categoria: "color", texto: "corte" }, []],
  ])("%s", (_nombre, filtro, esperados) => {
    expect(ids(filtrarServicios(CATALOGO, filtro))).toEqual(esperados)
  })

  it("un servicio sin descripción no rompe la búsqueda", () => {
    expect(ids(filtrarServicios([servicio("a", "Corte", null, null)], { texto: "corte" }))).toEqual(["a"])
  })

  it("no muta la entrada: devuelve una lista nueva con los mismos objetos", () => {
    const entrada = congelada(CATALOGO.map((s) => ({ ...s })))

    const todos = filtrarServicios(entrada, {})
    const algunos = filtrarServicios(entrada, { texto: "corte" })

    expect(todos).not.toBe(entrada)
    expect(todos).toEqual(entrada)
    expect(algunos[0]).toBe(entrada[0])
    expect(entrada).toHaveLength(15)
  })
})

describe("formaDelCatalogo: cuándo se agrupa y cuándo se busca", () => {
  it("los umbrales son 8 y 12", () => {
    expect(MAXIMO_SIN_AGRUPAR).toBe(8)
    expect(MAXIMO_SIN_BUSCADOR).toBe(12)
  })

  it.each([
    ["sin servicios", [], { agrupado: false, conBuscador: false }],
    ["8 servicios en varias categorías: se ve de corrido", lista(8, ["Corte", "Color", "Uñas"]), { agrupado: false, conBuscador: false }],
    ["9 servicios en 2 categorías: agrupa", lista(9, DOS), { agrupado: true, conBuscador: false }],
    ["12 servicios en 2 categorías: agrupa, sin buscador", lista(12, DOS), { agrupado: true, conBuscador: false }],
    ["13 servicios en 2 categorías: agrupa y busca", lista(13, DOS), { agrupado: true, conBuscador: true }],
    ["9 servicios en una sola categoría: de corrido", lista(9, ["Corte"]), { agrupado: false, conBuscador: false }],
    ["9 servicios, ninguno con categoría: de corrido", lista(9, [null]), { agrupado: false, conBuscador: false }],
    ["20 servicios en una sola categoría: de corrido y sin buscador", lista(20, ["Corte"]), { agrupado: false, conBuscador: false }],
    ["20 servicios, ninguno con categoría: de corrido y sin buscador", lista(20, [null]), { agrupado: false, conBuscador: false }],
    ["una categoría y 'Otros' son 2: agrupa", lista(9, ["Corte", null]), { agrupado: true, conBuscador: false }],
    ["'Color' y 'color ' son una: de corrido", lista(10, ["Color", "color "]), { agrupado: false, conBuscador: false }],
    ["una categoría escrita 'Otros' y los sin categoría son una: de corrido", lista(10, ["Otros", null]), { agrupado: false, conBuscador: false }],
  ])("%s", (_nombre, servicios, esperado) => {
    expect(formaDelCatalogo(servicios)).toEqual(esperado)
  })
})

describe("ajustarFiltro", () => {
  const GRANDE = CATALOGO
  const MEDIANA = lista(10, DOS)
  const CORTA = lista(5, DOS)

  it("lo que sigue valiendo vuelve igual: el mismo objeto", () => {
    const filtro = { categoria: "corte", texto: "barba" }

    expect(ajustarFiltro(filtro, GRANDE)).toBe(filtro)
    expect(ajustarFiltro(SIN_FILTRO, GRANDE)).toBe(SIN_FILTRO)
    expect(ajustarFiltro(SIN_FILTRO, CORTA)).toBe(SIN_FILTRO)
  })

  it("una lista que no se agrupa no tiene filtro", () => {
    expect(ajustarFiltro({ categoria: "corte", texto: "" }, CORTA)).toBe(SIN_FILTRO)
    expect(ajustarFiltro({ categoria: null, texto: "barba" }, CORTA)).toBe(SIN_FILTRO)
    const vacio = { categoria: null, texto: "" }
    expect(ajustarFiltro(vacio, CORTA)).toBe(vacio)
  })

  it("una categoría que ya no existe vuelve a 'todos' y deja la búsqueda", () => {
    // 14 servicios sin las uñas: sigue habiendo buscador.
    const sinUnas = [...CATALOGO, servicio("16", "Spa", null), servicio("17", "Sauna", null)].filter((s) => s.category !== "Uñas")
    expect(ajustarFiltro({ categoria: "uñas", texto: "barba" }, sinUnas)).toEqual({ categoria: null, texto: "barba" })
    expect(ajustarFiltro({ categoria: "no-existe", texto: "" }, MEDIANA)).toEqual(SIN_FILTRO)
  })

  it("ajustar dos veces es lo mismo que una: el selector no se queda guardando el filtro una y otra vez", () => {
    const filtros = [SIN_FILTRO, { categoria: "corte", texto: "" }, { categoria: "no-existe", texto: "x" }, { categoria: null, texto: "barba" }]
    for (const servicios of [CORTA, MEDIANA, GRANDE]) {
      for (const filtro of filtros) {
        const una = ajustarFiltro(filtro, servicios)
        expect(ajustarFiltro(una, servicios)).toBe(una)
      }
    }
  })

  it("sin buscador (hasta 12 servicios) no hay texto, pero la categoría se queda", () => {
    expect(ajustarFiltro({ categoria: "corte", texto: "barba" }, MEDIANA)).toEqual({ categoria: "corte", texto: "" })
  })
})

describe("vistaDelCatalogo", () => {
  it("con pocos servicios no cambia nada: la lista de siempre, sin barra ni grupos", () => {
    const pocos = CATALOGO.slice(0, 8)

    const vista = vistaDelCatalogo(pocos, { categoria: "corte", texto: "x" })

    expect(vista).toMatchObject({ agrupado: false, conBuscador: false, conBusqueda: false, categorias: [], grupos: [] })
    expect(vista.filtro).toBe(SIN_FILTRO)
    expect(ids(vista.resultados)).toEqual(ids(pocos))
    expect(vista.cantidadTotal).toBe(8)
  })

  it("sin filtro: todos los grupos, y la barra con la cantidad de cada categoría", () => {
    const vista = vistaDelCatalogo(CATALOGO)

    expect(vista).toMatchObject({ agrupado: true, conBuscador: true, conBusqueda: false, cantidadTotal: 15 })
    expect(vista.categorias).toEqual([
      { clave: "corte", categoria: "Corte", cantidad: 3 },
      { clave: "color", categoria: "Color", cantidad: 3 },
      { clave: "depilación", categoria: "Depilación", cantidad: 3 },
      { clave: "uñas", categoria: "Uñas", cantidad: 3 },
      { clave: "otros", categoria: "Otros", cantidad: 3 },
    ])
    expect(vista.grupos.map((g) => g.categoria)).toEqual(["Corte", "Color", "Depilación", "Uñas", "Otros"])
    expect(vista.resultados).toHaveLength(15)
  })

  it("una categoría: sólo su grupo; la barra sigue completa", () => {
    const vista = vistaDelCatalogo(CATALOGO, { categoria: "color", texto: "" })

    expect(vista.grupos.map((g) => g.categoria)).toEqual(["Color"])
    expect(ids(vista.resultados)).toEqual(["4", "5", "6"])
    expect(vista.categorias).toHaveLength(5)
    expect(vista.cantidadTotal).toBe(15)
  })

  it("la búsqueda filtra entre categorías; la barra deja las que quedaron en 0 y 'Todos' cuenta los resultados", () => {
    const vista = vistaDelCatalogo(CATALOGO, { categoria: null, texto: "depilacion" })

    expect(vista.conBusqueda).toBe(true)
    expect(vista.cantidadTotal).toBe(3)
    expect(vista.categorias.map((c) => c.cantidad)).toEqual([0, 0, 3, 0, 0])
    expect(vista.grupos.map((g) => g.categoria)).toEqual(["Depilación"])
    expect(ids(vista.resultados)).toEqual(["7", "8", "9"])
  })

  it("la búsqueda de varias categorías conserva el orden del catálogo, con 'Otros' al final", () => {
    const vista = vistaDelCatalogo(CATALOGO, { categoria: null, texto: "i" })

    const categorias = vista.grupos.map((g) => g.categoria)
    expect(categorias[categorias.length - 1]).toBe("Otros")
    expect(categorias.indexOf("Corte")).toBeLessThan(categorias.indexOf("Color"))
  })

  it("una categoría con una búsqueda sin coincidencias en ella: nada que mostrar", () => {
    const vista = vistaDelCatalogo(CATALOGO, { categoria: "color", texto: "corte" })

    expect(vista.resultados).toEqual([])
    expect(vista.grupos).toEqual([])
    expect(vista.cantidadTotal).toBe(3)
  })

  it("una búsqueda de puros espacios no cuenta como búsqueda", () => {
    expect(vistaDelCatalogo(CATALOGO, { categoria: null, texto: "   " }).conBusqueda).toBe(false)
  })

  it("al cambiar de profesional: la categoría que ya no existe vuelve a 'todos' y se avisa con otro filtro", () => {
    const filtro = { categoria: "uñas", texto: "" }
    const sinUnas = CATALOGO.filter((s) => s.category !== "Uñas")

    const vista = vistaDelCatalogo(sinUnas, filtro)

    expect(vista.filtro).not.toBe(filtro)
    expect(vista.filtro).toEqual(SIN_FILTRO)
    expect(vista.categorias.map((c) => c.categoria)).toEqual(["Corte", "Color", "Depilación", "Otros"])
    expect(vista.resultados).toHaveLength(12)
  })

  it("no muta la entrada", () => {
    const entrada = congelada(CATALOGO.map((s) => ({ ...s })))
    const copia = JSON.stringify(entrada)

    vistaDelCatalogo(entrada, { categoria: "corte", texto: "barba" })
    vistaDelCatalogo(entrada)

    expect(JSON.stringify(entrada)).toBe(copia)
  })
})
