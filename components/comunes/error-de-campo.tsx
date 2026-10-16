import type { ReactNode } from "react"
import { CircleAlert } from "lucide-react"

/**
 * El mensaje de un campo cuyo valor no sirve. Lleva ícono además del color:
 * el rojo solo no le dice nada a quien no distingue colores. El campo lo
 * apunta con `aria-describedby={id}` para que el lector de pantalla lo lea
 * al entrar.
 */
export function ErrorDeCampo({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className="flex items-start gap-1.5 text-sm font-medium text-error">
      <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  )
}
