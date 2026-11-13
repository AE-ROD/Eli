import { describe, it, expect } from "vitest"
import { vocabularioDe, type PalabrasDelRubro } from "@/lib/vocabulario"
import { frasesDeLasComisiones } from "./_frases"

const palabrasDe = (rubro: string | null): PalabrasDelRubro => vocabularioDe(rubro).palabras
const NEUTRAS = palabrasDe(null)

/** Las frases como texto plano, para compararlas: cada función se llama con un número y un booleano. */
function comoTexto(frases: unknown): string {
  return JSON.stringify(frases, (_clave, valor) => (typeof valor === "function" ? [valor(1), valor(3), valor(true)] : valor))
}

/** Un rubro inventado con los géneros al revés: el servicio es masculino y quien atiende, femenina. */
const AL_REVES: PalabrasDelRubro = {
  ...NEUTRAS,
  cliente: { singular: "clienta", plural: "clientas", genero: "f" },
  profesional: { singular: "estilista", plural: "estilistas", genero: "f" },
  servicio: { singular: "trabajo", plural: "trabajos", genero: "m" },
}

describe("sin rubro: exactamente los textos de siempre", () => {
  const f = frasesDeLasComisiones(NEUTRAS)

  it("la página y el aviso de pendientes", () => {
    expect(f.subtitulo).toBe("El porcentaje de cada profesional, por servicio y por producto.")
    expect(f.demasiadosPendientes).toBe(
      "Hay demasiados servicios pendientes para contarlos de una vez: los números de cada profesional se quedan cortos."
    )
  })

  it("la tarjeta de cada persona", () => {
    expect(f.tarjeta.esperanUnPorcentaje(1)).toBe("1 servicio ya cobrado espera un porcentaje.")
    expect(f.tarjeta.esperanUnPorcentaje(3)).toBe("3 servicios ya cobrados esperan un porcentaje.")
    expect(f.tarjeta.seAplicaATodos).toBe(
      "Se aplica a todos sus servicios, salvo las excepciones de abajo. Vacío lo deja sin configurar (no es 0 %)."
    )
    expect(f.tarjeta.excepcionesPor).toBe("Excepciones por servicio")
    expect(f.tarjeta.sinExcepciones).toBe("No tiene: en todos sus servicios rige su % por defecto.")
    expect(f.tarjeta.etiquetaDelServicio).toBe("Servicio")
    expect(f.tarjeta.eligeUno).toBe("Elige un servicio")
    expect(f.tarjeta.eligeElServicio).toBe("Elige el servicio.")
    expect(f.tarjeta.escribeElPorcentaje).toBe("Escribe el porcentaje para ese servicio.")
  })

  it("el historial", () => {
    expect(f.historial.profesional).toBe("Profesional")
    expect(f.historial.unServicio).toBe("un servicio")
    expect(f.historial.sinCambios(false)).toBe("Todavía no hay cambios de porcentaje.")
    expect(f.historial.sinCambios(true)).toBe("Todavía no hay cambios de porcentaje de este profesional.")
  })
})

describe("clínica dental", () => {
  const f = frasesDeLasComisiones(palabrasDe("odontologia"))

  it("la prestación es femenina: todo lo que la acompaña concuerda", () => {
    expect(f.subtitulo).toBe("El porcentaje de cada odontólogo, por prestación y por producto.")
    expect(f.demasiadosPendientes).toBe(
      "Hay demasiadas prestaciones pendientes para contarlas de una vez: los números de cada odontólogo se quedan cortos."
    )
    expect(f.tarjeta.esperanUnPorcentaje(1)).toBe("1 prestación ya cobrada espera un porcentaje.")
    expect(f.tarjeta.esperanUnPorcentaje(2)).toBe("2 prestaciones ya cobradas esperan un porcentaje.")
    expect(f.tarjeta.seAplicaATodos).toBe(
      "Se aplica a todas sus prestaciones, salvo las excepciones de abajo. Vacío lo deja sin configurar (no es 0 %)."
    )
    expect(f.tarjeta.excepcionesPor).toBe("Excepciones por prestación")
    expect(f.tarjeta.sinExcepciones).toBe("No tiene: en todas sus prestaciones rige su % por defecto.")
    expect(f.tarjeta.etiquetaDelServicio).toBe("Prestación")
    expect(f.tarjeta.eligeUno).toBe("Elige una prestación")
    expect(f.tarjeta.eligeElServicio).toBe("Elige la prestación.")
    expect(f.tarjeta.escribeElPorcentaje).toBe("Escribe el porcentaje para esa prestación.")
    expect(f.historial.unServicio).toBe("una prestación")
  })

  it("el historial y el reparto de prótesis hablan de odontólogos y pacientes", () => {
    expect(f.historial.profesional).toBe("Odontólogo")
    expect(f.historial.sinCambios(true)).toBe("Todavía no hay cambios de porcentaje de este odontólogo.")
    expect(f.protesis.valorQuePaga).toBe("El valor que paga el paciente")
    expect(f.protesis.excepcionesPor).toBe("Excepciones por odontólogo")
    expect(f.protesis.sinProfesionales).toBe(
      "Cuando tengas odontólogos en el equipo, aquí les puedes dar un reparto propio por material."
    )
    expect(f.protesis.todosSiguenLaRegla).toBe("Todos siguen la regla de cada material.")
    expect(f.protesis.mandaSobreLaRegla).toBe("Manda sobre la regla del material para ese odontólogo, en sus prótesis nuevas.")
    expect(f.protesis.etiquetaDelProfesional).toBe("Odontólogo")
    expect(f.protesis.agregaLosMateriales).toBe("Agrega los materiales con que trabaja la clínica para poder crear prótesis.")
    expect(f.protesis.comoSeCalcula).toBe(
      "Las prótesis se reparten en tres partes: la tratante, la clínica y el laboratorio. El resto de las prestaciones sigue con el % de comisión de cada odontólogo. Cada prótesis guarda su regla al crearse: lo que cambies aquí aplica a las prótesis nuevas; las creadas antes mantienen su regla."
    )
    expect(f.protesis.tarjeta).toBe(
      "Las prótesis se reparten en tres partes (la tratante, la clínica y el laboratorio) según el material. El resto de las prestaciones sigue con el % de comisión de cada odontólogo, aquí abajo."
    )
  })

  it("'Comisión' no se renombra: sigue diciendo 'comisión' y 'Comisiones'", () => {
    expect(f.protesis.tarjeta).toContain("% de comisión")
  })
})

describe("salón, barbería y salón de uñas", () => {
  it("quien atiende, con su palabra y su género", () => {
    expect(frasesDeLasComisiones(palabrasDe("salon")).subtitulo).toBe("El porcentaje de cada estilista, por servicio y por producto.")
    expect(frasesDeLasComisiones(palabrasDe("salon")).historial.sinCambios(true)).toBe(
      "Todavía no hay cambios de porcentaje de esta estilista."
    )
    expect(frasesDeLasComisiones(palabrasDe("spa-de-unas")).historial.sinCambios(true)).toBe(
      "Todavía no hay cambios de porcentaje de esta manicurista."
    )
    expect(frasesDeLasComisiones(palabrasDe("barberia")).historial.sinCambios(true)).toBe(
      "Todavía no hay cambios de porcentaje de este barbero."
    )
  })

  it("el servicio sigue siendo servicio", () => {
    for (const rubro of ["salon", "barberia", "spa-de-unas"]) {
      expect(frasesDeLasComisiones(palabrasDe(rubro)).tarjeta.esperanUnPorcentaje(2)).toBe("2 servicios ya cobrados esperan un porcentaje.")
    }
  })
})

describe("un rubro desconocido o sin rubro dice lo mismo que las palabras neutras", () => {
  it.each([null, "", "salud", "fitness", "otro", "no-existe", "constructor", "__proto__"])("rubro %j", (rubro) => {
    expect(comoTexto(frasesDeLasComisiones(palabrasDe(rubro)))).toBe(comoTexto(frasesDeLasComisiones(NEUTRAS)))
  })
})

describe("la concordancia sigue al género y no a una terminación pegada", () => {
  const f = frasesDeLasComisiones(AL_REVES)

  it("el servicio masculino y quien atiende femenina", () => {
    expect(f.demasiadosPendientes).toBe(
      "Hay demasiados trabajos pendientes para contarlos de una vez: los números de cada estilista se quedan cortos."
    )
    expect(f.tarjeta.esperanUnPorcentaje(1)).toBe("1 trabajo ya cobrado espera un porcentaje.")
    expect(f.tarjeta.esperanUnPorcentaje(2)).toBe("2 trabajos ya cobrados esperan un porcentaje.")
    expect(f.tarjeta.eligeUno).toBe("Elige un trabajo")
    expect(f.tarjeta.escribeElPorcentaje).toBe("Escribe el porcentaje para ese trabajo.")
    expect(f.historial.sinCambios(true)).toBe("Todavía no hay cambios de porcentaje de esta estilista.")
    expect(f.protesis.todosSiguenLaRegla).toBe("Todas siguen la regla de cada material.")
    expect(f.protesis.mandaSobreLaRegla).toBe("Manda sobre la regla del material para esa estilista, en sus prótesis nuevas.")
    expect(f.protesis.valorQuePaga).toBe("El valor que paga la clienta")
  })
})
