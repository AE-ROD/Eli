"use client"

import type { ReactNode } from "react"
import { Clock, MapPin, Timer } from "lucide-react"
import { AvatarUsuario } from "@/components/panel/avatar-usuario"
import { useRubroDelPanel } from "@/components/panel/contexto-rubro"
import { frasesDelPanel } from "@/components/panel/frases-del-panel"
import { vocabularioDe } from "@/lib/vocabulario"
import { cn } from "@/lib/utils"
import { formatearTiempoLibre as formatearDuracion } from "@/lib/horario-dia"
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
  /** Pendiente porque entró por confirmar tras faltas (#84): se lee "Por confirmar". */
  porConfirmar?: boolean
  /** Sin profesional asignado habiendo equipo (#103): ocupa la hora de todos, y se marca para asignarla. */
  sinProfesional?: boolean
  /**
   * El nombre de la sede donde se atiende (etapa 9): sólo se pasa con varias
   * sedes activas. Sin él, la tarjeta es la de siempre.
   */
  sede?: string
}

interface PropsDeTarjetaCita {
  cita: CitaEnTarjeta
  compacta?: boolean
  onClick?: () => void
}

/**
 * El estado de la cita en palabras, sobre un pastel: el color solo no le dice
 * nada a quien no lo distingue. El texto es navy, que pasa el contraste sobre
 * todos, salvo en la cancelada, que va en el rojo de error. "No vino" es el de
 * un rubro sin palabras propias: cada rubro dice el suyo (`EstadoDeLaCita`,
 * "No asistió" en una clínica dental).
 */
const ESTADOS: Record<CitaEnTarjeta["estado"], { texto: string; clases: string }> = {
  pendiente: { texto: "Pendiente", clases: "bg-borde text-navy" },
  confirmada: { texto: "Confirmada", clases: "bg-azul-suave text-navy" },
  "en-progreso": { texto: "En progreso", clases: "bg-naranja-suave text-navy" },
  completada: { texto: "Completada", clases: "bg-lima-suave text-navy" },
  cancelada: { texto: "Cancelada", clases: "bg-error/8 text-error" },
  "no-asistio": { texto: "No vino", clases: "bg-navy/8 text-navy" },
}

/** Una pendiente que el local tiene que confirmar (#84): el gris de la pendiente, con borde, y dicho en palabras. */
const POR_CONFIRMAR = { texto: "Por confirmar", clases: "bg-tarjeta text-navy ring-1 ring-inset ring-navy" }

/**
 * "Sin profesional" ("Sin estilista", "Sin odontólogo": la palabra del rubro),
 * en el naranja del tablero y con borde punteado: se distingue sin depender
 * del color.
 */
function MarcaSinProfesional() {
  const { tarjetaDeCita } = frasesDelPanel(vocabularioDe(useRubroDelPanel()).palabras)
  return (
    <span className="inline-flex h-5 shrink-0 items-center rounded-full border border-dashed border-navy/40 bg-naranja-suave px-2 text-[11px] leading-none font-medium whitespace-nowrap text-navy">
      {tarjetaDeCita.sinProfesional}
    </span>
  )
}

/**
 * La sede, como insignia discreta junto a la hora: el nombre con un pin, en
 * navy sobre blanco (pasa el contraste) y con borde, para distinguirse de los
 * estados. El lector de pantalla oye "Sede Centro"; el pin es decoración. Un
 * nombre largo se corta con "…".
 */
function MarcaDeSede({ nombre }: { nombre: string }) {
  return (
    <span className="inline-flex h-5 max-w-32 min-w-0 items-center gap-1 rounded-full bg-tarjeta px-2 text-[11px] leading-none font-medium text-navy ring-1 ring-inset ring-borde">
      <MapPin className="size-3 shrink-0" aria-hidden="true" strokeWidth={1.75} />
      <span className="sr-only">Sede </span>
      <span className="truncate">{nombre}</span>
    </span>
  )
}

function EstadoDeLaCita({ estado, porConfirmar = false }: { estado: CitaEnTarjeta["estado"]; porConfirmar?: boolean }) {
  const { tarjetaDeCita } = frasesDelPanel(vocabularioDe(useRubroDelPanel()).palabras)
  // El endpoint no restringe el string: un estado desconocido se muestra tal cual, sin color.
  const conocido = ESTADOS[estado]
  const { texto, clases } =
    porConfirmar && estado === "pendiente"
      ? POR_CONFIRMAR
      : conocido
        ? { ...conocido, texto: estado === "no-asistio" ? tarjetaDeCita.noVino : conocido.texto }
        : { texto: estado, clases: "bg-borde text-navy" }
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
            {cita.servicio} · {formatearDuracion(cita.duracion)}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-sm font-medium tabular-nums">{cita.horaInicio}</span>
          {cita.sede && <MarcaDeSede nombre={cita.sede} />}
          <EstadoDeLaCita estado={cita.estado} porConfirmar={cita.porConfirmar} />
          {cita.sinProfesional && <MarcaSinProfesional />}
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
        <span className="flex shrink-0 flex-col items-end gap-1">
          <EstadoDeLaCita estado={cita.estado} porConfirmar={cita.porConfirmar} />
          {cita.sinProfesional && <MarcaSinProfesional />}
        </span>
      </span>

      <span className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-borde pt-3 text-sm text-texto-2">
        <span className="flex items-center gap-1.5 tabular-nums">
          <Clock className="size-4" aria-hidden="true" strokeWidth={1.75} />
          {cita.horaInicio} – {cita.horaFin}
        </span>
        <span className="flex items-center gap-1.5">
          <Timer className="size-4" aria-hidden="true" strokeWidth={1.75} />
          {formatearDuracion(cita.duracion)}
        </span>
        {cita.sede && (
          <span className="flex min-w-0 items-center gap-1.5">
            <MapPin className="size-4 shrink-0" aria-hidden="true" strokeWidth={1.75} />
            <span className="sr-only">Sede </span>
            <span className="truncate">{cita.sede}</span>
          </span>
        )}
      </span>

      {cita.notas && (
        <span className="block rounded-[14px] bg-superficie p-2.5 text-[13px] text-texto-2 squircle">{cita.notas}</span>
      )}
    </Contenedor>
  )
}
