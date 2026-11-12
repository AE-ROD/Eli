/**
 * Las frases del Inicio del panel y las piezas que comparte con la Agenda, con
 * las palabras del rubro (`vocabularioDe(rubro).palabras`, `lib/vocabulario.ts`)
 * y la concordancia de `lib/concordancia.ts`: "Horas de hoy" en un salón,
 * "Citas de hoy" en una clínica o en un negocio sin rubro, "Pacientes
 * registrados" donde antes se pegaba un "registrados" a una cadena.
 *
 * Es lógica sin pantalla: las pantallas piden las frases con
 * `frasesDelInicio(palabras)` y no arman ninguna con un artículo, un
 * demostrativo o un adjetivo escritos a mano. Un rubro desconocido o `null`
 * recibe las palabras neutras, y con ellas las frases de siempre, sin un cambio.
 *
 * Cuidado con "hora": en un salón la reserva se llama "hora", y "3 horas
 * programadas" o "Horas de hoy por hora" se leen como minutos de reloj. Donde
 * la palabra choca con el reloj, la frase se escribe de otra forma
 * (`seLlamaHora`); el resto del tiempo, la reserva es un sustantivo más.
 */

import { al, concordar, del, el, type Numero } from "@/lib/concordancia"
import { conMayuscula, vocabularioDe, type PalabrasDelRubro, type Sustantivo } from "@/lib/vocabulario"

const PALABRAS_NEUTRAS = vocabularioDe(null).palabras

/**
 * Las formas sueltas que `lib/concordancia.ts` todavía no trae (el artículo, el
 * pronombre, "uno" y "todo" sin su sustantivo). Se eligen por el género de la
 * palabra y no se pegan a ninguna: si el vocabulario cambia una palabra de
 * género, la frase la sigue. Cuando `concordancia.ts` las incluya, se mudan.
 */
function segunElGenero(masculino: string, femenino: string): (sustantivo: Sustantivo) => string {
  return (sustantivo) => (sustantivo.genero === "f" ? femenino : masculino)
}

/** "el" / "la": el artículo solo, para "La próxima es…". */
export const articuloDe = segunElGenero("el", "la")
/** "lo" / "la": el pronombre de la palabra, para "Confírmala" o "créalo". */
export const pronombreDe = segunElGenero("lo", "la")
/** "uno" / "una": "Elige uno de la lista", cuando el sustantivo ya se dijo. */
export const unoDe = segunElGenero("uno", "una")
/** "todo" / "toda": "Todo el salón", "Toda la clínica". */
export const todoDe = segunElGenero("todo", "toda")

/** El número gramatical de una cantidad: 1 es singular; 0 y el resto, plural. */
export function numeroDe(cantidad: number): Numero {
  return cantidad === 1 ? "singular" : "plural"
}

/** "1 cita" / "3 citas" / "0 citas". */
export function cantidadDe(cantidad: number, sustantivo: Sustantivo): string {
  return `${cantidad} ${sustantivo[numeroDe(cantidad)]}`
}

/** La palabra del reloj: la reserva de un salón, una barbería y un salón de uñas se llama igual. */
const LA_HORA = "hora"

/**
 * Si la reserva se llama "hora". Choca con la hora del reloj: "3 horas hoy",
 * "Horas de hoy por hora" o "la hora de la hora" se leen como tiempo, no como
 * reservas. Quien la usa escribe la frase de otra manera ("3 horas agendadas
 * hoy", "Hoy, hora por hora").
 */
export function seLlamaHora(cita: Sustantivo): boolean {
  return cita.singular === LA_HORA
}

/** "Nueva cita" / "Nueva hora": el botón de arriba de la Agenda y del Inicio. */
export function nuevaCita(cita: Sustantivo): string {
  return `${conMayuscula(concordar("nuevo", cita))} ${cita.singular}`
}

/**
 * El negocio como lugar, para "el local": el rubro con palabras propias lo
 * nombra con ellas ("el salón", "la clínica") y el que no las tiene sigue
 * diciendo "local", como hablaba la interfaz antes del vocabulario.
 */
export function elLocal(palabras: PalabrasDelRubro): Sustantivo {
  const sinPalabrasPropias = palabras.negocio.singular === PALABRAS_NEUTRAS.negocio.singular
  return sinPalabrasPropias ? { singular: "local", plural: "locales", genero: "m" } : palabras.negocio
}

/** "Todo el negocio" / "Todo el salón" / "Toda la barbería": un bloqueo, o una cita, de todo el lugar. */
export function todoElNegocio(negocio: Sustantivo): string {
  return `${conMayuscula(todoDe(negocio))} ${el(negocio)}`
}

/**
 * Las frases del Inicio con las palabras del rubro. Una por pantalla o por
 * tarjeta, con el nombre de lo que dicen.
 */
export function frasesDelInicio(palabras: PalabrasDelRubro) {
  const { cliente, cita, tablero, negocio } = palabras
  const agendada = (cantidad: number) => concordar("agendado", cita, numeroDe(cantidad))
  const sinCitasParaHoy = `Sin ${cita.plural} para hoy`

  return {
    /** El botón de arriba: "Nueva cita" / "Nueva hora". */
    nuevaCita: nuevaCita(cita),

    citasDeHoy: {
      /** "Citas de hoy" / "Horas de hoy". */
      titulo: `${conMayuscula(cita.plural)} de hoy`,
      /**
       * "3 citas programadas" / "1 cita programada"; en un salón, "3
       * agendadas": "3 horas programadas" se lee como tres horas de reloj.
       */
      resumen: (cantidad: number): string =>
        seLlamaHora(cita)
          ? `${cantidad} ${agendada(cantidad)}`
          : `${cantidadDe(cantidad, cita)} ${concordar("programado", cita, numeroDe(cantidad))}`,
      sinCitas: sinCitasParaHoy,
      /** Lo que lee el lector de pantalla mientras cargan. */
      cargando: `Cargando ${cita.plural}...`,
    },

    citasPorHora: {
      /** "Citas de hoy por hora"; en un salón, "Hoy, hora por hora" ("Horas de hoy por hora" repite la palabra). */
      titulo: seLlamaHora(cita) ? "Hoy, hora por hora" : `${conMayuscula(cita.plural)} de hoy por hora`,
      sinCitas: sinCitasParaHoy,
    },

    estadisticas: {
      /** "Citas hoy"; en un salón, "Horas agendadas hoy" ("Horas hoy" junto a una cifra se lee como reloj). */
      citasHoy: seLlamaHora(cita)
        ? `${conMayuscula(cita.plural)} ${agendada(2)} hoy`
        : `${conMayuscula(cita.plural)} hoy`,
      /** "Total de clientes" / "Total de pacientes". */
      totalDeClientes: `Total de ${cliente.plural}`,
      /** "Ninguna agendada todavía." */
      ningunaAgendada: `${conMayuscula(concordar("ninguno", cita))} ${agendada(1)} todavía.`,
      /** "La próxima es el martes, 3 de noviembre a las 10:00." Recibe el día y la hora ya escritos. */
      proximaCita: (dia: string, hora: string): string =>
        `${conMayuscula(articuloDe(cita))} ${concordar("próximo", cita)} es el ${dia} a las ${hora}.`,
      /** "Se suman solos cuando alguien reserva." */
      sinClientes: `Se suman ${concordar("solo", cliente, "plural")} cuando alguien reserva.`,
      /** "ninguno nuevo" / "1 nuevo" / "3 nuevos", este mes. */
      clientesNuevos: (cantidad: number): string =>
        cantidad === 0
          ? `${conMayuscula(concordar("ninguno", cliente))} ${concordar("nuevo", cliente)} este mes.`
          : `${cantidad} ${concordar("nuevo", cliente, numeroDe(cantidad))} este mes.`,
      /** Dónde se cobra: "el tablero" / "la sala de espera" (con su artículo). */
      dondeSeCobra: el(tablero),
    },

    resumenDelNegocio: {
      /** "Resumen del negocio" / "Resumen del salón" / "Resumen de la clínica". */
      titulo: `Resumen ${del(negocio)}`,
      /** "Total clientes" / "Total pacientes". */
      totalDeClientes: `Total ${cliente.plural}`,
      /** "Clientes nuevos este mes". */
      clientesNuevosEsteMes: `${conMayuscula(cliente.plural)} ${concordar("nuevo", cliente, "plural")} este mes`,
    },

    resumenDeClientes: {
      /** "Clientes" / "Pacientes". */
      titulo: conMayuscula(cliente.plural),
      /** "Aún no tienes clientes registrados". */
      sinClientes: `Aún no tienes ${cliente.plural} ${concordar("registrado", cliente, "plural")}`,
      /** "1 cliente" / "3 clientes". */
      total: (cantidad: number): string => cantidadDe(cantidad, cliente),
      /** El enlace de la tarjeta: "Ver todos" / "Ver todas". */
      verTodos: `Ver ${concordar("todo", cliente, "plural")}`,
    },

    vistaDelProfesional: {
      /** "1 cita hoy" / "3 citas hoy"; en un salón, "3 horas agendadas hoy". */
      resumenDelDia: (cantidad: number): string =>
        seLlamaHora(cita) ? `${cantidadDe(cantidad, cita)} ${agendada(cantidad)} hoy` : `${cantidadDe(cantidad, cita)} hoy`,
      /** "Tus citas de hoy". */
      tusCitasDeHoy: `Tus ${cita.plural} de hoy`,
      sinCitas: sinCitasParaHoy,
      /** "Tampoco tienes citas agendadas para hoy." */
      tampocoTienes: `Tampoco tienes ${cita.plural} ${agendada(2)} para hoy.`,
    },

    /** "el local" (sin palabras propias) / "el salón" / "la clínica": para "Tu QR para el local". */
    tituloDelQr: `Tu QR para ${el(elLocal(palabras))}`,
  }
}

/**
 * Clínica dental: las frases del inicio de la clínica ("Sillones ahora", la
 * sala de espera y los presupuestos por responder). Es una vista de un solo
 * rubro, pero sus palabras salen del vocabulario como en el resto del panel, así
 * que "sala de espera", "paciente" y "odontólogo" tienen un solo dueño.
 */
export function frasesDelInicioDeLaClinica(palabras: PalabrasDelRubro) {
  const { cliente, profesional, cita, tablero } = palabras
  const tuyas = concordar("tuyo", cita, "plural")

  return {
    /** El subtítulo de "Sillones ahora" para el odontólogo, que sólo ve sus citas. */
    sillonesDeQuienSoloVeLoSuyo: `Tus ${cita.plural} en cada sillón. Un sillón sin ${cita.plural} ${tuyas} puede estar ocupado por ${concordar("otro", profesional)} ${profesional.singular}.`,
    /** El estado del sillón del odontólogo que no tiene citas suyas ahora. */
    sinCitasTuyasAhora: `Sin ${cita.plural} ${tuyas} ahora`,
    sinMasCitasTuyasHoy: `Sin más ${cita.plural} ${tuyas} hoy`,
    /** "Tu próxima cita, a las 10:00". */
    tuProxima: (hora: string): string => `Tu ${concordar("próximo", cita)} ${cita.singular}, a las ${hora}`,
    /** "Atrasada la de las 10:00": la siguiente ya debía haber empezado. */
    atrasada: (hora: string): string => `${conMayuscula(concordar("atrasado", cita))} ${articuloDe(cita)} de las ${hora}`,
    /** "Sin paciente". */
    sinCliente: `Sin ${cliente.singular}`,
    /** El título de la tarjeta de quienes esperan: "En sala de espera". */
    enLaSalaDeEspera: `En ${tablero.singular}`,
    /** "Ver los 8 en la sala de espera". */
    verLosQueEsperan: (cantidad: number): string => `Ver los ${cantidad} en ${el(tablero)}`,
    /** "Ir a la sala de espera". */
    irALaSalaDeEspera: `Ir ${al(tablero)}`,
    /** El texto sólo para el lector de pantalla del enlace a un presupuesto: ", abrir la ficha del paciente". */
    abrirLaFicha: `, abrir la ficha ${del(cliente)}`,
    /** "Y 3 más: están en la ficha de cada paciente." */
    estanEnLaFicha: (cantidad: number): string => `Y ${cantidad} más: están en la ficha de cada ${cliente.singular}.`,
  }
}
