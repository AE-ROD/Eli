"use client"

import { forwardRef } from "react"
import type { InputHTMLAttributes } from "react"
import { Eye, EyeOff } from "lucide-react"
import { useState } from "react"

interface CampoFormularioProps extends InputHTMLAttributes<HTMLInputElement> {
  etiqueta: string
  error?: string
  icono?: React.ReactNode
}

export const CampoFormulario = forwardRef<HTMLInputElement, CampoFormularioProps>(
  ({ etiqueta, error, icono, type, className = "", ...props }, ref) => {
    const [mostrarContrasena, setMostrarContrasena] = useState(false)
    const esContrasena = type === "password"

    return (
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">
          {etiqueta}
        </label>
        <div className="relative">
          {icono && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              {icono}
            </div>
          )}
          <input
            ref={ref}
            type={esContrasena ? (mostrarContrasena ? "text" : "password") : type}
            className={`
              w-full px-4 py-3 rounded-lg border border-border bg-background
              text-foreground placeholder:text-muted-foreground
              focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary
              transition-all duration-200
              ${icono ? "pl-10" : ""}
              ${esContrasena ? "pr-10" : ""}
              ${error ? "border-red-500 focus:ring-red-500/20 focus:border-red-500" : ""}
              ${className}
            `}
            {...props}
          />
          {esContrasena && (
            <button
              type="button"
              onClick={() => setMostrarContrasena(!mostrarContrasena)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              {mostrarContrasena ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          )}
        </div>
        {error && (
          <p className="text-xs text-red-500">{error}</p>
        )}
      </div>
    )
  }
)

CampoFormulario.displayName = "CampoFormulario"
