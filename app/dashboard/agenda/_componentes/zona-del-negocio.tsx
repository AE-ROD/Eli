"use client"

import { createContext, useContext, type ReactNode } from "react"
import { ZONA_POR_DEFECTO } from "@/lib/zona-horaria"

/**
 * La zona horaria del negocio de la sesión, para toda la agenda (#99). La lee
 * el layout de la agenda en el servidor; sin proveedor, la de por defecto,
 * igual que `zonaDelNegocio` con un dato inválido.
 */
const ZonaDelNegocio = createContext<string>(ZONA_POR_DEFECTO)

export function useZonaDelNegocio(): string {
  return useContext(ZonaDelNegocio)
}

export function ProveedorDeZona({ zona, children }: { zona: string; children: ReactNode }) {
  return <ZonaDelNegocio.Provider value={zona}>{children}</ZonaDelNegocio.Provider>
}
