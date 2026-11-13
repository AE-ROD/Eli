import { describe, it, expect } from "vitest"
import { vocabularioDe, type PalabrasDelRubro } from "@/lib/vocabulario"
import { frasesDeLaAgenda } from "./_frases"

const palabrasDe = (rubro: string | null): PalabrasDelRubro => vocabularioDe(rubro).palabras
const NEUTRAS = palabrasDe(null)

/** Un rubro inventado con otros géneros: una cita masculina y una cliente femenina. */
const AL_REVES: PalabrasDelRubro = {
  ...NEUTRAS,
  cliente: { singular: "clienta", plural: "clientas", genero: "f" },
  cita: { singular: "turno", plural: "turnos", genero: "m" },
}

describe("sin rubro: exactamente los textos de siempre", () => {
  const f = frasesDeLaAgenda(NEUTRAS)

  it("los botones y títulos", () => {
    expect(f.nuevaCita).toBe("Nueva cita")
    expect(f.guardarCita).toBe("Guardar cita")
    expect(f.cancelarCita).toBe("Cancelar cita")
    expect(f.marcarCompletada).toBe("Marcar completada")
    expect(f.detalleDeLaCita).toBe("Detalle de cita")
    expect(f.preguntaCancelar).toBe("¿Cancelar la cita?")
    expect(f.noVino).toBe("No vino")
    expect(f.cancelada).toEqual({ por: "Cancelada por", el: "Cancelada el" })
  })

  it("el resumen del período y los conteos", () => {
    expect(f.resumenDelPeriodo(true, 0)).toBe("Cargando...")
    expect(f.resumenDelPeriodo(true, 8)).toBe("Cargando...")
    expect(f.resumenDelPeriodo(false, 0)).toBe("Sin citas en este período")
    expect(f.resumenDelPeriodo(false, 1)).toBe("1 cita en este período")
    expect(f.resumenDelPeriodo(false, 5)).toBe("5 citas en este período")
    expect(f.cuantasCitas(1)).toBe("1 cita")
    expect(f.cuantasCitas(3)).toBe("3 citas")
    expect(f.sinCitas).toBe("sin citas")
  })

  it("el cliente y su buscador", () => {
    expect(f.elegirClienteDeLaLista).toBe(
      "Elige un cliente de la lista: escribir su nombre no basta. Si no aparece, créalo primero en Clientes."
    )
    expect(f.cliente.etiqueta).toBe("Cliente")
    expect(f.cliente.buscar).toBe("Buscar cliente...")
    expect(f.cliente.queCoinciden).toBe("Clientes que coinciden")
    expect(f.cliente.escribioAlReservar).toBe("El cliente escribió al reservar")
    const buscador = { letras: 5, minimo: 2, elegido: false, coincidencias: null }
    expect(f.cliente.estadoDelBuscador({ ...buscador, letras: 1 })).toBe("Escribe al menos 2 letras y elige de la lista.")
    expect(f.cliente.estadoDelBuscador({ ...buscador, elegido: true })).toBe("Cliente elegido.")
    expect(f.cliente.estadoDelBuscador({ ...buscador, coincidencias: 1 })).toBe("1 cliente coincide. Elige uno de la lista.")
    expect(f.cliente.estadoDelBuscador({ ...buscador, coincidencias: 3 })).toBe("3 clientes coinciden. Elige uno de la lista.")
    expect(f.cliente.estadoDelBuscador(buscador)).toBe("Elige un cliente de la lista.")
  })

  it("el profesional y el servicio", () => {
    expect(f.profesional).toMatchObject({
      etiqueta: "Profesional",
      sin: "Sin profesional",
      sinEnMedioDeFrase: "sin profesional",
      asignar: "Asignar profesional",
    })
    expect(f.profesional.avisoSinAsignar(true)).toBe(
      "Mientras no tenga profesional, en la reserva pública ocupa la hora de todo el equipo. Asígnala para liberar a los demás."
    )
    expect(f.profesional.avisoSinAsignar(false)).toBe(
      "Mientras no tenga profesional, en la reserva pública ocupa la hora de todo el equipo. La asigna la dueña o el encargado."
    )
    expect(f.servicio.etiqueta).toBe("Servicio")
    expect(f.servicio.otro).toBe("Otro servicio")
    expect(f.servicio.delCatalogo).toBe("Servicios del catálogo")
    expect(f.servicio.ayudaDelCatalogo(3)).toBe("Elige hasta 3, o escribe el servicio abajo si no está en el catálogo.")
  })

  it("la cita por confirmar y la reactivación", () => {
    expect(f.avisoPorConfirmar(true)).toBe(
      "Este contacto faltó a citas anteriores. Confírmala si la aceptas, o cancélala: al confirmarla le avisamos por correo."
    )
    expect(f.avisoPorConfirmar(false)).toBe(
      "Este contacto faltó a citas anteriores: la confirma o la cancela la dueña o el encargado."
    )
    expect(f.reactivar("cancelada")).toEqual({ boton: "Reactivar cita", botonIgual: "Reactivar igual", advertencias: "Al reactivarla:" })
    expect(f.reactivar("no-asistio")).toEqual({
      boton: "Deshacer «No vino»",
      botonIgual: "Deshacer igual",
      advertencias: "Al volver a confirmarla:",
    })
    expect(f.reactivar("completada")).toEqual({
      boton: "Devolver a confirmada",
      botonIgual: "Reactivar igual",
      advertencias: "Al reactivarla:",
    })
  })

  it("el bloqueo y los mensajes de error", () => {
    expect(f.descripcionDelBloqueo).toBe("Ese tramo se ve en gris en la agenda, y una cita encima pide confirmación.")
    expect(f.todoElNegocio).toBe("Todo el negocio")
    expect(f.errores).toEqual({
      cargarCitas: "No se pudieron cargar las citas",
      moverCita: "No se pudo mover la cita",
      crearCita: "No se pudo crear la cita",
      reactivarCita: "No se pudo reactivar la cita",
      asignarProfesional: "No se pudo asignar el profesional",
      cargarCatalogo: "No se pudo cargar el catálogo de servicios",
      buscarClientes: "No se pudieron buscar los clientes",
    })
  })
})

describe("los rubros que no tienen palabras propias hablan como sin rubro", () => {
  it("salud, fitness, otro y un id raro", () => {
    for (const rubro of ["salud", "fitness", "otro", "", "constructor"]) {
      expect(JSON.stringify(frasesDeLaAgenda(palabrasDe(rubro)).errores)).toBe(JSON.stringify(frasesDeLaAgenda(NEUTRAS).errores))
      expect(frasesDeLaAgenda(palabrasDe(rubro)).nuevaCita).toBe("Nueva cita")
      expect(frasesDeLaAgenda(palabrasDe(rubro)).profesional.asignar).toBe("Asignar profesional")
    }
  })
})

describe("salón, barbería y salón de uñas: la reserva es una hora", () => {
  const f = frasesDeLaAgenda(palabrasDe("salon"))

  it("la reserva se llama hora, con su artículo y sus participios", () => {
    expect(f.nuevaCita).toBe("Nueva hora")
    expect(f.guardarCita).toBe("Guardar hora")
    expect(f.cancelarCita).toBe("Cancelar hora")
    expect(f.detalleDeLaCita).toBe("Detalle de hora")
    expect(f.preguntaCancelar).toBe("¿Cancelar la hora?")
    expect(f.marcarCompletada).toBe("Marcar completada")
    expect(f.cancelada).toEqual({ por: "Cancelada por", el: "Cancelada el" })
    expect(f.resumenDelPeriodo(false, 0)).toBe("Sin horas en este período")
    expect(f.resumenDelPeriodo(false, 1)).toBe("1 hora en este período")
    expect(f.resumenDelPeriodo(false, 5)).toBe("5 horas en este período")
    expect(f.cuantasCitas(2)).toBe("2 horas")
    expect(f.sinCitas).toBe("sin horas")
    expect(f.descripcionDelBloqueo).toBe("Ese tramo se ve en gris en la agenda, y una hora encima pide confirmación.")
    expect(f.errores.cargarCitas).toBe("No se pudieron cargar las horas")
    expect(f.errores.moverCita).toBe("No se pudo mover la hora")
    expect(f.errores.reactivarCita).toBe("No se pudo reactivar la hora")
    expect(f.errores.crearCita).toBe("No se pudo crear la hora")
    expect(f.reactivar("cancelada").boton).toBe("Reactivar hora")
    expect(f.avisoPorConfirmar(true)).toContain("faltó a horas anteriores. Confírmala si la aceptas")
  })

  it("lo demás del salón sigue siendo cliente, servicio y \"No vino\"", () => {
    expect(f.cliente.etiqueta).toBe("Cliente")
    expect(f.servicio.etiqueta).toBe("Servicio")
    expect(f.noVino).toBe("No vino")
    expect(f.reactivar("no-asistio").boton).toBe("Deshacer «No vino»")
    expect(f.errores.cargarCatalogo).toBe("No se pudo cargar el catálogo de servicios")
  })

  it("quien atiende es la estilista, el barbero o la manicurista, y el artículo lo sigue", () => {
    expect(f.profesional.etiqueta).toBe("Estilista")
    expect(f.profesional.sin).toBe("Sin estilista")
    expect(f.profesional.asignar).toBe("Asignar estilista")
    expect(f.errores.asignarProfesional).toBe("No se pudo asignar la estilista")
    expect(f.profesional.avisoSinAsignar(true)).toContain("Mientras no tenga estilista,")

    const barberia = frasesDeLaAgenda(palabrasDe("barberia"))
    expect(barberia.profesional.etiqueta).toBe("Barbero")
    expect(barberia.profesional.sinEnMedioDeFrase).toBe("sin barbero")
    expect(barberia.errores.asignarProfesional).toBe("No se pudo asignar el barbero")

    const unas = frasesDeLaAgenda(palabrasDe("spa-de-unas"))
    expect(unas.profesional.asignar).toBe("Asignar manicurista")
    expect(unas.errores.asignarProfesional).toBe("No se pudo asignar la manicurista")
  })

  it("\"Todo el negocio\" nombra el lugar con su género", () => {
    expect(f.todoElNegocio).toBe("Todo el salón")
    expect(frasesDeLaAgenda(palabrasDe("barberia")).todoElNegocio).toBe("Toda la barbería")
    expect(frasesDeLaAgenda(palabrasDe("spa-de-unas")).todoElNegocio).toBe("Todo el salón de uñas")
  })
})

describe("clínica dental: paciente, odontólogo, prestación y \"No asistió\"", () => {
  const f = frasesDeLaAgenda(palabrasDe("odontologia"))

  it("en el panel la reserva sigue siendo una cita", () => {
    expect(f.nuevaCita).toBe("Nueva cita")
    expect(f.preguntaCancelar).toBe("¿Cancelar la cita?")
    expect(f.resumenDelPeriodo(false, 2)).toBe("2 citas en este período")
    expect(f.descripcionDelBloqueo).toContain("una cita encima")
  })

  it("el paciente, el odontólogo y la prestación", () => {
    expect(f.cliente.etiqueta).toBe("Paciente")
    expect(f.cliente.buscar).toBe("Buscar paciente...")
    expect(f.cliente.queCoinciden).toBe("Pacientes que coinciden")
    expect(f.cliente.escribioAlReservar).toBe("El paciente escribió al reservar")
    expect(f.cliente.estadoDelBuscador({ letras: 4, minimo: 2, elegido: false, coincidencias: 2 })).toBe(
      "2 pacientes coinciden. Elige uno de la lista."
    )
    expect(f.elegirClienteDeLaLista).toBe(
      "Elige un paciente de la lista: escribir su nombre no basta. Si no aparece, créalo primero en Pacientes."
    )
    expect(f.profesional.etiqueta).toBe("Odontólogo")
    expect(f.profesional.sin).toBe("Sin odontólogo")
    expect(f.errores.asignarProfesional).toBe("No se pudo asignar el odontólogo")
    expect(f.servicio.etiqueta).toBe("Prestación")
    expect(f.servicio.otro).toBe("Otra prestación")
    expect(f.servicio.delCatalogo).toBe("Prestaciones del catálogo")
    expect(f.servicio.ayudaDelCatalogo(3)).toBe("Elige hasta 3, o escribe la prestación abajo si no está en el catálogo.")
    expect(f.errores.cargarCatalogo).toBe("No se pudo cargar el catálogo de prestaciones")
    expect(f.errores.buscarClientes).toBe("No se pudieron buscar los pacientes")
    expect(f.todoElNegocio).toBe("Toda la clínica")
  })

  it("quien no llegó \"No asistió\", y la primera vez es la primera consulta", () => {
    expect(f.noVino).toBe("No asistió")
    expect(f.reactivar("no-asistio").boton).toBe("Deshacer «No asistió»")
    expect(f.grilla.primeraVez).toBe("primera consulta")
    expect(f.grilla.verPorProfesional).toBe("Odontólogo")
  })
})

describe("la concordancia sale del género y no de las palabras de hoy", () => {
  it("una cita masculina (un turno): lo, el, nuevo, confirmado", () => {
    const f = frasesDeLaAgenda(AL_REVES)
    expect(f.nuevaCita).toBe("Nuevo turno")
    expect(f.marcarCompletada).toBe("Marcar completado")
    expect(f.preguntaCancelar).toBe("¿Cancelar el turno?")
    expect(f.cancelada.por).toBe("Cancelado por")
    expect(f.errores.moverCita).toBe("No se pudo mover el turno")
    expect(f.errores.cargarCitas).toBe("No se pudieron cargar los turnos")
    expect(f.reactivar("completada")).toEqual({
      boton: "Devolver a confirmado",
      botonIgual: "Reactivar igual",
      advertencias: "Al reactivarlo:",
    })
    expect(f.reactivar("no-asistio").advertencias).toBe("Al volver a confirmarlo:")
    expect(f.avisoPorConfirmar(true)).toBe(
      "Este contacto faltó a turnos anteriores. Confírmalo si lo aceptas, o cancélalo: al confirmarlo le avisamos por correo."
    )
    expect(f.avisoPorConfirmar(false)).toBe(
      "Este contacto faltó a turnos anteriores: lo confirma o lo cancela la dueña o el encargado."
    )
    expect(f.profesional.avisoSinAsignar(false)).toContain("Lo asigna la dueña o el encargado.")
    expect(f.descripcionDelBloqueo).toContain("un turno encima")
  })

  it("una cliente femenina (una clienta): una, la, elegida", () => {
    const f = frasesDeLaAgenda(AL_REVES)
    expect(f.elegirClienteDeLaLista).toBe(
      "Elige una clienta de la lista: escribir su nombre no basta. Si no aparece, créala primero en Clientas."
    )
    expect(f.cliente.escribioAlReservar).toBe("La clienta escribió al reservar")
    expect(f.cliente.estadoDelBuscador({ letras: 4, minimo: 2, elegido: true, coincidencias: null })).toBe("Clienta elegida.")
    expect(f.cliente.estadoDelBuscador({ letras: 4, minimo: 2, elegido: false, coincidencias: 1 })).toBe(
      "1 clienta coincide. Elige una de la lista."
    )
    expect(f.cliente.estadoDelBuscador({ letras: 4, minimo: 2, elegido: false, coincidencias: null })).toBe(
      "Elige una clienta de la lista."
    )
  })
})

describe("las sedes (etapa 9, plan Independiente)", () => {
  const f = frasesDeLaAgenda(NEUTRAS)

  it("los rótulos del selector y del detalle", () => {
    expect(f.sede.etiqueta).toBe("Sede")
    expect(f.sede.elegir).toBe("Elige la sede")
    expect(f.sede.enNombreAccesible("Centro")).toBe("sede Centro")
  })

  it("lo que dice el modal de la sede elegida ese día", () => {
    expect(f.sede.horarioEseDia([])).toBe("Esta sede no atiende ese día.")
    expect(f.sede.horarioEseDia([{ startTime: "09:00", endTime: "13:00" }])).toBe("Atiende ese día de 09:00 a 13:00.")
    expect(
      f.sede.horarioEseDia([
        { startTime: "09:00", endTime: "13:00" },
        { startTime: "15:00", endTime: "19:00" },
      ])
    ).toBe("Atiende ese día de 09:00 a 13:00 y 15:00 a 19:00.")
    expect(
      f.sede.horarioEseDia([
        { startTime: "08:00", endTime: "10:00" },
        { startTime: "11:00", endTime: "13:00" },
        { startTime: "15:00", endTime: "19:00" },
      ])
    ).toBe("Atiende ese día de 08:00 a 10:00, 11:00 a 13:00 y 15:00 a 19:00.")
  })

  it("las frases de la sede no llevan palabras del rubro: son las mismas en una clínica y en un salón", () => {
    const franjas = [{ startTime: "09:00", endTime: "13:00" }]
    for (const rubro of [null, "odontologia", "barberia", "salon"]) {
      const { sede } = frasesDeLaAgenda(palabrasDe(rubro))
      expect([sede.etiqueta, sede.elegir, sede.ayuda, sede.horarioNoCargo]).toEqual([f.sede.etiqueta, f.sede.elegir, f.sede.ayuda, f.sede.horarioNoCargo])
      expect(sede.enNombreAccesible("Centro")).toBe(f.sede.enNombreAccesible("Centro"))
      expect(sede.horarioEseDia(franjas)).toBe(f.sede.horarioEseDia(franjas))
    }
  })
})
