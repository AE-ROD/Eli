"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"
import { ANILLO_DE_FOCO } from "@/components/panel/estilos"
import { cn } from "@/lib/utils"

const BOTON_DE_PAGINA =
  "inline-flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"

interface PaginadorProps {
  /** Qué se pagina, para el nombre de la navegación: "Páginas del historial". */
  nombre: string
  pagina: number
  paginas: number
  /** Mientras llega otra página: los botones esperan. */
  actualizando: boolean
  onPagina: (pagina: number) => void
}

/** Anterior y siguiente, con la página actual en el medio. Sin nada que paginar no se dibuja. */
export function Paginador({ nombre, pagina, paginas, actualizando, onPagina }: PaginadorProps) {
  if (paginas <= 1) return null

  return (
    <nav aria-label={nombre} className="flex items-center justify-between gap-3 p-4 border-t border-border/50">
      <button
        type="button"
        onClick={() => onPagina(pagina - 1)}
        disabled={pagina <= 1 || actualizando}
        className={cn(BOTON_DE_PAGINA, ANILLO_DE_FOCO)}
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        Anterior
      </button>
      <p className="text-sm text-muted-foreground" aria-live="polite">
        Página {pagina} de {paginas}
      </p>
      <button
        type="button"
        onClick={() => onPagina(pagina + 1)}
        disabled={pagina >= paginas || actualizando}
        className={cn(BOTON_DE_PAGINA, ANILLO_DE_FOCO)}
      >
        Siguiente
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </button>
    </nav>
  )
}
