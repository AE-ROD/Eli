/**
 * Las frases de las piezas que el panel comparte entre sus pantallas (la
 * tarjeta de la cita, los primeros pasos, el modal de los planes y el de
 * anular), con las palabras del rubro (`vocabularioDe(rubro).palabras`,
 * `lib/vocabulario.ts`) y la concordancia de `lib/concordancia.ts`: "No vino"
 * en un salón, "No asistió" en una clínica; "Agrega tus servicios" o "Agrega
 * tus prestaciones".
 *
 * Es lógica sin pantalla: los componentes piden las frases con
 * `frasesDelPanel(palabras)` y no pegan un artículo ni un adjetivo a ninguna
 * palabra del vocabulario. Un rubro desconocido o `null` recibe las palabras
 * neutras, y con ellas los textos de siempre, sin un cambio.
 *
 * "hora" es también la hora del reloj: donde "sus horas" se leería como
 * horario ("Ve su agenda, sus horas y lo que lleva cobrado"), la frase se
 * escribe de otra forma (`seLlamaHora`).
 */

import { seLlamaHora } from "@/app/dashboard/_frases"
import { concordar, del, el, todoDe } from "@/lib/concordancia"
import { conMayuscula, type PalabrasDelRubro } from "@/lib/vocabulario"

/** Un rol del equipo, como lo cuenta el modal de los planes: su nombre y lo que puede hacer. */
export interface RolDelPlan {
  rol: string
  texto: string
}

export function frasesDelPanel(palabras: PalabrasDelRubro) {
  const { cliente, profesional, servicio, cita, negocio, tablero, etiquetas } = palabras

  return {
    /** La tarjeta de la cita: el estado de quien no llegó y la marca de la cita sin asignar. */
    tarjetaDeCita: {
      /** "No vino" / "No asistió". */
      noVino: etiquetas.noVino,
      /** "Sin profesional" / "Sin estilista" / "Sin odontólogo". */
      sinProfesional: `Sin ${profesional.singular}`,
    },

    /** Los tres primeros pasos, con las palabras del rubro de quien reserva y de lo que se ofrece. */
    bienvenida: {
      horario: {
        titulo: "Configura tu horario",
        descripcion: `Define los días y horas en que atiendes. Así tus ${cliente.plural} solo podrán reservar en tu disponibilidad real.`,
        accion: "Ir a configuración",
      },
      servicios: {
        /** "Agrega tus servicios" / "Agrega tus prestaciones". */
        titulo: `Agrega tus ${servicio.plural}`,
        descripcion: `Crea el catálogo de ${servicio.plural} que ofreces con su duración y precio. Esto aparecerá en tu página de reservas.`,
        accion: `Agregar ${servicio.plural}`,
      },
      enlace: {
        titulo: "Comparte tu enlace",
        descripcion: `Este es tu link único de reservas. Compártelo con tus ${cliente.plural} por WhatsApp, redes sociales o donde quieras.`,
      },
    },

    /** El modal de anular un cobro o una atención. */
    anular: {
      /** El ejemplo del motivo de un cobro: "se cargó a otro cliente" / "a otra clienta". */
      ejemploDeCobro: `Ej.: se cobró de más, se cargó a ${concordar("otro", cliente)} ${cliente.singular}…`,
    },

    /** El modal de los planes: a quién llega cada uno y lo que puede hacer cada rol. */
    precios: {
      /** "Tu agenda, tu página de reservas, el tablero del día y los reportes." */
      independiente: `Tu agenda, tu página de reservas, ${el(tablero)} del día y los reportes. Todo Eli, para ti.`,
      /** "¿Sumas a alguien? Te pasas a Equipo y tu agenda, tus clientes y tu historial siguen ahí." */
      sumarAlguien: `¿Sumas a alguien? Te pasas a Equipo y tu agenda, tus ${cliente.plural} y tu historial siguen ahí.`,
      /** Lo que distingue a Independiente: varias sedes, cada una con su horario por día. */
      variasSedes: "Si trabajas en más de un lugar, agrega hasta 5 sedes, cada una con su dirección y los días y horas en que estás ahí.",
      /** Lo que distingue a Equipo: una sola sede. "Una sola sede: la dirección del salón." */
      unaSede: `Una sola sede: la dirección ${del(negocio)}.`,
      /** "Para el negocio con equipo" / "Para el salón con equipo" / "Para la clínica con equipo". */
      paraElNegocioConEquipo: `Para ${el(negocio)} con equipo`,
      /** "Tú, tu encargado y tus profesionales, cada uno con su rol." ("cada uno": el grupo mezcla géneros.) */
      equipo: `Tú, tu encargado y tus ${profesional.plural}, cada uno con su rol.`,
      /**
       * Los tres roles. Quien atiende lleva la palabra del rubro; en un salón,
       * "sus horas" se leería como horario y dice "sus horas agendadas".
       */
      roles: [
        { rol: "Dueño", texto: `Ve ${todoDe(negocio)} ${el(negocio)}. El plan y el pago son solo tuyos.` },
        {
          rol: "Encargado",
          texto: `Organiza la agenda, ${el(servicio, "plural")} y el equipo. No cuenta como persona que atiende.`,
        },
        {
          rol: conMayuscula(profesional.singular),
          texto: `Ve su agenda, ${seLlamaHora(cita) ? "sus horas agendadas" : `sus ${cita.plural}`} y lo que lleva cobrado. Siempre cuenta.`,
        },
      ] satisfies readonly RolDelPlan[],
    },
  }
}
