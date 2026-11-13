import { describe, expect, it } from "vitest"
import { vocabularioDe } from "./vocabulario"
import { conAdjetivoAntes, hastaElMomentoDe, hastaLaHoraDe, palabrasDeLaReserva, seLlamaHora } from "./palabras-de-la-reserva"

/*
 * Las palabras de la reserva pública se escriben aparte a propósito: si
 * alguien cambia el vocabulario o los textos de siempre, esta prueba avisa.
 * Los rubros con palabras propias leen la reserva como "hora" (también la
 * clínica, aunque el panel diga "cita"); uno desconocido, como siempre.
 */

const RUBROS_CON_PALABRAS = ["salon", "barberia", "spa-de-unas", "odontologia"] as const
const RUBROS_SIN_PALABRAS = [undefined, null, "", "salud", "fitness", "otro", "peluqueria-canina", "constructor", "__proto__"] as const

describe("palabrasDeLaReserva", () => {
  it.each(RUBROS_SIN_PALABRAS)("%j: las palabras de siempre ('cita', 'hora', 'persona', 'local')", (rubro) => {
    const palabras = palabrasDeLaReserva(rubro)
    expect(palabras.conPalabrasPropias).toBe(false)
    expect(palabras.clinicaDental).toBe(false)
    expect(palabras.cita.singular).toBe("cita")
    expect(palabras.hora.singular).toBe("hora")
    expect(palabras.servicioDeLaReserva.singular).toBe("servicio")
    expect(palabras.servicio.singular).toBe("servicio")
    expect(palabras.profesional.singular).toBe("profesional")
    expect(palabras.quienAtiende.singular).toBe("persona")
    expect(palabras.negocio.singular).toBe("negocio")
    expect(palabras.local.singular).toBe("local")
  })

  it.each(RUBROS_CON_PALABRAS)("%s: la reserva es 'hora', y el negocio, el suyo", (rubro) => {
    const palabras = palabrasDeLaReserva(rubro)
    const delVocabulario = vocabularioDe(rubro).palabras
    expect(palabras.conPalabrasPropias).toBe(true)
    expect(palabras.cita).toEqual({ singular: "hora", plural: "horas", genero: "f" })
    expect(palabras.hora).toEqual(palabras.cita)
    expect(palabras.profesional).toEqual(delVocabulario.profesional)
    expect(palabras.quienAtiende).toEqual(delVocabulario.profesional)
    expect(palabras.negocio).toEqual(delVocabulario.negocio)
    expect(palabras.local).toEqual(delVocabulario.negocio)
    expect(palabras.servicioDeLaReserva).toEqual(delVocabulario.servicioDeLaReserva)
    expect(palabras.servicio).toEqual(delVocabulario.servicio)
  })

  it("lo que se elige ('motivo') y lo que se ofrece ('prestación') son dos palabras en la clínica", () => {
    const palabras = palabrasDeLaReserva("odontologia")
    expect(palabras.clinicaDental).toBe(true)
    expect(palabras.servicioDeLaReserva.singular).toBe("motivo")
    expect(palabras.servicio.singular).toBe("prestación")
    expect(palabras.primeraVez.singular).toBe("primera consulta")
  })

  it("sólo la clínica es dental", () => {
    for (const rubro of ["salon", "barberia", "spa-de-unas"]) expect(palabrasDeLaReserva(rubro).clinicaDental).toBe(false)
  })

  it("devuelve palabras nuevas en cada llamada: cambiarlas no cambia las de los demás", () => {
    const primera = palabrasDeLaReserva("salon")
    primera.cita.singular = "otra cosa"
    expect(palabrasDeLaReserva("salon").cita.singular).toBe("hora")
  })
})

describe("'hora' choca con el reloj", () => {
  it("se llama 'hora' la reserva del salón, no la cita", () => {
    expect(seLlamaHora(palabrasDeLaReserva("salon").cita)).toBe(true)
    expect(seLlamaHora(palabrasDeLaReserva(null).cita)).toBe(false)
  })

  it("hasta cuándo se puede cambiar: 'la hora de la cita', y nunca 'la hora de la hora'", () => {
    expect(hastaLaHoraDe(palabrasDeLaReserva(null).cita)).toBe("hasta la hora de la cita")
    for (const rubro of RUBROS_CON_PALABRAS) expect(hastaLaHoraDe(palabrasDeLaReserva(rubro).cita)).toBe("hasta que llegue la hora")
  })

  it("lo mismo con 'el momento': 'el momento de la cita' o 'que llegue la hora'", () => {
    expect(hastaElMomentoDe(palabrasDeLaReserva(null).cita)).toBe("hasta el momento de la cita")
    for (const rubro of RUBROS_CON_PALABRAS) expect(hastaElMomentoDe(palabrasDeLaReserva(rubro).cita)).toBe("hasta que llegue la hora")
  })
})

describe("conAdjetivoAntes", () => {
  it("concuerda el adjetivo con la palabra, en singular y en plural", () => {
    expect(conAdjetivoAntes("solo", { singular: "hora", plural: "horas", genero: "f" })).toEqual({
      singular: "sola hora",
      plural: "solas horas",
      genero: "f",
    })
    expect(conAdjetivoAntes("solo", { singular: "motivo", plural: "motivos", genero: "m" }).singular).toBe("solo motivo")
  })
})
