import { describe, expect, it } from "vitest"
import {
  GRUPOS,
  NOMBRE_DE_SECCION,
  agruparSecciones,
  anclaDelHash,
  grupoDeAncla,
  gruposAbiertosAlEntrar,
  type AnclaDeConfiguracion,
} from "./_grupos"

const seccion = (id: AnclaDeConfiguracion) => ({ id })

const DE_SIEMPRE = { clientes: "clientes" }
const DE_LA_CLINICA = { clientes: "pacientes" }

/** Lo que ve cada quien, en el orden en que `page.tsx` las arma. */
const DUEÑA_DE_UN_SALON = (
  ["horario", "pagina", "servicios", "productos", "plazo-de-cambios", "por-confirmar", "hora-valle", "mensajes", "fila-virtual"] as const
).map(seccion)
// Sin "hora-valle" ni "fila-virtual": en una clínica dental no existen (`lib/permisos.ts`).
const DUEÑA_DE_UNA_CLINICA = (
  ["horario", "pagina", "servicios", "sillones", "laboratorios", "productos", "plazo-de-cambios", "por-confirmar", "mensajes"] as const
).map(seccion)
const PROFESIONAL = (["horario", "pagina"] as const).map(seccion)

describe("GRUPOS", () => {
  it("cada sección está en exactamente un grupo", () => {
    const todas = GRUPOS.flatMap((grupo) => grupo.secciones)
    expect(new Set(todas).size).toBe(todas.length)
    expect([...todas].sort()).toEqual(Object.keys(NOMBRE_DE_SECCION).sort())
  })
})

describe("agruparSecciones", () => {
  it("reparte las once secciones en los cinco grupos, en su orden, lleguen como lleguen", () => {
    const grupos = agruparSecciones(
      [...DUEÑA_DE_UN_SALON, seccion("sillones"), seccion("laboratorios")].reverse(),
      DE_SIEMPRE
    )
    expect(grupos.map((grupo) => [grupo.id, grupo.secciones.map((s) => s.id)])).toEqual([
      ["horario-y-equipo", ["horario"]],
      ["tu-negocio", ["pagina", "productos"]],
      ["catalogo-y-clinica", ["servicios", "sillones", "laboratorios"]],
      ["reservas-y-clientes", ["plazo-de-cambios", "por-confirmar", "hora-valle", "fila-virtual"]],
      ["mensajes", ["mensajes"]],
    ])
  })

  it("una clínica dental no tiene hora valle ni fila virtual: su grupo de reservas sigue con las otras dos, en los cinco grupos", () => {
    const grupos = agruparSecciones(DUEÑA_DE_UNA_CLINICA, DE_LA_CLINICA)
    expect(grupos.map((grupo) => [grupo.id, grupo.secciones.map((s) => s.id)])).toEqual([
      ["horario-y-equipo", ["horario"]],
      ["tu-negocio", ["pagina", "productos"]],
      ["catalogo-y-clinica", ["servicios", "sillones", "laboratorios"]],
      ["reservas-y-clientes", ["plazo-de-cambios", "por-confirmar"]],
      ["mensajes", ["mensajes"]],
    ])
    expect(grupos.find((grupo) => grupo.id === "reservas-y-clientes")?.resumen).toBe("Cancelar o reagendar · Reservas por confirmar")
  })

  it("si un grupo quedara sin secciones visibles, no existe (la clínica del encargado sin «Cancelar o reagendar» ni las de la dueña)", () => {
    const grupos = agruparSecciones((["horario", "mensajes"] as const).map(seccion), DE_LA_CLINICA)
    expect(grupos.map((grupo) => grupo.id)).toEqual(["horario-y-equipo", "mensajes"])
  })

  it("no muestra un grupo sin ninguna sección visible: el profesional ve sólo dos grupos", () => {
    const grupos = agruparSecciones(PROFESIONAL, DE_SIEMPRE)
    expect(grupos.map((grupo) => grupo.id)).toEqual(["horario-y-equipo", "tu-negocio"])
    expect(grupos.every((grupo) => grupo.secciones.length > 0)).toBe(true)
  })

  it("sin ninguna sección visible no hay grupos", () => {
    expect(agruparSecciones([], DE_SIEMPRE)).toEqual([])
  })

  it("el orden de las secciones de un grupo es el del grupo, no el de entrada", () => {
    const revueltas = (["productos", "pagina"] as const).map(seccion)
    expect(agruparSecciones(revueltas, DE_SIEMPRE)[0].secciones.map((s) => s.id)).toEqual(["pagina", "productos"])
  })

  it("conserva el resto de lo que trae cada sección (el contenido ya renderizado)", () => {
    const grupos = agruparSecciones([{ id: "horario" as const, contenido: "<Horario />" }], DE_SIEMPRE)
    expect(grupos[0].secciones[0].contenido).toBe("<Horario />")
  })

  it("el resumen nombra sólo las secciones visibles, separadas por «·»", () => {
    const grupos = agruparSecciones(DUEÑA_DE_UN_SALON, DE_SIEMPRE)
    const porId = Object.fromEntries(grupos.map((grupo) => [grupo.id, grupo.resumen]))
    expect(porId["tu-negocio"]).toBe("Página pública · Productos")
    expect(porId["catalogo-y-clinica"]).toBe("Servicios")
    expect(porId["reservas-y-clientes"]).toBe("Cancelar o reagendar · Reservas por confirmar · Precios de hora valle · Fila virtual")
  })

  it("el encargado de una clínica (sin laboratorios ni las secciones de la dueña) ve su grupo reducido", () => {
    const encargado = (["horario", "pagina", "servicios", "sillones", "productos", "plazo-de-cambios", "mensajes"] as const).map(seccion)
    const grupos = agruparSecciones(encargado, DE_LA_CLINICA)
    expect(grupos.map((grupo) => grupo.id)).toEqual(["horario-y-equipo", "tu-negocio", "catalogo-y-clinica", "reservas-y-clientes", "mensajes"])
    expect(grupos.find((grupo) => grupo.id === "catalogo-y-clinica")?.resumen).toBe("Servicios · Sillones")
    expect(grupos.find((grupo) => grupo.id === "reservas-y-clientes")?.resumen).toBe("Cancelar o reagendar")
  })

  describe("títulos", () => {
    const titulos = (grupos: ReturnType<typeof agruparSecciones>) => grupos.map((grupo) => grupo.titulo)

    it("los cinco, con las palabras del rubro", () => {
      expect(titulos(agruparSecciones(DUEÑA_DE_UNA_CLINICA, DE_LA_CLINICA))).toEqual([
        "Horario y equipo",
        "Tu negocio",
        "Catálogo y clínica",
        "Reservas y pacientes",
        "Mensajes",
      ])
      expect(titulos(agruparSecciones(DUEÑA_DE_UN_SALON, DE_SIEMPRE))[3]).toBe("Reservas y clientes")
    })

    it("un salón no tiene nada de clínica: el grupo se llama «Catálogo»", () => {
      expect(titulos(agruparSecciones(DUEÑA_DE_UN_SALON, DE_SIEMPRE))[2]).toBe("Catálogo")
    })
  })
})

describe("anclaDelHash", () => {
  it("quita el # y devuelve el ancla", () => {
    expect(anclaDelHash("#servicios")).toBe("servicios")
    expect(anclaDelHash("servicios")).toBe("servicios")
  })

  it("sin ancla, null", () => {
    expect(anclaDelHash("")).toBeNull()
    expect(anclaDelHash("#")).toBeNull()
  })

  it("decodifica lo codificado, y un % suelto no rompe", () => {
    expect(anclaDelHash("#hora%2Dvalle")).toBe("hora-valle")
    expect(anclaDelHash("#100%")).toBe("100%")
  })
})

describe("grupoDeAncla", () => {
  const grupos = agruparSecciones(DUEÑA_DE_UNA_CLINICA, DE_LA_CLINICA)

  it.each([
    ["#horario", "horario-y-equipo"],
    ["#pagina", "tu-negocio"],
    ["#productos", "tu-negocio"],
    ["#servicios", "catalogo-y-clinica"],
    ["#sillones", "catalogo-y-clinica"],
    ["#laboratorios", "catalogo-y-clinica"],
    ["#plazo-de-cambios", "reservas-y-clientes"],
    ["#por-confirmar", "reservas-y-clientes"],
    ["#mensajes", "mensajes"],
  ])("%s abre %s", (hash, esperado) => {
    expect(grupoDeAncla(hash, grupos)).toBe(esperado)
  })

  it("#hora-valle y #fila-virtual abren su grupo en un salón, y nada en una clínica dental", () => {
    const delSalon = agruparSecciones(DUEÑA_DE_UN_SALON, DE_SIEMPRE)
    expect(grupoDeAncla("#hora-valle", delSalon)).toBe("reservas-y-clientes")
    expect(grupoDeAncla("#fila-virtual", delSalon)).toBe("reservas-y-clientes")
    expect(grupoDeAncla("#hora-valle", grupos)).toBeNull()
    expect(grupoDeAncla("#fila-virtual", grupos)).toBeNull()
  })

  it("un hash desconocido o vacío no abre nada", () => {
    expect(grupoDeAncla("#no-existe", grupos)).toBeNull()
    expect(grupoDeAncla("#", grupos)).toBeNull()
    expect(grupoDeAncla("", grupos)).toBeNull()
    // Es el id de un grupo, no de una sección.
    expect(grupoDeAncla("#tu-negocio", grupos)).toBeNull()
  })

  it("el ancla de una sección que este rol o rubro no ve no abre nada", () => {
    const delSalon = agruparSecciones(DUEÑA_DE_UN_SALON, DE_SIEMPRE)
    expect(grupoDeAncla("#sillones", delSalon)).toBeNull()
    expect(grupoDeAncla("#laboratorios", delSalon)).toBeNull()
    expect(grupoDeAncla("#hora-valle", agruparSecciones(PROFESIONAL, DE_SIEMPRE))).toBeNull()
  })

  it("distingue mayúsculas, como el id del elemento", () => {
    expect(grupoDeAncla("#Servicios", grupos)).toBeNull()
  })
})

describe("gruposAbiertosAlEntrar", () => {
  it("abre sólo el primer grupo", () => {
    expect(gruposAbiertosAlEntrar(agruparSecciones(DUEÑA_DE_UNA_CLINICA, DE_LA_CLINICA))).toEqual(["horario-y-equipo"])
  })

  it("el primer grupo es el primero visible, no el primero de la lista de grupos", () => {
    const sinHorario = agruparSecciones((["servicios", "mensajes"] as const).map(seccion), DE_SIEMPRE)
    expect(gruposAbiertosAlEntrar(sinHorario)).toEqual(["catalogo-y-clinica"])
  })

  it("sin grupos no abre ninguno", () => {
    expect(gruposAbiertosAlEntrar([])).toEqual([])
  })
})
