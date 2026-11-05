import type { ReactNode } from "react"
import { PieDeEli } from "@/app/reservar/[slug]/_componentes/pie-de-eli"

/**
 * El marco de las páginas públicas de la fila virtual (#85): el mismo de la
 * página de reservas, fondo crema y una columna centrada, pensado para el
 * celular. Es la página del negocio: Eli firma abajo, discreto.
 */
export function MarcoDeFila({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-dvh bg-crema halo-agenda">
      <div className="mx-auto w-full max-w-[40rem] px-4 pt-10 pb-6 md:pt-16 md:pb-10">
        {children}
        <PieDeEli />
      </div>
    </main>
  )
}
