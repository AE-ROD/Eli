/**
 * Marcar varias filas de una lista con casillas: una por una, una categoría
 * entera o todas. Sólo lógica, sin pantalla. Nada se muta: cada función
 * devuelve un `Set` nuevo, que es lo que React necesita para volver a dibujar.
 */

/** Cuántas de las filas de un grupo están marcadas. */
export type EstadoDeLaSeleccion = "todos" | "algunos" | "ninguno"

/**
 * Si todas, algunas o ninguna de estas filas están marcadas. Un grupo sin
 * filas es `ninguno`: no hay nada que marcar, y una casilla de "todas" sobre
 * un grupo vacío no debe verse tildada.
 */
export function estadoDeLaSeleccion(seleccion: ReadonlySet<string>, ids: readonly string[]): EstadoDeLaSeleccion {
  if (ids.length === 0) return "ninguno"
  const marcadas = ids.filter((id) => seleccion.has(id)).length
  if (marcadas === 0) return "ninguno"
  return marcadas === ids.length ? "todos" : "algunos"
}

/** La selección con estas filas marcadas (`marcado`) o desmarcadas. */
export function conMarca(seleccion: ReadonlySet<string>, ids: readonly string[], marcado: boolean): Set<string> {
  const nueva = new Set(seleccion)
  for (const id of ids) {
    if (marcado) nueva.add(id)
    else nueva.delete(id)
  }
  return nueva
}

/** La selección con esta fila al revés de como estaba. */
export function alternarUna(seleccion: ReadonlySet<string>, id: string): Set<string> {
  return conMarca(seleccion, [id], !seleccion.has(id))
}

/**
 * Lo que queda marcado de las filas que se ven. Lo marcado que un filtro
 * esconde no cuenta: una acción sobre la selección no debe tocar lo que
 * nadie está viendo.
 */
export function marcadasEntre(seleccion: ReadonlySet<string>, ids: readonly string[]): string[] {
  return ids.filter((id) => seleccion.has(id))
}
