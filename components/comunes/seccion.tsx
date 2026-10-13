import type { ReactNode } from "react"
import { cva } from "class-variance-authority"
import { Antetitulo } from "@/components/comunes/antetitulo"
import { cn } from "@/lib/utils"

type FondoDeSeccion = "crema" | "superficie" | "navy" | "degradado"

const variantesDeSeccion = cva("isla", {
  variants: {
    fondo: {
      crema: "bg-crema text-navy",
      superficie: "bg-superficie text-navy",
      // Sobre navy, el contorno del foco de todo lo de adentro pasa a blanco.
      navy: "bg-navy text-white anillo-foco-claro",
      // Tres manchas pastel sobre crema: azul arriba a la izquierda, lila arriba
      // a la derecha y naranja abajo, como la isla "degradado" de la referencia.
      degradado:
        "bg-crema text-navy bg-[image:radial-gradient(120%_90%_at_0%_0%,var(--color-azul-suave),transparent_60%),radial-gradient(120%_90%_at_100%_0%,var(--color-lila-suave),transparent_60%),radial-gradient(120%_100%_at_50%_100%,var(--color-naranja-suave),transparent_70%)]",
    } satisfies Record<FondoDeSeccion, string>,
  },
  defaultVariants: { fondo: "crema" },
})

interface PropsDeSeccion {
  /** Por defecto, `crema`. Con `navy` el texto pasa a blanco. */
  fondo?: FondoDeSeccion
  id?: string
  /** Para la isla: el `<section>` de afuera. */
  className?: string
  /** Para el contenedor de adentro, que limita el ancho y pone el relleno. */
  interior?: string
  children: ReactNode
  "aria-labelledby"?: string
}

/**
 * Una sección de página como isla: un bloque redondeado separado del borde
 * de la pantalla (8px en teléfono, 24px desde md), con un contenedor de hasta
 * 1440px y relleno vertical generoso. La separación vertical entre islas la
 * pone quien las apila (`gap-2 md:gap-6` en el `<main>`), no cada sección.
 */
export function Seccion({
  fondo = "crema",
  id,
  className,
  interior,
  children,
  "aria-labelledby": etiquetadaPor,
}: PropsDeSeccion) {
  return (
    <section id={id} aria-labelledby={etiquetadaPor} className={cn(variantesDeSeccion({ fondo }), className)}>
      <div className={cn("contenedor px-5 py-16 md:px-12 md:py-24 xl:px-18 xl:py-28", interior)}>{children}</div>
    </section>
  )
}

interface PropsDeEncabezadoDeSeccion {
  antetitulo?: string
  titulo: ReactNode
  subtitulo?: ReactNode
  /** El `id` del `<h2>`, para el `aria-labelledby` de la sección. */
  id?: string
  /** Por defecto, `centro`. */
  alineacion?: "centro" | "izquierda"
  /** El tono del fondo donde va: `oscuro` sobre navy, con el texto en blanco. Por defecto, `claro`. */
  tono?: "claro" | "oscuro"
}

/** Antetítulo, titular de sección en serif (hasta 640px) y subtítulo (hasta 560px). */
export function EncabezadoDeSeccion({
  antetitulo,
  titulo,
  subtitulo,
  id,
  alineacion = "centro",
  tono = "claro",
}: PropsDeEncabezadoDeSeccion) {
  const oscuro = tono === "oscuro"
  return (
    <header
      className={cn("flex flex-col", alineacion === "centro" ? "items-center text-center" : "items-start text-left")}
    >
      {antetitulo && <Antetitulo className={oscuro ? "text-white/70" : undefined}>{antetitulo}</Antetitulo>}
      <h2
        id={id}
        className={cn(
          "titulo-seccion max-w-[640px] text-balance",
          antetitulo && "mt-3",
          oscuro ? "text-white" : "text-navy"
        )}
      >
        {titulo}
      </h2>
      {subtitulo && (
        <p className={cn("cuerpo-xl mt-4 max-w-[560px]", oscuro ? "text-white/75" : "text-texto-2")}>{subtitulo}</p>
      )}
    </header>
  )
}
