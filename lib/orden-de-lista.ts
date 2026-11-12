/**
 * Ordenar una lista a mano, de a un lugar: subir o bajar un elemento. Es lo que
 * hace falta para las listas con `orden` que el dueño acomoda (las sedes), sin
 * pantalla: entra la lista tal como se ve y salen la lista nueva y los
 * elementos que cambian de `orden`, para guardar sólo esos.
 *
 * El orden que le toca a cada elemento es su posición en la lista, de 0 en
 * adelante: con órdenes repetidos o con huecos (lo que deja un alta sin
 * orden), mover uno los vuelve a numerar.
 */

/** Lo mínimo que tiene que tener un elemento para poder ordenarse. */
export interface ConOrden {
  id: string
  orden: number
}

/** Una lista movida un lugar, y qué elementos cambian de orden (`id` y el `orden` nuevo). */
export interface ListaMovida<T extends ConOrden> {
  lista: T[]
  cambios: { id: string; orden: number }[]
}

/**
 * La lista con `id` movido un lugar (`-1` sube, `1` baja). `null` si no se
 * puede mover: ya está primero o último, o no está. No toca la lista que recibe.
 */
export function moverEnLaLista<T extends ConOrden>(
  lista: readonly T[],
  id: string,
  direccion: -1 | 1
): ListaMovida<T> | null {
  const desde = lista.findIndex((elemento) => elemento.id === id)
  const hasta = desde + direccion
  if (desde === -1 || hasta < 0 || hasta >= lista.length) return null

  const reordenados = [...lista]
  ;[reordenados[desde], reordenados[hasta]] = [reordenados[hasta], reordenados[desde]]
  const cambios = reordenados.flatMap((elemento, orden) => (elemento.orden === orden ? [] : [{ id: elemento.id, orden }]))
  return { lista: reordenados.map((elemento, orden) => ({ ...elemento, orden })), cambios }
}
