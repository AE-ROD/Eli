"use client"

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react"
import { MoreHorizontal } from "lucide-react"
import { cn } from "@/lib/utils"

export interface OpcionDeLaPersona {
  texto: string
  icono?: ReactNode
  onElegir: () => void
  deshabilitada?: boolean
  /** Lo que no se deshace (anular una invitación): en el rojo de error. */
  peligro?: boolean
}

/**
 * El menú ⋯ de una fila del equipo en el celular: las acciones de la persona
 * («Servicios que hace», la foto; «Reenviar» y «Anular» de una invitación)
 * sin ocupar otra fila. Desde `escritorio` no se usa: los botones van a la vista.
 *
 * Un botón de 44 px que abre la lista. Escape, tocar afuera o elegir una
 * opción la cierra y el foco vuelve al botón (o a lo que abra la opción, que
 * al cerrarse lo devuelve al ⋯). Con flechas se pasa de una opción a otra.
 */
export function MenuDeLaPersona({ etiqueta, opciones, className }: { etiqueta: string; opciones: OpcionDeLaPersona[]; className?: string }) {
  const [abierto, setAbierto] = useState(false)
  const idDelMenu = useId()
  const boton = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLUListElement>(null)

  useEffect(() => {
    if (!abierto) return
    menu.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus()
    const alTocarAfuera = (evento: PointerEvent) => {
      const objetivo = evento.target as Node
      if (!menu.current?.contains(objetivo) && !boton.current?.contains(objetivo)) setAbierto(false)
    }
    document.addEventListener("pointerdown", alTocarAfuera)
    return () => document.removeEventListener("pointerdown", alTocarAfuera)
  }, [abierto])

  const cerrar = () => {
    setAbierto(false)
    boton.current?.focus()
  }

  const alTeclear = (evento: KeyboardEvent<HTMLUListElement>) => {
    const botones = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])
    const actual = botones.indexOf(document.activeElement as HTMLButtonElement)
    if (evento.key === "Escape") {
      evento.preventDefault()
      cerrar()
    } else if (evento.key === "ArrowDown" || evento.key === "ArrowUp") {
      evento.preventDefault()
      const paso = evento.key === "ArrowDown" ? 1 : -1
      botones[(actual + paso + botones.length) % botones.length]?.focus()
    } else if (evento.key === "Tab") {
      setAbierto(false)
    }
  }

  return (
    <div className={cn("relative", className)}>
      <button
        ref={boton}
        type="button"
        aria-label={etiqueta}
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-controls={abierto ? idDelMenu : undefined}
        onClick={() => setAbierto((antes) => !antes)}
        className="grid size-11 place-items-center rounded-[14px] text-navy squircle anillo-foco transition-colors duration-150 ease-suave hover:bg-superficie"
      >
        <MoreHorizontal className="size-5" aria-hidden="true" strokeWidth={1.75} />
      </button>
      {abierto && (
        <ul
          ref={menu}
          id={idDelMenu}
          role="menu"
          aria-label={etiqueta}
          onKeyDown={alTeclear}
          className="absolute top-full right-0 z-20 mt-1 min-w-52 rounded-[16px] bg-tarjeta p-1.5 shadow-md ring-1 ring-borde squircle"
        >
          {opciones.map((opcion) => (
            <li key={opcion.texto} role="none">
              <button
                type="button"
                role="menuitem"
                disabled={opcion.deshabilitada}
                onClick={() => {
                  setAbierto(false)
                  // Antes de abrir lo que sigue: el diálogo que abra devuelve el foco al ⋯ al cerrarse.
                  boton.current?.focus()
                  opcion.onElegir()
                }}
                className={cn(
                  "flex min-h-11 w-full items-center gap-3 rounded-[12px] px-3 text-left text-[15px] font-medium anillo-foco hover:bg-superficie disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
                  opcion.peligro ? "text-error" : "text-navy"
                )}
              >
                {opcion.icono}
                {opcion.texto}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
