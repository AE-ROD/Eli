import { describe, expect, it } from "vitest"
import {
  SIN_FILTRO_DE_LA_LISTA,
  ajustarFiltroDeLaLista,
  categoriaCanonica,
  categoriasDe,
  conActivo,
  conCategoria,
  conCategoriaRenombrada,
  contarDeLaCategoria,
  escriturasDeLaCategoria,
  filtrarLista,
  fusionarServicios,
  llevaFiltros,
  planDeRenombre,
  vistaDeLaLista,
  type ServicioDeLaLista,
} from "./lista-de-servicios"

let numero = 0
const servicio = (name: string, category: string | null = null, active = true): ServicioDeLaLista => ({
  id: `s${++numero}`,
  name,
  category,
  active,
})

const MUCHOS = (cantidad: number): ServicioDeLaLista[] =>
  Array.from({ length: cantidad }, (_, i) => servicio(`Servicio ${i + 1}`, i % 2 === 0 ? "Par" : null))

describe("los filtros sólo aparecen con una lista larga", () => {
  it("más de 12 servicios llevan buscador y filtro; 12 o menos, no", () => {
    expect(llevaFiltros(12)).toBe(false)
    expect(llevaFiltros(13)).toBe(true)
  })

  it("si la lista se acorta, un filtro escondido no sigue ocultando servicios", () => {
    const activo = { texto: "corte", estado: "inactivos" as const }
    expect(ajustarFiltroDeLaLista(activo, 20)).toBe(activo)
    expect(ajustarFiltroDeLaLista(activo, 12)).toBe(SIN_FILTRO_DE_LA_LISTA)
    expect(ajustarFiltroDeLaLista(SIN_FILTRO_DE_LA_LISTA, 3)).toBe(SIN_FILTRO_DE_LA_LISTA)
  })

  it("vistaDeLaLista ignora el filtro de una lista corta", () => {
    const lista = [servicio("Corte"), servicio("Barba", null, false)]
    const vista = vistaDeLaLista(lista, { texto: "zzz", estado: "inactivos" })
    expect(vista.conFiltros).toBe(false)
    expect(vista.visibles).toHaveLength(2)
    expect(vista.filtrando).toBe(false)
  })
})

describe("filtrarLista", () => {
  const lista = [
    servicio("Depilación de piernas", "Cera"),
    servicio("Corte", "Cabello"),
    servicio("Tintura", "Color", false),
    servicio("Brushing", "Cabello", false),
  ]

  it("busca en el nombre y en la categoría, sin mayúsculas ni tildes", () => {
    expect(filtrarLista(lista, { texto: "DEPILACION", estado: "todos" }).map((s) => s.name)).toEqual(["Depilación de piernas"])
    expect(filtrarLista(lista, { texto: "cabello", estado: "todos" }).map((s) => s.name)).toEqual(["Corte", "Brushing"])
  })

  it("todas las palabras tienen que estar, en el nombre o en la categoría", () => {
    expect(filtrarLista(lista, { texto: "cabello brush", estado: "todos" }).map((s) => s.name)).toEqual(["Brushing"])
    expect(filtrarLista(lista, { texto: "cabello tintura", estado: "todos" })).toEqual([])
  })

  it("activos, inactivos o todos, solos o con una búsqueda", () => {
    expect(filtrarLista(lista, { texto: "", estado: "activos" })).toHaveLength(2)
    expect(filtrarLista(lista, { texto: "", estado: "inactivos" }).map((s) => s.name)).toEqual(["Tintura", "Brushing"])
    expect(filtrarLista(lista, { texto: "cabello", estado: "inactivos" }).map((s) => s.name)).toEqual(["Brushing"])
    expect(filtrarLista(lista, SIN_FILTRO_DE_LA_LISTA)).toHaveLength(4)
  })
})

describe("vistaDeLaLista: agrupa como la reserva pública", () => {
  it("las categorías en el orden en que aparecen y los sin categoría al final", () => {
    const lista = [servicio("A", null), servicio("B", "Color"), servicio("C", "Corte"), servicio("D", "color ")]
    const vista = vistaDeLaLista(lista)
    expect(vista.grupos.map((g) => [g.clave, g.categoria, g.servicios.map((s) => s.name)])).toEqual([
      ["color", "Color", ["B", "D"]],
      ["corte", "Corte", ["C"]],
      ["otros", "Otros", ["A"]],
    ])
    expect(vista.grupos.map((g) => g.sinCategoria)).toEqual([false, false, true])
  })

  it("un filtro no cambia el orden de las categorías ni su nombre", () => {
    const lista = [
      ...MUCHOS(10),
      servicio("Color 1", "Color", false), // la primera de "Color" queda escondida
      servicio("Color 2", "Color"),
      servicio("Zeta", "Zeta"),
    ]
    const sinFiltro = vistaDeLaLista(lista).grupos.map((g) => g.clave)
    const conFiltro = vistaDeLaLista(lista, { texto: "", estado: "activos" })
    expect(conFiltro.grupos.map((g) => g.clave)).toEqual(sinFiltro)
    expect(conFiltro.grupos.find((g) => g.clave === "color")?.servicios.map((s) => s.name)).toEqual(["Color 2"])
  })

  it("los grupos que el filtro deja vacíos no aparecen", () => {
    const lista = [...MUCHOS(12), servicio("Tinte", "Color")]
    const vista = vistaDeLaLista(lista, { texto: "tinte", estado: "todos" })
    expect(vista.conFiltros).toBe(true)
    expect(vista.grupos.map((g) => g.clave)).toEqual(["color"])
    expect(vista.buscando && vista.filtrando).toBe(true)
    expect(vista.total).toBe(13)
  })

  it("un grupo \"Otros\" con alguno que se llama así no es \"sin categoría\"", () => {
    const vista = vistaDeLaLista([servicio("A", null), servicio("B", "Otros")])
    expect(vista.grupos).toHaveLength(1)
    expect(vista.grupos[0].sinCategoria).toBe(false)
  })
})

describe("categorías", () => {
  it("categoriasDe: una por categoría, como la escribió el primero, sin los sin categoría", () => {
    const lista = [servicio("A", "Color"), servicio("B", null), servicio("C", " color"), servicio("D", "Corte"), servicio("E", "  ")]
    expect(categoriasDe(lista)).toEqual(["Color", "Corte"])
  })

  it("categoriaCanonica usa la que ya existe en vez de crear una segunda", () => {
    expect(categoriaCanonica(["Color", "Corte"], " color ")).toBe("Color")
    expect(categoriaCanonica(["Color"], "Barba")).toBe("Barba")
    expect(categoriaCanonica(["Color"], "   ")).toBe("")
  })

  it("escriturasDeLaCategoria: cada forma distinta con que está guardada", () => {
    const lista = [servicio("A", "Color"), servicio("B", "color "), servicio("C", "Color"), servicio("D", "Corte"), servicio("E", null)]
    expect(escriturasDeLaCategoria(lista, "color")).toEqual(["Color", "color"])
    expect(escriturasDeLaCategoria(lista, "otros")).toEqual([])
  })
})

describe("contarDeLaCategoria", () => {
  it("cuenta las escrituras de la categoría y no a los sin categoría", () => {
    const lista = [servicio("A", "Color"), servicio("B", "color "), servicio("C", null), servicio("D", "Otros"), servicio("E", "  ")]
    expect(contarDeLaCategoria(lista, "color")).toBe(2)
    expect(contarDeLaCategoria(lista, "otros")).toBe(1)
    expect(contarDeLaCategoria(lista, "corte")).toBe(0)
  })
})

describe("planDeRenombre", () => {
  const lista = [servicio("A", "Color"), servicio("B", "Color"), servicio("C", "Corte"), servicio("D", "Corte"), servicio("E", "Corte")]

  it("sin nombre no hay plan", () => {
    expect(planDeRenombre(lista, "color", "   ")).toEqual({ tipo: "vacio" })
  })

  it("el mismo nombre no hace nada, salvo que haya escrituras distintas que unificar", () => {
    expect(planDeRenombre(lista, "color", "Color")).toEqual({ tipo: "igual" })
    const variantes = [servicio("A", "Color"), servicio("B", "color")]
    expect(planDeRenombre(variantes, "color", "Color")).toEqual({ tipo: "corregir", nuevo: "Color" })
  })

  it("otras mayúsculas de la misma categoría la corrigen, no la unen consigo misma", () => {
    expect(planDeRenombre(lista, "color", "COLOR")).toEqual({ tipo: "corregir", nuevo: "COLOR" })
  })

  it("un nombre nuevo la renombra", () => {
    expect(planDeRenombre(lista, "color", " Tintes ")).toEqual({ tipo: "renombrar", nuevo: "Tintes" })
  })

  it("un nombre que ya existe los une, con la escritura de la que existe y cuántos ya tiene", () => {
    expect(planDeRenombre(lista, "color", "corte")).toEqual({ tipo: "unir", nuevo: "Corte", conLosDe: 3 })
  })
})

describe("los cambios en la lista no mutan nada", () => {
  const lista = [
    { id: "1", category: "Color", active: true },
    { id: "2", category: null, active: true },
    { id: "3", category: "color ", active: false },
  ]

  it("conCategoria cambia sólo las elegidas", () => {
    const nueva = conCategoria(lista, new Set(["1", "2"]), "Corte")
    expect(nueva.map((s) => s.category)).toEqual(["Corte", "Corte", "color "])
    expect(lista[0].category).toBe("Color")
    expect(conCategoria(lista, new Set(["1"]), null)[0].category).toBeNull()
  })

  it("conActivo activa o desactiva sólo las elegidas", () => {
    expect(conActivo(lista, new Set(["1", "3"]), false).map((s) => s.active)).toEqual([false, true, false])
    expect(conActivo(lista, new Set(["3"]), true).map((s) => s.active)).toEqual([true, true, true])
  })

  it("conCategoriaRenombrada cambia todas las escrituras de la categoría y no toca a los sin categoría", () => {
    expect(conCategoriaRenombrada(lista, "color", "Tintes").map((s) => s.category)).toEqual(["Tintes", null, "Tintes"])
    expect(conCategoriaRenombrada(lista, "otros", "X").map((s) => s.category)).toEqual(["Color", null, "color "])
  })

  it("fusionarServicios actualiza lo que ya estaba, agrega lo nuevo y no quita nada", () => {
    const actuales = [{ id: "a", n: 1 }, { id: "b", n: 2 }]
    const traidos = [{ id: "c", n: 3 }, { id: "a", n: 10 }]
    expect(fusionarServicios(actuales, traidos)).toEqual([{ id: "a", n: 10 }, { id: "b", n: 2 }, { id: "c", n: 3 }])
    expect(fusionarServicios(actuales, [])).toEqual(actuales)
  })
})
