"use client"

import { useId } from "react"
import { LayoutGrid, List, Search } from "lucide-react"
import { CAMPO } from "@/components/panel/estilos"
import { cn } from "@/lib/utils"

const ETIQUETAS = ["Todos", "VIP", "Frecuente", "Nuevo", "Inactivo"]

const VISTAS = [
  { id: "grid", texto: "Ver en cuadrícula", icono: LayoutGrid },
  { id: "lista", texto: "Ver en lista", icono: List },
] as const

interface PropsDeFiltrosClientes {
  busqueda: string
  onBusqueda: (v: string) => void
  etiquetaActiva: string
  onEtiqueta: (v: string) => void
  vista: "grid" | "lista"
  onVista: (v: "grid" | "lista") => void
}

/**
 * La búsqueda, la vista y las etiquetas. Las etiquetas y la vista son
 * botones que dicen cuál está elegido (`aria-pressed`), con lo elegido en
 * navy. Las etiquetas bajan de renglón si no entran: con un desplazamiento
 * de costado, las del final quedaban fuera de la vista.
 */
export function FiltrosClientes({
  busqueda,
  onBusqueda,
  etiquetaActiva,
  onEtiqueta,
  vista,
  onVista,
}: PropsDeFiltrosClientes) {
  const idDelBuscador = useId()

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="relative min-w-0 flex-1">
          <label htmlFor={idDelBuscador} className="sr-only">
            Buscar clientes
          </label>
          <Search
            className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-texto-2"
            aria-hidden="true"
            strokeWidth={1.75}
          />
          {/* 16px de letra: con menos, el teléfono acerca la pantalla al tocar el campo. */}
          <input
            id={idDelBuscador}
            type="search"
            autoComplete="off"
            placeholder="Buscar por nombre, correo o teléfono"
            value={busqueda}
            onChange={(e) => onBusqueda(e.target.value)}
            className={cn(CAMPO, "h-12 pl-11 text-base")}
          />
        </div>

        {/* En el teléfono la lista y la cuadrícula se ven iguales, en una columna: el selector aparece desde md, donde se distinguen. */}
        <div
          role="group"
          aria-label="Cómo ver los clientes"
          className="hidden shrink-0 gap-1 rounded-full bg-superficie p-1 md:flex"
        >
          {VISTAS.map(({ id, texto, icono: Icono }) => (
            <button
              key={id}
              type="button"
              aria-label={texto}
              aria-pressed={vista === id}
              onClick={() => onVista(id)}
              className={cn(
                "grid size-10 place-items-center rounded-full anillo-foco transition-colors duration-150 ease-suave",
                vista === id ? "bg-navy text-white" : "text-navy hover:bg-borde"
              )}
            >
              <Icono className="size-4" aria-hidden="true" strokeWidth={1.75} />
            </button>
          ))}
        </div>
      </div>

      <div role="group" aria-label="Filtrar por etiqueta" className="flex flex-wrap gap-2">
        {ETIQUETAS.map((etiqueta) => {
          const activa = etiquetaActiva === etiqueta
          return (
            <button
              key={etiqueta}
              type="button"
              aria-pressed={activa}
              onClick={() => onEtiqueta(etiqueta)}
              className={cn(
                "inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium whitespace-nowrap anillo-foco transition-colors duration-150 ease-suave",
                activa ? "bg-navy text-white" : "bg-tarjeta text-navy shadow-sm hover:bg-superficie"
              )}
            >
              {etiqueta}
            </button>
          )
        })}
      </div>
    </div>
  )
}
