"use client"

import { useId } from "react"
import { cn } from "@/lib/utils"

interface PropsDeInterruptor {
  etiqueta: string
  activo: boolean
  alCambiar: (activo: boolean) => void
  /** Una línea debajo de la etiqueta que explica qué cambia. */
  descripcion?: string
  /** El `id` del interruptor. Sin él, uno generado. */
  id?: string
}

/**
 * Un sí/no que se aplica al tocarlo, con `role="switch"`: el lector de
 * pantalla dice "activado" o "desactivado". Es un `<button>`, así que Espacio
 * y Enter lo cambian, y la etiqueta es un `<label>` del botón: tocarla también
 * lo cambia.
 */
export function Interruptor({ etiqueta, activo, alCambiar, descripcion, id }: PropsDeInterruptor) {
  const idGenerado = useId()
  const idDelBoton = id ?? idGenerado
  const idDeLaDescripcion = `${idDelBoton}-descripcion`

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor={idDelBoton} className="block cursor-pointer text-sm font-medium text-navy">
          {etiqueta}
        </label>
        {descripcion && (
          <p id={idDeLaDescripcion} className="mt-1 text-sm text-texto-2">
            {descripcion}
          </p>
        )}
      </div>
      <button
        id={idDelBoton}
        type="button"
        role="switch"
        aria-checked={activo}
        aria-describedby={descripcion ? idDeLaDescripcion : undefined}
        onClick={() => alCambiar(!activo)}
        className={cn(
          // 52×32 a la vista; el ::after lleva el área táctil a 60×44.
          "relative inline-flex h-8 w-13 shrink-0 cursor-pointer items-center rounded-full p-1",
          "anillo-foco transition-colors duration-150 ease-suave after:absolute after:-inset-x-1 after:-inset-y-1.5",
          activo ? "bg-navy" : "bg-texto-2"
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "size-6 rounded-full bg-white shadow-sm transition-transform duration-300 ease-suave",
            activo && "translate-x-5"
          )}
        />
      </button>
    </div>
  )
}
