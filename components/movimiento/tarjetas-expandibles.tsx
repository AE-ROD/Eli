"use client"

import { Fragment, useId, useState, type ReactNode } from "react"
import { cn } from "@/lib/utils"
import { useCoincideMedia } from "./usar-coincide-media"

export interface PasoDeTarjeta {
  texto: string
  /** El ícono ya en su cuadro de color. Es decoración. */
  icono: ReactNode
}

export interface TarjetaExpandible {
  /** Estable: es la clave de la tarjeta. */
  id: string
  /** El ícono ya en su cuadro de color. Es decoración. */
  icono: ReactNode
  titulo: string
  /** Lo que se lee con la tarjeta cerrada. */
  corto: string
  /** Lo que se lee con la tarjeta abierta, arriba de la línea de pasos. */
  largo: string
  pasos: readonly PasoDeTarjeta[]
}

/**
 * Son cuatro, ni una más ni una menos: los anchos de abajo están hechos para
 * cuatro tarjetas y tres conectores.
 */
export type CuatroTarjetas = readonly [TarjetaExpandible, TarjetaExpandible, TarjetaExpandible, TarjetaExpandible]

/*
 * El contenido de cada tarjeta tiene ancho fijo: el que le toca a la tarjeta
 * abierta (o a una cerrada), calculado contra el ancho de la fila con
 * unidades de contenedor (`cqw`). Así el texto no se reacomoda mientras la
 * tarjeta crece: la tarjeta lo va descubriendo y el `overflow-hidden` corta
 * lo que todavía no entra.
 *
 * Las cuentas: cada conector es una píldora de 28px que se mete 6px en cada
 * tarjeta, así que ocupa 16px (48px los tres). La abierta crece 2,6 contra 1
 * de las otras: se lleva 2,6/5,6 del resto (un poco menos, 0,46, para que
 * sobre margen), y cada cerrada 1/5,6. A eso se le resta el relleno de 32px
 * de cada lado.
 */
const ANCHO_CERRADA = "xl:w-[calc((100cqw_-_48px)/5.6_-_64px)]"
const ANCHO_ABIERTA = "xl:w-[calc((100cqw_-_48px)*0.46_-_64px)]"

interface PropsDeTarjetasExpandibles {
  tarjetas: CuatroTarjetas
  className?: string
}

/**
 * Cuatro tarjetas en fila unidas por conectores en forma de píldora. La activa
 * (con el cursor encima, con el foco o con un clic) crece a lo ancho y cambia
 * su texto corto por uno largo con una línea de pasos.
 *
 * Por debajo de xl no entran en fila sin cortar el texto: se apilan, todas
 * abiertas, y el título deja de ser un botón porque no hay nada que abrir.
 */
export function TarjetasExpandibles({ tarjetas, className }: PropsDeTarjetasExpandibles) {
  const [activa, setActiva] = useState(0)
  // En el servidor se asume la fila: es lo que se ve en escritorio, y en un
  // teléfono el CSS ya apila y abre todo antes de que llegue JavaScript.
  const enFila = useCoincideMedia("(min-width: 1280px)", true)
  const base = useId()

  return (
    <div
      className={cn(
        "@container mx-auto flex max-w-[640px] flex-col xl:h-[440px] xl:max-w-none xl:flex-row",
        className
      )}
    >
      {tarjetas.map((tarjeta, indice) => (
        <Fragment key={tarjeta.id}>
          {indice > 0 && (
            <span
              aria-hidden="true"
              className="relative z-10 mx-auto -my-1.5 block h-7 w-3.5 shrink-0 rounded-full bg-tarjeta xl:-mx-1.5 xl:my-0 xl:h-3.5 xl:w-7 xl:self-center"
            />
          )}
          <TarjetaQueCrece
            tarjeta={tarjeta}
            indice={indice}
            activa={indice === activa}
            enFila={enFila}
            idDelDetalle={`${base}-detalle-${indice}`}
            alActivar={setActiva}
          />
        </Fragment>
      ))}
    </div>
  )
}

interface PropsDeTarjetaQueCrece {
  tarjeta: TarjetaExpandible
  indice: number
  activa: boolean
  enFila: boolean
  idDelDetalle: string
  alActivar: (indice: number) => void
}

function TarjetaQueCrece({ tarjeta, indice, activa, enFila, idDelDetalle, alActivar }: PropsDeTarjetaQueCrece) {
  const activar = () => alActivar(indice)

  return (
    <article
      onMouseEnter={activar}
      className={cn(
        "relative min-w-0 overflow-hidden rounded-[40px] bg-tarjeta text-navy squircle",
        // El ancho es la excepción a "sólo transform y opacity": lo pide el patrón.
        "transition-[flex-grow,box-shadow] duration-500 ease-in-out xl:basis-0",
        activa ? "shadow-md xl:grow-[2.6]" : "shadow-sm xl:grow"
      )}
    >
      <div className="flex h-full flex-col p-7 xl:p-8">
        <div className="flex items-center justify-between gap-3">
          {tarjeta.icono}
          <span aria-hidden="true" className="text-[13px] font-medium tabular-nums text-texto-2">
            {String(indice + 1).padStart(2, "0")}
          </span>
        </div>

        <h3 className="titulo-3 mt-[18px] xl:mt-7">
          {enFila ? (
            <button
              type="button"
              aria-expanded={activa}
              aria-controls={idDelDetalle}
              onClick={activar}
              onFocus={activar}
              // El ::after cubre la tarjeta entera: se abre con un clic en cualquier parte.
              className="anillo-foco rounded-[10px] text-left xl:whitespace-nowrap after:absolute after:inset-0 after:rounded-[40px]"
            >
              {tarjeta.titulo}
            </button>
          ) : (
            tarjeta.titulo
          )}
        </h3>

        <div className="relative mt-3 xl:mt-auto">
          <p
            aria-hidden={activa || undefined}
            className={cn(
              "hidden max-w-[220px] text-[15px] leading-[1.4] text-texto-2 transition-opacity duration-300 ease-suave xl:block",
              ANCHO_CERRADA,
              activa && "opacity-0"
            )}
          >
            {tarjeta.corto}
          </p>

          <div
            id={idDelDetalle}
            className={cn(
              "xl:absolute xl:bottom-0 xl:left-0 xl:transition-[opacity,visibility] xl:ease-suave",
              ANCHO_ABIERTA,
              // Al abrirse, el detalle espera a que la tarjeta haya crecido un poco.
              activa ? "xl:visible xl:opacity-100 xl:delay-200 xl:duration-400" : "xl:invisible xl:opacity-0 xl:duration-300"
            )}
          >
            <p className="text-base leading-normal text-texto-2">{tarjeta.largo}</p>
            <ol className="mt-6 flex items-start">
              {tarjeta.pasos.map((paso) => (
                <li
                  key={paso.texto}
                  className={cn(
                    "relative flex min-w-0 flex-1 flex-col items-start gap-2 pr-3 text-[13px] font-medium leading-[1.3]",
                    // La línea punteada que une un paso con el siguiente.
                    "after:absolute after:top-[18px] after:right-2.5 after:left-[46px] after:border-t-[1.5px] after:border-dashed after:border-[#D9D4C9] last:after:hidden"
                  )}
                >
                  {paso.icono}
                  {paso.texto}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </article>
  )
}
