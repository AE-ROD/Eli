import type { ReactNode } from "react"
import type { LucideIcon } from "lucide-react"
import { CuadroDeIcono } from "@/components/comunes/icono-de-modulo"
import { TITULO_DE_TARJETA } from "@/components/panel/estilos"
import type { ColorDeModulo } from "@/lib/modulos"
import { cn } from "@/lib/utils"

interface PropsDeEncabezadoDeTarjeta {
  titulo: ReactNode
  /** El `id` del título, para el `aria-labelledby` de la sección que encabeza. */
  id?: string
  subtitulo?: ReactNode
  /**
   * El ícono de la izquierda: en el pastel suave del módulo del que habla la
   * tarjeta (la agenda, los clientes), o en gris si no es de ningún módulo.
   */
  icono?: { figura: LucideIcon; color?: ColorDeModulo }
  /** A la derecha: un enlace o un botón. En el teléfono baja debajo del título si no entra. */
  accion?: ReactNode
  /** `h2` por defecto; `h3` si la tarjeta va dentro de otra sección con título. */
  nivel?: 2 | 3
  className?: string
}

/**
 * La cabecera de una tarjeta del panel: el ícono en su cuadro, el título en
 * la serif de los titulares y una línea debajo; a la derecha, lo que se puede
 * hacer con ella.
 */
export function EncabezadoDeTarjeta({
  titulo,
  id,
  subtitulo,
  icono,
  accion,
  nivel = 2,
  className,
}: PropsDeEncabezadoDeTarjeta) {
  const Titulo = nivel === 2 ? "h2" : "h3"

  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-x-4 gap-y-3", className)}>
      {/*
        El ancho mínimo es lo que hace bajar la acción cuando no entra al
        lado: sin él, el título se achicaba hasta una letra por renglón.
      */}
      <div className="flex min-w-44 flex-1 items-start gap-3">
        {icono &&
          (icono.color ? (
            <CuadroDeIcono icono={icono.figura} color={icono.color} />
          ) : (
            <span
              aria-hidden="true"
              className="inline-grid size-10 shrink-0 place-items-center rounded-[12px] bg-superficie text-navy squircle"
            >
              <icono.figura className="size-5" strokeWidth={1.75} />
            </span>
          ))}
        <div className={cn("min-w-0", icono && "pt-1.5")}>
          <Titulo id={id} className={cn(TITULO_DE_TARJETA, "break-words")}>
            {titulo}
          </Titulo>
          {subtitulo && <p className="mt-1 text-sm text-pretty text-texto-2">{subtitulo}</p>}
        </div>
      </div>
      {accion && <div className="flex shrink-0 items-center gap-2">{accion}</div>}
    </div>
  )
}
