import { describe, expect, it } from "vitest"
import {
  frasesDeLaEspera,
  frasesDeLaFila,
  frasesDeLaGestion,
  frasesDeLaListaDeEspera,
  frasesDeLaPagina,
  frasesDelCatalogo,
  frasesDelFormulario,
  lineaDeLaImagen,
  pestanaDeLaReserva,
  tituloDeLaReserva,
} from "./_frases"

/*
 * Lo que dicen las pantallas de la reserva pública, rubro por rubro. Un rubro
 * desconocido o `null` conserva EXACTAMENTE los textos de antes del
 * vocabulario ("cita", "hora", "persona", "local", "servicio"); los rubros
 * con palabras propias hablan con las suyas, con su género y su número.
 */

const DIA = "lunes 2 de noviembre"
const SIN_PALABRAS_PROPIAS = [undefined, null, "", "salud", "fitness", "otro", "peluqueria-canina", "constructor"] as const

describe("sin rubro (o con uno desconocido): los textos de siempre", () => {
  it.each(SIN_PALABRAS_PROPIAS)("%j: el formulario", (rubro) => {
    const f = frasesDelFormulario(rubro)

    expect(f.encabezado.titulo).toBe("Reserva tu hora")
    expect(f.encabezado.bajada).toBe("Elige el servicio, el día y la hora, y deja tus datos.")
    expect(f.primerPaso).toBe("Servicio")
    expect(f.paso1.titulo).toBe("¿Qué servicio necesitas?")
    expect(f.paso1.puedesElegirHasta(4)).toBe("Puedes elegir hasta 4: te los hace la misma persona, uno después del otro.")
    expect(f.paso1.sinCombinacion(null)).toBe("Nadie del equipo lo hace junto con lo que elegiste.")
    expect(f.paso1.sinCombinacion("Carla")).toBe("Carla no lo hace junto con lo que elegiste.")
    expect(f.cualquiera).toBeUndefined()
    expect(f.profesionalSinElegir).toBe("Cualquiera disponible")
    expect(f.cambiarDeProfesional("Carla")).toBe("Cambiar de profesional: ahora con Carla")
    expect(f.elegidosEnPlural).toBe("servicios")
    expect(f.terminoDelServicio).toBe("Servicio")
    expect(f.paso2.sinDias.lo(1)).toBe("este servicio")
    expect(f.paso2.sinDias.lo(2)).toBe("estos servicios juntos")
    expect(f.paso2.sinDias.textoDelBoton(1)).toBe("Cambiar el servicio")
    expect(f.paso2.sinDias.textoDelBoton(3)).toBe("Cambiar los servicios")
    expect(f.paso2.sinDias.sinOtros).toBe(
      "Nadie que lo haga tiene horario para reservar por acá. Cambia lo que elegiste, o escríbele al negocio."
    )
    expect(f.paso3.pistaDeComentarios).toBe("¿Algo que debamos saber antes de tu cita?")
    expect(f.confirmada.pregunta).toBe("¿Necesitas cancelar o cambiar la hora?")
    expect(f.confirmada.enlace).toBe("Gestiona tu cita acá")
  })

  it.each(SIN_PALABRAS_PROPIAS)("%j: lista de espera, página, imagen y pestaña", (rubro) => {
    const espera = frasesDeLaListaDeEspera(rubro)
    expect(espera.avisame).toBe("Avísame si se libera una hora")
    expect(espera.listo(DIA)).toBe("Listo. Si se libera una hora el lunes 2 de noviembre, te escribimos a")
    expect(espera.explicacion(DIA)).toBe(
      "Si alguien cancela el lunes 2 de noviembre, te mandamos un correo para que la reserves. Avisamos a todos los que esperan: la hora es de quien reserve primero."
    )

    const salida = frasesDeLaEspera(rubro)
    expect(salida.listo).toBe(
      "Ya no estás en la lista de espera y no te vamos a avisar si se libera una hora. Tus datos se borraron."
    )
    expect(salida.confirmar).toBe("Si sales, no te vamos a avisar cuando se libere una hora ese día. Tus reservas no cambian.")

    expect(frasesDeLaPagina(rubro).catalogo).toBe("Servicios")
    expect(frasesDeLaPagina(rubro).sinServicios).toBe("Este negocio aún no tiene servicios disponibles para reservar.")
    expect(tituloDeLaReserva(rubro)).toBe("Reserva tu hora")
    expect(lineaDeLaImagen(rubro)).toBe("Reserva tu hora en línea")
    expect(pestanaDeLaReserva(rubro)).toBe("Reservar cita")
  })

  it.each(SIN_PALABRAS_PROPIAS)("%j: el enlace para cancelar o cambiar", (rubro) => {
    const g = frasesDeLaGestion(rubro)

    expect(g.tuCita).toBe("Tu cita")
    expect(g.cargando).toBe("Cargando tu cita...")
    expect(g.noSirve).toBe(
      "El enlace no es válido, o la cita ya pasó o se canceló. Si necesitas algo, contacta directamente al local."
    )
    expect(g.cancelada.titulo).toBe("Cita cancelada")
    expect(g.cancelada.bajada).toBe("Le avisamos al local. El horario quedó libre.")
    expect(g.reagendada("jueves 15 de octubre", "10:00")).toBe(
      "Listo: tu cita quedó el jueves 15 de octubre a las 10:00. Le avisamos al local."
    )
    expect(g.fueraDePlazo(24, "Salón Uno")).toBe(
      "Esta cita se puede cancelar o cambiar por acá hasta 24 horas antes. Ya no se puede: si necesitas cancelarla o cambiarla, contacta directamente a Salón Uno."
    )
    expect(g.fueraDePlazo(1, "Salón Uno")).toContain("por acá hasta 1 hora antes.")
    expect(g.fueraDePlazo(0, "Salón Uno")).toContain("por acá hasta la hora de la cita.")
    expect(g.cancelar).toBe("Cancelar cita")
    expect(g.confirmarCancelacion.pregunta).toBe("¿Seguro que quieres cancelar tu cita?")
    expect(g.confirmarCancelacion.mantener).toBe("No, mantenerla")
    expect(g.mismoServicio("Carla")).toBe("Mismo servicio, con Carla.")
    expect(g.mismoServicio(null)).toBe("Mismo servicio.")
    expect(g.terminoDelServicio).toBe("Servicio")
    expect(g.errores).toEqual({
      cargar: "No se pudo cargar tu cita",
      cancelar: "No se pudo cancelar la cita",
      cambiar: "No se pudo cambiar la cita",
    })
  })

  it.each(SIN_PALABRAS_PROPIAS)("%j: la fila", (rubro) => {
    const fila = frasesDeLaFila(rubro)
    expect(fila.cerrado).toBe("El local no está atendiendo en este momento. La fila se abre en su horario de atención.")
    expect(fila.fuera).toBe("Saliste de la fila o el local cerró tu turno. Si quieres, vuelve a anotarte.")
  })
})

describe("un salón: estilista, hora y 'al salón'", () => {
  const f = frasesDelFormulario("salon")

  it("el formulario habla de la estilista, con su género", () => {
    expect(f.paso1.titulo).toBe("¿Qué servicio necesitas?")
    expect(f.paso1.puedesElegirHasta(4)).toBe("Puedes elegir hasta 4: te los hace la misma estilista, uno después del otro.")
    expect(f.paso1.sinCombinacion(null)).toBe("Ninguna estilista lo hace junto con lo que elegiste.")
    expect(f.cambiarDeProfesional("Carla")).toBe("Cambiar de estilista: ahora con Carla")
    expect(f.paso2.sinDias.sinOtros).toMatch(/escríbele al salón\.$/)
  })

  it("la reserva es 'hora' también donde un rubro desconocido dice 'cita'", () => {
    expect(f.paso3.pistaDeComentarios).toBe("¿Algo que debamos saber antes de tu hora?")
    expect(f.confirmada.enlace).toBe("Gestiona tu hora acá")
    expect(pestanaDeLaReserva("salon")).toBe("Reservar hora")
    expect(tituloDeLaReserva("salon")).toBe("Reserva tu hora")
  })

  it("el enlace para cancelar o cambiar: 'Tu hora', 'Hora cancelada' y 'al salón', con su género", () => {
    const g = frasesDeLaGestion("salon")
    expect(g.tuCita).toBe("Tu hora")
    expect(g.cancelada.titulo).toBe("Hora cancelada")
    expect(g.cancelada.bajada).toBe("Le avisamos al salón. El horario quedó libre.")
    expect(g.noSirve).toBe(
      "El enlace no es válido, o la hora ya pasó o se canceló. Si necesitas algo, contacta directamente al salón."
    )
    expect(g.cancelar).toBe("Cancelar hora")
    expect(g.confirmarCancelacion.pregunta).toBe("¿Seguro que quieres cancelar tu hora?")
    expect(g.confirmarCancelacion.mantener).toBe("No, mantenerla")
    expect(g.errores.cancelar).toBe("No se pudo cancelar la hora")
    expect(g.fueraDePlazo(24, "Salón Uno")).toBe(
      "Esta hora se puede cancelar o cambiar por acá hasta 24 horas antes. Ya no se puede: si necesitas cancelarla o cambiarla, contacta directamente a Salón Uno."
    )
  })

  it("'hora' choca con el reloj: nunca 'la hora de la hora'", () => {
    const g = frasesDeLaGestion("salon")
    expect(g.fueraDePlazo(0, "Salón Uno")).toContain("por acá hasta que llegue la hora.")
    expect(g.fueraDePlazo(0, "Salón Uno")).not.toContain("la hora de la hora")
  })

  it("la fila nombra al salón", () => {
    const fila = frasesDeLaFila("salon")
    expect(fila.cerrado).toBe("El salón no está atendiendo en este momento. La fila se abre en su horario de atención.")
    expect(fila.fuera).toBe("Saliste de la fila o el salón cerró tu turno. Si quieres, vuelve a anotarte.")
  })

  it("la página ofrece 'Servicios' y el salón es 'Este salón'", () => {
    expect(frasesDeLaPagina("salon").catalogo).toBe("Servicios")
    expect(frasesDeLaPagina("salon").sinServicios).toBe("Este salón aún no tiene servicios disponibles para reservar.")
  })
})

describe("una barbería y un salón de uñas: el género de su profesional y de su negocio", () => {
  it("la barbería: 'el mismo barbero', 'Ningún barbero', 'a la barbería', 'La barbería'", () => {
    const f = frasesDelFormulario("barberia")
    expect(f.paso1.puedesElegirHasta(2)).toBe("Puedes elegir hasta 2: te los hace el mismo barbero, uno después del otro.")
    expect(f.paso1.sinCombinacion(null)).toBe("Ningún barbero lo hace junto con lo que elegiste.")
    expect(f.paso2.sinDias.sinOtros).toMatch(/escríbele a la barbería\.$/)
    expect(frasesDeLaGestion("barberia").cancelada.bajada).toBe("Le avisamos a la barbería. El horario quedó libre.")
    expect(frasesDeLaFila("barberia").cerrado).toMatch(/^La barbería no está atendiendo/)
    expect(frasesDeLaFila("barberia").fuera).toMatch(/o la barbería cerró tu turno/)
    expect(frasesDeLaPagina("barberia").sinServicios).toMatch(/^Esta barbería aún no tiene servicios/)
  })

  it("el salón de uñas: 'la misma manicurista', 'al salón de uñas', 'Este salón de uñas'", () => {
    const f = frasesDelFormulario("spa-de-unas")
    expect(f.paso1.puedesElegirHasta(4)).toBe("Puedes elegir hasta 4: te los hace la misma manicurista, uno después del otro.")
    expect(f.paso1.sinCombinacion(null)).toBe("Ninguna manicurista lo hace junto con lo que elegiste.")
    expect(frasesDeLaGestion("spa-de-unas").cancelada.bajada).toBe("Le avisamos al salón de uñas. El horario quedó libre.")
    expect(frasesDeLaFila("spa-de-unas").cerrado).toMatch(/^El salón de uñas no está atendiendo/)
    expect(frasesDeLaPagina("spa-de-unas").sinServicios).toMatch(/^Este salón de uñas aún no tiene servicios/)
  })
})

describe("una clínica dental: motivo, odontólogo, primera consulta y 'a la clínica'", () => {
  const f = frasesDelFormulario("odontologia")

  it("el primer paso es el motivo de la consulta", () => {
    expect(f.primerPaso).toBe("Motivo")
    expect(f.paso1.titulo).toBe("¿Cuál es el motivo de tu consulta?")
    expect(f.paso1.puedesElegirHasta(4)).toBe(
      "Puedes elegir hasta 4 motivos: te atiende el mismo odontólogo, en una sola hora."
    )
    expect(f.paso1.sinCombinacion(null)).toBe("Ningún odontólogo lo atiende junto con lo que elegiste.")
    expect(f.paso1.sinCombinacion("Ana")).toBe("Ana no lo hace junto con lo que elegiste.")
    expect(f.terminoDelServicio).toBe("Motivo")
    expect(f.elegidosEnPlural).toBe("motivos")
    expect(f.encabezado.bajada).toBe("Elige el motivo, el día y la hora, y deja tus datos.")
  })

  it("'¿Con quién?' dice odontólogo", () => {
    expect(f.cualquiera).toEqual({ nombre: "La primera hora disponible", detalle: "Con cualquier odontólogo" })
    expect(f.profesionalSinElegir).toBe("Cualquier odontólogo")
    expect(f.cambiarDeProfesional("Ana")).toBe("Cambiar de odontólogo: ahora con Ana")
  })

  it("la primera vez es la primera consulta, con su género", () => {
    expect(f.paso2.preguntaDePrimeraVez).toBe("¿Es tu primera consulta en la clínica?")
    expect(f.paso2.respuestaDePrimeraVez).toBe("Sí, es la primera")
    expect(f.paso2.notaDePrimeraVez).toBe("En la primera consulta sumamos 15 minutos para abrir tu ficha.")
    expect(f.paso2.faltaLaPrimeraVez).toBe("Responde si es tu primera consulta para ver las horas libres.")
  })

  it("sin días con atención: 'estos motivos juntos', 'Cambiar los motivos', 'a la clínica'", () => {
    expect(f.paso2.sinDias.lo(1)).toBe("este motivo")
    expect(f.paso2.sinDias.lo(2)).toBe("estos motivos juntos")
    expect(f.paso2.sinDias.textoDelBoton(1)).toBe("Cambiar el motivo")
    expect(f.paso2.sinDias.textoDelBoton(2)).toBe("Cambiar los motivos")
    expect(f.paso2.sinDias.sinOtros).toMatch(/escríbele a la clínica\.$/)
  })

  it("la reserva es 'hora', no 'cita' (la clínica la llama cita en su panel)", () => {
    expect(f.paso3.pistaDeComentarios).toBe("¿Algo que debamos saber antes de tu hora?")
    expect(f.confirmada.enlace).toBe("Gestiona tu hora acá")
    expect(pestanaDeLaReserva("odontologia")).toBe("Reservar hora")
    const g = frasesDeLaGestion("odontologia")
    expect(g.tuCita).toBe("Tu hora")
    expect(g.cancelada.titulo).toBe("Hora cancelada")
    expect(g.cancelada.bajada).toBe("Le avisamos a la clínica. El horario quedó libre.")
    expect(g.mismoServicio("Ana")).toBe("Mismo motivo, con Ana.")
    expect(g.terminoDelServicio).toBe("Motivo")
  })

  it("la página ofrece 'Prestaciones' (lo que cobra), no 'Motivos'", () => {
    expect(frasesDeLaPagina("odontologia").catalogo).toBe("Prestaciones")
    expect(frasesDeLaPagina("odontologia").sinServicios).toBe(
      "Esta clínica aún no tiene prestaciones disponibles para reservar."
    )
  })
})

describe("ningún rubro con palabras propias deja una palabra de siempre", () => {
  const RUBROS = ["salon", "barberia", "spa-de-unas", "odontologia"] as const

  /** Todo lo que lee quien reserva y nombra la reserva, el lugar o a quien atiende. */
  function textosDe(rubro: (typeof RUBROS)[number]): string[] {
    const f = frasesDelFormulario(rubro)
    const g = frasesDeLaGestion(rubro)
    const e = frasesDeLaListaDeEspera(rubro)
    const s = frasesDeLaEspera(rubro)
    const fila = frasesDeLaFila(rubro)
    return [
      f.paso1.titulo,
      f.paso1.puedesElegirHasta(4),
      f.paso1.sinCombinacion(null),
      f.paso2.sinDias.sinOtros,
      f.paso3.pistaDeComentarios,
      f.confirmada.pregunta,
      f.confirmada.enlace,
      f.profesionalSinElegir,
      g.tuCita,
      g.cargando,
      g.noSirve,
      g.cancelada.titulo,
      g.cancelada.bajada,
      g.reagendada("jueves 15 de octubre", "10:00"),
      g.fueraDePlazo(24, "Casa Ana"),
      g.cancelar,
      g.confirmarCancelacion.pregunta,
      g.errores.cargar,
      e.avisame,
      e.listo(DIA),
      e.explicacion(DIA),
      s.listo,
      s.confirmar,
      fila.cerrado,
      fila.fuera,
      frasesDeLaPagina(rubro).sinServicios,
      pestanaDeLaReserva(rubro),
    ]
  }

  it.each(RUBROS)("%s: ni 'cita', ni 'local', ni 'persona', ni 'negocio'", (rubro) => {
    for (const texto of textosDe(rubro)) {
      expect(texto, texto).not.toMatch(/\bcitas?\b/i)
      expect(texto, texto).not.toMatch(/\blocal(es)?\b/i)
      expect(texto, texto).not.toMatch(/\bpersona\b/i)
      expect(texto, texto).not.toMatch(/\bnegocio\b/i)
    }
  })
})

describe("el catálogo ordenado del primer paso: la búsqueda, 'Todos' y lo elegido", () => {
  it.each([undefined, null, "", "salud", "otro", "salon", "barberia", "spa-de-unas"] as const)(
    "%j: 'servicio'",
    (rubro) => {
      const c = frasesDelFormulario(rubro).paso1.catalogo

      expect(c.buscar).toBe("Buscar servicio")
      expect(c.todos).toBe("Todos")
      expect(c.filtrarPorCategoria).toBe("Filtrar por categoría")
      expect(c.elegiste).toBe("Elegiste:")
      expect(c.quitar("Corte de pelo")).toBe("Quitar Corte de pelo")
      expect(c.resultados(1)).toBe("1 servicio encontrado")
      expect(c.resultados(7)).toBe("7 servicios encontrados")
      expect(c.sinResultados).toBe("No encontramos servicios con esa búsqueda.")
      expect(c.quitarFiltros).toBe("Quitar filtros")
    }
  )

  it("una clínica dental: 'motivo', no 'servicio'", () => {
    const c = frasesDelFormulario("odontologia").paso1.catalogo

    expect(c.buscar).toBe("Buscar motivo")
    expect(c.todos).toBe("Todos")
    expect(c.resultados(1)).toBe("1 motivo encontrado")
    expect(c.resultados(3)).toBe("3 motivos encontrados")
    expect(c.resultados(0)).toBe("0 motivos encontrados")
    expect(c.sinResultados).toBe("No encontramos motivos con esa búsqueda.")
    for (const texto of [c.buscar, c.todos, c.resultados(2), c.sinResultados]) expect(texto).not.toMatch(/servicio/i)
  })

  it("una palabra femenina concuerda: 'Todas', '1 prestación encontrada', 'No encontramos prestaciones…'", () => {
    const c = frasesDelCatalogo({ singular: "prestación", plural: "prestaciones", genero: "f" })

    expect(c.buscar).toBe("Buscar prestación")
    expect(c.todos).toBe("Todas")
    expect(c.resultados(1)).toBe("1 prestación encontrada")
    expect(c.resultados(4)).toBe("4 prestaciones encontradas")
    expect(c.sinResultados).toBe("No encontramos prestaciones con esa búsqueda.")
  })
})
