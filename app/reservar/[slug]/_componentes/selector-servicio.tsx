"use client"

import { Check, Clock } from "lucide-react"
import { formatearMonto } from "@/lib/dinero"
import { formatearDuracionDeServicio } from "@/lib/fechas"
import { cn } from "@/lib/utils"

export interface ServicioPublico {
  id: string
  name: string
  description: string | null
  duration: number
  price: number | null
}

interface PropsDeSelectorServicio {
  servicios: ServicioPublico[]
  /** Los elegidos, en el orden en que se eligieron: es el orden en que se hacen. */
  seleccionados: ServicioPublico[]
  /** Elige uno que no estaba o quita uno que estaba. */
  onAlternar: (servicio: ServicioPublico) => void
  /** Cuántos se pueden elegir (#89a). Con el tope lleno, los demás quedan deshabilitados. */
  tope: number
}

/**
 * Los servicios del negocio, uno por tarjeta, y se pueden elegir varios
 * (hasta `tope`, #89a). Con más de uno, el círculo lleva el número de orden:
 * así se lee en qué orden se harán. El elegido se marca con el
 * azul de la Agenda, un borde navy de 2px y un tilde: el pastel solo no llega
 * al contraste de 3:1 contra el blanco, el borde sí.
 *
 * Los bordes son `inset-ring` y no `border` para que el más grueso del
 * elegido no corra el contenido, y porque `anillo-foco` los conserva al
 * enfocar. El de reposo es del gris de texto secundario, como el de los
 * campos: el gris de los bordes decorativos no se distingue sobre blanco.
 */
export function SelectorServicio({ servicios, seleccionados, onAlternar, tope }: PropsDeSelectorServicio) {
  const lleno = seleccionados.length >= tope
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {servicios.map((servicio) => {
        const posicion = seleccionados.findIndex((elegido) => elegido.id === servicio.id)
        const elegido = posicion >= 0
        const bloqueado = !elegido && lleno
        // El gris secundario da 4,3:1 sobre el azul suave del elegido: ahí el texto chico pasa a navy al 75%.
        const textoSecundario = elegido ? "text-navy/75" : "text-texto-2"
        return (
          <li key={servicio.id} className="flex">
            <button
              type="button"
              aria-pressed={elegido}
              disabled={bloqueado}
              onClick={() => onAlternar(servicio)}
              className={cn(
                "flex w-full flex-col rounded-boton-lg p-4 text-left text-navy squircle anillo-foco sm:p-5",
                "transition-[background-color,box-shadow] duration-150 ease-suave",
                elegido
                  ? "bg-azul-suave inset-ring-2 inset-ring-navy"
                  : bloqueado
                    ? "cursor-not-allowed bg-tarjeta opacity-60 inset-ring-1 inset-ring-texto-2"
                    : "bg-tarjeta inset-ring-1 inset-ring-texto-2 hover:bg-crema hover:inset-ring-navy"
              )}
            >
              <span className="flex w-full items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="block font-medium break-words">{servicio.name}</span>
                  {/* Sin `block`: le ganaría al `display` de `line-clamp` y el texto no se cortaría. */}
                  {servicio.description && (
                    <span className={cn("mt-1 line-clamp-2 text-sm", textoSecundario)}>{servicio.description}</span>
                  )}
                </span>
                {/* Un círculo vacío que se llena: se lee como una elección entre varias. */}
                <span
                  aria-hidden="true"
                  className={cn(
                    "grid size-6 shrink-0 place-items-center rounded-full transition-colors duration-150 ease-suave",
                    elegido ? "bg-azul text-navy" : "inset-ring-[1.5px] inset-ring-texto-2"
                  )}
                >
                  {elegido &&
                    (seleccionados.length > 1 ? (
                      <span className="text-xs font-semibold tabular-nums">{posicion + 1}</span>
                    ) : (
                      <Check className="size-3.5" strokeWidth={2.5} />
                    ))}
                </span>
              </span>
              <span className="mt-auto flex w-full items-center gap-4 pt-4 text-sm">
                <span className={cn("flex items-center gap-1.5", textoSecundario)}>
                  <Clock aria-hidden="true" className="size-4" strokeWidth={1.75} />
                  {formatearDuracionDeServicio(servicio.duration)}
                </span>
                {servicio.price != null && (
                  <span className="ml-auto font-medium tabular-nums">{formatearMonto(servicio.price)}</span>
                )}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
