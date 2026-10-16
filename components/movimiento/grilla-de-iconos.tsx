import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export interface TileDeGrilla {
  /** Estable: es la clave del tile. */
  id: string
  titulo: string
  /** El ícono ya en su cuadro de color. Es decoración. */
  icono: ReactNode
}

/** Columnas en cada ancho: una en teléfono, dos desde md y cinco desde lg. */
const COLUMNAS = { base: 1, md: 2, lg: 5 } as const

type Ancho = keyof typeof COLUMNAS

const ANCHOS = Object.keys(COLUMNAS) as Ancho[]

/** Ocultar o mostrar un puente en cada ancho. Escritas enteras: Tailwind no ve las clases armadas al vuelo. */
const MOSTRAR: Record<Ancho, readonly [oculto: string, visible: string]> = {
  base: ["hidden", "block"],
  md: ["md:hidden", "md:block"],
  lg: ["lg:hidden", "lg:block"],
}

/** Las clases de un puente que se ve sólo en los anchos donde el tile tiene vecino de ese lado. */
function clasesDePuente(tieneVecino: (columnas: number) => boolean): string {
  return ANCHOS.map((ancho) => MOSTRAR[ancho][tieneVecino(COLUMNAS[ancho]) ? 1 : 0]).join(" ")
}

/*
 * Un puente es un rectángulo del gris de los tiles con los lados largos
 * curvados hacia adentro (dos medias lunas de 8px de radio): parece que los
 * tiles se estiran uno hacia el otro. Llena los 16px de separación y se mete
 * 1px en cada tile, que es del mismo color, para que no quede una línea de
 * luz entre los dos.
 */
const PUENTE_A_LA_DERECHA = "M0 0H1A8 8 0 0 0 17 0H18V56H17A8 8 0 0 0 1 56H0Z"
const PUENTE_HACIA_ABAJO = "M0 0V1A8 8 0 0 1 0 17V18H56V17A8 8 0 0 1 56 1V0Z"

interface PropsDeGrillaDeIconos {
  tiles: readonly TileDeGrilla[]
  className?: string
}

/**
 * Una grilla de tiles grises, cada uno con su ícono y su nombre, unidos por
 * puentes cóncavos con el vecino de la derecha y con el de abajo. Al pasar el
 * cursor, el tile crece un poco (1,06; 1,02 en teléfono, donde ocupa todo el
 * ancho).
 */
export function GrillaDeIconos({ tiles, className }: PropsDeGrillaDeIconos) {
  const total = tiles.length

  return (
    <ul className={cn("grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5", className)}>
      {tiles.map((tile, indice) => {
        const aLaDerecha = clasesDePuente((columnas) => indice % columnas !== columnas - 1 && indice + 1 < total)
        const haciaAbajo = clasesDePuente((columnas) => indice + columnas < total)
        return (
          <li
            key={tile.id}
            className={cn(
              "relative flex items-center gap-4 rounded-[24px] bg-superficie px-[18px] py-3.5 squircle",
              "md:min-h-[176px] md:flex-col md:items-start md:justify-between md:gap-5 md:rounded-panel md:p-6",
              "transition-transform duration-200 ease-suave hover:z-10 motion-safe:hover:scale-[1.02] motion-safe:md:hover:scale-[1.06]"
            )}
          >
            {tile.icono}
            <span className="text-base font-medium leading-[1.3] tracking-[-0.2px] xl:text-[17px]">{tile.titulo}</span>
            <svg
              aria-hidden="true"
              viewBox="0 0 18 56"
              className={cn("pointer-events-none absolute top-1/2 left-[calc(100%_-_1px)] -mt-7 h-14 w-[18px] fill-superficie", aLaDerecha)}
            >
              <path d={PUENTE_A_LA_DERECHA} />
            </svg>
            <svg
              aria-hidden="true"
              viewBox="0 0 56 18"
              className={cn("pointer-events-none absolute top-[calc(100%_-_1px)] left-1/2 -ml-7 h-[18px] w-14 fill-superficie", haciaAbajo)}
            >
              <path d={PUENTE_HACIA_ABAJO} />
            </svg>
          </li>
        )
      })}
    </ul>
  )
}
