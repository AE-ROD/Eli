/**
 * Las frases de los Reportes con las palabras del rubro (`vocabularioDe(rubro)
 * .palabras`, `lib/vocabulario.ts`) y la concordancia de `lib/concordancia.ts`:
 * "Pacientes nuevos" y "Por odontólogo" en una clínica dental, "Todas" donde un
 * salón elige entre las estilistas, "Prestaciones" donde otros dicen
 * "Servicios".
 *
 * Es lógica sin pantalla: las pantallas piden las frases con
 * `frasesDeLosReportes(palabras)` y no pegan un artículo, un participio ni una
 * terminación a ninguna palabra del vocabulario. Un rubro desconocido o `null`
 * recibe las palabras neutras, y con ellas los textos de siempre, sin un cambio.
 *
 * Cuidado con "hora": en un salón la reserva se llama "hora" y "demasiadas
 * horas o atenciones" o "minutos con horas" se leen como tiempo de reloj. Donde
 * la palabra choca con el reloj la frase dice "horas agendadas" o se escribe de
 * otra forma (`seLlamaHora`).
 *
 * Lo que NO cambia con el rubro: "Turno" (la franja del día), "Equipo",
 * "Llenar horas" (el nombre del reporte), "Atenciones" y "Comisiones".
 */

import { cantidadDe, concordar, del, el, pronombreDe } from "@/lib/concordancia"
import { conMayuscula, type PalabrasDelRubro } from "@/lib/vocabulario"
import { seLlamaHora } from "../_frases"

/**
 * La etiqueta de quien no llegó, dicha en plural: "No vino" → "No vinieron",
 * "No asistió" → "No asistieron". Sólo sabe de los dos modelos que hoy tiene el
 * vocabulario (el pretérito en -ó y el irregular "vino"); con cualquier otra
 * forma deja la etiqueta como está, que se lee igual aunque no cuente cuántos.
 */
export function noVinieron(etiqueta: string): string {
  if (etiqueta.endsWith("ió")) return `${etiqueta.slice(0, -2)}ieron`
  if (etiqueta.endsWith("vino")) return `${etiqueta.slice(0, -4)}vinieron`
  return etiqueta
}

export function frasesDeLosReportes(palabras: PalabrasDelRubro) {
  const { cliente, profesional, servicio, cita, tablero, negocio, etiquetas } = palabras
  const noVino = etiquetas.noVino.toLocaleLowerCase("es")
  // En un salón "horas" suena a reloj: "demasiadas horas", "minutos con horas".
  const citasAgendadas = seLlamaHora(cita) ? `${cita.plural} ${concordar("agendado", cita, "plural")}` : cita.plural
  // "las" / "los": el pronombre en plural de la reserva, para "sobre las que ya empezaron".
  const lasCitas = `${pronombreDe(cita)}s`
  const clientesNuevos = `${cliente.plural} ${concordar("nuevo", cliente, "plural")}`

  return {
    /** Debajo del título de la página, según la vista. */
    subtitulo: {
      /** "Ocupación del equipo, clientes nuevos y quién no vino". */
      llenarHoras: `Ocupación del equipo, ${clientesNuevos} y quién ${noVino}`,
      /** "Lo atendido y cobrado en el tablero" / "…en la sala de espera". */
      deLoCobrado: `Lo atendido y cobrado en ${el(tablero)}`,
    },

    /** Los filtros. */
    filtros: {
      /** La etiqueta del selector de quien atiende: "Profesional" / "Estilista" / "Odontólogo". */
      profesional: conMayuscula(profesional.singular),
      /** La etiqueta del selector de servicio: "Servicio" / "Prestación". */
      servicio: conMayuscula(servicio.singular),
      /** La opción que no filtra: "Todos" / "Todas", según el género de quien atiende. */
      todosLosProfesionales: conMayuscula(concordar("todo", profesional, "plural")),
      /** Lo mismo para el servicio: "Todos" / "Todas". */
      todosLosServicios: conMayuscula(concordar("todo", servicio, "plural")),
      /** Si cargar las opciones falla: "No se pudieron cargar los profesionales y servicios para filtrar". */
      noSePudieronCargar: `No se pudieron cargar ${el(profesional, "plural")} y ${servicio.plural} para filtrar`,
    },

    /**
     * Lo elegido en un filtro que ya no está en la lista, dicho dentro del
     * título de la cifra: "el profesional elegido" / "la estilista elegida".
     */
    elegido: {
      profesional: `${el(profesional)} ${concordar("elegido", profesional)}`,
      servicio: `${el(servicio)} ${concordar("elegido", servicio)}`,
    },

    /** El resumen del período y su desglose. */
    resumen: {
      porProfesional: `Por ${profesional.singular}`,
      porServicio: `Por ${servicio.singular}`,
      /** Para quien sólo ve lo suyo. */
      loQueAtendisteDeCadaServicio: `Lo que atendiste, por ${servicio.singular}`,
      sinDesglosePorMedio: `No se puede repartir por medio de pago cuando filtras por ${profesional.singular} o ${servicio.singular}.`,
      sinDesglosePorProfesional: `No se puede repartir por ${profesional.singular} cuando filtras por medio de pago.`,
      sinDesglosePorServicio: `No se puede repartir por ${servicio.singular} cuando filtras por medio de pago.`,
      /** Cuántos hizo cada uno: "1 servicio" / "3 prestaciones". */
      cuantos: (cantidad: number): string => cantidadDe(cantidad, servicio),
    },

    /** Las tablas del historial de cobros y de anuladas. */
    historial: {
      cliente: conMayuscula(cliente.singular),
      servicios: conMayuscula(servicio.plural),
      sinServicios: `Sin ${servicio.plural}`,
    },

    /** "Llenar horas": ocupación, quienes vuelven y quienes no vinieron. */
    llenarHoras: {
      /** El período no cabe de una vez. */
      demasiadas: `El período tiene ${concordar("demasiado", cita, "plural")} ${citasAgendadas} o atenciones para sumarlas de una vez: las cifras están incompletas. Acota el período.`,
      /** Por la zona horaria del lugar: "…en la zona horaria del negocio" / "…de la clínica". */
      zonaHoraria: `en la zona horaria ${del(negocio)}`,
      clientesNuevos: conMayuscula(clientesNuevos),
      clientesQueVolvieron: `${conMayuscula(cliente.plural)} que volvieron`,
      /** La cifra de la tasa de inasistencia: "No vinieron" / "No asistieron". */
      noVinieron: noVinieron(etiquetas.noVino),
      ocupacionPor: `Ocupación por ${profesional.singular}`,
      /** Qué cuenta la ocupación. */
      queCuentaLaOcupacion: `Minutos con ${citasAgendadas} dentro de su horario, sin bloqueos. Si no cargó horario propio, cuenta el ${del(negocio)}.`,
      /** Qué cuenta la inasistencia. */
      queCuentaLaInasistencia: `${conMayuscula(cita.plural)} ${concordar("marcado", cita, "plural")} como “${noVino}”, sobre ${lasCitas} que ya empezaron y no se cancelaron.`,
      /**
       * Atenciones que no se pueden contar como nuevas ni recurrentes: sin ficha.
       * Se escribe "atenciones" (la pantalla de antes decía "atenciónes", con el
       * acento del singular).
       */
      sinFicha: (cantidad: number): string =>
        ` ${cantidad === 1 ? "1 atención" : `${cantidad} atenciones`} sin ficha ${del(cliente)} no entra${cantidad === 1 ? "" : "n"} en nuevos ni recurrentes.`,
      /** Cuando no hubo ninguna reserva que ya haya pasado. */
      sinCitasPasadas: seLlamaHora(cita)
        ? "En el período no hubo horas agendadas que ya pasaran."
        : `No hubo ${cita.plural} ${concordar("pasado", cita, "plural")} en el período.`,
    },
  }
}
