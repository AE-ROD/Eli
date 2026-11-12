"use client"

import { useId, type Ref } from "react"
import { Search } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { CAMPO, ETIQUETA } from "@/components/panel/estilos"
import { cn } from "@/lib/utils"
import type { EstadoDelFiltro, FiltroDeLaLista } from "@/lib/lista-de-servicios"
import type { frasesDeConfiguracion } from "../_frases"

type FrasesDeServicios = ReturnType<typeof frasesDeConfiguracion>["servicios"]

const ESTADOS: readonly EstadoDelFiltro[] = ["todos", "activos", "inactivos"]

interface PropsDeBarraDeServicios {
  frases: FrasesDeServicios
  /** Si se dibujan el buscador y el filtro de activos (más de 12 servicios). */
  conFiltros: boolean
  filtro: FiltroDeLaLista
  alCambiarFiltro: (filtro: FiltroDeLaLista) => void
  seleccionando: boolean
  alAlternarSeleccion: () => void
  /** El botón de seleccionar: quien usa la barra le devuelve el foco cuando una acción en lote cierra el modo. */
  botonDeSeleccion?: Ref<HTMLButtonElement>
}

/**
 * Lo que se hace sobre la lista entera: buscar por nombre o categoría, ver sólo
 * los activos o los inactivos, y pasar al modo de selección. El buscador y el
 * filtro sólo aparecen con una lista larga; "Seleccionar" siempre que haya
 * servicios. Los botones del filtro llevan `aria-pressed` (un grupo de botones
 * de dos estados, no pestañas: no cambian de panel, cambian lo que se ve).
 *
 */
export function BarraDeServicios({ frases, conFiltros, filtro, alCambiarFiltro, seleccionando, alAlternarSeleccion, botonDeSeleccion }: PropsDeBarraDeServicios) {
  const idDelBuscador = useId()

  return (
    <div className="mt-5 flex flex-wrap items-end gap-x-4 gap-y-3">
      {conFiltros && (
        <>
          <div className="min-w-48 flex-1">
            <label htmlFor={idDelBuscador} className={ETIQUETA}>
              {frases.lista.buscar}
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-texto-2" aria-hidden="true" />
              <input
                id={idDelBuscador}
                type="search"
                value={filtro.texto}
                onChange={(evento) => alCambiarFiltro({ ...filtro, texto: evento.target.value })}
                placeholder={frases.lista.buscarAyuda}
                autoComplete="off"
                maxLength={100}
                className={cn(CAMPO, "pl-10")}
              />
            </div>
          </div>

          <div role="group" aria-label={frases.lista.mostrar} className="inline-flex max-w-full gap-1 overflow-x-auto rounded-full bg-superficie p-1">
            {ESTADOS.map((estado) => {
              const elegido = filtro.estado === estado
              return (
                <button
                  key={estado}
                  type="button"
                  aria-pressed={elegido}
                  onClick={() => alCambiarFiltro({ ...filtro, estado })}
                  className={cn(
                    "relative h-10 shrink-0 rounded-full px-4 text-sm whitespace-nowrap anillo-foco after:absolute after:inset-x-0 after:-inset-y-0.5",
                    "transition-colors duration-150 ease-suave",
                    elegido ? "bg-navy font-semibold text-white" : "font-medium text-texto-2 hover:bg-tarjeta hover:text-navy"
                  )}
                >
                  {frases.lista.estados[estado]}
                </button>
              )
            })}
          </div>
        </>
      )}

      <Boton ref={botonDeSeleccion} variante="secundario" tamano="sm" onClick={alAlternarSeleccion} className={conFiltros ? undefined : "ml-auto"}>
        {seleccionando ? frases.seleccion.salir : frases.seleccion.activar}
      </Boton>
    </div>
  )
}
