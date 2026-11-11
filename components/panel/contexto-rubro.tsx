"use client"

import { createContext, useContext, type ReactNode } from "react"
import { useSession } from "next-auth/react"

/**
 * El rubro del negocio de la sesión (`Business.type`, `lib/rubros.ts`) para
 * las piezas de cliente del panel: con él la barra superior y cada pantalla
 * eligen sus palabras (`lib/vocabulario.ts`). Qué se muestra lo sigue
 * decidiendo `lib/permisos.ts`.
 *
 * Lo pone el layout del panel, en el servidor, con el rubro del actor. Así la
 * primera pintura ya dice "Pacientes" en una clínica: con la sesión del
 * navegador (`useSession`), que llega después, el antetítulo decía "Clientes"
 * un instante. Sin proveedor (`undefined`), el de la sesión.
 */
const RubroDelPanel = createContext<string | null | undefined>(undefined)

export function ProveedorDeRubro({ rubro, children }: { rubro: string | null; children: ReactNode }) {
  return <RubroDelPanel.Provider value={rubro}>{children}</RubroDelPanel.Provider>
}

/** El rubro del negocio de la sesión, o `null` si no se sabe (una sesión de antes del rubro). */
export function useRubroDelPanel(): string | null {
  const delLayout = useContext(RubroDelPanel)
  const { data: sesion } = useSession()
  return delLayout !== undefined ? delLayout : (sesion?.user?.rubro ?? null)
}
