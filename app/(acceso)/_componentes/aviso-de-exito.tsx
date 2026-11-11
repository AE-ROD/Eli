import { CircleCheck } from "lucide-react"

/**
 * Lo que salió bien antes de llegar a esta pantalla ("tu contraseña quedó
 * cambiada"), arriba del formulario. Es un estado y no una alerta: el lector
 * de pantalla lo lee sin interrumpir. Texto navy sobre el turquesa suave,
 * con ícono además del color, como `AvisoDeError`.
 */
export function AvisoDeExito({ mensaje }: { mensaje: string }) {
  if (!mensaje) return null
  return (
    <div role="status" className="flex items-start gap-2.5 rounded-campo bg-turquesa-suave px-4 py-3 text-sm text-navy squircle">
      <CircleCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <p className="min-w-0 font-medium">{mensaje}</p>
    </div>
  )
}
