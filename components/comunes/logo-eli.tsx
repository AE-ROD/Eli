"use client"

import { cn } from "@/lib/utils"

interface LogoEliProps {
  className?: string
  tamaño?: "sm" | "md" | "lg" | "xl"
  /** En blanco, para ir sobre navy. */
  invertido?: boolean
}

const clasesPorTamaño = {
  sm: "text-xl",
  md: "text-2xl",
  lg: "text-4xl",
  xl: "text-6xl",
}

export function LogoEli({ className, tamaño = "md", invertido = false }: LogoEliProps) {
  return (
    <span
      // Geist, la sans del sistema. Antes pedía DM Sans, que nunca se cargó y
      // caía a la sans de cada sistema operativo.
      className={cn(
        "font-sans font-bold tracking-tight select-none",
        clasesPorTamaño[tamaño],
        invertido ? "text-white" : "text-navy",
        className
      )}
    >
      <span className="relative">
        E
      </span>
      <span className="relative">
        l
        <span
          className={cn(
            "absolute -top-[0.15em] -right-[0.1em] w-[0.2em] h-[0.2em] rotate-45",
            invertido ? "bg-white" : "bg-navy"
          )}
        />
      </span>
      <span>i</span>
    </span>
  )
}
