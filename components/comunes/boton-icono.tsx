import Link from "next/link"
import type { ComponentProps, ReactNode } from "react"
import { cva } from "class-variance-authority"
import { ArrowUpRight } from "lucide-react"
import { cn } from "@/lib/utils"
import type { TamanoDeBoton } from "@/components/comunes/boton"

/**
 * Botón cuadrado de sólo ícono: blanco con sombra suave, se oscurece a navy al
 * pasar el cursor. Con `href` es un enlace de Next; sin `href`, un `<button>`.
 *
 * `etiqueta` es obligatoria porque es su único nombre: el ícono no se lee.
 */

const variantesDeBotonIcono = cva(
  [
    "relative inline-flex shrink-0 items-center justify-center bg-tarjeta text-navy shadow-sm",
    "squircle anillo-foco transition-colors duration-150 ease-suave hover:bg-navy hover:text-white",
    "disabled:cursor-not-allowed disabled:opacity-50",
  ],
  {
    variants: {
      tamano: {
        // A 36px el ::after estira el área táctil a 44px sin cambiar lo que se ve.
        sm: "size-9 rounded-[12px] after:absolute after:-inset-1 [&_svg:not([class*='size-'])]:size-4",
        md: "size-12 rounded-boton [&_svg:not([class*='size-'])]:size-5",
        lg: "size-14 rounded-boton-lg [&_svg:not([class*='size-'])]:size-6",
      } satisfies Record<TamanoDeBoton, string>,
    },
    defaultVariants: { tamano: "md" },
  }
)

interface PropsComunesDeBotonIcono {
  /** El nombre del botón (`aria-label`). */
  etiqueta: string
  /** Por defecto, una flecha ↗. */
  icono?: ReactNode
  /** Cuadrado de 36, 48 o 56 px. Por defecto, `md`. */
  tamano?: TamanoDeBoton
  className?: string
}

type PropsComoEnlace = PropsComunesDeBotonIcono &
  Omit<ComponentProps<typeof Link>, keyof PropsComunesDeBotonIcono | "href" | "children" | "aria-label"> & {
    href: string
  }

type PropsComoBoton = PropsComunesDeBotonIcono &
  Omit<ComponentProps<"button">, keyof PropsComunesDeBotonIcono | "children" | "aria-label"> & {
    href?: undefined
  }

export type PropsDeBotonIcono = PropsComoEnlace | PropsComoBoton

export function BotonIcono(props: PropsDeBotonIcono) {
  if (props.href !== undefined) {
    const { etiqueta, icono = <ArrowUpRight />, tamano = "md", className, ...resto } = props
    return (
      <Link {...resto} aria-label={etiqueta} className={cn(variantesDeBotonIcono({ tamano }), className)}>
        {icono}
      </Link>
    )
  }

  const { etiqueta, icono = <ArrowUpRight />, tamano = "md", className, type = "button", ...resto } = props
  return (
    <button {...resto} type={type} aria-label={etiqueta} className={cn(variantesDeBotonIcono({ tamano }), className)}>
      {icono}
    </button>
  )
}
