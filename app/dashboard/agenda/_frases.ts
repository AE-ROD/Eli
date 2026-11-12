/**
 * Las frases de la Agenda con las palabras del rubro (`vocabularioDe(rubro)
 * .palabras`, `lib/vocabulario.ts`) y la concordancia de `lib/concordancia.ts`:
 * "Nueva hora" en un salón, "Nueva cita" en una clínica o en un negocio sin
 * rubro; "Confírmala" para una hora o una cita; "Asignar odontólogo" o
 * "Asignar estilista".
 *
 * Es lógica sin pantalla: las pantallas piden las frases con
 * `frasesDeLaAgenda(palabras)` y no pegan un artículo, un demostrativo, un
 * pronombre ni un adjetivo a ninguna palabra del vocabulario. Un rubro
 * desconocido o `null` recibe las palabras neutras, y con ellas los textos de
 * siempre, sin un cambio.
 *
 * "hora" es también la hora del reloj: "Hora inicio", "Cambiar fecha y hora" y
 * "ocupa la hora de todo el equipo" hablan del reloj y no se migran. Las
 * frases que repetirían la palabra ("la hora de la hora") se evitan.
 */

import { concordar, el, un } from "@/lib/concordancia"
import { conMayuscula, type PalabrasDelRubro } from "@/lib/vocabulario"
import { cantidadDe, nuevaCita, pronombreDe, todoElNegocio, unoDe } from "../_frases"

/** `a, b y c`. */
function enumerar(partes: string[]): string {
  if (partes.length <= 1) return partes.join("")
  return `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`
}

/** Lo que hace falta saber del buscador de la cita nueva para decir su estado. */
export interface EntradaDelBuscador {
  /** Cuántas letras se escribieron. */
  letras: number
  /** Cuántas hacen falta para buscar. */
  minimo: number
  /** Ya se eligió uno de la lista y lo escrito sigue siendo ese nombre. */
  elegido: boolean
  /** Cuántos coinciden, si la lista está a la vista; `null`, si no. */
  coincidencias: number | null
}

/** Lo que dicen los botones y el aviso de volver una reserva a "confirmada", según su estado. */
export interface FrasesDeReactivar {
  /** El botón: "Reactivar cita", "Deshacer «No vino»" o "Devolver a confirmada". */
  boton: string
  /** El botón cuando hay advertencias y el segundo envío guarda igual. */
  botonIgual: string
  /** El título de las advertencias del primer envío. */
  advertencias: string
}

export function frasesDeLaAgenda(palabras: PalabrasDelRubro) {
  const { cliente, profesional, servicio, cita, negocio, etiquetas } = palabras
  // "la" / "lo": el pronombre de la reserva ("Confírmala"), según su género.
  const laCita = pronombreDe(cita)

  return {
    /** El botón de arriba y el título del modal: "Nueva cita" / "Nueva hora". */
    nuevaCita: nuevaCita(cita),
    guardarCita: `Guardar ${cita.singular}`,
    cancelarCita: `Cancelar ${cita.singular}`,
    marcarCompletada: `Marcar ${concordar("completado", cita)}`,
    /** El título del detalle: "Detalle de cita" / "Detalle de hora". */
    detalleDeLaCita: `Detalle de ${cita.singular}`,
    /** El título de la confirmación: "¿Cancelar la cita?". */
    preguntaCancelar: `¿Cancelar ${el(cita)}?`,
    /** El botón de quien no llegó: "No vino" / "No asistió". */
    noVino: etiquetas.noVino,

    /** La línea de debajo del título: "Cargando...", "Sin citas en este período", "3 citas en este período". */
    resumenDelPeriodo: (cargando: boolean, cantidad: number): string => {
      if (cargando) return "Cargando..."
      if (cantidad === 0) return `Sin ${cita.plural} en este período`
      return `${cantidadDe(cantidad, cita)} en este período`
    },
    /** "1 cita" / "3 citas": lo que dice el día del mes y la columna de la grilla. */
    cuantasCitas: (cantidad: number): string => cantidadDe(cantidad, cita),
    /** "sin citas": para un nombre accesible. */
    sinCitas: `sin ${cita.plural}`,

    /** El aviso de la cita sin cliente elegido, con su "créalo" y la sección a donde ir. */
    elegirClienteDeLaLista: `Elige ${un(cliente)} de la lista: escribir su nombre no basta. Si no aparece, créa${pronombreDe(cliente)} primero en ${conMayuscula(cliente.plural)}.`,

    cliente: {
      /** La etiqueta del buscador: "Cliente" / "Paciente". */
      etiqueta: conMayuscula(cliente.singular),
      /** "Buscar cliente...". */
      buscar: `Buscar ${cliente.singular}...`,
      /** El nombre accesible de la lista: "Clientes que coinciden". */
      queCoinciden: `${conMayuscula(cliente.plural)} que coinciden`,
      /** Lo que dice la línea de debajo del buscador (se anuncia al cambiar). */
      estadoDelBuscador: (entrada: EntradaDelBuscador): string => {
        if (entrada.letras < entrada.minimo) return `Escribe al menos ${entrada.minimo} letras y elige de la lista.`
        if (entrada.elegido) return `${conMayuscula(cliente.singular)} ${concordar("elegido", cliente)}.`
        if (entrada.coincidencias !== null) {
          const coinciden =
            entrada.coincidencias === 1 ? `1 ${cliente.singular} coincide` : `${entrada.coincidencias} ${cliente.plural} coinciden`
          return `${coinciden}. Elige ${unoDe(cliente)} de la lista.`
        }
        return `Elige ${un(cliente)} de la lista.`
      },
      /** "El cliente escribió al reservar": el rótulo de lo que escribió quien reservó. */
      escribioAlReservar: `${conMayuscula(el(cliente))} escribió al reservar`,
    },

    profesional: {
      /** La etiqueta del selector: "Profesional" / "Estilista" / "Odontólogo". */
      etiqueta: conMayuscula(profesional.singular),
      /** "Sin estilista": el título del aviso y la marca de la cita sin asignar. */
      sin: `Sin ${profesional.singular}`,
      /** "sin estilista": lo mismo en medio de una frase, para un nombre accesible. */
      sinEnMedioDeFrase: `sin ${profesional.singular}`,
      /** "Asignar estilista": el botón y el título del modal. */
      asignar: `Asignar ${profesional.singular}`,
      /** El aviso de la cita sin profesional (#103), según quién lo lee. */
      avisoSinAsignar: (puedeAsignar: boolean): string =>
        puedeAsignar
          ? `Mientras no tenga ${profesional.singular}, en la reserva pública ocupa la hora de todo el equipo. Asígna${laCita} para liberar a los demás.`
          : `Mientras no tenga ${profesional.singular}, en la reserva pública ocupa la hora de todo el equipo. ${conMayuscula(laCita)} asigna la dueña o el encargado.`,
    },

    servicio: {
      /** "Servicio" / "Prestación": la etiqueta del campo de texto libre. */
      etiqueta: conMayuscula(servicio.singular),
      /** "Otro servicio" / "Otra prestación": cuando también se ofrece el catálogo. */
      otro: `${conMayuscula(concordar("otro", servicio))} ${servicio.singular}`,
      /** "Servicios del catálogo". */
      delCatalogo: `${conMayuscula(servicio.plural)} del catálogo`,
      /** La ayuda del catálogo cuando no se eligió nada. */
      ayudaDelCatalogo: (tope: number): string => `Elige hasta ${tope}, o escribe ${el(servicio)} abajo si no está en el catálogo.`,
    },

    /** "Cancelada por" / "Cancelada el": el rótulo concuerda con la reserva. */
    cancelada: {
      por: `${conMayuscula(concordar("cancelado", cita))} por`,
      el: `${conMayuscula(concordar("cancelado", cita))} el`,
    },

    /** El aviso de la cita por confirmar (#84), según quién lo lee. */
    avisoPorConfirmar: (puedeResolver: boolean): string =>
      puedeResolver
        ? `Este contacto faltó a ${cita.plural} anteriores. Confírma${laCita} si ${laCita} aceptas, o cancéla${laCita}: al confirmar${laCita} le avisamos por correo.`
        : `Este contacto faltó a ${cita.plural} anteriores: ${laCita} confirma o ${laCita} cancela la dueña o el encargado.`,

    /** Lo que dice el botón de reactivar y el título de las advertencias, según el estado de la reserva. */
    reactivar: (estado: string): FrasesDeReactivar => {
      const sinVenir = estado === "no-asistio"
      return {
        boton:
          estado === "cancelada"
            ? `Reactivar ${cita.singular}`
            : sinVenir
              ? `Deshacer «${etiquetas.noVino}»`
              : `Devolver a ${concordar("confirmado", cita)}`,
        botonIgual: sinVenir ? "Deshacer igual" : "Reactivar igual",
        advertencias: sinVenir ? `Al volver a confirmar${laCita}:` : `Al reactivar${laCita}:`,
      }
    },

    /** "Ese tramo se ve en gris en la agenda, y una cita encima pide confirmación." */
    descripcionDelBloqueo: `Ese tramo se ve en gris en la agenda, y ${un(cita)} encima pide confirmación.`,
    /** La opción de bloquear todo: "Todo el negocio" / "Todo el salón" / "Toda la clínica". */
    todoElNegocio: todoElNegocio(negocio),

    /** Los mensajes de error de los pedidos: dicen qué no se pudo hacer con las palabras del rubro. */
    errores: {
      cargarCitas: `No se pudieron cargar ${el(cita, "plural")}`,
      moverCita: `No se pudo mover ${el(cita)}`,
      crearCita: `No se pudo crear ${el(cita)}`,
      reactivarCita: `No se pudo reactivar ${el(cita)}`,
      asignarProfesional: `No se pudo asignar ${el(profesional)}`,
      cargarCatalogo: `No se pudo cargar el catálogo de ${servicio.plural}`,
      buscarClientes: `No se pudieron buscar ${el(cliente, "plural")}`,
    },

    /**
     * Las sedes (etapa 9, plan Independiente): sólo con varias sedes activas.
     * Con una o ninguna la agenda no las nombra.
     */
    sede: {
      /** La etiqueta del selector del modal y del dato del detalle. */
      etiqueta: "Sede",
      /** La opción vacía del selector: obliga a elegir una. */
      elegir: "Elige la sede",
      /** Dicho en un nombre accesible: "sede Centro". */
      enNombreAccesible: (nombre: string): string => `sede ${nombre}`,
      /** Debajo de la hora del modal: cuándo atiende la sede elegida el día elegido. */
      horarioEseDia: (franjas: readonly { startTime: string; endTime: string }[]): string =>
        franjas.length === 0
          ? "Esta sede no atiende ese día."
          : `Atiende ese día de ${enumerar(franjas.map((franja) => `${franja.startTime} a ${franja.endTime}`))}.`,
      /** Debajo de la hora del modal mientras no se elige sede: por qué hay que elegirla primero. */
      ayuda: "Cada sede tiene su horario: elige la sede para ver cuándo atiende.",
      /** Si el horario de la sede no cargó: no se avisa nada de horas, sólo se dice. */
      horarioNoCargo: "No se pudo cargar el horario de la sede.",
    },

    /** Clínica dental: la grilla del día. */
    grilla: {
      /** El botón de "Ver por": "Odontólogo". */
      verPorProfesional: conMayuscula(profesional.singular),
      /** Dicho en el nombre accesible de la cita: "primera vez" / "primera consulta". */
      primeraVez: palabras.primeraVez.singular,
    },
  }
}
