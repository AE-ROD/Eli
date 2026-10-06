"use client"

import { cn } from "@/lib/utils"

interface LogoEliProps {
  className?: string
  tamaño?: "sm" | "md" | "lg" | "xl"
  /** Claro, para ir sobre un fondo oscuro. */
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
      className={cn(
        "font-bold tracking-tight select-none",
        clasesPorTamaño[tamaño],
        invertido ? "text-background" : "text-[#0a3a6b]",
        className
      )}
      style={{ fontFamily: "'DM Sans', sans-serif" }}
    >
      <span className="relative">
        E
      </span>
      <span className="relative">
        l
        <span
          className={cn(
            "absolute -top-[0.15em] -right-[0.1em] w-[0.2em] h-[0.2em] rotate-45",
            invertido ? "bg-background" : "bg-[#0a3a6b]"
          )}
        />
      </span>
      <span>i</span>
    </span>
  )
}
