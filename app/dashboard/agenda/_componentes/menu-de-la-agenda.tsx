"use client"

import { useEffect, useId, useRef, useState, type ReactNode } from "react"
import { MoreHorizontal } from "lucide-react"
import { cn } from "@/lib/utils"

export interface OpcionDelMenu {
  texto: string
  icono?: ReactNode
  onElegir: () => void
}

/**
 * El menú ⋯ de la agenda en el celular: lo que no es la acción principal
 * ("Bloquear horario") sin ocupar una fila de la pantalla. Un botón de 44 px
 * que abre una lista de opciones; Escape, tocar afuera o elegir una la cierra,
 * y el foco vuelve al botón (o va a lo que abra la opción). Con flechas se
 * pasa de una opción a otra.
 */
export function MenuDeLaAgenda({ opciones, className }: { opciones: OpcionDelMenu[]; className?: string }) {
  const [abierto, setAbierto] = useState(false)
  const idDelMenu = useId()
  const boton = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLUListElement>(null)

  useEffect(() => {
    if (!abierto) return
    menu.current?.querySelector<HTMLButtonElement>("button")?.focus()
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

  const alTeclear = (evento: React.KeyboardEvent<HTMLUListElement>) => {
    const botones = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])
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
        aria-label="Más opciones de la agenda"
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-controls={abierto ? idDelMenu : undefined}
        onClick={() => setAbierto((antes) => !antes)}
        className="grid size-11 place-items-center rounded-[14px] bg-superficie text-navy squircle anillo-foco transition-colors duration-150 ease-suave hover:bg-borde"
      >
        <MoreHorizontal className="size-5" aria-hidden="true" strokeWidth={1.75} />
      </button>
      {abierto && (
        <ul
          ref={menu}
          id={idDelMenu}
          role="menu"
          aria-label="Más opciones de la agenda"
          onKeyDown={alTeclear}
          className="absolute top-full right-0 z-30 mt-2 min-w-52 rounded-[16px] bg-tarjeta p-1.5 shadow-md ring-1 ring-borde squircle"
        >
          {opciones.map((opcion) => (
            <li key={opcion.texto} role="none">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setAbierto(false)
                  // Antes de abrir lo que sigue: el diálogo que abra devuelve el foco al ⋯ al cerrarse.
                  boton.current?.focus()
                  opcion.onElegir()
                }}
                className="flex min-h-11 w-full items-center gap-3 rounded-[12px] px-3 text-left text-[15px] font-medium text-navy anillo-foco hover:bg-superficie [&_svg]:size-4 [&_svg]:shrink-0"
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
