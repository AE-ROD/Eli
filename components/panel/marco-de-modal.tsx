"use client"

import { useEffect, useEffectEvent, useId, useRef, type FocusEvent, type ReactNode } from "react"
import { motion, useIsPresent } from "framer-motion"
import { X } from "lucide-react"
import { ANILLO_DE_FOCO } from "@/components/panel/estilos"
import { cn } from "@/lib/utils"

/** Lo que se puede enfocar con Tab dentro del diálogo. */
const ENFOCABLES =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** Los campos del formulario: adonde vuelve el foco si lo que lo tenía ya no se puede usar. */
const CAMPOS = 'input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled])'

/**
 * Lo que coincide con `selector`, se ve y no está deshabilitado. Lo que está
 * dentro de algo oculto no cuenta. Y `:disabled` se mira aparte: los botones
 * de framer-motion llevan `tabindex="0"` aunque estén deshabilitados, así que
 * entran por `[tabindex]`, y enfocar uno no hace nada.
 */
function visibles(nodo: HTMLElement, selector: string): HTMLElement[] {
  return Array.from(nodo.querySelectorAll<HTMLElement>(selector)).filter(
    (elemento) => !elemento.matches(":disabled") && elemento.getClientRects().length > 0
  )
}

/** Si el foco puede ir a `elemento` dentro del diálogo: sigue ahí, se ve y no está deshabilitado. */
function sePuedeEnfocar(elemento: Element | null, dentroDe: HTMLElement): elemento is HTMLElement {
  return (
    elemento instanceof HTMLElement &&
    elemento !== dentroDe &&
    dentroDe.contains(elemento) &&
    !elemento.matches(":disabled") &&
    elemento.getClientRects().length > 0
  )
}

/**
 * Lleva el foco de vuelta adentro del diálogo: a lo último que lo tuvo, si
 * todavía se puede usar; si no, al primer campo, al primer botón o, si nada
 * se puede enfocar (mientras guarda), al diálogo mismo.
 */
function volverAdentro(nodo: HTMLElement, ultimoEnfocado: HTMLElement | null) {
  const destino = [ultimoEnfocado, visibles(nodo, CAMPOS)[0], visibles(nodo, ENFOCABLES)[0]].find((candidato) =>
    sePuedeEnfocar(candidato ?? null, nodo)
  )
  ;(destino ?? nodo).focus({ preventScroll: true })
}

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
 * El marco de los modales del panel (tablero y reportes): el mismo velo y la
 * misma tarjeta que los modales de la agenda y de clientes, más lo que un
 * diálogo necesita para usarse con teclado y lector de pantalla:
 *
 * - se anuncia como diálogo, con su título;
 * - al abrirse el foco entra (al campo con `autoFocus`, o al diálogo), y al
 *   cerrarse vuelve a lo que lo abrió;
 * - el foco no sale nunca, tampoco mientras guarda: si el campo que lo tenía
 *   se deshabilita, el navegador lo tira al `<body>` y desde ahí Tab iba a lo
 *   que está detrás del velo. Se queda en el diálogo y, si guardar falla,
 *   vuelve a lo último que lo tuvo;
 * - Escape y Tab se atienden en el documento y no sólo en el diálogo: así
 *   funcionan aunque el foco haya quedado afuera;
 * - Escape, el botón de cerrar y un clic en el velo lo cierran, salvo
 *   mientras guarda.
 *
 * Mientras sale (la animación de cierre de `AnimatePresence`) sigue a la
 * vista pero ya no es el diálogo activo: no atrapa el foco ni atiende teclas,
 * para no pelearle el foco a lo que viene después (el modal siguiente, o la
 * tarjeta que se acaba de mover).
 */
export function MarcoDeModal({ titulo, descripcion, bloqueado = false, ancho = "md", alCerrar, children }: MarcoDeModalProps) {
  const idDelTitulo = useId()
  const idDeLaDescripcion = useId()
  const panel = useRef<HTMLDivElement>(null)
  const presente = useIsPresent()
  /** Lo último que tuvo el foco adentro: adonde vuelve si guardar falla. */
  const ultimoEnfocado = useRef<HTMLElement | null>(null)
  const estabaBloqueado = useRef(bloqueado)

  const cerrar = () => {
    if (!bloqueado) alCerrar()
  }
  // Con lo último de `bloqueado` y `alCerrar`, sin reinstalar los oyentes del documento.
  const cerrarConEscape = useEffectEvent(() => cerrar())

  // Mientras es el diálogo activo, Escape y Tab se atienden en el documento, y
  // lo que se enfoque afuera vuelve adentro. Va antes que el efecto que
  // devuelve el foco al cerrar: React limpia en orden, y así la trampa ya no
  // está cuando el foco vuelve a lo que abrió el diálogo (si siguiera, lo
  // traería de vuelta adentro).
  useEffect(() => {
    const nodo = panel.current
    if (!presente || !nodo) return

    const alTeclear = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") {
        if (!evento.defaultPrevented) cerrarConEscape()
        return
      }
      if (evento.key !== "Tab") return

      const enfocables = visibles(nodo, ENFOCABLES)
      const actual = document.activeElement
      if (enfocables.length === 0) {
        evento.preventDefault()
        nodo.focus()
        return
      }
      const primero = enfocables[0]
      const ultimo = enfocables[enfocables.length - 1]

      if (!nodo.contains(actual)) {
        // El foco quedó afuera (en el <body>): Tab lo trae de vuelta en vez de
        // seguir por lo que está detrás del velo.
        evento.preventDefault()
        ;(evento.shiftKey ? ultimo : primero).focus()
      } else if (evento.shiftKey && (actual === primero || actual === nodo)) {
        evento.preventDefault()
        ultimo.focus()
      } else if (!evento.shiftKey && actual === ultimo) {
        evento.preventDefault()
        primero.focus()
      }
    }

    const alEnfocarAfuera = (evento: globalThis.FocusEvent) => {
      if (evento.target instanceof Node && !nodo.contains(evento.target)) volverAdentro(nodo, ultimoEnfocado.current)
    }

    document.addEventListener("keydown", alTeclear)
    document.addEventListener("focusin", alEnfocarAfuera)
    return () => {
      document.removeEventListener("keydown", alTeclear)
      document.removeEventListener("focusin", alEnfocarAfuera)
    }
  }, [presente])

  // Al abrirse el foco entra; al cerrarse vuelve a lo que abrió el diálogo.
  useEffect(() => {
    const nodo = panel.current
    const anterior = document.activeElement instanceof HTMLElement ? document.activeElement : null
    // Si un campo ya tomó el foco con `autoFocus`, se respeta.
    if (!nodo?.contains(document.activeElement)) nodo?.focus()
    return () => {
      // Salvo que el foco ya esté en otro lado que no sea el <body>: en otro
      // diálogo (el editor de servicios se cierra para abrir el cobro) o en la
      // tarjeta que se acaba de mover. Devolvérselo a lo que abrió éste se lo
      // sacaría.
      const actual = document.activeElement
      if (!actual || actual === document.body || nodo?.contains(actual)) anterior?.focus()
    }
  }, [])

  // Mientras guarda, y cuando termina sin cerrarse (porque falló).
  useEffect(() => {
    const nodo = panel.current
    const venia = estabaBloqueado.current
    estabaBloqueado.current = bloqueado
    if (!presente || !nodo) return

    if (bloqueado) {
      // Los campos se deshabilitan y el que tenía el foco lo pierde. El
      // navegador lo saca después de dibujar: se mira en el cuadro siguiente.
      const cuadro = requestAnimationFrame(() => {
        if (!nodo.contains(document.activeElement)) nodo.focus({ preventScroll: true })
      })
      return () => cancelAnimationFrame(cuadro)
    }

    if (venia && !sePuedeEnfocar(document.activeElement, nodo)) volverAdentro(nodo, ultimoEnfocado.current)
  }, [bloqueado, presente])

  const recordarFoco = (evento: FocusEvent<HTMLDivElement>) => {
    if (evento.target !== panel.current) ultimoEnfocado.current = evento.target
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
        onFocus={recordarFoco}
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
