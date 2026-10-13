"use client"

import { useId } from "react"
import type { SelectHTMLAttributes } from "react"
import { ChevronDown } from "lucide-react"
import { ErrorDeCampo } from "@/components/comunes/error-de-campo"
import {
  CLASES_DE_CAMPO,
  CLASES_DE_CAMPO_CON_ERROR,
  CLASES_DE_ETIQUETA,
} from "@/components/comunes/estilos-de-campo"
import { cn } from "@/lib/utils"

interface OpcionDeSelector {
  valor: string
  texto: string
}

type PropsDeSelector = {
  etiqueta: string
  opciones: OpcionDeSelector[]
  error?: string
} & SelectHTMLAttributes<HTMLSelectElement>

/**
 * Un `<select>` nativo con etiqueta, el mismo borde y foco que
 * `CampoFormulario` y una flecha propia. Nativo a propósito: en el teléfono
 * abre la lista del sistema, que se maneja con el pulgar y con el lector de
 * pantalla sin nada extra. Los `children`, si los hay, van antes de las
 * opciones (una opción vacía de "Elige…", por ejemplo).
 */
export function Selector({
  etiqueta,
  opciones,
  error,
  id,
  className,
  children,
  "aria-describedby": descritoPor,
  ...props
}: PropsDeSelector) {
  const idGenerado = useId()
  const idDelCampo = id ?? idGenerado
  const idDelError = `${idDelCampo}-error`

  return (
    <div className="space-y-2">
      <label htmlFor={idDelCampo} className={CLASES_DE_ETIQUETA}>
        {etiqueta}
      </label>
      <div className="relative">
        <select
          {...props}
          id={idDelCampo}
          aria-invalid={error ? true : props["aria-invalid"]}
          aria-describedby={[descritoPor, error ? idDelError : undefined].filter(Boolean).join(" ") || undefined}
          className={cn(
            "h-12 w-full cursor-pointer appearance-none pl-4 pr-11 text-base",
            CLASES_DE_CAMPO,
            error && CLASES_DE_CAMPO_CON_ERROR,
            className
          )}
        >
          {children}
          {opciones.map((opcion) => (
            <option key={opcion.valor} value={opcion.valor}>
              {opcion.texto}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute right-3.5 top-1/2 size-[18px] -translate-y-1/2 text-navy"
        />
      </div>
      {error && <ErrorDeCampo id={idDelError}>{error}</ErrorDeCampo>}
    </div>
  )
}
