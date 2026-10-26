import { CircleUserRound, Ellipsis, Globe, type LucideIcon } from "lucide-react"
import { IconoDeModulo } from "@/components/comunes/icono-de-modulo"
import type { ModuloId } from "@/lib/modulos"
import type { AreaDeSoporte } from "@/lib/soporte"
import { cn } from "@/lib/utils"

/**
 * Las áreas que son un módulo del panel llevan su ícono y su pastel; las demás
 * (reservas en línea, cuenta y plan, otro) van en gris, como las secciones del
 * panel que no son un módulo.
 */
const MODULO_DEL_AREA: Partial<Record<AreaDeSoporte, ModuloId>> = {
  agenda: "agenda",
  tablero: "tablero",
  clientes: "clientes",
  reportes: "reportes",
  equipo: "equipo",
}

const ICONO_SIN_MODULO: Record<Exclude<AreaDeSoporte, ModuloId>, LucideIcon> = {
  reservas: Globe,
  "cuenta-y-plan": CircleUserRound,
  otro: Ellipsis,
}

export function moduloDelArea(area: AreaDeSoporte): ModuloId | undefined {
  return MODULO_DEL_AREA[area]
}

interface PropsDeIconoDeArea {
  area: AreaDeSoporte
  tamano?: "sm" | "md"
  /** El pastel fuerte en vez del suave: el área elegida. */
  activo?: boolean
  className?: string
}

/** El ícono de un área en su cuadro. Decorativo: va siempre junto al nombre del área. */
export function IconoDeArea({ area, tamano = "md", activo = false, className }: PropsDeIconoDeArea) {
  const modulo = moduloDelArea(area)
  if (modulo) return <IconoDeModulo modulo={modulo} tamano={tamano} activo={activo} className={className} />

  const Icono = ICONO_SIN_MODULO[area as Exclude<AreaDeSoporte, ModuloId>]
  // Las mismas medidas que `CuadroDeIcono`; el gris sube un tono al elegirla.
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-grid shrink-0 place-items-center text-navy squircle transition-colors duration-300 ease-suave",
        tamano === "sm" ? "size-8 rounded-[10px] [&_svg]:size-4" : "size-10 rounded-[12px] [&_svg]:size-5",
        activo ? "bg-borde" : "bg-superficie",
        className
      )}
    >
      <Icono strokeWidth={1.75} />
    </span>
  )
}
