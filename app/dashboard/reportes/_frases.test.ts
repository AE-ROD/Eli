import { describe, it, expect } from "vitest"
import { vocabularioDe, type PalabrasDelRubro } from "@/lib/vocabulario"
import { frasesDeLosReportes, noVinieron } from "./_frases"

const palabrasDe = (rubro: string | null): PalabrasDelRubro => vocabularioDe(rubro).palabras
const NEUTRAS = palabrasDe(null)

/** Las frases como texto plano, para compararlas: cada función se llama con un número y lo que devuelve queda en su lugar. */
function comoTexto(frases: unknown): string {
  return JSON.stringify(frases, (_clave, valor) => (typeof valor === "function" ? [valor(1), valor(3)] : valor))
}

/** Un rubro inventado con los géneros al revés: la cita es masculina, la clienta femenina y el servicio femenino. */
const AL_REVES: PalabrasDelRubro = {
  ...NEUTRAS,
  cliente: { singular: "clienta", plural: "clientas", genero: "f" },
  profesional: { singular: "estilista", plural: "estilistas", genero: "f" },
  servicio: { singular: "prestación", plural: "prestaciones", genero: "f" },
  cita: { singular: "turno", plural: "turnos", genero: "m" },
  negocio: { singular: "clínica", plural: "clínicas", genero: "f" },
}

describe("sin rubro: exactamente los textos de siempre", () => {
  const f = frasesDeLosReportes(NEUTRAS)

  it("los subtítulos y los filtros", () => {
    expect(f.subtitulo.llenarHoras).toBe("Ocupación del equipo, clientes nuevos y quién no vino")
    expect(f.subtitulo.deLoCobrado).toBe("Lo atendido y cobrado en el tablero")
    expect(f.filtros).toEqual({
      profesional: "Profesional",
      servicio: "Servicio",
      todosLosProfesionales: "Todos",
      todosLosServicios: "Todos",
      noSePudieronCargar: "No se pudieron cargar los profesionales y servicios para filtrar",
    })
    expect(f.elegido).toEqual({ profesional: "el profesional elegido", servicio: "el servicio elegido" })
  })

  it("el resumen", () => {
    expect(f.resumen.porProfesional).toBe("Por profesional")
    expect(f.resumen.porServicio).toBe("Por servicio")
    expect(f.resumen.loQueAtendisteDeCadaServicio).toBe("Lo que atendiste, por servicio")
    expect(f.resumen.sinDesglosePorMedio).toBe("No se puede repartir por medio de pago cuando filtras por profesional o servicio.")
    expect(f.resumen.sinDesglosePorProfesional).toBe("No se puede repartir por profesional cuando filtras por medio de pago.")
    expect(f.resumen.sinDesglosePorServicio).toBe("No se puede repartir por servicio cuando filtras por medio de pago.")
    expect(f.resumen.cuantos(1)).toBe("1 servicio")
    expect(f.resumen.cuantos(3)).toBe("3 servicios")
    expect(f.resumen.cuantos(0)).toBe("0 servicios")
  })

  it("los historiales", () => {
    expect(f.historial).toEqual({ cliente: "Cliente", servicios: "Servicios", sinServicios: "Sin servicios" })
  })

  it("Llenar horas", () => {
    expect(f.llenarHoras.demasiadas).toBe(
      "El período tiene demasiadas citas o atenciones para sumarlas de una vez: las cifras están incompletas. Acota el período."
    )
    expect(f.llenarHoras.zonaHoraria).toBe("en la zona horaria del negocio")
    expect(f.llenarHoras.clientesNuevos).toBe("Clientes nuevos")
    expect(f.llenarHoras.clientesQueVolvieron).toBe("Clientes que volvieron")
    expect(f.llenarHoras.noVinieron).toBe("No vinieron")
    expect(f.llenarHoras.ocupacionPor).toBe("Ocupación por profesional")
    expect(f.llenarHoras.queCuentaLaOcupacion).toBe(
      "Minutos con citas dentro de su horario, sin bloqueos. Si no cargó horario propio, cuenta el del negocio."
    )
    expect(f.llenarHoras.queCuentaLaInasistencia).toBe(
      "Citas marcadas como “no vino”, sobre las que ya empezaron y no se cancelaron."
    )
    expect(f.llenarHoras.sinFicha(1)).toBe(" 1 atención sin ficha del cliente no entra en nuevos ni recurrentes.")
    expect(f.llenarHoras.sinFicha(3)).toBe(" 3 atenciones sin ficha del cliente no entran en nuevos ni recurrentes.")
    expect(f.llenarHoras.sinCitasPasadas).toBe("No hubo citas pasadas en el período.")
  })
})

describe("clínica dental", () => {
  const f = frasesDeLosReportes(palabrasDe("odontologia"))

  it("pacientes, odontólogos, prestaciones y la sala de espera", () => {
    expect(f.subtitulo.llenarHoras).toBe("Ocupación del equipo, pacientes nuevos y quién no asistió")
    expect(f.subtitulo.deLoCobrado).toBe("Lo atendido y cobrado en la sala de espera")
    expect(f.elegido).toEqual({ profesional: "el odontólogo elegido", servicio: "la prestación elegida" })
    expect(f.resumen.porProfesional).toBe("Por odontólogo")
    expect(f.resumen.porServicio).toBe("Por prestación")
    expect(f.resumen.sinDesglosePorMedio).toBe("No se puede repartir por medio de pago cuando filtras por odontólogo o prestación.")
    expect(f.resumen.cuantos(1)).toBe("1 prestación")
    expect(f.resumen.cuantos(2)).toBe("2 prestaciones")
    expect(f.historial).toEqual({ cliente: "Paciente", servicios: "Prestaciones", sinServicios: "Sin prestaciones" })
  })

  it("las opciones que no filtran concuerdan: 'Todos' los odontólogos, 'Todas' las prestaciones", () => {
    expect(f.filtros).toEqual({
      profesional: "Odontólogo",
      servicio: "Prestación",
      todosLosProfesionales: "Todos",
      todosLosServicios: "Todas",
      noSePudieronCargar: "No se pudieron cargar los odontólogos y prestaciones para filtrar",
    })
  })

  it("Llenar horas: cita, no asistió y la clínica", () => {
    expect(f.llenarHoras.demasiadas).toBe(
      "El período tiene demasiadas citas o atenciones para sumarlas de una vez: las cifras están incompletas. Acota el período."
    )
    expect(f.llenarHoras.zonaHoraria).toBe("en la zona horaria de la clínica")
    expect(f.llenarHoras.clientesNuevos).toBe("Pacientes nuevos")
    expect(f.llenarHoras.clientesQueVolvieron).toBe("Pacientes que volvieron")
    expect(f.llenarHoras.noVinieron).toBe("No asistieron")
    expect(f.llenarHoras.ocupacionPor).toBe("Ocupación por odontólogo")
    expect(f.llenarHoras.queCuentaLaOcupacion).toBe(
      "Minutos con citas dentro de su horario, sin bloqueos. Si no cargó horario propio, cuenta el de la clínica."
    )
    expect(f.llenarHoras.queCuentaLaInasistencia).toBe(
      "Citas marcadas como “no asistió”, sobre las que ya empezaron y no se cancelaron."
    )
    expect(f.llenarHoras.sinFicha(2)).toBe(" 2 atenciones sin ficha del paciente no entran en nuevos ni recurrentes.")
    expect(f.llenarHoras.sinCitasPasadas).toBe("No hubo citas pasadas en el período.")
  })

  it("no queda un solo 'cliente' en ninguna frase", () => {
    expect(comoTexto(f).replace(/"[a-zA-Z]*[Cc]liente[a-zA-Z]*":/g, "")).not.toMatch(/cliente/i)
  })
})

describe("salón, barbería y salón de uñas: 'hora' no se confunde con el reloj", () => {
  it.each(["salon", "barberia", "spa-de-unas"])("%s dice 'horas agendadas'", (rubro) => {
    const f = frasesDeLosReportes(palabrasDe(rubro))
    expect(f.llenarHoras.demasiadas).toBe(
      "El período tiene demasiadas horas agendadas o atenciones para sumarlas de una vez: las cifras están incompletas. Acota el período."
    )
    expect(f.llenarHoras.queCuentaLaOcupacion).toContain("Minutos con horas agendadas dentro de su horario")
    expect(f.llenarHoras.sinCitasPasadas).toBe("En el período no hubo horas agendadas que ya pasaran.")
    // "No vino" se queda: es el estado de la hora que no llegó.
    expect(f.llenarHoras.noVinieron).toBe("No vinieron")
    expect(f.llenarHoras.queCuentaLaInasistencia).toBe(
      "Horas marcadas como “no vino”, sobre las que ya empezaron y no se cancelaron."
    )
  })

  it("quien atiende va con su género: 'Todas' las estilistas y las manicuristas, 'Todos' los barberos", () => {
    expect(frasesDeLosReportes(palabrasDe("salon")).filtros.todosLosProfesionales).toBe("Todas")
    expect(frasesDeLosReportes(palabrasDe("spa-de-unas")).filtros.todosLosProfesionales).toBe("Todas")
    expect(frasesDeLosReportes(palabrasDe("barberia")).filtros.todosLosProfesionales).toBe("Todos")
    expect(frasesDeLosReportes(palabrasDe("salon")).filtros.todosLosServicios).toBe("Todos")
    expect(frasesDeLosReportes(palabrasDe("salon")).elegido.profesional).toBe("la estilista elegida")
    expect(frasesDeLosReportes(palabrasDe("barberia")).elegido.profesional).toBe("el barbero elegido")
    expect(frasesDeLosReportes(palabrasDe("salon")).resumen.porProfesional).toBe("Por estilista")
    expect(frasesDeLosReportes(palabrasDe("barberia")).llenarHoras.zonaHoraria).toBe("en la zona horaria de la barbería")
    expect(frasesDeLosReportes(palabrasDe("spa-de-unas")).llenarHoras.zonaHoraria).toBe("en la zona horaria del salón de uñas")
  })
})

describe("un rubro desconocido o sin rubro dice lo mismo que las palabras neutras", () => {
  it.each([null, "", "salud", "fitness", "otro", "no-existe", "constructor", "__proto__"])("rubro %j", (rubro) => {
    expect(comoTexto(frasesDeLosReportes(palabrasDe(rubro)))).toBe(comoTexto(frasesDeLosReportes(NEUTRAS)))
  })
})

describe("noVinieron", () => {
  it("pone en plural las dos etiquetas que hay", () => {
    expect(noVinieron("No vino")).toBe("No vinieron")
    expect(noVinieron("No asistió")).toBe("No asistieron")
  })

  it("una forma que no conoce queda como está", () => {
    expect(noVinieron("Ausente")).toBe("Ausente")
    expect(noVinieron("")).toBe("")
  })
})

describe("la concordancia sigue al género y no a una terminación pegada", () => {
  const f = frasesDeLosReportes(AL_REVES)

  it("el turno masculino y la clienta femenina", () => {
    expect(f.llenarHoras.demasiadas).toBe(
      "El período tiene demasiados turnos o atenciones para sumarlas de una vez: las cifras están incompletas. Acota el período."
    )
    expect(f.llenarHoras.queCuentaLaInasistencia).toBe(
      "Turnos marcados como “no vino”, sobre los que ya empezaron y no se cancelaron."
    )
    expect(f.llenarHoras.clientesNuevos).toBe("Clientas nuevas")
    expect(f.subtitulo.llenarHoras).toBe("Ocupación del equipo, clientas nuevas y quién no vino")
    expect(f.llenarHoras.sinFicha(1)).toBe(" 1 atención sin ficha de la clienta no entra en nuevos ni recurrentes.")
    expect(f.llenarHoras.sinCitasPasadas).toBe("No hubo turnos pasados en el período.")
    expect(f.filtros.todosLosProfesionales).toBe("Todas")
  })
})
