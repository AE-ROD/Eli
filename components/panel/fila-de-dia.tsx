"use client"

import type { ReactNode } from "react"
import { Interruptor } from "@/components/comunes/interruptor"
import { cn } from "@/lib/utils"

interface PropsDeFilaDeDia {
  /** El día: "Lunes". Es el nombre del interruptor. */
  etiqueta: string
  /** Si el día tiene atención. Apagado se lee "No disponible" y no se muestra nada más. */
  activo: boolean
  alAlternar: () => void
  /** El `id` del interruptor: adonde vuelve el foco si lo que lo tenía desapareció. */
  idDelInterruptor?: string
  /** Lo que se muestra con el día encendido: las horas. */
  children: ReactNode
  /** `arriba`: las horas de varias franjas, una debajo de otra; el interruptor queda a la altura de la primera. */
  alineacion?: "centro" | "arriba"
  /** Lo que se lee con el día apagado. */
  textoSinAtencion?: string
}

/**
 * Un día del horario semanal: su interruptor a la izquierda y, al lado, las
 * horas de atención. Desde `sm` cada día es una fila; en el teléfono las horas
 * bajan debajo del día (en una sola fila no entraban y la página se
 * ensanchaba). Lo comparten "Horario" y "Sedes y horarios".
 */
export function FilaDeDia({
  etiqueta,
  activo,
  alAlternar,
  idDelInterruptor,
  children,
  alineacion = "centro",
  textoSinAtencion = "No disponible",
}: PropsDeFilaDeDia) {
  return (
    <li
      className={cn(
        "flex flex-wrap gap-x-6 gap-y-2.5 py-3.5 first:pt-0 last:pb-0",
        alineacion === "centro" ? "items-center" : "items-start"
      )}
    >
      <div className={cn("w-full sm:w-40", alineacion === "arriba" && "sm:flex sm:min-h-11 sm:items-center sm:[&>*]:w-full")}>
        <Interruptor id={idDelInterruptor} etiqueta={etiqueta} activo={activo} alCambiar={() => alAlternar()} />
      </div>

      {activo ? children : <p className={cn("text-sm text-texto-2", alineacion === "arriba" && "sm:flex sm:min-h-11 sm:items-center")}>{textoSinAtencion}</p>}
    </li>
  )
}
