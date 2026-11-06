import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

/** Cuál de los brillos tenues lleva detrás (`fondo-tenue-*` en `app/globals.css`). */
export type TonoDeSeccion = "frambuesa" | "pistacho" | "ciruela"

const FONDO_TENUE: Record<TonoDeSeccion, string> = {
  frambuesa: "fondo-tenue-frambuesa",
  pistacho: "fondo-tenue-pistacho",
  ciruela: "fondo-tenue-ciruela",
}

interface PropsDeSeccionDeLanding {
  id?: string
  /** El `id` del titular de la sección. */
  etiquetadaPor: string
  /** Los brillos de detrás. Sin esto, crema lisa. */
  tono?: TonoDeSeccion
  /** Para el `<section>`. */
  className?: string
  /** Para el contenedor de adentro, que limita el ancho y pone el relleno. */
  interior?: string
  children: ReactNode
}

/**
 * Una sección del medio de la landing nueva: de borde a borde sobre la
 * crema, con los brillos tenues del diseño detrás y el contenido en el
 * contenedor de 1440px (72px de margen a 1440, como el diseño). No es una
 * isla: el diseño nuevo no las separa en bloques.
 *
 * Recorta lo que se sale (las líneas que se ondulan entran desde fuera de la
 * pantalla): nada de lo de adentro deja scroll horizontal.
 */
export function SeccionDeLanding({ id, etiquetadaPor, tono, className, interior, children }: PropsDeSeccionDeLanding) {
  return (
    <section id={id} aria-labelledby={etiquetadaPor} className={cn("relative isolate overflow-hidden text-navy", className)}>
      {tono && <div aria-hidden="true" className={cn("pointer-events-none absolute inset-0 -z-10", FONDO_TENUE[tono])} />}
      <div className={cn("contenedor px-5 py-14 md:px-12 md:py-16 xl:px-18", interior)}>{children}</div>
    </section>
  )
}

interface PropsDeEncabezadoDeLanding {
  /** El `id` del `<h2>`. */
  id: string
  /** Va en la píldora blanca con el punto pistacho. */
  antetitulo?: string
  titulo: ReactNode
  subtitulo?: ReactNode
  /** Por defecto, `izquierda`. */
  alineacion?: "izquierda" | "centro"
  className?: string
}

/**
 * El antetítulo en píldora, el titular de la sección (`titulo-landing`, con
 * la palabra que importa en `resaltado`) y una bajada, como en el diseño.
 */
export function EncabezadoDeLanding({
  id,
  antetitulo,
  titulo,
  subtitulo,
  alineacion = "izquierda",
  className,
}: PropsDeEncabezadoDeLanding) {
  const centrado = alineacion === "centro"
  return (
    <div className={cn("flex flex-col", centrado ? "items-center text-center" : "items-start text-left", className)}>
      {antetitulo && <p className="antetitulo-pildora">{antetitulo}</p>}
      <h2 id={id} className={cn("titulo-landing text-balance", antetitulo && "mt-4")}>
        {titulo}
      </h2>
      {subtitulo && (
        <p className="mt-4 max-w-[640px] text-lg leading-[1.45] text-texto-2 md:text-[1.1875rem]">{subtitulo}</p>
      )}
    </div>
  )
}
