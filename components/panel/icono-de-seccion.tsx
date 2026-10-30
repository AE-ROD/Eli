import { Banknote, CircleHelp, House, Percent, ReceiptText, SlidersHorizontal, Wallet, type LucideIcon } from "lucide-react"
import { FONDO_FUERTE } from "@/components/comunes/colores-de-modulo"
import { ICONOS_DE_MODULO, IconoDeModulo } from "@/components/comunes/icono-de-modulo"
import type { IdDeSeccion, SeccionDelPanel } from "@/components/panel/secciones-del-panel"
import { moduloPorId, type ModuloId } from "@/lib/modulos"
import { cn } from "@/lib/utils"

/** El ícono de las secciones que no son un módulo; las de un módulo usan el suyo (`ICONOS_DE_MODULO`). */
const ICONOS_SIN_MODULO: Record<Exclude<IdDeSeccion, ModuloId>, LucideIcon> = {
  inicio: House,
  "mi-plata": Wallet,
  caja: Banknote,
  liquidaciones: ReceiptText,
  comisiones: Percent,
  configuracion: SlidersHorizontal,
  ayuda: CircleHelp,
}

/** El ícono de cada sección, de un módulo o no. TypeScript avisa si una sección nueva no tiene el suyo. */
const ICONOS_DE_SECCION: Record<IdDeSeccion, LucideIcon> = { ...ICONOS_DE_MODULO, ...ICONOS_SIN_MODULO }

interface PropsDeCuadroDeSeccion {
  seccion: SeccionDelPanel
  /** `xs` (20px) para el antetítulo; `sm` (32px) para la barra lateral. Por defecto, `sm`. */
  tamano?: "xs" | "sm"
  /**
   * El fondo cuando la sección no es un módulo, que depende de dónde va: el
   * gris de superficie sobre blanco, el de los bordes sobre crema. Las de un
   * módulo llevan siempre su pastel fuerte.
   */
  fondoSinModulo?: string
  className?: string
}

/**
 * El ícono de una sección del panel en su cuadro: el de un módulo es
 * `IconoDeModulo`, con el pastel fuerte del módulo; el de las demás, en gris.
 * Es decorativo: va siempre junto al nombre de la sección. `IconoDeModulo` no
 * tiene un tamaño de 20px: el del antetítulo se dibuja acá, con sus mismas
 * clases.
 */
export function CuadroDeSeccion({
  seccion,
  tamano = "sm",
  fondoSinModulo = "bg-superficie",
  className,
}: PropsDeCuadroDeSeccion) {
  if (seccion.modulo && tamano === "sm") {
    return <IconoDeModulo modulo={seccion.modulo} tamano="sm" activo className={className} />
  }

  const Icono = ICONOS_DE_SECCION[seccion.id]
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-grid shrink-0 place-items-center text-navy squircle transition-colors duration-150 ease-suave",
        tamano === "xs" ? "size-5 rounded-[6px] [&_svg]:size-3" : "size-8 rounded-[10px] [&_svg]:size-4",
        seccion.modulo ? FONDO_FUERTE[moduloPorId(seccion.modulo).color] : fondoSinModulo,
        className
      )}
    >
      <Icono strokeWidth={tamano === "xs" ? 2 : 1.75} />
    </span>
  )
}
