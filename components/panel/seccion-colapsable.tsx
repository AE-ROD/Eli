"use client"

import { useId, type ReactNode } from "react"
import { ChevronDown } from "lucide-react"
import { TARJETA_DEL_PANEL } from "@/components/panel/estilos"
import { cn } from "@/lib/utils"

interface PropsDeSeccionColapsable {
  titulo: ReactNode
  /** Una línea corta debajo del título con lo que hay adentro. Describe al botón; no lo nombra. */
  descripcion?: ReactNode
  /** Quien la usa guarda si está abierta: así puede abrirla desde afuera (un ancla de la URL). */
  abierta: boolean
  onAlternar: () => void
  /** El nivel del título, según bajo qué título va. Por defecto, `h2`. */
  nivel?: 2 | 3
  /** Para la capa que envuelve el contenido (el espaciado entre sus hijos). */
  className?: string
  children: ReactNode
}

/**
 * Una sección del panel que se pliega: una cabecera en forma de tarjeta, que
 * es un botón con `aria-expanded` dentro de su título, y debajo el contenido,
 * una región nombrada por el título. Las abre y cierra quien la usa (`abierta`
 * y `onAlternar`), así que se pueden tener varias abiertas a la vez.
 *
 * El contenido está siempre en el DOM y, plegado, con `hidden`: no se
 * desmonta, así que no se pierde lo escrito sin guardar ni el estado de lo de
 * adentro. Por lo mismo, un elemento de adentro no se puede desplazar mientras
 * está plegada: quien la abre por un ancla desplaza después de abrirla.
 *
 * El chevron gira sólo con `transform`; con "reducir movimiento" (`globals.css`
 * apaga las transiciones) aparece ya girado.
 */
export function SeccionColapsable({
  titulo,
  descripcion,
  abierta,
  onAlternar,
  nivel = 2,
  className,
  children,
}: PropsDeSeccionColapsable) {
  const Titulo = nivel === 2 ? "h2" : "h3"
  const prefijo = useId()
  const idDelBoton = `${prefijo}-boton`
  const idDelTitulo = `${prefijo}-titulo`
  const idDeLaDescripcion = `${prefijo}-descripcion`
  const idDelContenido = `${prefijo}-contenido`

  return (
    <div>
      <Titulo>
        <button
          type="button"
          id={idDelBoton}
          aria-expanded={abierta}
          aria-controls={idDelContenido}
          // El nombre es sólo el título; la línea de abajo lo describe.
          aria-labelledby={idDelTitulo}
          aria-describedby={descripcion ? idDeLaDescripcion : undefined}
          onClick={onAlternar}
          className={cn(
            TARJETA_DEL_PANEL,
            "flex min-h-16 w-full items-center justify-between gap-4 px-5 py-3 text-left anillo-foco transition-colors duration-150 ease-suave hover:bg-superficie/60 sm:px-6"
          )}
        >
          <span className="min-w-0">
            <span id={idDelTitulo} className="block text-lg font-medium text-pretty text-navy">
              {titulo}
            </span>
            {descripcion && (
              <span id={idDeLaDescripcion} className="mt-0.5 block text-sm text-pretty text-texto-2">
                {descripcion}
              </span>
            )}
          </span>
          <ChevronDown
            aria-hidden="true"
            strokeWidth={1.75}
            className={cn(
              "size-5 shrink-0 text-texto-2 transition-transform duration-300 ease-suave motion-reduce:transition-none",
              abierta && "rotate-180"
            )}
          />
        </button>
      </Titulo>
      {/* Siempre en el DOM, para que `aria-controls` apunte a algo y no se desmonte lo de adentro; plegada, `hidden`. */}
      <div id={idDelContenido} role="region" aria-labelledby={idDelTitulo} hidden={!abierta} className="pt-4 pb-2">
        <div className={className}>{children}</div>
      </div>
    </div>
  )
}
