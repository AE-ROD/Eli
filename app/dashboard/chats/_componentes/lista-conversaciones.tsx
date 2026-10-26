"use client"

import { useEffect, useId } from "react"
import { MessageSquarePlus, Search } from "lucide-react"
import { AvatarUsuario } from "@/components/panel/avatar-usuario"
import { CAMPO } from "@/components/panel/estilos"
import { cn } from "@/lib/utils"
import type { Conversacion } from "../_datos"

/** `Ahora`, `5m`, `14:30`, `Mié` o `8 mar`, según cuánto pasó. */
function formatearHoraRelativa(iso: string): string {
  const segundos = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (segundos < 60) return "Ahora"
  if (segundos < 3600) return `${Math.floor(segundos / 60)}m`
  if (segundos < 86400) return new Date(iso).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", hour12: false })
  if (segundos < 604800) return ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"][new Date(iso).getDay()]
  return new Date(iso).toLocaleDateString("es-CL", { day: "numeric", month: "short" })
}

interface PropsDeListaConversaciones {
  conversaciones: Conversacion[]
  busqueda: string
  onBusqueda: (busqueda: string) => void
  activaId: string | null
  onSeleccionar: (conversacion: Conversacion) => void
  onNueva: () => void
  /**
   * La conversación cuyo botón recibe el foco: la que se acaba de dejar al
   * volver a la lista en el teléfono. Sin esto, el foco caía al `<body>`.
   */
  enfocarId?: string | null
  className?: string
}

export function ListaConversaciones({
  conversaciones,
  busqueda,
  onBusqueda,
  activaId,
  onSeleccionar,
  onNueva,
  enfocarId,
  className,
}: PropsDeListaConversaciones) {
  const prefijo = useId()
  const idDe = (conversacion: string) => `${prefijo}-${conversacion}`

  useEffect(() => {
    if (enfocarId) document.getElementById(`${prefijo}-${enfocarId}`)?.focus()
  }, [enfocarId, prefijo])

  const filtradas = conversaciones.filter((conversacion) =>
    conversacion.customerName.toLowerCase().includes(busqueda.toLowerCase()) ||
    (conversacion.customerPhone ?? "").includes(busqueda)
  )

  return (
    <aside aria-label="Conversaciones" className={cn("min-h-0 w-full flex-col md:w-72 md:shrink-0 md:border-r md:border-borde lg:w-80", className)}>
      <div className="flex items-center gap-2 border-b border-borde p-3">
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-texto-2"
            aria-hidden="true"
            strokeWidth={1.75}
          />
          <input
            type="search"
            aria-label="Buscar conversación"
            placeholder="Buscar conversación..."
            value={busqueda}
            onChange={(e) => onBusqueda(e.target.value)}
            className={cn(CAMPO, "pl-10")}
          />
        </div>
        <button
          type="button"
          onClick={onNueva}
          aria-label="Nueva conversación"
          title="Nueva conversación"
          className="grid size-11 shrink-0 place-items-center rounded-[14px] bg-superficie text-navy squircle anillo-foco transition-colors duration-150 ease-suave hover:bg-borde"
        >
          <MessageSquarePlus className="size-5" aria-hidden="true" strokeWidth={1.75} />
        </button>
      </div>

      {/* El relleno deja lugar al anillo del foco, que la lista que se desplaza recortaría en los bordes. */}
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {filtradas.length === 0 ? (
          <p className="p-6 text-center text-sm text-texto-2">Sin conversaciones</p>
        ) : (
          <ul className="space-y-1">
            {filtradas.map((conversacion) => {
              const ultimo = conversacion.messages[0]
              const activa = activaId === conversacion.id
              return (
                <li key={conversacion.id}>
                  <button
                    id={idDe(conversacion.id)}
                    type="button"
                    aria-current={activa ? "true" : undefined}
                    onClick={() => onSeleccionar(conversacion)}
                    className={cn(
                      "relative flex w-full items-start gap-3 rounded-[20px] p-3 text-left text-navy squircle anillo-foco transition-colors duration-150 ease-suave",
                      // La abierta, además del fondo, lleva una barra navy: el gris solo casi no se distingue del blanco.
                      activa
                        ? "bg-superficie before:absolute before:inset-y-3 before:left-0 before:w-1 before:rounded-full before:bg-navy"
                        : "hover:bg-crema"
                    )}
                  >
                    <AvatarUsuario nombre={conversacion.customerName} tamaño="md" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className={cn("truncate", activa ? "font-semibold" : "font-medium")}>
                          {conversacion.customerName}
                        </span>
                        <span className="shrink-0 text-xs text-texto-2 tabular-nums">
                          {formatearHoraRelativa(conversacion.updatedAt)}
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate text-sm text-texto-2">
                        {ultimo ? (ultimo.fromBusiness ? "Tú: " : "") + ultimo.content : "Sin mensajes"}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </aside>
  )
}
