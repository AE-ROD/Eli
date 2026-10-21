"use client"

import { CalendarDays, Mail, Phone } from "lucide-react"
import { Insignia } from "@/components/comunes/insignia"
import { AvatarUsuario } from "@/components/panel/avatar-usuario"
import { cn } from "@/lib/utils"
import type { Cliente } from "../_datos"

/**
 * Un cliente tal como lo dibuja la tarjeta: ya con los textos de pantalla
 * resueltos. No es el `Cliente` del servidor; se arma con `clienteParaTarjeta`.
 */
export interface ClienteEnTarjeta {
  id: string
  nombre: string
  email: string
  telefono: string
  imagenUrl?: string
  visitas: number
  ultimaVisita: string
  etiqueta?: "VIP" | "Frecuente" | "Nuevo" | "Inactivo"
}

interface PropsDeTarjetaCliente {
  cliente: ClienteEnTarjeta
  /** Si es el que está abierto en la ficha de al lado. La ficha se ve desde `lg`, y la marca también. */
  seleccionado?: boolean
  onClick?: () => void
}

const ETIQUETAS_VALIDAS = ["VIP", "Frecuente", "Nuevo", "Inactivo"] as const

/** `Hoy`, `Ayer`, `Hace 3 días`, `Hace 2 semanas`, `Hace 4 meses`. */
function formatearFechaRelativa(iso: string): string {
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (dias === 0) return "Hoy"
  if (dias === 1) return "Ayer"
  if (dias < 7) return `Hace ${dias} días`
  if (dias < 14) return "Hace 1 semana"
  if (dias < 30) return `Hace ${Math.floor(dias / 7)} semanas`
  if (dias < 60) return "Hace 1 mes"
  return `Hace ${Math.floor(dias / 30)} meses`
}

/** `1 visita`, `3 visitas`. */
function visitasEnTexto(visitas: number): string {
  return visitas === 1 ? "1 visita" : `${visitas} visitas`
}

/**
 * Del cliente que devuelve el servidor a lo que muestra la tarjeta. Las citas
 * vienen de la más reciente a la más vieja, así que la primera es la última
 * visita. De las etiquetas, se muestra la primera que la tarjeta sabe pintar.
 */
export function clienteParaTarjeta(cliente: Cliente): ClienteEnTarjeta {
  const etiqueta = cliente.tags.find((etiquetaDelCliente) =>
    (ETIQUETAS_VALIDAS as readonly string[]).includes(etiquetaDelCliente)
  ) as ClienteEnTarjeta["etiqueta"]
  const ultimaCita = cliente.appointments[0]
  return {
    id: cliente.id,
    nombre: cliente.name,
    // "Correo", como en el formulario del cliente nuevo y en el resto del producto.
    email: cliente.email ?? "Sin correo",
    telefono: cliente.phone ?? "Sin teléfono",
    visitas: cliente.appointments.length,
    ultimaVisita: ultimaCita ? formatearFechaRelativa(ultimaCita.startTime) : "Sin visitas",
    etiqueta,
  }
}

/**
 * La etiqueta del cliente, en una píldora con el lila de Clientes; "Inactivo",
 * en gris. El texto es navy sobre las dos.
 */
export function EtiquetaDeCliente({
  etiqueta,
  className,
}: {
  etiqueta: NonNullable<ClienteEnTarjeta["etiqueta"]>
  className?: string
}) {
  return (
    <Insignia tono={etiqueta === "Inactivo" ? "gris" : "lila"} className={className}>
      {etiqueta}
    </Insignia>
  )
}

/**
 * Un cliente de la lista. La tarjeta entera es un botón que abre su ficha: se
 * enfoca con Tab y se abre con Enter o Espacio, no sólo con el mouse. Por eso
 * todo lo de adentro son `span`: en un botón no va un `div` ni un `p`.
 *
 * Mide su propio ancho (`@container`): angosta, en la cuadrícula, los datos
 * van debajo del nombre; ancha, en la lista, todo va en una fila. Un nombre o
 * un correo largos se cortan en renglones y no ensanchan la página.
 */
export function TarjetaCliente({ cliente, seleccionado = false, onClick }: PropsDeTarjetaCliente) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        // Todo el alto de su celda: en la cuadrícula, las de una fila miden lo mismo.
        "@container block h-full w-full rounded-[24px] bg-tarjeta p-4 text-left text-navy shadow-sm squircle anillo-foco",
        "cursor-pointer transition-[box-shadow,background-color] duration-200 ease-suave hover:shadow-md",
        // La abierta, con el lila de Clientes. Sólo marca: el nombre está en la ficha.
        seleccionado && "lg:bg-lila-suave/50 lg:inset-ring-2 lg:inset-ring-lila"
      )}
    >
      {/* En columna, los datos quedan al pie: alineados entre las tarjetas de una fila. */}
      <span className="flex h-full flex-col justify-between gap-4 @xl:flex-row @xl:items-center @xl:gap-6">
        <span className="flex min-w-0 items-center gap-3 @xl:flex-1">
          <AvatarUsuario nombre={cliente.nombre} imagenUrl={cliente.imagenUrl} tamaño="lg" />
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="min-w-0 font-semibold break-words">{cliente.nombre}</span>
              {cliente.etiqueta && <EtiquetaDeCliente etiqueta={cliente.etiqueta} />}
            </span>
            <span className="mt-1 flex items-start gap-1.5 text-sm text-texto-2">
              <Mail className="mt-[3px] size-3.5 shrink-0" aria-hidden="true" strokeWidth={1.75} />
              <span className="min-w-0 wrap-anywhere">{cliente.email}</span>
            </span>
          </span>
        </span>

        <span className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-borde pt-3 text-[13px] text-texto-2 @xl:shrink-0 @xl:border-t-0 @xl:pt-0">
          <span className="flex min-w-0 items-center gap-1.5">
            <Phone className="size-3.5 shrink-0" aria-hidden="true" strokeWidth={1.75} />
            <span className="min-w-0 wrap-anywhere">{cliente.telefono}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <CalendarDays className="size-3.5 shrink-0" aria-hidden="true" strokeWidth={1.75} />
            {visitasEnTexto(cliente.visitas)}
          </span>
          <span>Última: {cliente.ultimaVisita}</span>
        </span>
      </span>
    </button>
  )
}
