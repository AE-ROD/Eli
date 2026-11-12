import { concordar, el } from "@/lib/concordancia"
import { esRubroDental } from "@/lib/rubros"
import { vocabularioDe, type Sustantivo } from "@/lib/vocabulario"

/**
 * Las palabras de la reserva pública y de todo lo que lee quien reserva: la
 * página del negocio, el formulario, el enlace para cancelar o cambiar, la
 * lista de espera y la fila virtual. Sale de `vocabularioDe(rubro).palabras`
 * (`lib/vocabulario.ts`) y se usa con `lib/concordancia.ts`, como los correos
 * (`lib/email.ts`, `palabrasDelCorreo`): una clínica dental lee "motivo" y "a la
 * clínica"; un salón, "estilista" y "al salón".
 *
 * Es lógica sin pantalla ni base: recibe el rubro (`Business.type`, que sale
 * del `slug` en el servidor, nunca de datos del navegador) y devuelve palabras.
 * Un rubro desconocido, `null` o ausente (los viejos `salud`, `fitness` y
 * `otro`) deja la reserva con los textos de siempre, sin un cambio.
 *
 * Cuidado con "hora": en un salón, una barbería, un salón de uñas y una
 * clínica la reserva se llama "hora", y también es la hora del reloj ("a las
 * 10:00"). Las frases que mezclan las dos se escriben de otra forma
 * (`hastaLaHoraDe`), y "la hora" como reloj no se migra.
 */

const PALABRAS_NEUTRAS = vocabularioDe(null).palabras

/**
 * La reserva como la decían las pantallas de siempre donde se dice "hora"
 * ("Reserva tu hora", "Avísame si se libera una hora"): los textos de antes
 * del vocabulario decían "hora" aunque el vocabulario neutro diga "cita".
 */
const HORA: Sustantivo = { singular: "hora", plural: "horas", genero: "f" }

/** El negocio como lugar al que se va, en los textos de siempre: "el local". */
const LOCAL: Sustantivo = { singular: "local", plural: "locales", genero: "m" }

/** Quien atiende, en los textos de siempre: "la misma persona". */
const PERSONA: Sustantivo = { singular: "persona", plural: "personas", genero: "f" }

export interface PalabrasDeLaReserva {
  /**
   * La reserva donde las pantallas de siempre dicen "cita" ("Gestiona tu cita
   * acá", "Tu cita"): `citaParaElCliente`, "hora" en un rubro con palabras
   * propias y "cita" en uno desconocido.
   */
  cita: Sustantivo
  /**
   * La reserva donde las pantallas de siempre dicen "hora" ("Reserva tu hora",
   * "se libera una hora"): "hora" en todos, también en un rubro desconocido.
   */
  hora: Sustantivo
  /** Lo que elige quien reserva: servicio / motivo. */
  servicioDeLaReserva: Sustantivo
  /** Lo que ofrece el negocio y se cobra, en su catálogo: servicio / prestación. */
  servicio: Sustantivo
  /** Quien atiende: estilista / barbero / manicurista / odontólogo / profesional. */
  profesional: Sustantivo
  /**
   * Quien atiende donde las pantallas de siempre dicen "persona" ("te los hace
   * la misma persona"): "persona" en un rubro desconocido y el profesional en
   * uno con palabras propias.
   */
  quienAtiende: Sustantivo
  /** El negocio: salón / barbería / salón de uñas / clínica / negocio. */
  negocio: Sustantivo
  /** El negocio como lugar: "el salón", "la clínica", y "el local" si el rubro no tiene palabras propias. */
  local: Sustantivo
  /** La primera visita: primera vez / primera consulta. */
  primeraVez: Sustantivo
  /** Si el rubro tiene palabras propias (no es uno desconocido). */
  conPalabrasPropias: boolean
  /** Clínica dental: motivo, primera consulta y urgencias. */
  clinicaDental: boolean
}

/** Las palabras de la reserva del rubro; un rubro desconocido, `null` o ausente recibe las de siempre. */
export function palabrasDeLaReserva(rubro: string | null | undefined): PalabrasDeLaReserva {
  const palabras = vocabularioDe(rubro).palabras
  const conPalabrasPropias = palabras.negocio.singular !== PALABRAS_NEUTRAS.negocio.singular
  return {
    cita: palabras.citaParaElCliente,
    hora: conPalabrasPropias ? palabras.citaParaElCliente : HORA,
    servicioDeLaReserva: palabras.servicioDeLaReserva,
    servicio: palabras.servicio,
    profesional: palabras.profesional,
    quienAtiende: conPalabrasPropias ? palabras.profesional : PERSONA,
    negocio: palabras.negocio,
    local: conPalabrasPropias ? palabras.negocio : LOCAL,
    primeraVez: palabras.primeraVez,
    conPalabrasPropias,
    clinicaDental: esRubroDental(rubro),
  }
}

/** Si la reserva se llama "hora": choca con la hora del reloj, y la frase se escribe de otra forma. */
export function seLlamaHora(cita: Sustantivo): boolean {
  return cita.singular === HORA.singular
}

/**
 * Hasta cuándo se puede cambiar una reserva sin plazo: "hasta la hora de la
 * cita", o "hasta que llegue la hora" si la reserva ya se llama hora ("la hora
 * de la hora" no se dice). Es la misma frase de los correos.
 */
export function hastaLaHoraDe(cita: Sustantivo): string {
  return seLlamaHora(cita) ? "hasta que llegue la hora" : `hasta la hora de ${el(cita)}`
}

/**
 * Lo mismo con "el momento": "hasta el momento de la cita", o "hasta que
 * llegue la hora" si la reserva se llama hora ("el momento de la hora" se lee
 * como un instante cualquiera).
 */
export function hastaElMomentoDe(cita: Sustantivo): string {
  return seLlamaHora(cita) ? "hasta que llegue la hora" : `hasta el momento de ${el(cita)}`
}

/**
 * El sustantivo con su adjetivo antepuesto y concordado ("solo" + "hora" →
 * "sola hora"), con el mismo género, para pasarlo a `un` o `el`: "una sola
 * hora". Lo mismo que hacen los correos con "una nueva hora".
 */
export function conAdjetivoAntes(adjetivo: string, sustantivo: Sustantivo): Sustantivo {
  return {
    singular: `${concordar(adjetivo, sustantivo)} ${sustantivo.singular}`,
    plural: `${concordar(adjetivo, sustantivo, "plural")} ${sustantivo.plural}`,
    genero: sustantivo.genero,
  }
}
