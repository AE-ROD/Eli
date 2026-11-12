import { describe, it, expect } from "vitest"
import { vocabularioDe, type PalabrasDelRubro } from "@/lib/vocabulario"
import { frasesDeMiPlata } from "./_frases"

const palabrasDe = (rubro: string | null): PalabrasDelRubro => vocabularioDe(rubro).palabras

describe("sin rubro: exactamente los textos de siempre", () => {
  const f = frasesDeMiPlata(palabrasDe(null))

  it("los servicios que esperan su porcentaje, en singular y en plural", () => {
    expect(f.esperanSuPorcentaje(1)).toBe("1 servicio espera su porcentaje de comisión: avísale a la dueña.")
    expect(f.esperanSuPorcentaje(2)).toBe("2 servicios esperan su porcentaje de comisión: avísale a la dueña.")
    expect(f.esperanSuPorcentaje(12)).toBe("12 servicios esperan su porcentaje de comisión: avísale a la dueña.")
  })
})

describe("clínica dental", () => {
  const f = frasesDeMiPlata(palabrasDe("odontologia"))

  it("las prestaciones esperan su porcentaje; 'comisión' no se renombra", () => {
    expect(f.esperanSuPorcentaje(1)).toBe("1 prestación espera su porcentaje de comisión: avísale a la dueña.")
    expect(f.esperanSuPorcentaje(3)).toBe("3 prestaciones esperan su porcentaje de comisión: avísale a la dueña.")
  })
})

describe("salón, barbería y salón de uñas", () => {
  it.each(["salon", "barberia", "spa-de-unas"])("%s sigue diciendo servicios", (rubro) => {
    expect(frasesDeMiPlata(palabrasDe(rubro)).esperanSuPorcentaje(2)).toBe(
      "2 servicios esperan su porcentaje de comisión: avísale a la dueña."
    )
  })
})

describe("un rubro desconocido o sin rubro dice lo mismo que las palabras neutras", () => {
  it.each([null, "", "salud", "fitness", "otro", "no-existe", "constructor", "__proto__"])("rubro %j", (rubro) => {
    const f = frasesDeMiPlata(palabrasDe(rubro))
    expect(f.esperanSuPorcentaje(1)).toBe("1 servicio espera su porcentaje de comisión: avísale a la dueña.")
    expect(f.esperanSuPorcentaje(4)).toBe("4 servicios esperan su porcentaje de comisión: avísale a la dueña.")
  })
})

describe("la concordancia sigue al género", () => {
  it("un servicio femenino o masculino no cambia el verbo, que sigue al número", () => {
    const f = frasesDeMiPlata({ ...palabrasDe(null), servicio: { singular: "cita", plural: "citas", genero: "f" } })
    expect(f.esperanSuPorcentaje(1)).toBe("1 cita espera su porcentaje de comisión: avísale a la dueña.")
    expect(f.esperanSuPorcentaje(2)).toBe("2 citas esperan su porcentaje de comisión: avísale a la dueña.")
  })
})
