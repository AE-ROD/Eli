/**
 * Los diálogos abiertos del panel, del de abajo al de arriba. `MarcoDeModal`
 * se anota al abrirse y se borra al cerrarse (o al empezar a salir).
 *
 * Sirve para dos cosas:
 *
 * - **Uno solo atiende el teclado.** Cada diálogo escucha Escape, Tab y el
 *   foco en el documento entero. Con dos abiertos a la vez (la confirmación
 *   de cancelar encima del detalle de la cita, en el teléfono) los dos se
 *   peleaban el foco y Escape cerraba los dos. Ahora sólo actúa el de arriba.
 * - **El foco no cae al `<body>` al reemplazar un diálogo por otro.** Si lo
 *   que abrió un diálogo estaba dentro de otro que ya no está (la vista previa
 *   de la liquidación se reemplaza por su confirmación, y al volver al revés),
 *   al cerrarse el foco va adonde iría el de abajo: lo que abrió aquél.
 *
 * Es pura y genérica en el elemento (`E`) para probarla sin navegador.
 */

export interface DialogoEnLaPila<E> {
  /** Si `elemento` está adentro de este diálogo. */
  contiene: (elemento: E) => boolean
  /** Adonde va el foco cuando este diálogo se cierra. */
  destinoAlCerrar: () => E | null
}

export interface PilaDeDialogos<E> {
  /** Lo anota arriba de todo. Devuelve cómo borrarlo. */
  abrir: (dialogo: DialogoEnLaPila<E>) => () => void
  /** Si es el de arriba: el único que atiende teclas y foco. */
  esElDeArriba: (dialogo: DialogoEnLaPila<E>) => boolean
  /** El diálogo abierto más alto que contiene a `elemento`, o `null`. */
  contenedorDe: (elemento: E) => DialogoEnLaPila<E> | null
}

export function crearPilaDeDialogos<E>(): PilaDeDialogos<E> {
  const abiertos: DialogoEnLaPila<E>[] = []
  return {
    abrir(dialogo) {
      abiertos.push(dialogo)
      return () => {
        const indice = abiertos.lastIndexOf(dialogo)
        if (indice !== -1) abiertos.splice(indice, 1)
      }
    },
    esElDeArriba: (dialogo) => abiertos[abiertos.length - 1] === dialogo,
    contenedorDe(elemento) {
      for (let i = abiertos.length - 1; i >= 0; i--) if (abiertos[i].contiene(elemento)) return abiertos[i]
      return null
    },
  }
}

/**
 * Adonde va el foco al cerrar un diálogo: a lo que lo abrió, si sigue en la
 * página; si no, y lo abrió algo de adentro de otro diálogo (que ya se fue),
 * adonde iría aquél al cerrarse; si tampoco, a ninguna parte (`null`).
 */
export function destinoAlCerrar<E extends { isConnected: boolean }>(
  quienLoAbrio: E | null,
  dialogoQueLoTenia: Pick<DialogoEnLaPila<E>, "destinoAlCerrar"> | null
): E | null {
  if (quienLoAbrio?.isConnected) return quienLoAbrio
  return dialogoQueLoTenia?.destinoAlCerrar() ?? null
}
