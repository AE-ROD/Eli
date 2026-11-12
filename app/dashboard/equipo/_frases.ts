/**
 * Las frases de Equipo (la lista, invitar, las prestaciones de cada integrante
 * y su foto) con las palabras del rubro (`vocabularioDe(rubro).palabras`,
 * `lib/vocabulario.ts`) y la concordancia de `lib/concordancia.ts`: "tus
 * estilistas" en un salón, "tus odontólogos" en una clínica dental; "Servicios
 * que hace" o "Prestaciones que hace".
 *
 * Es lógica sin pantalla: las pantallas piden las frases con
 * `frasesDeEquipo(palabras)` y no pegan un artículo ni un adjetivo a ninguna
 * palabra del vocabulario. Un rubro desconocido o `null` recibe las palabras
 * neutras, y con ellas los textos de siempre, sin un cambio.
 *
 * El nombre de cada rol (Encargado, Estilista…) no está acá: lo da
 * `lib/nombres-de-roles.ts`. "Equipo" y "Encargado" no cambian con el rubro.
 *
 * "hora" es también la hora del reloj: la descripción de quien atiende ("su
 * propio horario y horas") se escribe de otra forma donde la reserva se llama
 * hora (`seLlamaHora`, de `../_frases`).
 */

import { el, todos, un } from "@/lib/concordancia"
import { conMayuscula, type PalabrasDelRubro } from "@/lib/vocabulario"
import { seLlamaHora } from "../_frases"

export function frasesDeEquipo(palabras: PalabrasDelRubro) {
  const { cliente, profesional, servicio, cita, negocio } = palabras
  const todosLosServicios = conMayuscula(todos(servicio))

  return {
    /** El subtítulo de la página: "Gestiona el equipo de tu negocio" / "de tu salón" / "de tu clínica". */
    subtitulo: `Gestiona el equipo de tu ${negocio.singular}`,

    /** La lista cuando todavía no hay nadie. */
    sinNadie: {
      titulo: "Todavía no hay nadie en tu equipo",
      /** "…para sumar a tu encargado o a tus profesionales." */
      ayuda: `Usa el botón “Invitar al equipo” para sumar a tu encargado o a tus ${profesional.plural}.`,
    },

    /** Los servicios de cada integrante. */
    servicios: {
      /** El botón de la fila y el título del grupo: "Servicios que hace" / "Prestaciones que hace". */
      queHace: `${conMayuscula(servicio.plural)} que hace`,
      /** El nombre accesible del botón de la fila. */
      queHaceDe: (nombre: string): string => `${conMayuscula(servicio.plural)} que hace ${nombre}`,
      /** El título del modal: "Servicios de Ana". */
      titulo: (nombre: string): string => `${conMayuscula(servicio.plural)} de ${nombre}`,
      /** Qué cambia para quien reserva. */
      descripcion: `En la página de reservas, tus ${cliente.plural} sólo pueden elegir a esta persona para ${el(servicio, "plural")} que hace.`,
      cargando: `Cargando ${el(servicio, "plural")}...`,
      /** La casilla de todos: "Todos los servicios" / "Todas las prestaciones". */
      todos: todosLosServicios,
      sinCatalogo: `Todavía no hay ${servicio.plural} en Configuración.`,
      /** Lo que falta si no se marcó ninguno: "Elige al menos un servicio, o marca "Todos los servicios"." */
      elegirAlMenosUno: `Elige al menos ${un(servicio)}, o marca "${todosLosServicios}".`,
      guardado: (nombre: string): string => `Se guardaron ${el(servicio, "plural")} de ${nombre}.`,
      guardar: `Guardar ${servicio.plural}`,
    },

    /** La foto de un integrante. */
    foto: {
      /** Quién la ve, según si el integrante aparece en la página de reservas. */
      descripcion: (apareceEnLaPagina: boolean): string =>
        apareceEnLaPagina
          ? `La ven tus ${cliente.plural} en la página de reservas, junto al nombre.`
          : "Se ve en la lista del equipo. En la página de reservas sólo salen quienes atienden.",
    },

    /** Lo que puede hacer cada rol al invitar. */
    roles: {
      /** Quien atiende; en un salón, "horas" se leería como horario y dice "su agenda". */
      quienAtiende: seLlamaHora(cita) ? "Gestiona su propio horario y su agenda" : `Gestiona su propio horario y ${cita.plural}`,
      /** El encargado: "…los servicios y los cobros" / "…las prestaciones y los cobros". */
      encargado: `Gestiona el equipo, la agenda, los horarios, ${el(servicio, "plural")} y los cobros. Puede invitar a otros.`,
    },

    /** Lo que dicen los pedidos al servidor cuando algo falla, con las palabras del rubro. */
    errores: {
      cargarServicios: `No se pudieron cargar ${el(servicio, "plural")}`,
      cargarServiciosDeLaPersona: `No se pudieron cargar ${el(servicio, "plural")} de esta persona`,
      guardarServicios: `No se pudieron guardar ${el(servicio, "plural")}`,
    },
  }
}
