import { describe, it, expect } from "vitest"
import { HORAS_DEL_DIA, juntarHora, minutosDeLaLista, partesDeHora } from "@/lib/campo-hora"

describe("el campo de hora en 24 h (#161)", () => {
  it("las horas van de 00 a 23, sin a. m. ni p. m.", () => {
    expect(HORAS_DEL_DIA).toHaveLength(24)
    expect(HORAS_DEL_DIA[0]).toBe("00")
    expect(HORAS_DEL_DIA[23]).toBe("23")
  })

  it("separa un HH:MM válido; otra cosa queda vacía", () => {
    expect(partesDeHora("09:30")).toEqual({ hora: "09", minuto: "30" })
    expect(partesDeHora("23:59")).toEqual({ hora: "23", minuto: "59" })
    for (const malo of ["", "9:30", "24:00", "12:60", "10:00:00", "a. m."]) {
      expect(partesDeHora(malo)).toEqual({ hora: "", minuto: "" })
    }
  })

  it("los minutos van de 5 en 5 y suman el actual si no cae en el paso", () => {
    expect(minutosDeLaLista("30")).toEqual(["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"])
    const conSiete = minutosDeLaLista("07")
    expect(conSiete).toHaveLength(13)
    expect(conSiete.slice(0, 3)).toEqual(["00", "05", "07"])
    expect(minutosDeLaLista("")).toHaveLength(12)
  })

  it("al juntar, una parte vacía es 00: nunca una hora a medias", () => {
    expect(juntarHora("14", "45")).toBe("14:45")
    expect(juntarHora("14", "")).toBe("14:00")
    expect(juntarHora("", "15")).toBe("00:15")
  })
})
