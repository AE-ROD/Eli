"use client"

import { cn } from "@/lib/utils"

interface EliLogoProps {
  className?: string
  size?: "sm" | "md" | "lg" | "xl"
  inverted?: boolean
}

export function EliLogo({ className, size = "md", inverted = false }: EliLogoProps) {
  const sizeClasses = {
    sm: "text-xl",
    md: "text-2xl",
    lg: "text-4xl",
    xl: "text-6xl",
  }

  return (
    <span
      className={cn(
        "font-bold tracking-tight select-none",
        sizeClasses[size],
        inverted ? "text-background" : "text-[#0a3a6b]",
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
            inverted ? "bg-background" : "bg-[#0a3a6b]"
          )}
        />
      </span>
      <span>i</span>
    </span>
  )
}
