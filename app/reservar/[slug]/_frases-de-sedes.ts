/**
 * Las frases de las sedes en la reserva pública (plan Independiente, con dos o
 * más sedes activas): el bloque "Dónde atiendo" de la mini página, el paso
 * "¿Dónde?" del formulario y el lugar de la cita. Sin sedes, o con una sola,
 * ninguna de estas frases aparece: la página es la de siempre.
 *
 * No llevan palabras del rubro (`palabrasDeLaReserva`): hablan del lugar ("la
 * sede") y de "el día y la hora" del reloj, que no se migra. Las que nombran
 * una sede reciben su nombre ya escrito por la dueña.
 *
 * La voz del bloque es la de la persona que atiende ("Dónde atiendo"): el
 * plan Independiente es de una sola persona, y la página habla de ella.
 */
export const FRASES_DE_LAS_SEDES = {
  /** El título del bloque de la mini página. */
  bloque: "Dónde atiendo",
  /** El título del paso 1 del formulario. */
  titulo: "¿Dónde?",
  /** Cómo se llama el paso en el indicador de pasos. */
  nombreDelPaso: "Dónde",
  /** Bajo el título del paso. */
  bajada: "Elige la sede donde quieres reservar.",
  /** El nombre del grupo de sedes para el lector de pantalla. */
  grupo: "Sedes",
  /** Una sede sin ningún día cargado: no se puede elegir. */
  sinHorario: "Todavía sin horario para reservar",
  /** El botón de cada sede en la mini página. */
  reservarAca: "Reservar en esta sede",
  /** Lo mismo para el lector de pantalla, con el nombre de la sede. */
  reservarEn: (sede: string): string => `Reservar en ${sede}`,
  /** Al cambiar de sede con un día o una hora ya elegidos: las horas son otras. */
  cambioDeSede: "Cambiaste de sede: elige de nuevo el día y la hora.",
  /** El texto para el lector de pantalla del botón "Cambiar": "Cambiar de sede: ahora en Centro". */
  cambiarDeSede: (sede: string): string => `Cambiar de sede: ahora en ${sede}`,
  /** "Cómo llegar a Centro con Google Maps" (el nombre de la sede lo distingue de las otras). */
  comoLlegar: (sede: string, mapa: "Google Maps" | "Waze"): string => `Cómo llegar a ${sede} con ${mapa}`,
  /** Al cambiar una cita que tiene sede: las horas son las de esa sede, y para otra se cancela y se reserva de nuevo. */
  reagendarEnLaSede: (sede: string): string =>
    `Sólo hay horas de ${sede}. Para cambiar de sede, cancela y reserva de nuevo.`,
  /** La fila del lugar en el resumen y en la gestión de la cita. */
  terminoDeLaSede: "Sede",
  /** La fila de la dirección de la sede. */
  terminoDeLaDireccion: "Dirección",
} as const
