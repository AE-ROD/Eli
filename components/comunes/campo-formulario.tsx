"use client"

import { forwardRef, useId, useState } from "react"
import type { InputHTMLAttributes, ReactNode } from "react"
import { Eye, EyeOff } from "lucide-react"
import { ErrorDeCampo } from "@/components/comunes/error-de-campo"
import {
  CLASES_DE_CAMPO,
  CLASES_DE_CAMPO_CON_ERROR,
  CLASES_DE_ETIQUETA,
} from "@/components/comunes/estilos-de-campo"
import { cn } from "@/lib/utils"

interface CampoFormularioProps extends InputHTMLAttributes<HTMLInputElement> {
  etiqueta: string
  error?: string
  icono?: ReactNode
}

export const CampoFormulario = forwardRef<HTMLInputElement, CampoFormularioProps>(
  ({ etiqueta, error, icono, type, className, id, ...props }, ref) => {
    const [mostrarContrasena, setMostrarContrasena] = useState(false)
    const esContrasena = type === "password"
    // La etiqueta apunta a su campo: el lector de pantalla la lee al entrar y
    // un clic en ella lleva el foco al campo. Sin `id` propio, uno generado.
    const idGenerado = useId()
    const idDelCampo = id ?? idGenerado
    const idDelError = `${idDelCampo}-error`

    return (
      <div className="space-y-2">
        <label htmlFor={idDelCampo} className={CLASES_DE_ETIQUETA}>
          {etiqueta}
        </label>
        <div className="relative">
          {icono && (
            <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-texto-2">{icono}</div>
          )}
          <input
            ref={ref}
            id={idDelCampo}
            type={esContrasena ? (mostrarContrasena ? "text" : "password") : type}
            className={cn(
              "h-12 w-full px-4 text-base",
              CLASES_DE_CAMPO,
              icono && "pl-11",
              esContrasena && "pr-12",
              error && CLASES_DE_CAMPO_CON_ERROR,
              className
            )}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? idDelError : undefined}
            {...props}
          />
          {esContrasena && (
            <button
              type="button"
              onClick={() => setMostrarContrasena(!mostrarContrasena)}
              // Sin nombre, el lector de pantalla anunciaba "botón" a secas.
              aria-label={mostrarContrasena ? "Ocultar contraseña" : "Mostrar contraseña"}
              className="absolute right-0.5 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-[12px] text-texto-2 squircle anillo-foco transition-colors duration-150 ease-suave hover:text-navy"
            >
              {mostrarContrasena ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          )}
        </div>
        {error && <ErrorDeCampo id={idDelError}>{error}</ErrorDeCampo>}
      </div>
    )
  }
)

CampoFormulario.displayName = "CampoFormulario"
