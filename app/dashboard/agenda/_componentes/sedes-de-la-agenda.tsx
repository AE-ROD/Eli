"use client"

import { createContext, useContext, type ReactNode } from "react"
import { SIN_SEDES, type SedesDeLaAgenda } from "../_sedes"

/**
 * Las sedes del negocio de la sesión y el modo en que está (`una` o `varias`),
 * para toda la agenda (etapa 9, plan Independiente). Las lee el layout de la
 * agenda en el servidor, con el `businessId` de la sesión, y llegan por
 * contexto: la pantalla no compara planes ni roles. Sin proveedor, sin sedes:
 * la agenda de siempre, igual que la zona horaria sin el suyo.
 */
const SedesDeLaAgendaContexto = createContext<SedesDeLaAgenda>(SIN_SEDES)

export function useSedesDeLaAgenda(): SedesDeLaAgenda {
  return useContext(SedesDeLaAgendaContexto)
}

export function ProveedorDeSedes({ sedes, children }: { sedes: SedesDeLaAgenda; children: ReactNode }) {
  return <SedesDeLaAgendaContexto.Provider value={sedes}>{children}</SedesDeLaAgendaContexto.Provider>
}
