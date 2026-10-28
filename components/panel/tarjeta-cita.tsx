"use client"

import type { ReactNode } from "react"
import { Clock, Timer } from "lucide-react"
import { AvatarUsuario } from "@/components/panel/avatar-usuario"
import { cn } from "@/lib/utils"
import type { EstadoDeCita } from "@/lib/campos-del-panel"

export interface CitaEnTarjeta {
  id: string
  nombreCliente: string
  imagenCliente?: string
  servicio: string
  horaInicio: string
  horaFin: string
  duracion: number // en minutos
  estado: EstadoDeCita
  notas?: string
}

interface PropsDeTarjetaCita {
  cita: CitaEnTarjeta
  compacta?: boolean
  onClick?: () => void
}

/**
 * El estado de la cita en palabras, sobre un pastel: el color solo no le dice
 * nada a quien no lo distingue. El texto es navy, que pasa el contraste sobre
 * todos, salvo en la cancelada, que va en el rojo de error.
 */
const ESTADOS: Record<CitaEnTarjeta["estado"], { texto: string; clases: string }> = {
  pendiente: { texto: "Pendiente", clases: "bg-borde text-navy" },
  confirmada: { texto: "Confirmada", clases: "bg-azul-suave text-navy" },
  "en-progreso": { texto: "En progreso", clases: "bg-naranja-suave text-navy" },
  completada: { texto: "Completada", clases: "bg-lima-suave text-navy" },
  cancelada: { texto: "Cancelada", clases: "bg-error/8 text-error" },
  "no-asistio": { texto: "No vino", clases: "bg-navy/8 text-navy" },
}

function EstadoDeLaCita({ estado }: { estado: CitaEnTarjeta["estado"] }) {
  // El endpoint no restringe el string: un estado desconocido se muestra tal cual, sin color.
  const { texto, clases } = ESTADOS[estado] ?? { texto: estado, clases: "bg-borde text-navy" }
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center rounded-full px-2 text-[11px] leading-none font-medium whitespace-nowrap",
        clases
      )}
    >
      {texto}
    </span>
  )
}

/**
 * Sin `onClick`, la tarjeta sólo muestra. Con `onClick` es un botón: se
 * enfoca con Tab y se abre con Enter o Espacio, no sólo con el mouse. Por eso
 * todo lo de adentro son `span`: dentro de un botón no va un `div` ni un `p`.
 */
function Contenedor({ onClick, className, children }: { onClick?: () => void; className: string; children: ReactNode }) {
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cn(className, "cursor-pointer text-left anillo-foco")}>
        {children}
      </button>
    )
  }
  return <div className={className}>{children}</div>
}

/**
 * Una cita: quién viene, a qué, a qué hora y en qué estado está. La compacta
 * va en listas sobre blanco (el inicio, la agenda del día, el historial de un
 * cliente), sobre el gris de superficie; la completa es una tarjeta blanca.
 */
export function TarjetaCita({ cita, compacta = false, onClick }: PropsDeTarjetaCita) {
  if (compacta) {
    return (
      <Contenedor
        onClick={onClick}
        className={cn(
          "flex w-full min-w-0 items-center gap-3 rounded-[20px] bg-superficie px-3 py-2.5 text-navy squircle",
          onClick && "transition-[background-color,box-shadow] duration-200 ease-suave hover:bg-tarjeta hover:shadow-sm"
        )}
      >
        {/* En el teléfono el nombre necesita el lugar: la inicial no agrega nada que no diga el nombre. */}
        <span className="hidden sm:block">
          <AvatarUsuario nombre={cita.nombreCliente} imagenUrl={cita.imagenCliente} tamaño="sm" />
        </span>
        {/*
          `contain-inline-size`: el nombre se corta con "…" y no cuenta para el
          ancho mínimo de la tarjeta. Sin esto, metida en una grilla o en una
          fila flexible, un nombre largo ensanchaba la página.
        */}
        <span className="min-w-0 flex-1 contain-inline-size">
          <span className="block truncate text-sm font-medium">{cita.nombreCliente}</span>
          <span className="mt-0.5 block truncate text-[13px] text-texto-2">
            {cita.servicio} · {cita.duracion} min
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-sm font-medium tabular-nums">{cita.horaInicio}</span>
          <EstadoDeLaCita estado={cita.estado} />
        </span>
      </Contenedor>
    )
  }

  return (
    <Contenedor
      onClick={onClick}
      className={cn(
        "flex w-full min-w-0 flex-col gap-4 rounded-[24px] bg-tarjeta p-4 text-navy shadow-sm squircle",
        onClick && "transition-shadow duration-200 ease-suave hover:shadow-md"
      )}
    >
      <span className="flex items-start justify-between gap-3">
        <span className="flex min-w-0 flex-1 items-center gap-3">
          <AvatarUsuario nombre={cita.nombreCliente} imagenUrl={cita.imagenCliente} tamaño="md" />
          <span className="min-w-0 flex-1 contain-inline-size">
            <span className="block truncate font-semibold">{cita.nombreCliente}</span>
            <span className="block truncate text-sm text-texto-2">{cita.servicio}</span>
          </span>
        </span>
        <EstadoDeLaCita estado={cita.estado} />
      </span>

      <span className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-borde pt-3 text-sm text-texto-2">
        <span className="flex items-center gap-1.5 tabular-nums">
          <Clock className="size-4" aria-hidden="true" strokeWidth={1.75} />
          {cita.horaInicio} – {cita.horaFin}
        </span>
        <span className="flex items-center gap-1.5">
          <Timer className="size-4" aria-hidden="true" strokeWidth={1.75} />
          {cita.duracion} minutos
        </span>
      </span>

      {cita.notas && (
        <span className="block rounded-[14px] bg-superficie p-2.5 text-[13px] text-texto-2 squircle">{cita.notas}</span>
      )}
    </Contenedor>
  )
}
