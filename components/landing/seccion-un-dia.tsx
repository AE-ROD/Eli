"use client"

import type { CSSProperties, ReactNode } from "react"
import { motion } from "framer-motion"
import {
  MaquetaMomentoAtencion,
  MaquetaMomentoCobro,
  MaquetaMomentoLlegada,
  MaquetaMomentoReserva,
} from "@/components/landing/maquetas/maqueta-un-dia"
import { TINTES_DE_PASO } from "@/components/landing/maquetas/maqueta-piezas"
import { EncabezadoDeLanding, SeccionDeLanding } from "@/components/landing/seccion-de-landing"
import { TRAZOS_DE_UN_DIA } from "@/components/landing/trazos-de-la-landing"
import { BotonDePausa } from "@/components/movimiento/boton-de-pausa"
import { TrazosOndulantes } from "@/components/movimiento/trazos-ondulantes"
import { useBloqueEnMovimiento } from "@/components/movimiento/usar-bloque-en-movimiento"
import { cn } from "@/lib/utils"

interface Momento {
  id: string
  titulo: string
  texto: string
  maqueta: ReactNode
}

/** El recorrido de una visita en cuatro momentos, de la reserva al cobro. */
const MOMENTOS: readonly Momento[] = [
  {
    id: "reserva",
    titulo: "Reserva",
    texto: "La clienta reserva sola, desde tu página.",
    maqueta: <MaquetaMomentoReserva />,
  },
  {
    id: "llegada",
    titulo: "Llegada",
    texto: "Tocas «Llegó» y pasa a En espera.",
    maqueta: <MaquetaMomentoLlegada />,
  },
  {
    id: "atencion",
    titulo: "Atención",
    texto: "Cada servicio, con su profesional.",
    maqueta: <MaquetaMomentoAtencion />,
  },
  {
    id: "cobro",
    titulo: "Cobro",
    texto:
      "Cobran el dueño o el encargado, y el pago se divide entre efectivo, tarjetas, transferencia o billetera digital. Si hubo un error se anula: queda quién, cuándo y por qué.",
    maqueta: <MaquetaMomentoCobro />,
  },
]

/**
 * Desde lg, las cuatro tarjetas van en fila con 32px entre ellas, y la línea
 * de tiempo va del centro de la primera al de la última: a un octavo del
 * ancho sin los tres huecos, de cada lado.
 */
const COMIENZO_DE_LA_LINEA = "calc((100% - 96px) / 8)"

/**
 * "Un día con Eli": cuatro tarjetas sobre una línea de tiempo. Los números
 * laten, un punto recorre la línea y las maquetas flotan; desde lg, unas
 * líneas que se ondulan llegan desde el borde al comienzo de la línea. Por
 * debajo de lg, la línea va de arriba abajo, sin el punto.
 *
 * Todo se mueve solo y sin fin: el botón de pausa lo congela, y fuera de la
 * pantalla se congela solo. Con movimiento reducido nada se mueve.
 */
export function SeccionUnDia() {
  const { ref, pausado, setPausado, quieto } = useBloqueEnMovimiento<HTMLDivElement>()

  return (
    <SeccionDeLanding
      id="un-dia"
      etiquetadaPor="un-dia-titulo"
      className="bg-linear-to-b from-[#F0E5D2] via-[#EEE2CE] via-41% to-[#EBDEC8]"
    >
      <div ref={ref} className={cn(quieto && "animaciones-en-pausa")}>
        <EncabezadoDeLanding
          id="un-dia-titulo"
          antetitulo="De la reserva al cobro"
          alineacion="centro"
          titulo={
            <>
              Un día con <span className="resaltado">Eli.</span>
            </>
          }
          subtitulo="Sin papeles ni planillas."
        />

        <ol className="relative mt-10 flex flex-col gap-5 md:mt-12 lg:mt-14 lg:grid lg:grid-cols-4 lg:gap-8 lg:pt-[72px]">
          <LineaDeTiempo quieto={quieto} />
          {MOMENTOS.map((momento, indice) => {
            const tinte = TINTES_DE_PASO[indice]
            const ultimo = indice === MOMENTOS.length - 1
            return (
              <li key={momento.id} className="relative flex gap-4 lg:block">
                {/* En el teléfono, el tramo de línea hasta el número siguiente. */}
                {!ultimo && (
                  <span aria-hidden="true" className="absolute -bottom-5 left-[18px] top-10 w-0.5 bg-ciruela/25 lg:hidden" />
                )}
                <span
                  aria-hidden="true"
                  className="relative z-[3] grid size-[38px] shrink-0 animate-latido place-items-center rounded-full bg-ciruela text-[15px] font-semibold text-white outline-6 outline-crema lg:absolute lg:-top-[72px] lg:left-1/2 lg:-translate-x-1/2"
                  style={{ "--retraso": `${-indice * 0.8}s` } as CSSProperties}
                >
                  {indice + 1}
                </span>
                <article
                  aria-labelledby={`un-dia-${momento.id}`}
                  className="min-w-0 flex-1 overflow-hidden rounded-[30px] border border-borde bg-tarjeta p-2.5 shadow-maqueta squircle md:grid md:grid-cols-2 md:items-center md:gap-2 lg:block lg:h-full"
                >
                  <div aria-hidden="true" className={cn("grid h-[236px] grid-cols-1 place-items-center rounded-[22px] px-2 squircle", tinte.suave)}>
                    {/* A lo más los 232px de la maqueta (`grid-cols-1` deja que la columna sea más angosta que ella): entre 1024 y 1279 px la tarjeta es más angosta y la maqueta se achica en vez de cortarse. */}
                    <div
                      className="flex w-full max-w-[232px] justify-center animate-flotar [--giro:0deg]"
                      style={{ "--duracion": "6.4s", "--retraso": `${-indice * 1.6}s` } as CSSProperties}
                    >
                      {momento.maqueta}
                    </div>
                  </div>
                  <div className="px-3.5 pb-4 pt-5 md:pt-4 lg:pt-5">
                    <p className={cn("text-xs font-semibold uppercase tracking-[0.08em]", tinte.texto)}>Paso {indice + 1}</p>
                    <h3
                      id={`un-dia-${momento.id}`}
                      className="mt-1 text-[1.625rem] font-semibold leading-[1.15] tracking-[-0.035em]"
                    >
                      {momento.titulo}
                    </h3>
                    <p className="mt-2 text-[14.5px] leading-normal text-texto-2">{momento.texto}</p>
                  </div>
                </article>
              </li>
            )
          })}
        </ol>

        <div className="mt-6 flex justify-end motion-reduce:hidden">
          <BotonDePausa pausado={pausado} alCambiar={setPausado} etiqueta="Pausar la animación de un día con Eli" />
        </div>
      </div>
    </SeccionDeLanding>
  )
}

/**
 * Desde lg: la línea ciruela del centro de la primera tarjeta al de la
 * última (crece una vez al aparecer), las líneas que se ondulan y llegan a
 * su comienzo desde el borde, y el punto rojo que la recorre.
 */
function LineaDeTiempo({ quieto }: { quieto: boolean }) {
  const extremos = { left: COMIENZO_DE_LA_LINEA, right: COMIENZO_DE_LA_LINEA }
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 hidden h-[38px] lg:block">
      {/* El final de las líneas (x 228, y 70 de su caja) cae justo en el comienzo de la línea de tiempo. */}
      <svg
        viewBox="-80 0 308 140"
        width="308"
        height="140"
        className="absolute -top-[51px] overflow-visible"
        style={{ left: `calc(${COMIENZO_DE_LA_LINEA} - 308px)` }}
      >
        <TrazosOndulantes trazos={TRAZOS_DE_UN_DIA} enPausa={quieto} />
      </svg>
      <div className="absolute top-[17.5px] h-[3px] rounded-full bg-borde" style={extremos} />
      <motion.div
        className="absolute top-[17.5px] h-[3px] origin-left rounded-full bg-ciruela"
        style={extremos}
        initial={{ scaleX: 0 }}
        whileInView={{ scaleX: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1.8, ease: [0.4, 0, 0.2, 1], delay: 0.2 }}
      />
      <div className="absolute top-3 h-3.5 motion-reduce:hidden" style={extremos}>
        <div className="absolute inset-0 animate-recorrer">
          <span className="absolute right-0 top-0 z-[4] size-3.5 translate-x-1/2 rounded-full border-2 border-white bg-frambuesa shadow-[0_0_0_1px_var(--color-frambuesa),0_0_0_7px_#b81d2338,0_4px_12px_#b81d2366]" />
        </div>
      </div>
    </div>
  )
}
