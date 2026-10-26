"use client"

import { useId, useState } from "react"
import { motion } from "framer-motion"
import { ChevronDown } from "lucide-react"
import { CURVA, DURACION } from "@/components/movimiento/tiempos"
import type { PreguntaFrecuente } from "@/lib/preguntas-frecuentes"
import { cn } from "@/lib/utils"

interface PropsDeAcordeon {
  preguntas: readonly PreguntaFrecuente[]
  /** El nivel del título de cada pregunta, según bajo qué título va la lista. Por defecto, `h3`. */
  nivel?: "h3" | "h4"
  className?: string
}

/**
 * Las preguntas frecuentes como acordeón: cada pregunta es un botón con
 * `aria-expanded` dentro de su título, y la respuesta, una región nombrada por
 * él. Se pueden abrir varias a la vez: comparar dos respuestas es común.
 *
 * La respuesta aparece con un fundido (sólo opacidad); el alto no se anima.
 */
export function AcordeonDePreguntas({ preguntas, nivel: Titulo = "h3", className }: PropsDeAcordeon) {
  const [abiertas, setAbiertas] = useState<ReadonlySet<string>>(() => new Set())
  const prefijo = useId()

  const alternar = (id: string) =>
    setAbiertas((anteriores) => {
      const siguientes = new Set(anteriores)
      if (siguientes.has(id)) siguientes.delete(id)
      else siguientes.add(id)
      return siguientes
    })

  return (
    <ul className={cn("divide-y divide-borde rounded-panel bg-tarjeta shadow-sm squircle", className)}>
      {preguntas.map((pregunta) => {
        const abierta = abiertas.has(pregunta.id)
        const idDelBoton = `${prefijo}-${pregunta.id}-boton`
        const idDeLaRespuesta = `${prefijo}-${pregunta.id}-respuesta`

        return (
          <li key={pregunta.id}>
            <Titulo className="text-base font-medium">
              <button
                type="button"
                id={idDelBoton}
                aria-expanded={abierta}
                aria-controls={idDeLaRespuesta}
                onClick={() => alternar(pregunta.id)}
                className="flex min-h-14 w-full items-center justify-between gap-4 rounded-panel px-5 py-4 text-left text-pretty text-navy squircle anillo-foco transition-colors duration-150 ease-suave hover:bg-superficie/60 sm:px-6"
              >
                <span>{pregunta.pregunta}</span>
                <ChevronDown
                  aria-hidden="true"
                  strokeWidth={1.75}
                  className={cn(
                    "size-5 shrink-0 text-texto-2 transition-transform duration-300 ease-suave",
                    abierta && "rotate-180"
                  )}
                />
              </button>
            </Titulo>
            {/* Siempre en el DOM, para que `aria-controls` apunte a algo; cerrada, `hidden`. */}
            <motion.div
              id={idDeLaRespuesta}
              role="region"
              aria-labelledby={idDelBoton}
              hidden={!abierta}
              initial={false}
              animate={{ opacity: abierta ? 1 : 0 }}
              transition={{ duration: DURACION.pildora, ease: CURVA.fundido }}
              className="space-y-3 px-5 pb-5 text-pretty text-texto-2 sm:px-6"
            >
              {pregunta.respuesta.map((parrafo) => (
                <p key={parrafo}>{parrafo}</p>
              ))}
            </motion.div>
          </li>
        )
      })}
    </ul>
  )
}
