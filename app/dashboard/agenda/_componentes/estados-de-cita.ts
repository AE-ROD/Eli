/**
 * Cómo se ve cada estado de una cita en la agenda: la insignia del detalle y
 * el bloque de la semana. Son los mismos pasteles de `TarjetaCita`
 * (`components/panel/tarjeta-cita.tsx`), así una cita se lee igual en la
 * agenda, en el inicio y en el historial de un cliente: gris la pendiente,
 * azul la confirmada, el naranja del tablero la que se está atendiendo, el
 * lima de lo cobrado la completada y el rojo de error la cancelada.
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
} satisfies Record<string, EstiloDeEstado>

/**
 * El estilo del estado de una cita. El endpoint no restringe el texto: uno
 * desconocido se pinta como pendiente, como hizo siempre la agenda.
 */
export function estiloDeEstado(estado: string): EstiloDeEstado {
  return ESTILOS[estado as keyof typeof ESTILOS] ?? ESTILOS.pendiente
}
