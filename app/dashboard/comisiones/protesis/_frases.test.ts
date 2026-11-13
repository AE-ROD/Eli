import { describe, it, expect } from "vitest"
import type { CambioDeReparto } from "@/lib/cambios-de-reparto-servidor"
import { vocabularioDe, type PalabrasDelRubro } from "@/lib/vocabulario"
import { PARTES_DEL_HISTORIAL, SIN_NOMBRE, cuandoParaLeer, filaDelHistorial, frasesDelHistorialDelReparto } from "./_frases"

const CLINICA = vocabularioDe("odontologia").palabras
const NEUTRAS = vocabularioDe(null).palabras
const SANTIAGO = "America/Santiago"

/** Un rubro inventado con los géneros al revés: quien atiende es femenina. */
const AL_REVES: PalabrasDelRubro = {
  ...NEUTRAS,
  profesional: { singular: "estilista", plural: "estilistas", genero: "f" },
}

function cambio(datos: Partial<CambioDeReparto> = {}): CambioDeReparto {
  return {
    id: "c-1",
    cuando: "2026-11-09T17:05:00.000Z",
    alcance: "material",
    material: "Acrílico termocurado",
    profesional: null,
    quien: "Valentina Soto",
    antes: { pbOdontologo: 4000, pbClinica: 3000, pbTecnico: 3000 },
    despues: { pbOdontologo: 3500, pbClinica: 2500, pbTecnico: 4000 },
    ...datos,
  }
}

describe("frasesDelHistorialDelReparto: las palabras del rubro, sin artículos pegados a mano", () => {
  it("en una clínica dental habla de «odontólogo»", () => {
    const f = frasesDelHistorialDelReparto(CLINICA)

    expect(f.titulo).toBe("Historial de cambios")
    expect(f.etiquetaDeLaExcepcion).toBe("Excepción por odontólogo")
    expect(f.etiquetaDelMaterial).toBe("Material")
    expect(f.sinCambios).toBe(
      "Todavía no hay cambios. Aparecen aquí cuando se crea o se cambia la regla de un material o la excepción del odontólogo."
    )
    expect(f.verMas).toBe("Ver más cambios")
    expect(f.tope(500)).toBe("Se muestran los últimos 500 cambios.")
  })

  it("sin rubro, las palabras neutras; con un rubro de otro género, el artículo lo sigue", () => {
    expect(frasesDelHistorialDelReparto(NEUTRAS).etiquetaDeLaExcepcion).toBe("Excepción por profesional")
    expect(frasesDelHistorialDelReparto(NEUTRAS).sinCambios).toContain("la excepción del profesional.")
    expect(frasesDelHistorialDelReparto(AL_REVES).etiquetaDeLaExcepcion).toBe("Excepción por estilista")
    expect(frasesDelHistorialDelReparto(AL_REVES).sinCambios).toContain("la excepción de la estilista.")
  })
})

describe("cuandoParaLeer: el instante en la zona del negocio", () => {
  it("fecha y hora en 24 h, en la zona (en noviembre Santiago está en UTC-3)", () => {
    expect(cuandoParaLeer("2026-11-09T17:05:00.000Z", SANTIAGO)).toBe("9 nov 2026, 14:05")
    expect(cuandoParaLeer("2026-11-09T17:05:00.000Z", "America/Bogota")).toBe("9 nov 2026, 12:05")
  })

  it("el día es el del negocio, no el de UTC: a las 23:30 del 9 en Santiago todavía es 9", () => {
    expect(cuandoParaLeer("2026-11-10T02:30:00.000Z", SANTIAGO)).toBe("9 nov 2026, 23:30")
    expect(cuandoParaLeer("2026-11-10T03:30:00.000Z", SANTIAGO)).toBe("10 nov 2026, 00:30")
  })
})

describe("filaDelHistorial: cada cambio, con el antes y el después en porcentaje", () => {
  it("el cambio de la regla de un material", () => {
    const fila = filaDelHistorial(cambio(), SANTIAGO, CLINICA)

    expect(fila).toEqual({
      id: "c-1",
      alcance: "material",
      etiqueta: "Material",
      titulo: "Acrílico termocurado",
      resumen: "Valentina Soto cambió la regla",
      cuando: "9 nov 2026, 14:05",
      antes: {
        partes: [
          { clave: "pbOdontologo", nombre: "Tratante", color: "bg-lila", texto: "40 %" },
          { clave: "pbClinica", nombre: "Clínica", color: "bg-azul", texto: "30 %" },
          { clave: "pbTecnico", nombre: "Laboratorio", color: "bg-naranja", texto: "30 %" },
        ],
      },
      despues: {
        partes: [
          { clave: "pbOdontologo", nombre: "Tratante", color: "bg-lila", texto: "35 %" },
          { clave: "pbClinica", nombre: "Clínica", color: "bg-azul", texto: "25 %" },
          { clave: "pbTecnico", nombre: "Laboratorio", color: "bg-naranja", texto: "40 %" },
        ],
      },
    })
  })

  it("las tres partes van en el mismo orden y con los mismos nombres que el reparto de arriba", () => {
    expect(PARTES_DEL_HISTORIAL.map((parte) => [parte.clave, parte.nombre])).toEqual([
      ["pbOdontologo", "Tratante"],
      ["pbClinica", "Clínica"],
      ["pbTecnico", "Laboratorio"],
    ])
  })

  it("los decimales se leen como en el reparto: 33,33 %, 66,67 %, 0 %", () => {
    const fila = filaDelHistorial(
      cambio({ antes: { pbOdontologo: 3333, pbClinica: 3333, pbTecnico: 3334 }, despues: { pbOdontologo: 0, pbClinica: 6667, pbTecnico: 3333 } }),
      SANTIAGO,
      CLINICA
    )

    expect(fila.antes.partes?.map((parte) => parte.texto)).toEqual(["33,33 %", "33,33 %", "33,34 %"])
    expect(fila.despues.partes?.map((parte) => parte.texto)).toEqual(["0 %", "66,67 %", "33,33 %"])
  })

  it("la excepción de un odontólogo: quién la tenía y en qué material, con la etiqueta del rubro", () => {
    const fila = filaDelHistorial(cambio({ alcance: "excepcion", profesional: "Diego Pérez", material: "Zirconio" }), SANTIAGO, CLINICA)

    expect(fila.alcance).toBe("excepcion")
    expect(fila.etiqueta).toBe("Excepción por odontólogo")
    expect(fila.titulo).toBe("Diego Pérez · Zirconio")
    expect(fila.resumen).toBe("Valentina Soto cambió la excepción")
  })

  it("lo que se creó no tiene «antes» («No existía») y lo que se quitó no tiene «después» («Se quitó»)", () => {
    const material = filaDelHistorial(cambio({ antes: null }), SANTIAGO, CLINICA)
    expect(material.resumen).toBe("Valentina Soto creó el material")
    expect(material.antes).toEqual({ vacio: "No existía" })
    expect(material.despues.partes).toHaveLength(3)

    const creada = filaDelHistorial(cambio({ alcance: "excepcion", profesional: "Diego Pérez", antes: null }), SANTIAGO, CLINICA)
    expect(creada.resumen).toBe("Valentina Soto creó la excepción")
    expect(creada.antes).toEqual({ vacio: "No existía" })

    const quitada = filaDelHistorial(cambio({ alcance: "excepcion", profesional: "Diego Pérez", despues: null }), SANTIAGO, CLINICA)
    expect(quitada.resumen).toBe("Valentina Soto quitó la excepción")
    expect(quitada.despues).toEqual({ vacio: "Se quitó" })
    expect(quitada.antes.partes).toHaveLength(3)
  })

  it("una parte que el registro no trae se escribe «—», no queda un hueco", () => {
    const fila = filaDelHistorial(cambio({ antes: { pbOdontologo: 4000, pbClinica: null, pbTecnico: 3000 } }), SANTIAGO, CLINICA)

    expect(fila.antes.partes?.map((parte) => parte.texto)).toEqual(["40 %", "—", "30 %"])
  })

  it("si un nombre quedó vacío (material, odontólogo, quien lo hizo), no hay un hueco: «Sin nombre» o «Alguien del equipo»", () => {
    const fila = filaDelHistorial(cambio({ alcance: "excepcion", material: "  ", profesional: null, quien: " " }), SANTIAGO, CLINICA)

    expect(fila.titulo).toBe(`${SIN_NOMBRE} · ${SIN_NOMBRE}`)
    expect(fila.resumen).toBe("Alguien del equipo cambió la excepción")
    expect(filaDelHistorial(cambio({ material: "" }), SANTIAGO, CLINICA).titulo).toBe(SIN_NOMBRE)
  })

  it("el nombre copiado de algo que ya no existe se muestra tal cual, aunque lleve caracteres raros (nada se interpreta)", () => {
    const fila = filaDelHistorial(cambio({ material: "<b>Resina</b> ñandú", quien: "Ana & Cía" }), SANTIAGO, CLINICA)

    expect(fila.titulo).toBe("<b>Resina</b> ñandú")
    expect(fila.resumen).toBe("Ana & Cía cambió la regla")
  })

  it("la fecha sale en la zona del negocio que se le pasa", () => {
    expect(filaDelHistorial(cambio(), "America/Bogota", CLINICA).cuando).toBe("9 nov 2026, 12:05")
  })
})
