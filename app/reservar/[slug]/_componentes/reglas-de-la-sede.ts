/**
 * Reglas puras de la sede en el formulario de reserva (plan Independiente, con
 * dos o más sedes activas): qué sede deja elegida la dirección, qué días ofrece
 * el calendario con ella y cómo se escribe su dirección. El servidor revalida
 * todo (`lib/sede-de-la-reserva.ts`): esto es para que la pantalla no lleve a un
 * callejón sin salida.
 */

/** Una sede, con lo que alcanza para elegirla y para saber qué días ofrece. Nada interno. */
export interface SedeParaElegir {
  id: string
  nombre: string
  direccion: string
  comuna: string
  /** Los días de la semana (0 domingo a 6 sábado) en que atiende. Vacío: aún sin horario. */
  dias: number[]
  /** Su horario por días agrupados, ya escrito: `Lun, Mié: 09:00–13:00`. */
  horario: string[]
}

/** Con la lista de sedes del negocio: si el formulario pregunta "¿Dónde?". Una sola sede no se pregunta. */
export function hayQueElegirSede(sedes: readonly unknown[]): boolean {
  return sedes.length >= 2
}

/** Si la sede se puede elegir: una sin ningún día cargado no tendría horas para ofrecer. */
export function sedeSePuedeElegir(sede: Pick<SedeParaElegir, "dias">): boolean {
  return sede.dias.length > 0
}

/**
 * El `?sede=` de la dirección, listo para usar (el "Reservar en esta sede" de la
 * mini página): el id de la sede si es una de las del negocio y se puede elegir;
 * `null` si falta, viene vacío, no es de este negocio o no tiene horario. Es lo
 * mismo que `profesionalDeLaUrl`: un id que no sirve no deja nada elegido y el
 * formulario empieza preguntando "¿Dónde?". El servidor igual lo revalida.
 */
export function sedeDeLaUrl(valor: string | null, sedes: readonly SedeParaElegir[]): string | null {
  if (valor === null || valor.trim() === "") return null
  const sede = sedes.find((candidata) => candidata.id === valor)
  return sede && sedeSePuedeElegir(sede) ? sede.id : null
}

/**
 * Los días que ofrece el calendario con esa sede: de los `dias` que ya salen de
 * lo elegido (servicios y profesional), sólo los que la sede atiende. Sin sede
 * elegida, ninguno: el calendario no se muestra antes de saber dónde.
 */
export function diasConLaSede(dias: readonly number[], sede: Pick<SedeParaElegir, "dias"> | null): number[] {
  return sede ? dias.filter((dia) => sede.dias.includes(dia)) : []
}

/**
 * Lo que pasa al elegir una sede en "¿Dónde?": si es la misma que ya estaba no
 * pasa nada (`cambia` en false); si es otra, el día y la hora elegidos se sueltan
 * (otra sede es otro horario) y se avisa (`avisa`) sólo si había algo que soltar.
 * Es lo mismo que hace el cambio de profesional con un día que ya no tiene atención.
 */
export function alElegirSede(
  actual: string | null,
  nueva: string,
  elegido: { fecha: string; hora: string }
): { cambia: boolean; avisa: boolean } {
  if (nueva === actual) return { cambia: false, avisa: false }
  return { cambia: true, avisa: elegido.fecha !== "" || elegido.hora !== "" }
}

/** "Av. Italia 1234, Providencia": la dirección con su comuna, para leer y para el evento del calendario. */
export function direccionConComuna(lugar: { direccion: string; comuna: string }): string {
  return [lugar.direccion, lugar.comuna].filter((parte) => parte.trim() !== "").join(", ")
}
