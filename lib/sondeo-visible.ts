/**
 * Un sondeo (pedir algo cada cierto tiempo) que sólo corre con la pestaña a la
 * vista. Oculta no se pide nada: nadie está mirando, y cada pedido es una
 * consulta a la base y un descuento del tope de lecturas de la sesión. Al
 * volver a la pestaña se pide en el acto, porque lo que se vio antes ya puede
 * ser viejo.
 *
 * Es el patrón que ya usan el tablero, el inicio de la clínica y "Mi turno"
 * (`app/fila/**`), en una pieza que se puede probar sin navegador: el
 * documento llega por parámetro y sólo se usan `visibilityState` y el evento
 * `visibilitychange`.
 *
 * No hace la primera llamada: quien lo usa carga al montar (suele necesitar el
 * resultado para otras cosas) y deja el sondeo para lo que sigue.
 */

/** Lo único que el sondeo necesita del `document` del navegador. */
export interface DocumentoConVisibilidad {
  readonly visibilityState: string
  addEventListener(tipo: "visibilitychange", escucha: () => void): void
  removeEventListener(tipo: "visibilitychange", escucha: () => void): void
}

export interface OpcionesDelSondeoVisible {
  /** Lo que se hace en cada vuelta y al volver a la pestaña. */
  alTocar: () => void
  /** Cada cuántos milisegundos, con la pestaña a la vista. */
  cadaMs: number
  /** El documento; por omisión el del navegador. */
  documento?: DocumentoConVisibilidad
}

/**
 * Arranca el sondeo y devuelve la función que lo detiene (la del `return` de un
 * `useEffect`). Con la pestaña oculta la vuelta del reloj no hace nada.
 */
export function iniciarSondeoVisible({
  alTocar,
  cadaMs,
  documento = document,
}: OpcionesDelSondeoVisible): () => void {
  const tocarSiSeVe = () => {
    if (documento.visibilityState === "visible") alTocar()
  }
  const intervalo = setInterval(tocarSiSeVe, cadaMs)
  documento.addEventListener("visibilitychange", tocarSiSeVe)
  return () => {
    clearInterval(intervalo)
    documento.removeEventListener("visibilitychange", tocarSiSeVe)
  }
}
