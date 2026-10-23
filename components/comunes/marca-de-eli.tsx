import { cn } from "@/lib/utils"

/**
 * La "e" de Eli en su cuadro navy: la firma chica de la página de reservas y
 * del afiche del QR.
 * Decorativa: siempre va al lado del nombre escrito.
 */
export function MarcaDeEli({ invertida = false, className }: { invertida?: boolean; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-grid size-6 shrink-0 place-items-center rounded-[8px] font-serif text-sm leading-none font-medium squircle",
        invertida ? "bg-white text-navy" : "bg-navy text-white",
        className
      )}
    >
      e
    </span>
  )
}
