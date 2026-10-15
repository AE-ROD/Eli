import { Send } from "lucide-react"
import { cn } from "@/lib/utils"

/** Lo que ocupa el lugar del chat mientras no se eligió ninguna conversación. */
export function SinConversacionAbierta({ className }: { className?: string }) {
  return (
    <div className={cn("min-w-0 flex-1 items-center justify-center p-6", className)}>
      <div className="max-w-xs text-center">
        <span
          aria-hidden="true"
          className="mx-auto mb-4 grid size-14 place-items-center rounded-campo bg-superficie text-navy squircle"
        >
          <Send className="size-6" strokeWidth={1.75} />
        </span>
        <h2 className="titulo-3 font-serif">Tus mensajes</h2>
        <p className="mt-2 text-sm text-pretty text-texto-2">Selecciona una conversación para comenzar a chatear</p>
      </div>
    </div>
  )
}
