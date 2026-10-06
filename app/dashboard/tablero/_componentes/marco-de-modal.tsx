"use client"

import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react"
import { motion } from "framer-motion"
import { X } from "lucide-react"
import { ANILLO_DE_FOCO } from "@/components/panel/estilos"
import { cn } from "@/lib/utils"

/** Lo que se puede enfocar con Tab dentro del diálogo. */
const ENFOCABLES =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

interface MarcoDeModalProps {
  titulo: string
  /**
   * Lo que se lee después del título, también para el lector de pantalla
   * (`aria-describedby`): por qué se abrió, o qué se está por hacer.
   */
  descripcion?: ReactNode
  /** Mientras se guarda no se cierra: el pedido ya salió y su respuesta tiene que verse. */
  bloqueado?: boolean
  ancho?: "md" | "lg"
  alCerrar: () => void
  children: ReactNode
}

/**
 * El marco de los modales del tablero: el mismo velo y la misma tarjeta que
 * los modales de la agenda y de clientes, más lo que un diálogo necesita para
 * usarse con teclado y lector de pantalla:
 *
 * - se anuncia como diálogo, con su título;
 * - al abrirse el foco entra (al campo con `autoFocus`, o al diálogo), y al
 *   cerrarse vuelve a lo que lo abrió;
 * - Tab y Shift+Tab dan la vuelta adentro sin escaparse detrás del velo;
 * - Escape, el botón de cerrar y un clic en el velo lo cierran.
 */
export function MarcoDeModal({ titulo, descripcion, bloqueado = false, ancho = "md", alCerrar, children }: MarcoDeModalProps) {
  const idDelTitulo = useId()
  const idDeLaDescripcion = useId()
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const nodo = panel.current
    const anterior = document.activeElement instanceof HTMLElement ? document.activeElement : null
    // Si un campo ya tomó el foco con `autoFocus`, se respeta.
    if (!nodo?.contains(document.activeElement)) nodo?.focus()
    return () => {
      // Al cerrar, el foco vuelve a lo que abrió el diálogo. Salvo que ya esté
      // en otro diálogo: el editor de servicios se cierra para abrir el cobro,
      // y devolverle el foco a la tarjeta se lo sacaría al cobro.
      const actual = document.activeElement
      if (!actual || actual === document.body || nodo?.contains(actual)) anterior?.focus()
    }
  }, [])

  const cerrar = () => {
    if (!bloqueado) alCerrar()
  }

  function alTeclear(evento: KeyboardEvent<HTMLDivElement>) {
    if (evento.key === "Escape") {
      evento.stopPropagation()
      cerrar()
      return
    }
    if (evento.key !== "Tab" || !panel.current) return

    const enfocables = Array.from(panel.current.querySelectorAll<HTMLElement>(ENFOCABLES))
    if (enfocables.length === 0) return
    const primero = enfocables[0]
    const ultimo = enfocables[enfocables.length - 1]
    const actual = document.activeElement

    if (evento.shiftKey && (actual === primero || actual === panel.current)) {
      evento.preventDefault()
      ultimo.focus()
    } else if (!evento.shiftKey && actual === ultimo) {
      evento.preventDefault()
      primero.focus()
    }
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-foreground/20 backdrop-blur-sm" onClick={cerrar} aria-hidden="true" />
      <motion.div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idDelTitulo}
        aria-describedby={descripcion ? idDeLaDescripcion : undefined}
        tabIndex={-1}
        onKeyDown={alTeclear}
        className={cn(
          "relative bg-card rounded-xl shadow-xl w-full max-h-[90vh] overflow-y-auto p-5 sm:p-6 focus:outline-none",
          ancho === "lg" ? "max-w-2xl" : "max-w-md"
        )}
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
      >
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="min-w-0">
            <h2 id={idDelTitulo} className="text-xl font-bold text-foreground">
              {titulo}
            </h2>
            {descripcion && (
              <div id={idDeLaDescripcion} className="text-sm text-muted-foreground mt-1">
                {descripcion}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={cerrar}
            disabled={bloqueado}
            aria-label="Cerrar"
            className={cn("p-1 rounded-lg hover:bg-muted transition-colors disabled:opacity-50", ANILLO_DE_FOCO)}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  )
}
