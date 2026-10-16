import type { ReactNode } from "react"
import { CircleAlert } from "lucide-react"

interface PropsDeAvisoDeError {
  /** El error. Vacío, no se pinta nada. */
  mensaje: string
  /**
   * Falso cuando el error es de un campo y ya se ve debajo de él: acá sólo se
   * anuncia. `ErrorDeCampo` no avisa al aparecer, y el foco sigue en el botón
   * que se apretó, así que sin esto el lector de pantalla no decía nada.
   */
  visible?: boolean
  /** Lo que se puede hacer al respecto, debajo del mensaje: una indicación, un enlace. */
  children?: ReactNode
}

/**
 * El error de un formulario de acceso que no es de un campo (casi siempre, la
 * respuesta del servidor), arriba del botón. Es una alerta: el lector de
 * pantalla la lee apenas aparece. Lleva ícono además del color, como
 * `ErrorDeCampo`.
 */
export function AvisoDeError({ mensaje, visible = true, children }: PropsDeAvisoDeError) {
  if (!mensaje) return null

  if (!visible) {
    return (
      <p role="alert" className="sr-only">
        {mensaje}
      </p>
    )
  }

  return (
    <div role="alert" className="flex items-start gap-2.5 rounded-campo bg-error/6 px-4 py-3 text-sm text-error squircle">
      <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">
        <p className="font-medium">{mensaje}</p>
        {children && <div className="mt-1 text-navy">{children}</div>}
      </div>
    </div>
  )
}
