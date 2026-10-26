"use client"

import { useId, useRef } from "react"
import { Search, X } from "lucide-react"
import { CLASES_DE_CAMPO } from "@/components/comunes/estilos-de-campo"
import { cn } from "@/lib/utils"

interface PropsDeBuscador {
  valor: string
  alCambiar: (valor: string) => void
  /** Cuántas preguntas encuentra lo escrito: se anuncia al lector de pantalla. */
  resultados: number
  className?: string
}

/**
 * El buscador de preguntas frecuentes. Filtra mientras se escribe, así que no
 * tiene botón de buscar; Enter sólo cierra el teclado del teléfono.
 */
export function BuscadorDePreguntas({ valor, alCambiar, resultados, className }: PropsDeBuscador) {
  const idDelCampo = useId()
  const refDelCampo = useRef<HTMLInputElement>(null)
  const hayConsulta = valor.trim() !== ""

  return (
    <div className={className}>
      <label htmlFor={idDelCampo} className="sr-only">
        Buscar en las preguntas frecuentes
      </label>
      <div className="relative">
        <Search
          aria-hidden="true"
          strokeWidth={1.75}
          className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-texto-2"
        />
        <input
          ref={refDelCampo}
          id={idDelCampo}
          type="search"
          value={valor}
          onChange={(evento) => alCambiar(evento.target.value)}
          onKeyDown={(evento) => {
            if (evento.key === "Enter") {
              evento.preventDefault()
              evento.currentTarget.blur()
            }
          }}
          placeholder="Busca: contraseña, precios, cobrar…"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          className={cn(
            CLASES_DE_CAMPO,
            // Sin la X del navegador: la propia tiene 44px y el mismo trazo.
            "h-14 w-full pr-14 pl-12 text-base shadow-sm [&::-webkit-search-cancel-button]:appearance-none"
          )}
        />
        {hayConsulta && (
          <button
            type="button"
            onClick={() => {
              alCambiar("")
              // El botón desaparece: el foco vuelve al campo y no cae al <body>.
              refDelCampo.current?.focus()
            }}
            aria-label="Borrar la búsqueda"
            className="absolute top-1/2 right-1.5 grid size-11 -translate-y-1/2 place-items-center rounded-[12px] text-texto-2 squircle anillo-foco transition-colors duration-150 ease-suave hover:text-navy"
          >
            <X aria-hidden="true" className="size-5" strokeWidth={1.75} />
          </button>
        )}
      </div>
      <p role="status" className="sr-only">
        {hayConsulta
          ? resultados === 0
            ? "No encontramos preguntas con esa búsqueda"
            : `${resultados} pregunta${resultados === 1 ? "" : "s"} encontrada${resultados === 1 ? "" : "s"}`
          : ""}
      </p>
    </div>
  )
}
