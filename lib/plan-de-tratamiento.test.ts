import { describe, it, expect } from "vitest"
import {
  ESTADOS_DE_ETAPA,
  ESTADOS_DE_PRESTACION,
  esEstadoDeEtapa,
  esEstadoDePrestacion,
  nombreDeEstadoDeEtapa,
  nombreDeEstadoDePrestacion,
  propuestaDesdeOdontograma,
  servicioSugerido,
  subtotalDeEtapa,
  totalesDelPlan,
  type ServicioDelCatalogo,
} from "./plan-de-tratamiento"
import { serviciosDeEjemplo } from "./servicios-de-ejemplo"
import type { MarcaDelOdontograma } from "./odontograma"

describe("estados", () => {
  it("los de la etapa y la prestación son los de los CHECKs de la base", () => {
    expect(ESTADOS_DE_ETAPA.map((e) => e.id)).toEqual(["por-aprobar", "aprobada"])
    expect(ESTADOS_DE_PRESTACION.map((e) => e.id)).toEqual(["por-agendar", "agendada", "realizada"])
  })

  it("se reconocen y se nombran; lo desconocido no rompe", () => {
    expect(esEstadoDeEtapa("aprobada")).toBe(true)
    expect(esEstadoDeEtapa("rechazada")).toBe(false)
    expect(esEstadoDePrestacion("agendada")).toBe(true)
    expect(esEstadoDePrestacion(null)).toBe(false)
    expect(nombreDeEstadoDeEtapa("por-aprobar")).toBe("Por aprobar")
    expect(nombreDeEstadoDePrestacion("realizada")).toBe("Realizada")
    expect(nombreDeEstadoDePrestacion("constructor")).toBe("Estado desconocido")
    expect(nombreDeEstadoDeEtapa("__proto__")).toBe("Estado desconocido")
  })
})

describe("totales", () => {
  /** El plan del diseño (Camila Rojas), en centavos. */
  const ETAPAS = [
    {
      estado: "aprobada",
      prestaciones: [
        { estado: "realizada", valorCents: 3_500_000 },
        { estado: "agendada", valorCents: 4_800_000 },
      ],
    },
    {
      estado: "aprobada",
      prestaciones: [
        { estado: "por-agendar", valorCents: 4_200_000 },
        { estado: "agendada", valorCents: 4_500_000 },
      ],
    },
    { estado: "aprobada", prestaciones: [{ estado: "por-agendar", valorCents: 9_500_000 }] },
    { estado: "por-aprobar", prestaciones: [{ estado: "por-agendar", valorCents: 89_000_000 }] },
  ]

  it("total del plan, aprobado y realizado", () => {
    expect(totalesDelPlan(ETAPAS)).toEqual({ totalCents: 115_500_000, aprobadoCents: 26_500_000, realizadoCents: 3_500_000 })
  })

  it("subtotal por etapa", () => {
    expect(ETAPAS.map(subtotalDeEtapa)).toEqual([8_300_000, 8_700_000, 9_500_000, 89_000_000])
  })

  it("en centavos enteros: no arrastra el error de sumar decimales", () => {
    const etapa = { estado: "aprobada", prestaciones: [{ estado: "realizada", valorCents: 10 }, { estado: "realizada", valorCents: 20 }] }
    expect(totalesDelPlan([etapa])).toEqual({ totalCents: 30, aprobadoCents: 30, realizadoCents: 30 })
  })

  it("un plan vacío suma cero", () => {
    expect(totalesDelPlan([])).toEqual({ totalCents: 0, aprobadoCents: 0, realizadoCents: 0 })
    expect(totalesDelPlan([{ estado: "aprobada", prestaciones: [] }])).toEqual({ totalCents: 0, aprobadoCents: 0, realizadoCents: 0 })
  })

  it("una etapa con un estado desconocido no cuenta como aprobada (falla cerrado), pero sí en el total", () => {
    const etapa = { estado: "Aprobada", prestaciones: [{ estado: "por-agendar", valorCents: 100 }] }
    expect(totalesDelPlan([etapa])).toEqual({ totalCents: 100, aprobadoCents: 0, realizadoCents: 0 })
  })
})

describe("propuesta desde el odontograma", () => {
  const CATALOGO: ServicioDelCatalogo[] = serviciosDeEjemplo("odontologia").map((servicio, i) => ({
    id: `s-${i}`,
    name: servicio.name,
    price: servicio.price,
  }))

  /** El odontograma del diseño de la ficha (Camila Rojas). */
  const MARCAS: MarcaDelOdontograma[] = [
    { pieza: 18, cara: null, tipo: "extraccion" },
    { pieza: 16, cara: "M", tipo: "caries" },
    { pieza: 16, cara: "O", tipo: "caries" },
    { pieza: 14, cara: "D", tipo: "obturacion" },
    { pieza: 11, cara: "M", tipo: "caries" },
    { pieza: 21, cara: null, tipo: "corona" },
    { pieza: 24, cara: "O", tipo: "sellante" },
    { pieza: 27, cara: "O", tipo: "caries" },
    { pieza: 36, cara: null, tipo: "endodoncia" },
    { pieza: 46, cara: null, tipo: "ausente" },
  ]

  it("caries → una restauración por pieza con sus caras; extracción → exodoncia; con el servicio del catálogo", () => {
    expect(propuestaDesdeOdontograma(MARCAS, CATALOGO)).toEqual([
      { motivo: "caries", pieza: 11, caras: ["M"], nombre: "Restauración con resina", serviceId: "s-2", valorCents: 4_500_000 },
      { motivo: "caries", pieza: 16, caras: ["O", "M"], nombre: "Restauración con resina", serviceId: "s-2", valorCents: 4_500_000 },
      { motivo: "extraccion", pieza: 18, caras: [], nombre: "Exodoncia simple", serviceId: "s-3", valorCents: 4_000_000 },
      { motivo: "caries", pieza: 27, caras: ["O"], nombre: "Restauración con resina", serviceId: "s-2", valorCents: 4_500_000 },
    ])
  })

  it("sin servicio que coincida: nombre genérico, sin servicio y valor 0", () => {
    const sinCoincidencia = [{ id: "x", name: "Limpieza", price: 30000 }]
    expect(propuestaDesdeOdontograma(MARCAS, sinCoincidencia).map((p) => [p.pieza, p.nombre, p.serviceId, p.valorCents])).toEqual([
      [11, "Restauración", null, 0],
      [16, "Restauración", null, 0],
      [18, "Exodoncia", null, 0],
      [27, "Restauración", null, 0],
    ])
  })

  it("no restaura una pieza con extracción indicada ni una ausente", () => {
    const marcas: MarcaDelOdontograma[] = [
      { pieza: 38, cara: "O", tipo: "caries" },
      { pieza: 38, cara: null, tipo: "extraccion" },
      { pieza: 47, cara: "O", tipo: "caries" },
      { pieza: 47, cara: null, tipo: "ausente" },
    ]
    expect(propuestaDesdeOdontograma(marcas, CATALOGO).map((p) => [p.pieza, p.motivo])).toEqual([[38, "extraccion"]])
  })

  it("ignora las marcas inválidas y un odontograma sin caries ni extracciones no propone nada", () => {
    expect(propuestaDesdeOdontograma([{ pieza: 36, cara: "P", tipo: "caries" }, { pieza: 19, cara: null, tipo: "extraccion" }], CATALOGO)).toEqual([])
    expect(propuestaDesdeOdontograma([{ pieza: 26, cara: "O", tipo: "obturacion" }], CATALOGO)).toEqual([])
    expect(propuestaDesdeOdontograma([], CATALOGO)).toEqual([])
  })

  it("las temporales también", () => {
    expect(propuestaDesdeOdontograma([{ pieza: 55, cara: "O", tipo: "caries" }], CATALOGO)[0]).toMatchObject({ pieza: 55, caras: ["O"] })
  })

  describe("servicioSugerido", () => {
    it("coincide sin importar tildes ni mayúsculas, y sólo entre los activos", () => {
      const servicios: ServicioDelCatalogo[] = [
        { id: "inactivo", name: "Obturación antigua", price: 1000, active: false },
        { id: "sin-tilde", name: "OBTURACION compuesta", price: 2000 },
        { id: "extraccion", name: "Extracción de tercer molar", price: 9000 },
      ]
      expect(servicioSugerido(servicios, "caries")?.id).toBe("sin-tilde")
      expect(servicioSugerido(servicios, "extraccion")?.id).toBe("extraccion")
      expect(servicioSugerido([], "caries")).toBeNull()
    })

    it("un servicio sin precio se sugiere con valor 0", () => {
      const [propuesta] = propuestaDesdeOdontograma([{ pieza: 16, cara: "O", tipo: "caries" }], [{ id: "r", name: "Resina", price: null }])
      expect(propuesta).toMatchObject({ serviceId: "r", nombre: "Resina", valorCents: 0 })
    })

    it("el precio pasa a centavos exactos", () => {
      const [propuesta] = propuestaDesdeOdontograma([{ pieza: 16, cara: "O", tipo: "caries" }], [{ id: "r", name: "Resina", price: 45000.1 }])
      expect(propuesta.valorCents).toBe(4_500_010)
    })
  })
})
