"use client"

import type { CSSProperties } from "react"
import { Link2 } from "lucide-react"
import { MaquetaQuienCobra, MaquetaReservasDeHoy } from "@/components/landing/maquetas/maqueta-dia-a-la-vista"
import { CuadroDeTono, TINTES_DE_PASO } from "@/components/landing/maquetas/maqueta-piezas"
import { EncabezadoDeLanding, SeccionDeLanding } from "@/components/landing/seccion-de-landing"
import { TRAZOS_DEL_TABLERO } from "@/components/landing/trazos-de-la-landing"
import { BotonDePausa } from "@/components/movimiento/boton-de-pausa"
import { TrazosOndulantes } from "@/components/movimiento/trazos-ondulantes"
import { useBloqueEnMovimiento } from "@/components/movimiento/usar-bloque-en-movimiento"
import { cn } from "@/lib/utils"

const PUNTOS = [
  {
    titulo: "Las reservas de hoy entran solas",
    texto: "Lo que reservan en tu página aparece en la columna Reservas de hoy. Nadie tiene que pasarlo a mano.",
  },
  {
    titulo: "Quien llega sin reserva, también",
    texto: "Se anota en el momento y entra a la fila En espera, como cualquier otra visita.",
  },
  {
    titulo: "Cada profesional ve lo suyo",
    texto: "Cada servicio de la visita lleva su profesional y su precio, y cada profesional ve solo lo que le toca.",
  },
  {
    titulo: "Cobran el dueño y el encargado",
    texto: "El profesional atiende y la visita pasa a Por cobrar. El cobro queda en manos del dueño y del encargado.",
  },
] as const

/**
 * El tablero del día: una caja arena con dos maquetas ("Reservas de hoy",
 * con las reservas que entran solas, y "Quién puede cobrar", que flota) y, al
 * lado, la lista de cuatro puntos. En el teléfono, el titular, la caja y la
 * lista, en ese orden.
 *
 * Las filas que entran, la maqueta y la etiqueta que flotan y las líneas que
 * se ondulan se mueven sin fin: el botón de pausa las congela, y fuera de la
 * pantalla se congelan solas. Con movimiento reducido nada se mueve.
 */
export function SeccionTablero() {
  const { ref, pausado, setPausado, quieto } = useBloqueEnMovimiento<HTMLDivElement>()

  return (
    <SeccionDeLanding
      id="tablero"
      etiquetadaPor="tablero-titulo"
      className="bg-linear-to-b from-[#EBDEC8] to-[#E7D8C0]"
    >
      <div
        ref={ref}
        className={cn(
          "grid gap-x-12 gap-y-8 [grid-template-areas:'titulo'_'visual'_'lista'] lg:grid-cols-[minmax(0,1.33fr)_minmax(0,1fr)] lg:grid-rows-[auto_1fr] lg:gap-x-12 lg:[grid-template-areas:'visual_titulo'_'visual_lista'] xl:gap-x-[68px]",
          quieto && "animaciones-en-pausa"
        )}
      >
        <EncabezadoDeLanding
          id="tablero-titulo"
          antetitulo="Tablero"
          className="[grid-area:titulo]"
          titulo={
            <>
              Todo el día, <span className="resaltado">a la vista.</span>
            </>
          }
        />

        <div className="[grid-area:visual]">
          <div className="relative isolate flex min-h-[540px] flex-col overflow-hidden rounded-bloque bg-pistacho-suave px-4 pb-10 pt-6 squircle md:px-12 md:pb-14 md:pt-[38px] lg:h-full lg:min-h-[632px]">
            <svg
              aria-hidden="true"
              viewBox="0 0 700 170"
              width="700"
              height="170"
              className="pointer-events-none absolute bottom-8 left-0 -z-10 overflow-visible"
            >
              <TrazosOndulantes trazos={TRAZOS_DEL_TABLERO} enPausa={quieto} />
            </svg>

            <span
              aria-hidden="true"
              // Desde lg, anclada a la derecha (y no a la izquierda): entre 1024 y 1279 px el bloque es angosto y se cortaba.
              className="relative z-[4] -mb-3 ml-auto mr-2 rotate-[3deg] md:mr-[6%] lg:absolute lg:right-[10%] lg:top-[38px] lg:m-0"
            >
              <span
                className="flex animate-flotar items-center gap-2 whitespace-nowrap rounded-etiqueta border border-borde bg-tarjeta py-[7px] pl-2 pr-4 text-[13px] font-semibold shadow-sm squircle md:text-sm"
                style={{ "--retraso": "-2s" } as CSSProperties}
              >
                <CuadroDeTono tono="ciruela">
                  <Link2 className="size-[15px]" strokeWidth={1.75} />
                </CuadroDeTono>
                Entran desde tu página de reservas
              </span>
            </span>

            <MaquetaReservasDeHoy className="relative z-[2] w-full max-w-[450px] lg:mt-[38px]" />
            <div
              className="relative z-[3] ml-auto mt-3 w-[88%] max-w-[362px] animate-flotar [--giro:0deg] md:-mt-10 lg:absolute lg:bottom-[50px] lg:right-[7%] lg:mt-0 lg:w-[362px]"
              style={{ "--retraso": "-2s" } as CSSProperties}
            >
              <MaquetaQuienCobra />
            </div>
          </div>
        </div>

        <div className="flex flex-col [grid-area:lista]">
          <ol className="flex flex-col gap-[22px]">
            {PUNTOS.map((punto, indice) => {
              const tinte = TINTES_DE_PASO[indice]
              return (
                <li key={punto.titulo} className="relative pl-16">
                  {indice < PUNTOS.length - 1 && (
                    <span aria-hidden="true" className="absolute -bottom-3.5 left-[19px] top-12 w-0.5 rounded-full bg-borde" />
                  )}
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute left-0 top-0.5 grid size-10 place-items-center rounded-full text-[15px] font-semibold ring-5",
                      tinte.suave,
                      tinte.texto,
                      tinte.anillo
                    )}
                  >
                    {indice + 1}
                  </span>
                  <h3 className="pt-1.5 text-[1.3125rem] font-semibold leading-[1.2] tracking-[-0.03em]">{punto.titulo}</h3>
                  <p className="mt-1.5 text-[15px] leading-normal text-texto-2">{punto.texto}</p>
                </li>
              )
            })}
          </ol>
          <div className="mt-6 flex justify-end motion-reduce:hidden lg:mt-auto">
            <BotonDePausa pausado={pausado} alCambiar={setPausado} etiqueta="Pausar la animación del tablero" />
          </div>
        </div>
      </div>
    </SeccionDeLanding>
  )
}
