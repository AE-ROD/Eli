import { describe, it, expect } from "vitest"
import {
  LECTURA_INICIAL,
  UMBRAL_DE_SCROLL,
  leerScroll,
  type LecturaDeScroll,
} from "./direccion-de-scroll"

/** Pasa la página por varias posiciones seguidas, como cuadros de un scroll. */
function recorrer(desde: LecturaDeScroll, posiciones: number[]): LecturaDeScroll {
  return posiciones.reduce(leerScroll, desde)
}

describe("UMBRAL_DE_SCROLL", () => {
  it("es de 10px", () => {
    expect(UMBRAL_DE_SCROLL).toBe(10)
  })
})

describe("leerScroll", () => {
  describe("arriba de todo", () => {
    it("la primera lectura con la página arriba es `arriba`", () => {
      expect(leerScroll(LECTURA_INICIAL, 0).estado).toBe("arriba")
    })

    it("hasta 10px inclusive sigue siendo `arriba`", () => {
      expect(leerScroll(LECTURA_INICIAL, 10).estado).toBe("arriba")
    })

    it("volver arriba desde lejos es `arriba`, venga de oculto o de flotante", () => {
      expect(leerScroll({ estado: "oculto", y: 800 }, 4).estado).toBe("arriba")
      expect(leerScroll({ estado: "flotante", y: 800 }, 0).estado).toBe("arriba")
    })

    it("llegar arriba no pide umbral: de 15 a 8 ya es `arriba`", () => {
      expect(leerScroll({ estado: "flotante", y: 15 }, 8).estado).toBe("arriba")
    })

    it("el rebote de iOS, con posición negativa, también es `arriba`", () => {
      expect(leerScroll({ estado: "flotante", y: 30 }, -40).estado).toBe("arriba")
    })
  })

  describe("bajar oculta el encabezado", () => {
    it("desde arriba, bajar más allá del umbral es `oculto`", () => {
      expect(leerScroll(LECTURA_INICIAL, 120)).toEqual({ estado: "oculto", y: 120 })
    })

    it("con la tarjeta flotante, volver a bajar la oculta", () => {
      expect(leerScroll({ estado: "flotante", y: 600 }, 640).estado).toBe("oculto")
    })

    it("una página que carga ya bajada empieza oculta", () => {
      expect(leerScroll(LECTURA_INICIAL, 2400).estado).toBe("oculto")
    })
  })

  describe("subir muestra la tarjeta flotante", () => {
    it("estando oculto, subir más allá del umbral es `flotante`", () => {
      expect(leerScroll({ estado: "oculto", y: 900 }, 860)).toEqual({ estado: "flotante", y: 860 })
    })

    it("sigue flotante mientras se sube, y se oculta en cuanto se vuelve a bajar", () => {
      const subiendo = recorrer({ estado: "oculto", y: 900 }, [880, 840, 790])
      expect(subiendo).toEqual({ estado: "flotante", y: 790 })
      expect(leerScroll(subiendo, 805).estado).toBe("oculto")
    })
  })

  describe("el umbral de 10px", () => {
    it("un movimiento de 9px no cambia nada: devuelve la lectura anterior tal cual", () => {
      const oculto: LecturaDeScroll = { estado: "oculto", y: 500 }
      expect(leerScroll(oculto, 491)).toBe(oculto)
      const flotante: LecturaDeScroll = { estado: "flotante", y: 500 }
      expect(leerScroll(flotante, 509)).toBe(flotante)
    })

    it("un movimiento de exactamente 10px ya cuenta", () => {
      expect(leerScroll({ estado: "oculto", y: 500 }, 490).estado).toBe("flotante")
      expect(leerScroll({ estado: "flotante", y: 500 }, 510).estado).toBe("oculto")
    })

    it("un scroll lento se acumula: tres pasos de 4px desde el mismo punto ya son 12", () => {
      const flotante: LecturaDeScroll = { estado: "flotante", y: 500 }
      const casi = recorrer(flotante, [504, 508])
      expect(casi).toBe(flotante)
      expect(leerScroll(casi, 512)).toEqual({ estado: "oculto", y: 512 })
    })

    it("salir de arriba también pide 10px de recorrido", () => {
      const arriba = leerScroll(LECTURA_INICIAL, 8)
      expect(leerScroll(arriba, 15)).toBe(arriba)
      expect(leerScroll(arriba, 18).estado).toBe("oculto")
    })

    it("un temblor alrededor del mismo punto no hace parpadear el encabezado", () => {
      const flotante: LecturaDeScroll = { estado: "flotante", y: 700 }
      expect(recorrer(flotante, [703, 698, 705, 701, 696])).toBe(flotante)
    })
  })
})
