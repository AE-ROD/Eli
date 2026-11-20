import type { ReactNode } from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

interface PropsDeGuiaPlegable {
  /** La pregunta o el título que se ve plegado: "¿Dónde encuentro el enlace de reseñas?". */
  titulo: string
  /** Los pasos, en orden: se leen como una lista numerada. */
  pasos?: readonly string[]
  /** Lo que va después de los pasos (una nota, un aviso). */
  children?: ReactNode
  className?: string
}

/**
 * Una ayuda que se despliega: plegada se ve sólo su título, y abierta, los
 * pasos numerados. Para lo que la mayoría no necesita leer pero a alguien le
 * salva el día (de dónde se saca un enlace, cómo se cuenta algo).
 *
 * Es un `<details>` nativo: se abre con el teclado y el lector de pantalla
 * dice si está abierta, sin JavaScript. El chevron gira sólo con `transform`.
 */
export function GuiaPlegable({ titulo, pasos, children, className }: PropsDeGuiaPlegable) {
  return (
    <details className={cn("group rounded-campo bg-superficie px-4 squircle", className)}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-boton text-sm font-medium text-navy anillo-foco [&::-webkit-details-marker]:hidden">
        <ChevronDown
          aria-hidden="true"
          className="size-4 shrink-0 transition-transform duration-150 ease-suave group-open:rotate-180"
          strokeWidth={2}
        />
        {titulo}
      </summary>
      <div className="space-y-2 pb-4 text-sm text-pretty text-texto-2">
        {pasos && pasos.length > 0 && (
          <ol className="list-decimal space-y-1.5 pl-5">
            {pasos.map((paso) => (
              <li key={paso}>{paso}</li>
            ))}
          </ol>
        )}
        {children}
      </div>
    </details>
  )
}
