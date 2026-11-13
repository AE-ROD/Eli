"use client"

import { Selector } from "@/components/comunes/selector"
import { opcionesDeSede, type SedeDeLaAgenda } from "../_sedes"

interface PropsDeSelectorDeSede {
  /** "Sede" (`frasesDeLaAgenda(...).sede.etiqueta`). */
  etiqueta: string
  /** La opción vacía, que obliga a elegir una (`frasesDeLaAgenda(...).sede.elegir`). */
  elegir: string
  /** Las sedes ACTIVAS del negocio, en el orden de la lista. */
  sedes: readonly SedeDeLaAgenda[]
  /** El id de la sede elegida; vacío, ninguna todavía. */
  value: string
  onChange: (sedeId: string) => void
  /** El id del texto que explica la sede elegida (su horario ese día), si lo hay: se lee junto al campo. */
  idDeLaAyuda?: string
}

/**
 * La sede donde se atiende la hora nueva, para el modal de nueva hora con
 * varias sedes (etapa 9, plan Independiente). Un `<select>` nativo con
 * etiqueta visible, obligatorio y sin una elegida de antemano: la opción vacía
 * está deshabilitada y el navegador no deja guardar sin elegir. Va antes de la
 * fecha y la hora, que dependen de ella.
 */
export function SelectorDeSede({ etiqueta, elegir, sedes, value, onChange, idDeLaAyuda }: PropsDeSelectorDeSede) {
  return (
    <Selector
      etiqueta={etiqueta}
      value={value}
      onChange={(evento) => onChange(evento.target.value)}
      opciones={opcionesDeSede(sedes)}
      required
      aria-describedby={idDeLaAyuda}
    >
      <option value="" disabled>
        {elegir}
      </option>
    </Selector>
  )
}
