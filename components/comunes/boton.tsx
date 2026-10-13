import Link from "next/link"
import type { ComponentProps, MouseEvent, ReactNode } from "react"
import { cva } from "class-variance-authority"
import { ArrowRight, LoaderCircle } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * El botón del sistema. Con `href` es un enlace de Next (navega); sin `href`,
 * un `<button>` (hace algo en la pantalla). No hay "botón que navega" con
 * `onClick`: el lector de pantalla tiene que saber si va a cambiar de página.
 *
 * No lleva "use client" a propósito: así `clasesDeBoton` se puede llamar desde
 * un componente de servidor, y el botón se pinta en el servidor cuando no
 * tiene manejadores.
 */

export type VarianteDeBoton = "primario" | "secundario" | "fantasma" | "enlace" | "invertido"

/** Alto de 36, 48 o 56 px. */
export type TamanoDeBoton = "sm" | "md" | "lg"

/** Las que llevan el ícono en un cuadro; `enlace` lo pone suelto junto al texto. */
const CON_CAJA_DE_ICONO: VarianteDeBoton[] = ["primario", "secundario", "fantasma", "invertido"]

/**
 * Las clases de cada combinación. cva sólo las junta; los choques (el alto
 * del tamaño contra el `h-auto` de `enlace`, el relleno de un ícono contra el
 * del tamaño) los resuelve `cn` al final, quedándose con lo que viene después.
 */
const variantesDeBoton = cva(
  [
    // Grupo con nombre: la flecha de `enlace` se mueve con el hover del botón y
    // no con el de una tarjeta `group` que lo contenga.
    "group/boton relative inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap font-medium",
    "squircle anillo-foco transition-[background-color,color,border-color] duration-150 ease-suave",
    "disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50",
  ],
  {
    variants: {
      // `leading-none` va después del tamaño de letra: en Tailwind 4 `text-sm`
      // también fija el interlineado, y `cn` descarta el `leading` que quede antes.
      tamano: {
        // 36px no alcanza para un dedo: el ::after estira el área que se puede
        // tocar a 44px de alto sin cambiar lo que se ve.
        sm: "h-9 rounded-boton px-3.5 text-sm leading-none after:absolute after:inset-x-0 after:-inset-y-1",
        md: "h-12 rounded-boton px-5 text-base leading-none",
        lg: "h-14 rounded-boton-lg px-6 text-base leading-none",
      } satisfies Record<TamanoDeBoton, string>,
      // Va después del tamaño para que `enlace` le gane en alto, relleno y radio.
      variante: {
        // El hover es un paso más claro que el navy, como en la referencia visual.
        primario: "bg-navy text-white hover:bg-[#1d3a5c]",
        secundario: "border-[1.5px] border-navy bg-transparent text-navy hover:bg-navy/6",
        fantasma: "bg-transparent text-navy hover:bg-navy/6",
        // Sin caja: el texto subrayado es el botón y el alto mínimo es el área
        // táctil. Hereda el color, así sirve igual sobre crema y sobre navy; al
        // pasar el cursor, la flecha se corre.
        enlace: "h-auto min-h-11 rounded-md px-0 underline decoration-[1.5px] underline-offset-4",
        // Blanco con texto navy, para ir sobre un fondo navy.
        invertido: "bg-white text-navy hover:bg-superficie",
      } satisfies Record<VarianteDeBoton, string>,
      // Interno: lo usa `Boton` cuando lleva ícono; `clasesDeBoton` no lo expone.
      conIcono: { true: "", false: "" },
    },
    compoundVariants: [
      // Con ícono, el cuadro va pegado al borde izquierdo y el texto se separa más.
      { conIcono: true, variante: CON_CAJA_DE_ICONO, tamano: "sm", class: "gap-2 pl-1.5" },
      { conIcono: true, variante: CON_CAJA_DE_ICONO, tamano: ["md", "lg"], class: "gap-3 pl-2" },
    ],
    defaultVariants: { variante: "primario", tamano: "md", conIcono: false },
  }
)

const cajaDeIcono = cva("grid shrink-0 place-items-center squircle", {
  variants: {
    tamano: {
      sm: "size-6 rounded-[8px] [&_svg:not([class*='size-'])]:size-3.5",
      md: "size-8 rounded-[10px] [&_svg:not([class*='size-'])]:size-4",
      lg: "size-10 rounded-[12px] [&_svg:not([class*='size-'])]:size-5",
    } satisfies Record<TamanoDeBoton, string>,
    // Sobre el botón blanco de `invertido`, el cuadro pasa a navy.
    invertido: { true: "bg-navy text-white", false: "bg-white text-navy" },
  },
  defaultVariants: { tamano: "md", invertido: false },
})

/**
 * Las clases de un botón, para darle esa forma a algo que no es `Boton` (un
 * `Link` con su propio manejo, un `label` de un archivo). Lo que llega en
 * `className` le gana a lo de acá cuando chocan.
 */
export function clasesDeBoton({
  variante = "primario",
  tamano = "md",
  className,
}: { variante?: VarianteDeBoton; tamano?: TamanoDeBoton; className?: string } = {}): string {
  return cn(variantesDeBoton({ variante, tamano }), className)
}

interface PropsComunesDeBoton {
  /** Por defecto, `primario`. */
  variante?: VarianteDeBoton
  /** Por defecto, `md`. */
  tamano?: TamanoDeBoton
  /** Va en un cuadro blanco a la izquierda del texto (navy en `invertido`). */
  icono?: ReactNode
  className?: string
  children: ReactNode
}

type PropsDeBotonComoEnlace = PropsComunesDeBoton &
  Omit<ComponentProps<typeof Link>, keyof PropsComunesDeBoton | "href"> & {
    href: string
  }

type PropsDeBotonComoBoton = PropsComunesDeBoton &
  Omit<ComponentProps<"button">, keyof PropsComunesDeBoton> & {
    href?: undefined
    /**
     * Mientras carga muestra un indicador y no responde. No se deshabilita:
     * un botón deshabilitado pierde el foco, el navegador lo tira al `<body>`
     * y en un diálogo eso deja afuera a quien usa teclado. Se marca con
     * `aria-disabled` y el clic se corta con `preventDefault`, que también
     * frena el envío del formulario con Enter desde un campo.
     */
    cargando?: boolean
  }

export type PropsDeBoton = PropsDeBotonComoEnlace | PropsDeBotonComoBoton

function evitarElClic(evento: MouseEvent<HTMLButtonElement>) {
  evento.preventDefault()
}

function contenido(variante: VarianteDeBoton, tamano: TamanoDeBoton, icono: ReactNode, children: ReactNode) {
  return (
    <>
      {Boolean(icono) && variante !== "enlace" && (
        <span aria-hidden="true" className={cajaDeIcono({ tamano, invertido: variante === "invertido" })}>
          {icono}
        </span>
      )}
      {variante === "enlace" && icono}
      {children}
      {variante === "enlace" && (
        <ArrowRight
          aria-hidden="true"
          className="size-[1.125em] shrink-0 transition-transform duration-150 ease-suave group-hover/boton:translate-x-0.5 group-focus-visible/boton:translate-x-0.5"
        />
      )}
    </>
  )
}

export function Boton(props: PropsDeBoton) {
  if (props.href !== undefined) {
    const { variante = "primario", tamano = "md", icono, className, children, ...resto } = props
    return (
      <Link {...resto} className={cn(variantesDeBoton({ variante, tamano, conIcono: Boolean(icono) }), className)}>
        {contenido(variante, tamano, icono, children)}
      </Link>
    )
  }

  const {
    variante = "primario",
    tamano = "md",
    icono,
    className,
    children,
    cargando = false,
    type = "button",
    disabled,
    onClick,
    "aria-disabled": ariaDisabled,
    ...resto
  } = props

  return (
    <button
      {...resto}
      type={type}
      disabled={disabled}
      aria-disabled={cargando && !disabled ? true : ariaDisabled}
      onClick={cargando ? evitarElClic : onClick}
      className={cn(variantesDeBoton({ variante, tamano, conIcono: Boolean(icono) && !cargando }), className)}
    >
      {cargando ? (
        <>
          <LoaderCircle aria-hidden="true" className={cn("animate-spin", tamano === "sm" ? "size-4" : "size-5")} />
          {/* El texto sigue siendo el nombre del botón, que conserva el foco mientras carga. */}
          <span className="sr-only">{children}</span>
        </>
      ) : (
        contenido(variante, tamano, icono, children)
      )}
    </button>
  )
}
