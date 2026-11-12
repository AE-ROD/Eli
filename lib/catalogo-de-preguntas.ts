import { articuloDe, concordar, del, el, ese, pronombreDe, un } from "@/lib/concordancia"
import {
  DIAS_DE_PRUEBA,
  DIAS_EXTRA_POR_REFERIDO,
  PERSONAS_INCLUIDAS_EQUIPO,
  PRECIO_EQUIPO,
  PRECIO_INDEPENDIENTE,
  PRECIO_PERSONA_ADICIONAL,
  formatearPesos,
} from "@/lib/precios"
import { DIAS_MAXIMOS_DE_ANTICIPACION } from "@/lib/reserva-publica"
import type { AreaDeSoporte } from "@/lib/soporte"
import { conMayuscula, vocabularioDe, type PalabrasDelRubro, type Sustantivo } from "@/lib/vocabulario"

/**
 * El catálogo de preguntas frecuentes del centro de ayuda (/dashboard/ayuda y
 * /soporte), agrupadas por las mismas áreas que una solicitud de soporte
 * (`lib/soporte.ts`). `lib/preguntas-frecuentes.ts` lo resuelve para un rubro y
 * lo busca.
 *
 * Cada pregunta es una función de las palabras del rubro (`vocabularioDe(rubro)
 * .palabras`, `lib/vocabulario.ts`): "Tablero" es "Sala de espera" en una
 * clínica dental, "cliente" es "paciente", "profesional" es "estilista" en un
 * salón. El artículo, el demostrativo, el pronombre y el adjetivo salen del
 * género y el número de la palabra (`lib/concordancia.ts`); ninguna pregunta
 * pega uno a mano. Las que no nombran nada del rubro son texto fijo. Con las
 * palabras neutras (un rubro desconocido o ninguno: la página pública
 * /soporte), cada pregunta dice exactamente lo que decía antes del vocabulario.
 *
 * Cada respuesta cuenta solo lo que el producto hace hoy (`docs/PRODUCTO.md`):
 * nada de WhatsApp, pagos en línea ni app nativa, que no existen. Cuando el
 * producto cambie, se revisan acá también. Los precios y los días se leen de
 * `lib/precios.ts` y de `lib/reserva-publica.ts`: escritos a mano quedarían
 * viejos cuando cambien.
 *
 * Lo que NO se migra, porque no es una palabra del rubro: Agenda, Reportes,
 * Equipo, "Reserva" como acto ("reservas de hoy", "la reserva queda guardada"),
 * "turno" (la franja mañana/tarde/noche), "dueño", "encargado" y "negocio".
 *
 * Cuidado con "hora": en un salón, una barbería y un salón de uñas la reserva
 * se llama "hora", y "¿Qué horas ve cada estilista?" o "sus últimas horas" se
 * leen como minutos de reloj. Donde la palabra choca con el reloj, la frase se
 * escribe de otra forma (`seLlamaHora`); la hora del reloj ("la hora de
 * inicio", "elige otra hora libre") no se toca.
 *
 * Una pregunta que explica algo que la clínica dental ya no tiene (hora valle,
 * fila virtual, propinas) se declara `sinClinica` y no se muestra ahí. Si
 * mezcla un tema que sí existe con uno que no, se escribe por rubro (con
 * `enLaClinica`) en vez de ocultarla.
 */

/** Lo que sabe una pregunta del rubro de quien la lee. */
export interface ContextoDeAyuda {
  palabras: PalabrasDelRubro
  /** El rubro es la clínica dental: para lo que se llama o funciona distinto ahí, más allá de las palabras. */
  enLaClinica: boolean
}

/** Un valor fijo, o uno que depende de las palabras del rubro. */
export type DePalabras<T> = T | ((contexto: ContextoDeAyuda) => T)

export interface PreguntaDelCatalogo {
  /** Único y estable: es el `id` del acordeón en la página. */
  id: string
  area: AreaDeSoporte
  pregunta: DePalabras<string>
  /** Párrafos de la respuesta, en el orden en que se leen. */
  respuesta: DePalabras<readonly string[]>
  /** Otras formas de decirlo que la búsqueda también encuentra ("contraseña" → "clave"). */
  palabrasClave: DePalabras<readonly string[]>
  /**
   * Si responde a un problema típico ("no aparecen horas", "no me llega el
   * correo"), no a cómo se usa algo. Son las que se sugieren en el camino
   * "Algo no funciona", antes del formulario.
   */
  paraFallas?: true
  /**
   * Lo que explica no existe en la clínica dental (hora valle, fila virtual,
   * propinas): ahí la pregunta no se muestra. En cualquier otro rubro, también
   * en uno desconocido, se muestra.
   */
  sinClinica?: true
}

// ─── Piezas ──────────────────────────────────────────────────────────────────

const PALABRAS_NEUTRAS = vocabularioDe(null).palabras

/**
 * Si la reserva se llama "hora". Choca con la hora del reloj: se evitan las
 * frases que se leerían como tiempo ("¿Qué horas ve cada estilista?"). Es la
 * misma regla de `app/dashboard/_frases.ts`.
 */
function seLlamaHora(cita: Sustantivo): boolean {
  return cita.singular === "hora"
}

/** La sección con su nombre propio, como se lee en el menú: "Tablero", "Sala de espera". */
function comoSeccion(sustantivo: Sustantivo): Sustantivo {
  return {
    ...sustantivo,
    singular: conMayuscula(sustantivo.singular),
    plural: conMayuscula(sustantivo.plural),
  }
}

/** "Nueva cita" / "Nueva hora" / "Nuevo cliente": el botón de crear, con el adjetivo concordado. */
function nuevo(sustantivo: Sustantivo): string {
  return `${conMayuscula(concordar("nuevo", sustantivo))} ${sustantivo.singular}`
}

/**
 * El negocio como lugar, para "Tu QR para el local": el rubro con palabras
 * propias lo nombra con ellas ("el salón", "la clínica") y el que no las tiene
 * sigue diciendo "local". Es la misma regla de `app/dashboard/_frases.ts`.
 */
function elLocal(palabras: PalabrasDelRubro): Sustantivo {
  const sinPalabrasPropias = palabras.negocio.singular === PALABRAS_NEUTRAS.negocio.singular
  return sinPalabrasPropias ? { singular: "local", plural: "locales", genero: "m" } : palabras.negocio
}

/** Formas sueltas que `lib/concordancia.ts` no tiene, elegidas por el género de la palabra. */
function segunElGenero(masculino: string, femenino: string): (sustantivo: Sustantivo) => string {
  return (sustantivo) => (sustantivo.genero === "f" ? femenino : masculino)
}

/** "él" / "ella": quien hace algo, cuando la palabra ya se dijo. */
const ellaOEl = segunElGenero("él", "ella")
/** "ellos" / "ellas". */
const ellasOEllos = segunElGenero("ellos", "ellas")
/** "los" / "las": el artículo plural solo, y el pronombre de varios ("asignarlas"). */
const lasOLos = segunElGenero("los", "las")

/** "del que" / "de la que": "a nombre de la estilista que eligió… o, con…, de la que estaba libre". */
function delQue(sustantivo: Sustantivo): string {
  const articulo = articuloDe(sustantivo)
  return articulo === "el" ? "del que" : `de ${articulo} que`
}

/** "o", o "u" ante una palabra que empieza con "o" o "ho": "encargado o estilista", "encargado u odontólogo". */
function oUAntesDe(siguiente: string): string {
  return /^h?o/i.test(siguiente) ? "u" : "o"
}

// ─── El catálogo ─────────────────────────────────────────────────────────────

export const CATALOGO: readonly PreguntaDelCatalogo[] = [
  // ─── Agenda ────────────────────────────────────────────────────────────────
  {
    id: "agenda-nueva-cita",
    area: "agenda",
    pregunta: ({ palabras: { cita } }) => `¿Cómo agendo ${un(cita)} desde el panel?`,
    respuesta: ({ palabras: { cliente, profesional, servicio, cita } }) => [
      `En Agenda, toca "${nuevo(cita)}". Escribe ${el(servicio)}, elige ${el(cliente)}, la fecha y la hora de inicio y de término. El dueño y el encargado eligen además ${el(profesional)} que atiende. El precio es opcional.`,
      `Las reservas que tus ${cliente.plural} hacen desde tu página pública aparecen solas en la agenda.`,
    ],
    palabrasClave: ({ palabras: { cita } }) => ["agendar", `crear ${cita.singular}`, "reservar", "turno", "hora"],
  },
  {
    id: "agenda-vistas",
    area: "agenda",
    pregunta: "¿Puedo ver la agenda por día, semana o mes?",
    respuesta: [
      "Sí. Arriba de la agenda eliges la vista Día, Semana o Mes, y con las flechas pasas al día, la semana o el mes anterior o siguiente.",
    ],
    palabrasClave: ["calendario", "vista", "semanal", "mensual", "diaria"],
  },
  {
    id: "agenda-cancelar-cita",
    area: "agenda",
    pregunta: ({ palabras: { cita } }) => `¿Cómo cancelo ${un(cita)}?`,
    respuesta: ({ palabras: { cita, tablero } }) => [
      `Abre ${el(cita)} en la agenda y toca "Cancelar ${cita.singular}". No se borra: queda en la agenda marcada como ${concordar("cancelado", cita)}.`,
      `Desde el mismo detalle puedes marcar${pronombreDe(cita)} como ${concordar("completado", cita)}. Ojo: ${un(cita)} ${concordar("marcado", cita)} como ${concordar("completado", cita)} en la agenda no suma ingresos en Reportes; lo que suma es lo que se cobra en ${el(comoSeccion(tablero))}.`,
    ],
    palabrasClave: ({ palabras: { cita } }) => [
      "anular",
      "eliminar",
      "borrar",
      concordar("cancelado", cita),
      concordar("completado", cita),
    ],
  },
  {
    id: "agenda-cambiar-hora",
    area: "agenda",
    // "¿Puedo cambiar la hora de una hora?" se lee como reloj: en un salón se pregunta por reprogramar.
    pregunta: ({ palabras: { cita } }) =>
      seLlamaHora(cita) ? `¿Puedo reprogramar ${un(cita)}?` : `¿Puedo cambiar la hora de ${un(cita)}?`,
    respuesta: ({ palabras: { cliente, profesional, cita } }) => [
      `Sí. Abre ${el(cita)} en la agenda y toca "Cambiar fecha y hora": eliges la fecha, la hora de inicio y la de término y, si eres dueño o encargado, ${el(profesional)}.`,
      `Si a esa hora ya hay algo, está bloqueada o queda fuera del horario, Eli te avisa antes de guardar y puedes confirmar igual. Tus ${cliente.plural} también pueden cambiar su hora desde el enlace de su correo de confirmación, dentro del plazo que fijes.`,
    ],
    palabrasClave: ["reprogramar", "mover", "cambiar fecha", "reagendar"],
  },
  {
    id: "agenda-profesional-ve",
    area: "agenda",
    // "¿Qué horas ve cada estilista?" se lee como reloj: en un salón se pregunta por la agenda.
    pregunta: ({ palabras: { profesional, cita } }) =>
      seLlamaHora(cita)
        ? `¿Qué agenda ve cada ${profesional.singular}?`
        : `¿Qué ${cita.plural} ve cada ${profesional.singular}?`,
    respuesta: ({ palabras: { profesional } }) => [
      `Cada ${profesional.singular} ve su propia agenda. El dueño y el encargado ven la de todo el negocio.`,
    ],
    palabrasClave: ({ palabras: { profesional, cita } }) => [
      "permisos",
      "rol",
      `ver ${cita.plural}`,
      profesional.singular,
    ],
  },
  {
    id: "agenda-no-veo-cita",
    area: "agenda",
    pregunta: ({ palabras: { cita } }) => `No veo ${un(cita)} en la agenda`,
    respuesta: ({ palabras: { cliente, profesional, cita }, enLaClinica }) => {
      // El selector de la página pública se llama distinto en la clínica.
      const cualquiera = enLaClinica ? "La primera hora disponible" : "Cualquiera disponible"
      return [
        "Revisa la vista (Día, Semana o Mes) y la fecha en que estás parado: con las flechas pasas al día, la semana o el mes anterior o siguiente.",
        `Si eres ${profesional.singular}, ves solo ${el(cita, "plural")} ${concordar("asignado", cita, "plural")} a ti. Las reservas de la página pública llegan a nombre ${del(profesional)} que eligió ${el(cliente)} o, con "${cualquiera}", ${delQue(profesional)} estaba libre. ${conMayuscula(el(cita, "plural"))} sin ${profesional.singular} (por ejemplo, ${lasOLos(cita)} de antes de que se pudiera elegir) solo ${lasOLos(cita)} ven el dueño y el encargado, que pueden asignar${lasOLos(cita)} desde el detalle ${del(cita)}.`,
      ]
    },
    palabrasClave: ({ palabras: { profesional, cita } }) => [
      "no aparece",
      "no veo",
      "falta",
      `${cita.singular} ${concordar("perdido", cita)}`,
      "reserva",
      profesional.singular,
    ],
    paraFallas: true,
  },
