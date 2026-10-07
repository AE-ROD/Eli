"use client"

import type { ReactNode } from "react"
import { useBarraLateral } from "@/components/panel/contexto-barra-lateral"
import { cn } from "@/lib/utils"

/**
 * El contenido de cada vista del panel, al lado de la barra lateral.
 *
 * En el teléfono la barra es un cajón que se abre encima, así que el contenido
 * usa todo el ancho. Desde `lg` la barra está fija y el margen sigue su ancho
 * real: los mismos 260 u 80 px que anima la barra al colapsarse.
 *
 * Con el cajón abierto el contenido queda `inert`: no se enfoca ni se lee
 * detrás de la superposición, aunque el lector de pantalla no respete
 * `aria-modal`.
 */
export function ContenidoDelPanel({ children }: { children: ReactNode }) {
  const { cajonAbierto, colapsada } = useBarraLateral()

  return (
    <main
      inert={cajonAbierto}
      className={cn("transition-all duration-300", colapsada ? "lg:ml-[80px]" : "lg:ml-[260px]")}
    >
      {children}
    </main>
  )
}
