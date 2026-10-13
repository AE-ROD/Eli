import { CalendarDays, ChartColumn, SquareKanban, Users, UsersRound, type LucideIcon } from "lucide-react"
import { cva } from "class-variance-authority"
import { moduloPorId, type ColorDeModulo, type ModuloId } from "@/lib/modulos"
import { FONDO_FUERTE, FONDO_SUAVE } from "@/components/comunes/colores-de-modulo"
import { cn } from "@/lib/utils"

/** El ícono de cada módulo, el mismo en el menú, el recorrido y el panel. */
export const ICONOS_DE_MODULO: Record<ModuloId, LucideIcon> = {
  agenda: CalendarDays,
  tablero: SquareKanban,
  clientes: Users,
  reportes: ChartColumn,
  equipo: UsersRound,
}

type TamanoDeIcono = "sm" | "md" | "lg"

const COLORES = Object.keys(FONDO_FUERTE) as ColorDeModulo[]

/**
 * En reposo, el cuadro lleva el pastel suave (`color`). Activo, cada color
 * suma su pastel fuerte; los dos son fondos, y `cn` se queda con el fuerte,
 * que viene después.
 */
const variantesDeCuadro = cva(
  "inline-grid shrink-0 place-items-center text-navy squircle transition-colors duration-300 ease-suave",
  {
    variants: {
      tamano: {
        sm: "size-8 rounded-[10px] [&_svg]:size-4",
        md: "size-10 rounded-[12px] [&_svg]:size-5",
        lg: "size-12 rounded-campo [&_svg]:size-6",
      } satisfies Record<TamanoDeIcono, string>,
      color: FONDO_SUAVE,
      activo: { true: "", false: "" },
    },
    compoundVariants: COLORES.map((color) => ({ color, activo: true, class: FONDO_FUERTE[color] })),
    defaultVariants: { tamano: "md", activo: false },
  }
)

interface PropsDeCuadroDeIcono {
  /** El ícono de lucide, sin tamaño ni trazo: los pone el cuadro. */
  icono: LucideIcon
  color: ColorDeModulo
  /** Cuadro de 32, 40 o 48 px. Por defecto, `md`. */
  tamano?: TamanoDeIcono
  /** Con el pastel fuerte de fondo en vez del suave: lo elegido. */
  activo?: boolean
  className?: string
}

/**
 * Un ícono cualquiera en un cuadro de pastel: la llegada, el cobro, un
 * oficio. Para el de un módulo está `IconoDeModulo`, que es este mismo cuadro
 * con el ícono y el color del módulo. Es decorativo (`aria-hidden`): siempre
 * va junto a un texto que dice lo mismo. El cambio de suave a fuerte dura lo
 * mismo que una píldora que se desliza.
 */
export function CuadroDeIcono({ icono: Icono, color, tamano = "md", activo = false, className }: PropsDeCuadroDeIcono) {
  return (
    <span aria-hidden="true" className={cn(variantesDeCuadro({ tamano, color, activo }), className)}>
      <Icono strokeWidth={1.75} />
    </span>
  )
}

interface PropsDeIconoDeModulo {
  modulo: ModuloId
  /** Cuadro de 32, 40 o 48 px. Por defecto, `md`. */
  tamano?: TamanoDeIcono
  /** Con el pastel fuerte de fondo en vez del suave: el módulo elegido. */
  activo?: boolean
  className?: string
}

/** El ícono del módulo en su cuadro, con el color del módulo. */
export function IconoDeModulo({ modulo, tamano, activo, className }: PropsDeIconoDeModulo) {
  return (
    <CuadroDeIcono
      icono={ICONOS_DE_MODULO[modulo]}
      color={moduloPorId(modulo).color}
      tamano={tamano}
      activo={activo}
      className={className}
    />
  )
}
