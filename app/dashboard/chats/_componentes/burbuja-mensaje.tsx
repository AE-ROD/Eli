import { Check, CheckCheck } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Un mensaje tal como lo dibuja la burbuja, con la hora ya escrita. No es el
 * `Mensaje` del servidor; se arma con `mensajeParaBurbuja` en `area-chat.tsx`.
 */
export interface MensajeEnBurbuja {
  id: string
  texto: string
  hora: string
  esPropio: boolean
  leido?: boolean
  tipo?: "texto" | "imagen" | "archivo"
}

interface PropsDeBurbujaMensaje {
  mensaje: MensajeEnBurbuja
}

/** Los del negocio, a la derecha en navy; los del cliente, a la izquierda en gris. */
export function BurbujaMensaje({ mensaje }: PropsDeBurbujaMensaje) {
  return (
    <div className={cn("flex", mensaje.esPropio ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-[20px] px-4 py-2.5 sm:max-w-[70%]",
          mensaje.esPropio ? "rounded-br-md bg-navy text-white" : "rounded-bl-md bg-superficie text-navy"
        )}
      >
        <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{mensaje.texto}</p>
        <div
          className={cn(
            "mt-1 flex items-center justify-end gap-1 text-xs tabular-nums",
            mensaje.esPropio ? "text-white/75" : "text-texto-2"
          )}
        >
          <span>{mensaje.hora}</span>
          {mensaje.esPropio &&
            (mensaje.leido ? (
              <CheckCheck className="size-3.5" aria-hidden="true" />
            ) : (
              <Check className="size-3.5" aria-hidden="true" />
            ))}
        </div>
      </div>
    </div>
  )
}
