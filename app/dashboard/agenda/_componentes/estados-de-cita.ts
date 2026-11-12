/**
 * Cómo se ve cada estado de una cita en la agenda: la insignia del detalle y
 * el bloque de la semana. Son los mismos pasteles de `TarjetaCita`
 * (`components/panel/tarjeta-cita.tsx`), así una cita se lee igual en la
 * agenda, en el inicio y en el historial de un cliente: gris la pendiente,
 * azul la confirmada, el naranja del tablero la que se está atendiendo, el
 * lima de lo cobrado la completada, el rojo de error la cancelada y un gris
 * navy la de quien no vino.
 *
 * El texto va en navy, que pasa el contraste sobre todos los pasteles, salvo
 * en la cancelada. El estado también se dice en palabras (la insignia, el
 * nombre accesible del bloque): el color solo no le dice nada a quien no lo
 * distingue. Las clases van escritas enteras para que Tailwind las encuentre.
 */

import { concordar } from "@/lib/concordancia"
import { conMayuscula, vocabularioDe, type PalabrasDelRubro } from "@/lib/vocabulario"

export interface EstiloDeEstado {
  /** El estado en palabras. */
  texto: string
  /** Fondo y texto de la insignia del detalle. */
  insignia: string
  /** Fondo, barra de la izquierda y texto del bloque en la vista semanal. */
  bloque: string
}

/** Lo que el estado necesita del vocabulario: cómo se llama la reserva y la etiqueta de quien no llegó. */
export type PalabrasDeLosEstados = Pick<PalabrasDelRubro, "cita" | "etiquetas">

const PALABRAS_NEUTRAS: PalabrasDeLosEstados = vocabularioDe(null).palabras

const CLASES = {
  pendiente: {
    insignia: "bg-borde text-navy",
    bloque: "bg-borde border-l-texto-2 text-navy",
  },
  confirmada: {
    insignia: "bg-azul-suave text-navy",
    bloque: "bg-azul-suave border-l-azul text-navy",
  },
  "en-progreso": {
    insignia: "bg-naranja-suave text-navy",
    bloque: "bg-naranja-suave border-l-naranja text-navy",
  },
  completada: {
    insignia: "bg-lima-suave text-navy",
    bloque: "bg-lima-suave border-l-lima text-navy",
  },
  cancelada: {
    insignia: "bg-error/8 text-error",
    bloque: "bg-error/6 border-l-error text-error",
  },
  "no-asistio": {
    insignia: "bg-navy/8 text-navy",
    bloque: "bg-navy/6 border-l-navy text-navy",
  },
} satisfies Record<string, Omit<EstiloDeEstado, "texto">>

type EstadoConocido = keyof typeof CLASES

function esConocido(estado: string): estado is EstadoConocido {
  return Object.hasOwn(CLASES, estado)
}

/**
 * El estado en palabras. Los participios concuerdan con la reserva ("Confirmada"
 * si es una cita o una hora, "Confirmado" si un rubro la llamara con una
 * palabra masculina) y "No vino" es la etiqueta del rubro ("No asistió" en una
 * clínica dental). Los nombres guardados en la base no cambian.
 */
function textoDelEstado(estado: EstadoConocido, { cita, etiquetas }: PalabrasDeLosEstados): string {
  switch (estado) {
    case "pendiente":
      return "Pendiente"
    case "confirmada":
      return conMayuscula(concordar("confirmado", cita))
    case "en-progreso":
      return "En progreso"
    case "completada":
      return conMayuscula(concordar("completado", cita))
    case "cancelada":
      return conMayuscula(concordar("cancelado", cita))
    case "no-asistio":
      return etiquetas.noVino
  }
}

/**
 * Una pendiente que el local tiene que confirmar o cancelar (#84): blanca con
 * borde navy, para que salte entre las pendientes grises, y dicha en palabras.
 */
const POR_CONFIRMAR: EstiloDeEstado = {
  texto: "Por confirmar",
  insignia: "bg-tarjeta text-navy ring-1 ring-inset ring-navy",
  bloque: "bg-tarjeta border-l-navy text-navy ring-1 ring-inset ring-navy",
}

/**
 * El estilo del estado de una cita. El endpoint no restringe el texto: uno
 * desconocido se pinta como pendiente, como hizo siempre la agenda. Con
 * `porConfirmar` (`estaPorConfirmar` de la cita), "Por confirmar". Las
 * palabras son las del rubro (`vocabularioDe(rubro).palabras`); sin ellas, las
 * neutras.
 */
export function estiloDeEstado(
  estado: string,
  porConfirmar = false,
  palabras: PalabrasDeLosEstados = PALABRAS_NEUTRAS
): EstiloDeEstado {
  if (porConfirmar) return POR_CONFIRMAR
  const conocido: EstadoConocido = esConocido(estado) ? estado : "pendiente"
  return { texto: textoDelEstado(conocido, palabras), ...CLASES[conocido] }
}
