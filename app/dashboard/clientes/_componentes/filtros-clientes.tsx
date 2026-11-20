"use client"

import { useId, useState } from "react"
import { AnimatePresence } from "framer-motion"
import { Check, LayoutGrid, List, Search, SlidersHorizontal, X } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { useRubroDelPanel } from "@/components/panel/contexto-rubro"
import { CAMPO, FILA_DE_LISTA } from "@/components/panel/estilos"
import { MarcoDeModal } from "@/components/panel/marco-de-modal"
import { cn } from "@/lib/utils"
import { vocabularioDe } from "@/lib/vocabulario"
import { frasesDeClientes } from "../_frases"

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
  // "Buscar pacientes" en una clínica dental.
  const { lista } = frasesDeClientes(vocabularioDe(useRubroDelPanel()).palabras)
  // En el celular las etiquetas no ocupan la pantalla: van en una hoja que abre el botón de filtros.
  const [hojaAbierta, setHojaAbierta] = useState(false)
  const conFiltro = etiquetaActiva !== "Todos"

  return (
    <>
      {/* En el celular el buscador queda pegado bajo la barra de arriba (56 px más el área segura) al bajar por la lista. */}
      <div className="space-y-3 max-lg:sticky max-lg:top-[calc(3.5rem+env(safe-area-inset-top))] max-lg:z-20 max-lg:-mx-4 max-lg:space-y-2 max-lg:bg-crema max-lg:px-4 max-lg:py-2 sm:max-lg:-mx-6 sm:max-lg:px-6">
        <div className="flex items-center gap-2 lg:gap-3">
          <div className="relative min-w-0 flex-1">
            <label htmlFor={idDelBuscador} className="sr-only">
              {lista.buscar}
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

          {/* Sólo en el celular: las etiquetas, en una hoja. Con una elegida, el botón lo dice (no sólo el punto). */}
          <button
            type="button"
            aria-haspopup="dialog"
            aria-label={conFiltro ? `Filtrar por etiqueta: ${etiquetaActiva}` : "Filtrar por etiqueta"}
            onClick={() => setHojaAbierta(true)}
            className={cn(
              "relative grid size-12 shrink-0 place-items-center rounded-[14px] squircle anillo-foco transition-colors duration-150 ease-suave lg:hidden",
              conFiltro ? "bg-navy text-white" : "bg-tarjeta text-navy shadow-sm"
            )}
          >
            <SlidersHorizontal className="size-5" aria-hidden="true" strokeWidth={1.75} />
          </button>

          {/* En el celular la lista y la cuadrícula se ven iguales, en filas: el selector aparece desde lg, donde se distinguen. */}
          <div
            role="group"
            aria-label={lista.comoVer}
            className="hidden shrink-0 gap-1 rounded-full bg-superficie p-1 lg:flex"
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

        {/* En el celular, la etiqueta elegida a la vista y fácil de quitar. */}
        {conFiltro && (
          <button
            type="button"
            onClick={() => onEtiqueta("Todos")}
            aria-label={`Quitar el filtro ${etiquetaActiva}`}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-navy pr-2.5 pl-3.5 text-sm font-medium text-white anillo-foco lg:hidden"
          >
            {etiquetaActiva}
            <X className="size-4" aria-hidden="true" strokeWidth={2} />
          </button>
        )}

        <div role="group" aria-label="Filtrar por etiqueta" className="flex flex-wrap gap-2 max-lg:hidden">
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

      {/* Fuera de la franja pegada: su z-20 dejaría la hoja debajo de la barra inferior. */}
      <AnimatePresence>
        {hojaAbierta && (
          <MarcoDeModal
            titulo="Filtrar por etiqueta"
            alCerrar={() => setHojaAbierta(false)}
            pie={
              <Boton type="button" className="w-full" onClick={() => setHojaAbierta(false)}>
                Listo
              </Boton>
            }
          >
            <div role="group" aria-label="Etiquetas" className="-mx-1 divide-y divide-borde">
              {ETIQUETAS.map((etiqueta) => {
                const activa = etiquetaActiva === etiqueta
                return (
                  <button
                    key={etiqueta}
                    type="button"
                    aria-pressed={activa}
                    onClick={() => onEtiqueta(etiqueta)}
                    className={cn(FILA_DE_LISTA, "w-full rounded-[12px] text-left text-navy anillo-foco", activa && "font-semibold")}
                  >
                    <span className="flex-1">{etiqueta}</span>
                    {activa && <Check className="size-5 shrink-0" aria-hidden="true" strokeWidth={2} />}
                  </button>
                )
              })}
            </div>
          </MarcoDeModal>
        )}
      </AnimatePresence>
    </>
  )
}
