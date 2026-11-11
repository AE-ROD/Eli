import { describe, it, expect } from "vitest"
import { conMayuscula, vocabularioDe } from "./vocabulario"

describe("vocabularioDe", () => {
  it("la clínica dental dice pacientes, sala de espera, odontólogo y motivo", () => {
    expect(vocabularioDe("odontologia")).toEqual({
      clientes: "pacientes",
      cliente: "paciente",
      tablero: "sala de espera",
      profesional: "odontólogo",
      profesionales: "odontólogos",
      servicioDeLaReserva: "motivo",
    })
  })

  it.each(["salon", "barberia", "spa-de-unas"])("el rubro %s habla como siempre", (rubro) => {
    expect(vocabularioDe(rubro)).toEqual({
      clientes: "clientes",
      cliente: "cliente",
      tablero: "tablero",
      profesional: "profesional",
      profesionales: "profesionales",
      servicioDeLaReserva: "servicio",
    })
  })

  it.each([
    ["un rubro viejo", "salud"],
    ["uno desconocido", "peluqueria-canina"],
    ["casi el dental", "Odontologia"],
    ["vacío", ""],
    ["null (sesión de antes del rubro)", null],
    ["undefined", undefined],
    ["una propiedad del prototipo", "constructor"],
    ["otra", "__proto__"],
  ])("%s usa las palabras de siempre", (_caso, rubro) => {
    expect(vocabularioDe(rubro)).toEqual(vocabularioDe("salon"))
    expect(vocabularioDe(rubro).cliente).toBe("cliente")
  })

  it("devuelve una copia: cambiarla no cambia la próxima", () => {
    const primera = vocabularioDe("odontologia")
    primera.cliente = "otra cosa"
    expect(vocabularioDe("odontologia").cliente).toBe("paciente")
  })
})

describe("conMayuscula", () => {
  it.each([
    ["sala de espera", "Sala de espera"],
    ["odontólogo", "Odontólogo"],
    ["clientes", "Clientes"],
    ["", ""],
  ])("%j → %j", (texto, esperado) => {
    expect(conMayuscula(texto)).toBe(esperado)
  })
})
