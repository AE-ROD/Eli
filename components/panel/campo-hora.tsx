"use client"

import { CAMPO } from "@/components/panel/estilos"
import { HORAS_DEL_DIA, juntarHora, minutosDeLaLista, partesDeHora } from "@/lib/campo-hora"
import { cn } from "@/lib/utils"

interface PropsDeCampoHora {
  /** El de la lista de horas: el `<label htmlFor>` de afuera apunta acá. */
  id?: string
  /** El nombre para el lector de pantalla ("Lunes: desde"); cada lista suma "hora" o "minutos". */
  etiqueta: string
  /** "HH:MM", en 24 h. */
  value: string
  onChange: (valor: string) => void
  className?: string
}

/**
 * Una hora del día en 24 h con dos listas nativas, horas y minutos (#161),
 * en vez de `<input type="time">`, que el navegador dibuja con "a. m./p. m."
 * según su idioma. Nativas a propósito, como `Selector`: en el teléfono
 * abren la lista del sistema. Los minutos van de 5 en 5 (`lib/campo-hora.ts`).
 */
export function CampoHora({ id, etiqueta, value, onChange, className }: PropsDeCampoHora) {
  const { hora, minuto } = partesDeHora(value)
  const lista = cn(CAMPO, "w-auto min-w-0 flex-1 cursor-pointer px-2 text-center tabular-nums")

  return (
    <div role="group" aria-label={etiqueta} className={cn("flex items-center gap-1", className)}>
      <select
        id={id}
        aria-label={`${etiqueta}, hora`}
        value={hora}
        onChange={(evento) => onChange(juntarHora(evento.target.value, minuto))}
        className={lista}
      >
        {hora === "" && <option value="">--</option>}
        {HORAS_DEL_DIA.map((opcion) => (
          <option key={opcion} value={opcion}>
            {opcion}
          </option>
        ))}
      </select>
      <span aria-hidden="true" className="text-sm text-texto-2">
        :
      </span>
      <select
        aria-label={`${etiqueta}, minutos`}
        value={minuto}
        onChange={(evento) => onChange(juntarHora(hora, evento.target.value))}
        className={lista}
      >
        {minuto === "" && <option value="">--</option>}
        {minutosDeLaLista(minuto).map((opcion) => (
          <option key={opcion} value={opcion}>
            {opcion}
          </option>
        ))}
      </select>
    </div>
  )
}
