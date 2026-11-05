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

export interface EstiloDeEstado {
  /** El estado en palabras. */
  texto: string
  /** Fondo y texto de la insignia del detalle. */
  insignia: string
  /** Fondo, barra de la izquierda y texto del bloque en la vista semanal. */
  bloque: string
}

const ESTILOS = {
  pendiente: {
    texto: "Pendiente",
    insignia: "bg-borde text-navy",
    bloque: "bg-borde border-l-texto-2 text-navy",
  },
  confirmada: {
    texto: "Confirmada",
    insignia: "bg-azul-suave text-navy",
    bloque: "bg-azul-suave border-l-azul text-navy",
  },
  "en-progreso": {
    texto: "En progreso",
    insignia: "bg-naranja-suave text-navy",
    bloque: "bg-naranja-suave border-l-naranja text-navy",
  },
  completada: {
    texto: "Completada",
    insignia: "bg-lima-suave text-navy",
    bloque: "bg-lima-suave border-l-lima text-navy",
  },
  cancelada: {
    texto: "Cancelada",
    insignia: "bg-error/8 text-error",
    bloque: "bg-error/6 border-l-error text-error",
  },
  "no-asistio": {
    texto: "No vino",
    insignia: "bg-navy/8 text-navy",
    bloque: "bg-navy/6 border-l-navy text-navy",
  },
} satisfies Record<string, EstiloDeEstado>

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
 * `porConfirmar` (`estaPorConfirmar` de la cita), "Por confirmar".
 */
export function estiloDeEstado(estado: string, porConfirmar = false): EstiloDeEstado {
  if (porConfirmar) return POR_CONFIRMAR
  return ESTILOS[estado as keyof typeof ESTILOS] ?? ESTILOS.pendiente
}
