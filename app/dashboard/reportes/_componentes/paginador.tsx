"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"
import { Boton } from "@/components/comunes/boton"

interface PaginadorProps {
  /** Qué se pagina, para el nombre de la navegación: "Páginas del historial". */
  nombre: string
  pagina: number
  paginas: number
  /** Mientras llega otra página: los botones esperan. */
  actualizando: boolean
  onPagina: (pagina: number) => void
}

/**
 * Anterior y siguiente, con la página actual en el medio. Sin nada que paginar
 * no se dibuja.
 *
 * Los botones no se deshabilitan mientras llega la página: un botón
 * deshabilitado pierde el foco, el navegador lo tiraba al `<body>` y quien
 * venía con teclado tenía que volver a recorrer la página desde arriba. Se
 * marcan con `aria-disabled` y un clic no pide nada: tampoco dos veces la
 * misma página. Lo mismo en la primera y la última página, para que llegar a
 * la última con "Siguiente" no deje el foco suelto.
 */
export function Paginador({ nombre, pagina, paginas, actualizando, onPagina }: PaginadorProps) {
  if (paginas <= 1) return null

  const sinAnterior = pagina <= 1 || actualizando
  const sinSiguiente = pagina >= paginas || actualizando

  return (
    <nav aria-label={nombre} className="relative flex items-center justify-between gap-3 border-t border-borde px-5 py-4 sm:px-6">
      <Boton
        variante="secundario"
        tamano="sm"
        aria-disabled={sinAnterior || undefined}
        onClick={sinAnterior ? undefined : () => onPagina(pagina - 1)}
        className="pl-2.5"
      >
        <ChevronLeft aria-hidden="true" className="size-4" strokeWidth={2} />
        Anterior
      </Boton>
      {/* En el teléfono no entra "Página" entre los dos botones: se ve "2 de 3" y se lee entero. */}
      <p className="min-w-0 text-center text-sm text-texto-2 tabular-nums" aria-live="polite">
        <span className="max-sm:sr-only">Página </span>
        {pagina} de {paginas}
      </p>
      <Boton
        variante="secundario"
        tamano="sm"
        aria-disabled={sinSiguiente || undefined}
        onClick={sinSiguiente ? undefined : () => onPagina(pagina + 1)}
        className="pr-2.5"
      >
        Siguiente
        <ChevronRight aria-hidden="true" className="size-4" strokeWidth={2} />
      </Boton>
    </nav>
  )
}
