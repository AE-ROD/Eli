import { describe, it, expect } from "vitest"
import { vocabularioDe, type PalabrasDelRubro } from "@/lib/vocabulario"
import {
  articuloDe,
  cantidadDe,
  elLocal,
  frasesDelInicio,
  frasesDelInicioDeLaClinica,
  nuevaCita,
  numeroDe,
  pronombreDe,
  seLlamaHora,
  todoDe,
  todoElNegocio,
  unoDe,
} from "./_frases"

const palabrasDe = (rubro: string | null): PalabrasDelRubro => vocabularioDe(rubro).palabras

const NEUTRAS = palabrasDe(null)

/**
 * Un rubro inventado con otros géneros que los reales: la cita masculina y el
 * cliente femenino. Si una frase pegara "la" o "nueva" a mano, acá se rompe.
 */
const AL_REVES: PalabrasDelRubro = {
  ...NEUTRAS,
  cliente: { singular: "clienta", plural: "clientas", genero: "f" },
  cita: { singular: "turno", plural: "turnos", genero: "m" },
  tablero: { singular: "mostrador", plural: "mostradores", genero: "m" },
  negocio: { singular: "taller", plural: "talleres", genero: "m" },
}

describe("las piezas sueltas", () => {
  it("el artículo, el pronombre, uno y todo salen del género", () => {
    const masculino = { singular: "turno", plural: "turnos", genero: "m" as const }
    const femenino = { singular: "hora", plural: "horas", genero: "f" as const }
    expect([articuloDe(masculino), pronombreDe(masculino), unoDe(masculino), todoDe(masculino)]).toEqual(["el", "lo", "uno", "todo"])
    expect([articuloDe(femenino), pronombreDe(femenino), unoDe(femenino), todoDe(femenino)]).toEqual(["la", "la", "una", "toda"])
  })

  it("cuenta con el singular sólo en 1; 0 y el resto van en plural", () => {
    expect(numeroDe(1)).toBe("singular")
    expect(numeroDe(0)).toBe("plural")
    expect(numeroDe(2)).toBe("plural")
    expect(cantidadDe(1, NEUTRAS.cita)).toBe("1 cita")
    expect(cantidadDe(0, NEUTRAS.cita)).toBe("0 citas")
    expect(cantidadDe(3, palabrasDe("salon").cita)).toBe("3 horas")
  })

  it("sólo la reserva que se llama \"hora\" choca con el reloj", () => {
    expect(seLlamaHora(palabrasDe("salon").cita)).toBe(true)
    expect(seLlamaHora(palabrasDe("barberia").cita)).toBe(true)
    expect(seLlamaHora(palabrasDe("spa-de-unas").cita)).toBe(true)
    expect(seLlamaHora(palabrasDe("odontologia").cita)).toBe(false)
    expect(seLlamaHora(NEUTRAS.cita)).toBe(false)
    // La hora que lee quien reserva en una clínica no es la del panel.
    expect(seLlamaHora(palabrasDe("odontologia").citaParaElCliente)).toBe(true)
  })

  it("\"Nueva cita\" / \"Nueva hora\" / \"Nuevo turno\": el adjetivo concuerda", () => {
    expect(nuevaCita(NEUTRAS.cita)).toBe("Nueva cita")
    expect(nuevaCita(palabrasDe("salon").cita)).toBe("Nueva hora")
    expect(nuevaCita(AL_REVES.cita)).toBe("Nuevo turno")
  })

  it("todo el negocio: \"Todo el negocio\", \"Todo el salón\", \"Toda la barbería\", \"Toda la clínica\"", () => {
    expect(todoElNegocio(NEUTRAS.negocio)).toBe("Todo el negocio")
    expect(todoElNegocio(palabrasDe("salon").negocio)).toBe("Todo el salón")
    expect(todoElNegocio(palabrasDe("barberia").negocio)).toBe("Toda la barbería")
    expect(todoElNegocio(palabrasDe("spa-de-unas").negocio)).toBe("Todo el salón de uñas")
    expect(todoElNegocio(palabrasDe("odontologia").negocio)).toBe("Toda la clínica")
  })

  it("el local: sin palabras propias sigue siendo \"local\"; con ellas, el negocio del rubro", () => {
    expect(elLocal(NEUTRAS).singular).toBe("local")
    expect(elLocal(palabrasDe("otro")).singular).toBe("local")
    expect(elLocal(palabrasDe("salon")).singular).toBe("salón")
    expect(elLocal(palabrasDe("odontologia")).singular).toBe("clínica")
  })
})

describe("frasesDelInicio", () => {
  describe("sin rubro: exactamente los textos de siempre", () => {
    const f = frasesDelInicio(NEUTRAS)

    it("las citas de hoy", () => {
      expect(f.nuevaCita).toBe("Nueva cita")
      expect(f.citasDeHoy.titulo).toBe("Citas de hoy")
      expect(f.citasDeHoy.resumen(0)).toBe("0 citas programadas")
      expect(f.citasDeHoy.resumen(1)).toBe("1 cita programada")
      expect(f.citasDeHoy.resumen(3)).toBe("3 citas programadas")
      expect(f.citasDeHoy.sinCitas).toBe("Sin citas para hoy")
      expect(f.citasDeHoy.cargando).toBe("Cargando citas...")
      expect(f.citasPorHora.titulo).toBe("Citas de hoy por hora")
      expect(f.citasPorHora.sinCitas).toBe("Sin citas para hoy")
    })

    it("las cifras", () => {
      expect(f.estadisticas.citasHoy).toBe("Citas hoy")
      expect(f.estadisticas.totalDeClientes).toBe("Total de clientes")
      expect(f.estadisticas.ningunaAgendada).toBe("Ninguna agendada todavía.")
      expect(f.estadisticas.proximaCita("martes, 3 de noviembre", "10:00")).toBe("La próxima es el martes, 3 de noviembre a las 10:00.")
      expect(f.estadisticas.sinClientes).toBe("Se suman solos cuando alguien reserva.")
      expect(f.estadisticas.clientesNuevos(0)).toBe("Ninguno nuevo este mes.")
      expect(f.estadisticas.clientesNuevos(1)).toBe("1 nuevo este mes.")
      expect(f.estadisticas.clientesNuevos(4)).toBe("4 nuevos este mes.")
      expect(f.estadisticas.dondeSeCobra).toBe("el tablero")
    })

    it("el resumen y los clientes", () => {
      expect(f.resumenDelNegocio.titulo).toBe("Resumen del negocio")
      expect(f.resumenDelNegocio.totalDeClientes).toBe("Total clientes")
      expect(f.resumenDelNegocio.clientesNuevosEsteMes).toBe("Clientes nuevos este mes")
      expect(f.resumenDeClientes.titulo).toBe("Clientes")
      expect(f.resumenDeClientes.sinClientes).toBe("Aún no tienes clientes registrados")
      expect(f.resumenDeClientes.total(1)).toBe("1 cliente")
      expect(f.resumenDeClientes.total(5)).toBe("5 clientes")
      expect(f.resumenDeClientes.verTodos).toBe("Ver todos")
    })

    it("la vista del profesional y el QR", () => {
      expect(f.vistaDelProfesional.resumenDelDia(1)).toBe("1 cita hoy")
      expect(f.vistaDelProfesional.resumenDelDia(3)).toBe("3 citas hoy")
      expect(f.vistaDelProfesional.tusCitasDeHoy).toBe("Tus citas de hoy")
      expect(f.vistaDelProfesional.sinCitas).toBe("Sin citas para hoy")
      expect(f.vistaDelProfesional.tampocoTienes).toBe("Tampoco tienes citas agendadas para hoy.")
      expect(f.tituloDelQr).toBe("Tu QR para el local")
    })
  })

  it("los rubros que no tienen palabras propias hablan como sin rubro", () => {
    const textos = (f: ReturnType<typeof frasesDelInicio>) => [
      f.nuevaCita,
      f.citasDeHoy.titulo,
      f.citasDeHoy.resumen(3),
      f.citasPorHora.titulo,
      f.estadisticas.citasHoy,
      f.estadisticas.totalDeClientes,
      f.resumenDelNegocio.titulo,
      f.vistaDelProfesional.resumenDelDia(3),
      f.tituloDelQr,
    ]
    for (const rubro of ["salud", "fitness", "otro", "", "constructor", undefined]) {
      expect(textos(frasesDelInicio(palabrasDe(rubro as string | null)))).toEqual(textos(frasesDelInicio(NEUTRAS)))
    }
  })

  describe("salón, barbería y salón de uñas: la reserva es una hora", () => {
    for (const rubro of ["salon", "barberia", "spa-de-unas"]) {
      it(`${rubro}: dice \"hora\" sin chocar con el reloj`, () => {
        const f = frasesDelInicio(palabrasDe(rubro))
        expect(f.nuevaCita).toBe("Nueva hora")
        expect(f.citasDeHoy.titulo).toBe("Horas de hoy")
        // "3 horas programadas" se leería como tres horas de reloj.
        expect(f.citasDeHoy.resumen(3)).toBe("3 agendadas")
        expect(f.citasDeHoy.resumen(1)).toBe("1 agendada")
        expect(f.citasDeHoy.sinCitas).toBe("Sin horas para hoy")
        expect(f.citasDeHoy.cargando).toBe("Cargando horas...")
        // "Horas de hoy por hora" repetiría la palabra.
        expect(f.citasPorHora.titulo).toBe("Hoy, hora por hora")
        expect(f.estadisticas.citasHoy).toBe("Horas agendadas hoy")
        expect(f.estadisticas.ningunaAgendada).toBe("Ninguna agendada todavía.")
        expect(f.estadisticas.proximaCita("martes, 3 de noviembre", "10:00")).toBe("La próxima es el martes, 3 de noviembre a las 10:00.")
        expect(f.vistaDelProfesional.resumenDelDia(0)).toBe("0 horas agendadas hoy")
        expect(f.vistaDelProfesional.resumenDelDia(1)).toBe("1 hora agendada hoy")
        expect(f.vistaDelProfesional.resumenDelDia(3)).toBe("3 horas agendadas hoy")
        expect(f.vistaDelProfesional.tusCitasDeHoy).toBe("Tus horas de hoy")
        expect(f.vistaDelProfesional.tampocoTienes).toBe("Tampoco tienes horas agendadas para hoy.")
        expect(f.estadisticas.dondeSeCobra).toBe("el tablero")
      })
    }

    it("el negocio se nombra con la palabra del rubro, con su artículo", () => {
      expect(frasesDelInicio(palabrasDe("salon")).resumenDelNegocio.titulo).toBe("Resumen del salón")
      expect(frasesDelInicio(palabrasDe("barberia")).resumenDelNegocio.titulo).toBe("Resumen de la barbería")
      expect(frasesDelInicio(palabrasDe("spa-de-unas")).resumenDelNegocio.titulo).toBe("Resumen del salón de uñas")
      expect(frasesDelInicio(palabrasDe("salon")).tituloDelQr).toBe("Tu QR para el salón")
      expect(frasesDelInicio(palabrasDe("barberia")).tituloDelQr).toBe("Tu QR para la barbería")
      expect(frasesDelInicio(palabrasDe("spa-de-unas")).tituloDelQr).toBe("Tu QR para el salón de uñas")
    })
  })

  describe("clínica dental: pacientes, cita y sala de espera", () => {
    const f = frasesDelInicio(palabrasDe("odontologia"))

    it("la reserva sigue siendo una cita en el panel", () => {
      expect(f.nuevaCita).toBe("Nueva cita")
      expect(f.citasDeHoy.titulo).toBe("Citas de hoy")
      expect(f.citasDeHoy.resumen(2)).toBe("2 citas programadas")
      expect(f.citasPorHora.titulo).toBe("Citas de hoy por hora")
      expect(f.estadisticas.citasHoy).toBe("Citas hoy")
      expect(f.vistaDelProfesional.resumenDelDia(1)).toBe("1 cita hoy")
    })

    it("los pacientes y la sala de espera, con su artículo", () => {
      expect(f.estadisticas.totalDeClientes).toBe("Total de pacientes")
      expect(f.estadisticas.clientesNuevos(1)).toBe("1 nuevo este mes.")
      expect(f.estadisticas.dondeSeCobra).toBe("la sala de espera")
      expect(f.resumenDeClientes.titulo).toBe("Pacientes")
      expect(f.resumenDeClientes.sinClientes).toBe("Aún no tienes pacientes registrados")
      expect(f.resumenDeClientes.total(2)).toBe("2 pacientes")
      expect(f.resumenDelNegocio.titulo).toBe("Resumen de la clínica")
      expect(f.resumenDelNegocio.clientesNuevosEsteMes).toBe("Pacientes nuevos este mes")
      expect(f.tituloDelQr).toBe("Tu QR para la clínica")
    })
  })

  it("la concordancia sale del género y no de las palabras de hoy: un turno masculino y una clienta femenina", () => {
    const f = frasesDelInicio(AL_REVES)
    expect(f.nuevaCita).toBe("Nuevo turno")
    expect(f.citasDeHoy.resumen(1)).toBe("1 turno programado")
    expect(f.citasDeHoy.resumen(3)).toBe("3 turnos programados")
    expect(f.estadisticas.ningunaAgendada).toBe("Ninguno agendado todavía.")
    expect(f.estadisticas.proximaCita("martes", "10:00")).toBe("El próximo es el martes a las 10:00.")
    expect(f.estadisticas.sinClientes).toBe("Se suman solas cuando alguien reserva.")
    expect(f.estadisticas.clientesNuevos(0)).toBe("Ninguna nueva este mes.")
    expect(f.estadisticas.clientesNuevos(2)).toBe("2 nuevas este mes.")
    expect(f.estadisticas.dondeSeCobra).toBe("el mostrador")
    expect(f.resumenDeClientes.sinClientes).toBe("Aún no tienes clientas registradas")
    expect(f.resumenDeClientes.verTodos).toBe("Ver todas")
    expect(f.resumenDelNegocio.clientesNuevosEsteMes).toBe("Clientas nuevas este mes")
    expect(f.resumenDelNegocio.titulo).toBe("Resumen del taller")
    expect(f.vistaDelProfesional.tampocoTienes).toBe("Tampoco tienes turnos agendados para hoy.")
  })
})

describe("frasesDelInicioDeLaClinica", () => {
  const f = frasesDelInicioDeLaClinica(palabrasDe("odontologia"))

  it("los textos de la clínica, tal como estaban", () => {
    expect(f.sillonesDeQuienSoloVeLoSuyo).toBe(
      "Tus citas en cada sillón. Un sillón sin citas tuyas puede estar ocupado por otro odontólogo."
    )
    expect(f.sinCitasTuyasAhora).toBe("Sin citas tuyas ahora")
    expect(f.sinMasCitasTuyasHoy).toBe("Sin más citas tuyas hoy")
    expect(f.tuProxima("10:00")).toBe("Tu próxima cita, a las 10:00")
    expect(f.atrasada("10:00")).toBe("Atrasada la de las 10:00")
    expect(f.sinCliente).toBe("Sin paciente")
    expect(f.abrirLaFicha).toBe(", abrir la ficha del paciente")
    expect(f.estanEnLaFicha(3)).toBe("Y 3 más: están en la ficha de cada paciente.")
  })

  it("la sala de espera lleva el artículo que le toca", () => {
    expect(f.enLaSalaDeEspera).toBe("En sala de espera")
    expect(f.verLosQueEsperan(8)).toBe("Ver los 8 en la sala de espera")
    expect(f.irALaSalaDeEspera).toBe("Ir a la sala de espera")
    // Una palabra masculina cambia "la" por "el" y "a la" por "al".
    const conTablero = frasesDelInicioDeLaClinica(NEUTRAS)
    expect(conTablero.verLosQueEsperan(8)).toBe("Ver los 8 en el tablero")
    expect(conTablero.irALaSalaDeEspera).toBe("Ir al tablero")
  })

  it("con una cita masculina, \"tuyos\", \"próximo\" y \"atrasado\" la siguen", () => {
    const g = frasesDelInicioDeLaClinica(AL_REVES)
    expect(g.sinCitasTuyasAhora).toBe("Sin turnos tuyos ahora")
    expect(g.tuProxima("10:00")).toBe("Tu próximo turno, a las 10:00")
    expect(g.atrasada("10:00")).toBe("Atrasado el de las 10:00")
  })
})
