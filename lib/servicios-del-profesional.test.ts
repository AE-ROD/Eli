import { describe, expect, it } from "vitest"
import {
  haceAlgunServicio,
  servicioIdsPublicos,
  TEXTO_HACE_TODOS,
  TEXTO_SIN_SERVICIOS,
  textoDeLoQueHace,
} from "./servicios-del-profesional"

const catalogo = [
  { id: "corte", name: "Corte" },
  { id: "barba", name: "Barba" },
  { id: "tinte", name: "Tinte" },
  { id: "alisado", name: "Alisado" },
  { id: "peinado", name: "Peinado" },
]
const activos = catalogo.map((servicio) => servicio.id)

describe("servicioIdsPublicos", () => {
  it("sin filas hace todos: null", () => {
    expect(servicioIdsPublicos([], activos)).toBeNull()
  })

  it("con filas, sus servicios en el orden del catálogo", () => {
    expect(servicioIdsPublicos(["barba", "corte"], activos)).toEqual(["corte", "barba"])
  })

  it("no publica un servicio inactivo ni uno de otro negocio: sólo sale lo activo de este", () => {
    expect(servicioIdsPublicos(["corte", "viejo-inactivo", "de-otro-negocio"], activos)).toEqual(["corte"])
  })

  it("con filas pero ninguna activa queda vacío: no hace ninguno, no hace todos", () => {
    expect(servicioIdsPublicos(["viejo-inactivo"], activos)).toEqual([])
  })

  it("una fila repetida no repite el servicio", () => {
    expect(servicioIdsPublicos(["corte", "corte"], activos)).toEqual(["corte"])
  })

  it("sin servicios activos y con filas queda vacío", () => {
    expect(servicioIdsPublicos(["corte"], [])).toEqual([])
  })
})

describe("haceAlgunServicio", () => {
  it("null hace todos, haya o no servicios que mirar", () => {
    expect(haceAlgunServicio(null, catalogo)).toBe(true)
    expect(haceAlgunServicio(null, [])).toBe(true)
  })

  it("con servicios acotados, depende de si alguno está entre los que se miran", () => {
    expect(haceAlgunServicio(["corte"], catalogo)).toBe(true)
    expect(haceAlgunServicio(["viejo-inactivo"], catalogo)).toBe(false)
    expect(haceAlgunServicio([], catalogo)).toBe(false)
  })
})

describe("textoDeLoQueHace", () => {
  it("null: hace todos los servicios", () => {
    expect(textoDeLoQueHace(null, catalogo)).toBe(TEXTO_HACE_TODOS)
  })

  it("pocos servicios: los nombra todos", () => {
    expect(textoDeLoQueHace(["corte"], catalogo)).toBe("Hace: Corte")
    expect(textoDeLoQueHace(["corte", "barba"], catalogo)).toBe("Hace: Corte, Barba")
    expect(textoDeLoQueHace(["corte", "barba", "tinte"], catalogo)).toBe("Hace: Corte, Barba, Tinte")
  })

  it("más del tope: los primeros del catálogo y cuántos más", () => {
    // Cinco de seis: tres nombres y "+2 más".
    const seis = [...catalogo, { id: "masaje", name: "Masaje" }]
    expect(textoDeLoQueHace(["corte", "barba", "tinte", "alisado", "peinado"], seis)).toBe("Hace: Corte, Barba, Tinte, +2 más")
  })

  it("si sobra uno solo, escribe su nombre en vez de '+1 más'", () => {
    const seis = [...catalogo, { id: "masaje", name: "Masaje" }]
    expect(textoDeLoQueHace(["corte", "barba", "tinte", "alisado"], seis)).toBe("Hace: Corte, Barba, Tinte, Alisado")
  })

  it("respeta el tope que se le pasa", () => {
    expect(textoDeLoQueHace(["corte", "barba", "tinte"], catalogo, 1)).toBe("Hace: Corte, +2 más")
  })

  it("ordena por catálogo, no por el orden en que vengan los ids", () => {
    expect(textoDeLoQueHace(["barba", "corte"], catalogo)).toBe("Hace: Corte, Barba")
  })

  it("quien tiene marcados todos uno por uno también hace todos", () => {
    expect(textoDeLoQueHace(activos, catalogo)).toBe(TEXTO_HACE_TODOS)
  })

  it("sin ninguno de los servicios que hay: sin servicios para reservar", () => {
    expect(textoDeLoQueHace([], catalogo)).toBe(TEXTO_SIN_SERVICIOS)
    expect(textoDeLoQueHace(["viejo-inactivo"], catalogo)).toBe(TEXTO_SIN_SERVICIOS)
  })
})
