import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

interface PropsDeChipDePalabra {
  children: ReactNode
  className?: string
}

/**
 * Una palabra suelta en serif sobre una píldora blanca con sombra suave
 * ("Corte", "Manicura"). Suele ser decoración: cuando la palabra repite lo
 * que ya dice el texto de al lado, va dentro de un contenedor con
 * `aria-hidden` para que el lector de pantalla no la lea dos veces.
 *
 * Sin `squircle`: es una píldora, y con `rounded-full` la superelipse le
 * aplana las puntas (en Chrome 139 o más, que la dibuja).
 */
export function ChipDePalabra({ children, className }: PropsDeChipDePalabra) {
  return (
    <span
      className={cn(
        "inline-flex h-10 shrink-0 items-center whitespace-nowrap rounded-full bg-tarjeta px-4 font-serif text-base font-medium leading-none tracking-[-0.2px] text-navy shadow-sm",
        "md:h-12 md:px-5 md:text-[1.375rem] md:tracking-[-0.3px]",
        className
      )}
    >
      {children}
    </span>
  )
}
