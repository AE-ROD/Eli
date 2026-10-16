"use client"

import type { ReactNode } from "react"
import { usePathname } from "next/navigation"
import { HALO_DE_MODULO } from "@/components/comunes/colores-de-modulo"
import { useBarraLateral } from "@/components/panel/contexto-barra-lateral"
import { seccionDeLaRuta } from "@/components/panel/secciones-del-panel"
import { cn } from "@/lib/utils"

/**
 * El contenido de cada vista del panel, al lado de la barra lateral.
 *
 * En el teléfono la barra es un cajón que se abre encima, así que el contenido
 * usa todo el ancho. Desde `lg` la barra es una isla fija de 240 px (76
 * colapsada) con 24 px de margen a la izquierda, y el contenido se corre eso
 * mismo; los 24 px que la separan del contenido son el relleno de cada vista.
 *
 * El foco toma el pastel del módulo de la ruta (`halo-<módulo>`): cada página
 * lo hereda sin hacer nada, también sus modales. Inicio, chats y
 * configuración no son un módulo y quedan con el halo de siempre.
 *
 * Con el cajón abierto el contenido queda `inert`: no se enfoca ni se lee
 * detrás de la superposición, aunque el lector de pantalla no respete
 * `aria-modal`.
 */
export function ContenidoDelPanel({ children }: { children: ReactNode }) {
  const { cajonAbierto, colapsada } = useBarraLateral()
  const modulo = seccionDeLaRuta(usePathname())?.modulo

  return (
    <main inert={cajonAbierto} className={cn(colapsada ? "lg:ml-[100px]" : "lg:ml-[264px]", modulo && HALO_DE_MODULO[modulo])}>
      {children}
    </main>
  )
}
