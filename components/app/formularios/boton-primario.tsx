"use client"

import { motion, type HTMLMotionProps } from "framer-motion"
import type { ReactNode } from "react"
import { Loader2 } from "lucide-react"

interface BotonPrimarioProps extends Omit<HTMLMotionProps<"button">, "children"> {
  children: ReactNode
  variante?: "primario" | "secundario" | "fantasma" | "peligro"
  tamaño?: "sm" | "md" | "lg"
  cargando?: boolean
  icono?: ReactNode
  iconoDerecha?: boolean
  anchoCompleto?: boolean
}

const estilosVariante = {
  primario: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20",
  secundario: "bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-border",
  fantasma: "bg-transparent text-foreground hover:bg-muted",
  peligro: "bg-red-500 text-white hover:bg-red-600 shadow-lg shadow-red-500/20",
}

const estilosTamaño = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-5 py-2.5 text-sm",
  lg: "px-6 py-3 text-base",
}

export function BotonPrimario({
  children,
  variante = "primario",
  tamaño = "md",
  cargando = false,
  icono,
  iconoDerecha = false,
  anchoCompleto = false,
  disabled,
  className = "",
  ...props
}: BotonPrimarioProps) {
  return (
    <motion.button
      whileHover={{ scale: disabled || cargando ? 1 : 1.02 }}
      whileTap={{ scale: disabled || cargando ? 1 : 0.98 }}
      disabled={disabled || cargando}
      className={`
        inline-flex items-center justify-center gap-2 rounded-lg font-medium
        transition-colors duration-200
        disabled:opacity-50 disabled:cursor-not-allowed
        ${estilosVariante[variante]}
        ${estilosTamaño[tamaño]}
        ${anchoCompleto ? "w-full" : ""}
        ${className}
      `}
      {...props}
    >
      {cargando ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <>
          {icono && !iconoDerecha && icono}
          {children}
          {icono && iconoDerecha && icono}
        </>
      )}
    </motion.button>
  )
}
