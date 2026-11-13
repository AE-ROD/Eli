"use client"

import { BotonPrimario } from "@/components/comunes/boton-primario"
import type { frasesDeConfiguracion } from "../_frases"

type FrasesDeServicios = ReturnType<typeof frasesDeConfiguracion>["servicios"]

interface PropsDeBarraDeSeleccion {
  frases: FrasesDeServicios
  /** Cuántos de los que se ven están marcados. */
  marcados: number
  /** Cuántos se ven (los que pasan el filtro). */
  visibles: number
  alMarcarTodos: () => void
  alQuitarSeleccion: () => void
  alCambiarCategoria: () => void
  alActivar: () => void
  alDesactivar: () => void
}

/**
 * Las acciones sobre los servicios marcados: cambiar la categoría, activar o
 * desactivar. Se pegan al borde de abajo de la pantalla mientras la lista está
 * a la vista, así no hay que volver arriba después de marcar los de más abajo.
 * Sin ninguno marcado las acciones están deshabilitadas y la barra dice qué
 * hacer. El conteo es una región `status`: el lector lo lee al marcar.
 */
export function BarraDeSeleccion({ frases, marcados, visibles, alMarcarTodos, alQuitarSeleccion, alCambiarCategoria, alActivar, alDesactivar }: PropsDeBarraDeSeleccion) {
  const sinMarcar = marcados === 0
  const todosMarcados = visibles > 0 && marcados === visibles

  return (
    <div
      role="group"
      aria-label={frases.seleccion.etiquetaDeLaBarra}
      className="sticky bottom-3 z-10 mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[20px] border border-borde bg-tarjeta p-3 shadow-md squircle"
    >
      <p role="status" className="min-w-40 flex-1 text-sm font-medium">
        {sinMarcar ? frases.seleccion.ninguno : frases.seleccion.seleccionados(marcados)}
      </p>
      <BotonPrimario variante="fantasma" tamaño="sm" onClick={todosMarcados ? alQuitarSeleccion : alMarcarTodos} disabled={visibles === 0}>
        {todosMarcados ? frases.seleccion.desmarcarTodos : frases.seleccion.marcarTodos}
      </BotonPrimario>
      <BotonPrimario variante="secundario" tamaño="sm" onClick={alCambiarCategoria} disabled={sinMarcar}>
        {frases.seleccion.acciones.categoria}
      </BotonPrimario>
      <BotonPrimario variante="secundario" tamaño="sm" onClick={alActivar} disabled={sinMarcar}>
        {frases.seleccion.acciones.activar}
      </BotonPrimario>
      <BotonPrimario variante="secundario" tamaño="sm" onClick={alDesactivar} disabled={sinMarcar}>
        {frases.seleccion.acciones.desactivar}
      </BotonPrimario>
    </div>
  )
}
