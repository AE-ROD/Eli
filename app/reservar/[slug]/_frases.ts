/**
 * Las frases de la reserva pública con las palabras del rubro
 * (`palabrasDeLaReserva`, que sale de `vocabularioDe(rubro).palabras`) y la
 * concordancia de `lib/concordancia.ts`: "Reserva tu hora" y "¿Qué servicio
 * necesitas?" en un salón, "¿Cuál es el motivo de tu consulta?" y "a la
 * clínica" en una clínica dental. Las comparten el formulario, el enlace para
 * cancelar o cambiar, la lista de espera, la mini página y la fila virtual.
 *
 * Es lógica sin pantalla: las pantallas piden las frases con el rubro
 * (`Business.type`, que sale del `slug` en el servidor) y no arman ninguna con
 * un artículo, un demostrativo, un "ningún" o un adjetivo escritos a mano. Un
 * rubro desconocido o `null` recibe exactamente los textos de siempre.
 *
 * Tres decisiones sobre las palabras de la reserva:
 *
 * - La reserva tiene dos nombres, porque los textos de siempre mezclaban
 *   "hora" y "cita": `hora` ("Reserva tu hora", "se libera una hora") y `cita`
 *   ("Gestiona tu cita acá", "Tu cita"). En un rubro con palabras propias los
 *   dos son "hora" (también en la clínica, aunque el panel diga "cita"); en uno
 *   desconocido siguen siendo "hora" y "cita", como siempre.
 * - "hora" choca con la hora del reloj. Donde la reserva se llama "hora" y la
 *   frase diría "hasta la hora de la hora", se escribe de otra forma
 *   (`hastaLaHoraDe`: "hasta que llegue la hora"). La hora del reloj ("el día
 *   y la hora", "a las 10:00", "Horarios disponibles") no se migra.
 * - Lo que ofrece el negocio (su catálogo, "Servicios" / "Prestaciones") es
 *   `servicio`, y lo que elige quien reserva es `servicioDeLaReserva`
 *   ("servicio" / "motivo").
 */

import {
  al,
  articuloDe,
  cantidadDe,
  concordar,
  del,
  el,
  este,
  ningun,
  numeroDe,
  pronombreDe,
  un,
  unoDe,
  type Numero,
} from "@/lib/concordancia"
import { conAdjetivoAntes, hastaLaHoraDe, palabrasDeLaReserva } from "@/lib/palabras-de-la-reserva"
import { textoDePrimeraVez } from "@/lib/reserva-publica"
import { conMayuscula, type Sustantivo } from "@/lib/vocabulario"

type Rubro = string | null | undefined

/** "Reserva tu hora": el título del formulario, y de la página cuando el negocio todavía no tiene qué reservar. */
export function tituloDeLaReserva(rubro: Rubro): string {
  return `Reserva tu ${palabrasDeLaReserva(rubro).hora.singular}`
}

/**
 * Lo que dice cada pestaña del navegador al reservar: "Reservar cita" en un
 * rubro desconocido, "Reservar hora" en los demás.
 */
export function pestanaDeLaReserva(rubro: Rubro): string {
  return `Reservar ${palabrasDeLaReserva(rubro).cita.singular}`
}

/**
 * Las frases del catálogo ordenado del primer paso (la barra de categorías, la
 * búsqueda y lo ya elegido), con la palabra de lo que se elige
 * (`servicioDeLaReserva`): "Buscar servicio" / "Buscar motivo". Recibe la
 * palabra y no el rubro para que se pueda probar con una femenina: "Todas",
 * "1 prestación encontrada".
 */
export function frasesDelCatalogo(palabra: Sustantivo) {
  return {
    /** El rótulo de la caja de búsqueda: "Buscar servicio" / "Buscar motivo". */
    buscar: `Buscar ${palabra.singular}`,
    /** El nombre de la barra de categorías para el lector de pantalla (los botones ya dicen cuál es). */
    filtrarPorCategoria: "Filtrar por categoría",
    /** El botón que quita el filtro de categoría: "Todos" / "Todas". */
    todos: conMayuscula(concordar("todo", palabra, "plural")),
    /** Lo ya elegido, siempre a la vista aunque el filtro lo esconda de la lista. */
    elegiste: "Elegiste:",
    /** El texto del botón de cada elegido para el lector de pantalla: "Quitar Corte de pelo". */
    quitar: (nombre: string): string => `Quitar ${nombre}`,
    /** Cuántos pasan la búsqueda: "3 servicios encontrados" / "1 motivo encontrado". */
    resultados: (cantidad: number): string =>
      `${cantidadDe(cantidad, palabra)} ${concordar("encontrado", palabra, numeroDe(cantidad))}`,
    /** La búsqueda sin resultados: "No encontramos servicios con esa búsqueda." */
    sinResultados: `No encontramos ${palabra.plural} con esa búsqueda.`,
    /** El botón de ese estado vacío. */
    quitarFiltros: "Quitar filtros",
  }
}

/** Las frases del catálogo ordenado del primer paso. */
export type FrasesDelCatalogo = ReturnType<typeof frasesDelCatalogo>

/**
 * Las frases del formulario de reserva (los tres pasos y la reserva
 * confirmada). Una por pantalla o por pieza, con el nombre de lo que dicen.
 */
export function frasesDelFormulario(rubro: Rubro) {
  const { hora, cita, servicioDeLaReserva: elegido, profesional, quienAtiende, negocio, primeraVez, conPalabrasPropias, clinicaDental } =
    palabrasDeLaReserva(rubro)
  // "del otro" / "de la otra": el otro servicio, para "uno después del otro".
  const delOtro = del({ ...elegido, singular: concordar("otro", elegido) })
  // "el mismo odontólogo" / "la misma estilista" / "la misma persona".
  const elMismo = (quien: Sustantivo) => `${articuloDe(quien)} ${concordar("mismo", quien)} ${quien.singular}`
  const numeroSegun = (cantidad: number): Numero => (cantidad > 1 ? "plural" : "singular")

  return {
    encabezado: {
      titulo: tituloDeLaReserva(rubro),
      /** "Elige el servicio, el día y la hora, y deja tus datos." La hora es la del reloj. */
      bajada: `Elige ${el(elegido)}, el día y la hora, y deja tus datos.`,
    },

    /** El nombre del primer paso: "Servicio" / "Motivo". Los otros dos no cambian. */
    primerPaso: conMayuscula(elegido.singular),

    paso1: {
      /** "¿Qué servicio necesitas?" / "¿Cuál es el motivo de tu consulta?". */
      titulo: clinicaDental ? `¿Cuál es ${el(elegido)} de tu consulta?` : `¿Qué ${elegido.singular} necesitas?`,
      /**
       * "Puedes elegir hasta 4: te los hace la misma persona, uno después del otro."
       * Con las palabras del rubro, "la misma estilista"; en una clínica dental,
       * "hasta 4 motivos: te atiende el mismo odontólogo, en una sola hora".
       */
      puedesElegirHasta: (maximo: number): string =>
        clinicaDental
          ? `Puedes elegir hasta ${maximo} ${elegido.plural}: te atiende ${elMismo(profesional)}, en ${un(conAdjetivoAntes("solo", hora))}.`
          : `Puedes elegir hasta ${maximo}: te ${pronombreDe(elegido)}s hace ${elMismo(quienAtiende)}, ${unoDe(elegido)} después ${delOtro}.`,
      /** Por qué un servicio no se puede sumar a lo ya elegido. Con alguien elegido, es de quien no lo hace. */
      sinCombinacion: (conQuien: string | null): string => {
        if (conQuien) return `${conQuien} no lo hace junto con lo que elegiste.`
        if (clinicaDental) return `${conMayuscula(ningun(profesional))} lo atiende junto con lo que elegiste.`
        if (conPalabrasPropias) return `${conMayuscula(ningun(profesional))} lo hace junto con lo que elegiste.`
        return "Nadie del equipo lo hace junto con lo que elegiste."
      },
      /** Con muchos servicios en varias categorías: la barra de categorías y la búsqueda. */
      catalogo: frasesDelCatalogo(elegido),
    },

    /** "¿Con quién?" cuando es cualquiera: sólo la clínica lo dice con sus palabras. */
    cualquiera: clinicaDental
      ? { nombre: "La primera hora disponible", detalle: `Con cualquier ${profesional.singular}` }
      : undefined,
    /** Quién atiende en el resumen cuando no se eligió a nadie. */
    profesionalSinElegir: clinicaDental ? `Cualquier ${profesional.singular}` : "Cualquiera disponible",
    /** El texto para el lector de pantalla del botón "Cambiar": "Cambiar de estilista: ahora con Carla". */
    cambiarDeProfesional: (nombre: string): string => `Cambiar de ${profesional.singular}: ahora con ${nombre}`,

    /** La palabra de lo que se elige, para concordar el "lo" / "los" del aviso de lo que se quitó. */
    servicioElegido: elegido,
    /** El plural de lo elegido, para "3 servicios · en total": "servicios" / "motivos". */
    elegidosEnPlural: elegido.plural,
    /** "Servicio" / "Motivo": la fila del resumen. */
    terminoDelServicio: conMayuscula(elegido.singular),

    paso2: {
      /** Clínica dental: "¿Es tu primera consulta en la clínica?". */
      preguntaDePrimeraVez: `¿Es tu ${primeraVez.singular} en ${el(negocio)}?`,
      /** La respuesta que dice que sí: "Sí, es la primera". */
      respuestaDePrimeraVez: `Sí, es ${articuloDe(primeraVez)} ${concordar("primero", primeraVez)}`,
      /** La nota bajo la pregunta: "En la primera consulta sumamos 15 minutos para abrir tu ficha." */
      notaDePrimeraVez: textoDePrimeraVez(rubro),
      /** Sin responder no hay horas: "Responde si es tu primera consulta para ver las horas libres." */
      faltaLaPrimeraVez: `Responde si es tu ${primeraVez.singular} para ver las horas libres.`,
      sinDias: {
        /** "este servicio" / "estos servicios juntos", y lo mismo con "motivo". */
        lo: (cantidad: number): string =>
          cantidad > 1 ? `${este(elegido, "plural")} ${concordar("junto", elegido, "plural")}` : este(elegido),
        /** "Cambiar el servicio" / "Cambiar los servicios". */
        textoDelBoton: (cantidad: number): string => `Cambiar ${el(elegido, numeroSegun(cantidad))}`,
        /** Cuando no hay a quién más elegir: "…o escríbele al negocio." / "al salón" / "a la clínica". */
        sinOtros: `Nadie que lo haga tiene horario para reservar por acá. Cambia lo que elegiste, o escríbele ${al(negocio)}.`,
      },
    },

    paso3: {
      /** "¿Algo que debamos saber antes de tu cita?" / "…de tu hora?". */
      pistaDeComentarios: `¿Algo que debamos saber antes de tu ${cita.singular}?`,
    },

    confirmada: {
      /** "¿Necesitas cancelar o cambiar la hora?" */
      pregunta: `¿Necesitas cancelar o cambiar ${el(hora)}?`,
      /** "Gestiona tu cita acá" / "Gestiona tu hora acá": el enlace al que lleva. */
      enlace: `Gestiona tu ${cita.singular} acá`,
    },
  }
}

/**
 * "Avísame si se libera una hora": el botón y el formulario de la lista de
 * espera de un día sin horas libres. La reserva que se libera es la `hora`.
 */
export function frasesDeLaListaDeEspera(rubro: Rubro) {
  const { hora } = palabrasDeLaReserva(rubro)
  return {
    /** El botón y el título del formulario. */
    avisame: `Avísame si se libera ${un(hora)}`,
    /** Lo que dice al inscribirse, hasta antes del correo: "Listo. Si se libera una hora el lunes 2 de noviembre, te escribimos a". */
    listo: (dia: string): string => `Listo. Si se libera ${un(hora)} el ${dia}, te escribimos a`,
    /** La explicación bajo el título: "…para que la reserves. Avisamos a todos los que esperan: la hora es de quien reserve primero." */
    explicacion: (dia: string): string =>
      `Si alguien cancela el ${dia}, te mandamos un correo para que ${pronombreDe(hora)} reserves. Avisamos a todos los que esperan: ${el(hora)} es de quien reserve primero.`,
  }
}

/** Las frases de "Salir de la lista de espera" (el enlace del correo). */
export function frasesDeLaEspera(rubro: Rubro) {
  const { hora } = palabrasDeLaReserva(rubro)
  return {
    /** Ya salió: "…no te vamos a avisar si se libera una hora. Tus datos se borraron." */
    listo: `Ya no estás en la lista de espera y no te vamos a avisar si se libera ${un(hora)}. Tus datos se borraron.`,
    /** Antes de salir: "Si sales, no te vamos a avisar cuando se libere una hora ese día. Tus reservas no cambian." */
    confirmar: `Si sales, no te vamos a avisar cuando se libere ${un(hora)} ese día. Tus reservas no cambian.`,
  }
}

/**
 * Las frases del enlace para cancelar o cambiar la reserva: "Tu cita" y "Cita
 * cancelada" en un rubro desconocido, "Tu hora" y "Hora cancelada" en un
 * salón, "Contacta al local" / "al salón" / "a la clínica".
 */
export function frasesDeLaGestion(rubro: Rubro) {
  const { cita, local, servicioDeLaReserva: elegido } = palabrasDeLaReserva(rubro)
  const lo = pronombreDe(cita)
  /** "hasta 24 horas antes" / "hasta que llegue la hora" / "hasta la hora de la cita". */
  const plazoParaLeer = (horas: number): string =>
    horas === 0 ? hastaLaHoraDe(cita) : `hasta ${horas} ${horas === 1 ? "hora" : "horas"} antes`

  return {
    /** El antetítulo y el título de la pestaña: "Tu cita" / "Tu hora". */
    tuCita: `Tu ${cita.singular}`,
    /** Lo que lee el lector de pantalla mientras carga. */
    cargando: `Cargando tu ${cita.singular}...`,
    /** El enlace que no sirve: "El enlace no es válido, o la cita ya pasó o se canceló. Si necesitas algo, contacta directamente al local." */
    noSirve: `El enlace no es válido, o ${el(cita)} ya pasó o se canceló. Si necesitas algo, contacta directamente ${al(local)}.`,
    cancelada: {
      /** "Cita cancelada" / "Hora cancelada". */
      titulo: `${conMayuscula(cita.singular)} ${concordar("cancelado", cita)}`,
      /** "Le avisamos al local. El horario quedó libre." */
      bajada: `Le avisamos ${al(local)}. El horario quedó libre.`,
    },
    /** Después de cambiarla: "Listo: tu cita quedó el jueves 15 de octubre a las 10:00. Le avisamos al local." */
    reagendada: (dia: string, horaDelDia: string): string =>
      `Listo: tu ${cita.singular} quedó el ${dia} a las ${horaDelDia}. Le avisamos ${al(local)}.`,
    /** Ya no se puede cambiar por el enlace: "Esta cita se puede cancelar o cambiar por acá hasta 24 horas antes. Ya no se puede: …". */
    fueraDePlazo: (horas: number, nombreDelNegocio: string): string =>
      `${conMayuscula(este(cita))} se puede cancelar o cambiar por acá ${plazoParaLeer(horas)}. Ya no se puede: si necesitas cancelar${lo} o cambiar${lo}, contacta directamente a ${nombreDelNegocio}.`,
    /** El botón de cancelar: "Cancelar cita" / "Cancelar hora". */
    cancelar: `Cancelar ${cita.singular}`,
    confirmarCancelacion: {
      /** "¿Seguro que quieres cancelar tu cita?" */
      pregunta: `¿Seguro que quieres cancelar tu ${cita.singular}?`,
      /** "No, mantenerla" / "No, mantenerlo". */
      mantener: `No, mantener${lo}`,
    },
    /** Al elegir otro día: "Mismo servicio, con Carla." / "Mismo motivo." */
    mismoServicio: (conQuien: string | null): string =>
      `${conMayuscula(concordar("mismo", elegido))} ${elegido.singular}${conQuien ? `, con ${conQuien}` : ""}.`,
    /** La fila del resumen: "Servicio" / "Motivo". */
    terminoDelServicio: conMayuscula(elegido.singular),
    /**
     * Lo que se dice si el servidor no dio otro motivo (`_datos.ts`). "No se
     * pudo cargar tu cita" es también el título cuando no se pudo leer.
     */
    errores: {
      cargar: `No se pudo cargar tu ${cita.singular}`,
      cancelar: `No se pudo cancelar ${el(cita)}`,
      cambiar: `No se pudo cambiar ${el(cita)}`,
    },
  }
}

/**
 * La página pública del negocio: lo que ofrece ("Servicios" / "Prestaciones")
 * y lo que dice si todavía no ofrece nada.
 */
export function frasesDeLaPagina(rubro: Rubro) {
  const { servicio, negocio } = palabrasDeLaReserva(rubro)
  return {
    /** El título del bloque del catálogo: "Servicios" / "Prestaciones". */
    catalogo: conMayuscula(servicio.plural),
    /** "Este negocio aún no tiene servicios disponibles para reservar." / "Esta clínica aún no tiene prestaciones…". */
    sinServicios: `${conMayuscula(este(negocio))} aún no tiene ${servicio.plural} ${concordar("disponible", servicio, "plural")} para reservar.`,
  }
}

/**
 * La imagen para compartir el enlace: "Reserva tu hora en línea". `alt` de la
 * imagen es una constante de Next y no puede leer el rubro: queda con la
 * palabra que hoy usan todos.
 */
export function lineaDeLaImagen(rubro: Rubro): string {
  return `${tituloDeLaReserva(rubro)} en línea`
}

/**
 * La fila virtual (sólo salón, barbería y salón de uñas): "El local no está
 * atendiendo" en un rubro desconocido, "El salón no está atendiendo" en los
 * demás. "Turno" y la fila misma no cambian.
 */
export function frasesDeLaFila(rubro: Rubro) {
  const { local } = palabrasDeLaReserva(rubro)
  return {
    /** Fuera del horario: "El local no está atendiendo en este momento. La fila se abre en su horario de atención." */
    cerrado: `${conMayuscula(el(local))} no está atendiendo en este momento. La fila se abre en su horario de atención.`,
    /** Un turno que ya no está: "Saliste de la fila o el local cerró tu turno. Si quieres, vuelve a anotarte." */
    fuera: `Saliste de la fila o ${el(local)} cerró tu turno. Si quieres, vuelve a anotarte.`,
  }
}
