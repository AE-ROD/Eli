"use client"

import { ArrowUpRight } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { TRAZOS_DEL_CIERRE } from "@/components/landing/trazos-de-la-landing"
import { BotonDePausa } from "@/components/movimiento/boton-de-pausa"
import { Marquesina } from "@/components/movimiento/marquesina"
import { TrazosOndulantes } from "@/components/movimiento/trazos-ondulantes"
import { useBloqueEnMovimiento } from "@/components/movimiento/usar-bloque-en-movimiento"
import { cn } from "@/lib/utils"

/** Servicios que se reservan en los salones, barberías y spas de uñas, para las marquesinas. */
const SERVICIOS = [
  "Pedicura",
  "Uñas esculpidas",
  "Cejas",
  "Pestañas",
  "Perfilado",
  "Corte",
  "Barba",
  "Color",
  "Mechas",
  "Alisado",
  "Peinado",
  "Manicura",
] as const

/** La segunda fila lleva los mismos servicios al revés, y va hacia el otro lado. */
const SERVICIOS_AL_REVES = [...SERVICIOS].reverse()

/** El punto de cada píldora, dando la vuelta a los cuatro colores. */
const PUNTOS = ["bg-frambuesa", "bg-pistacho", "bg-lavanda", "bg-pervinca"] as const

function Pildora({ palabra, orden }: { palabra: string; orden: number }) {
  return (
    <span className="inline-flex items-center gap-2.5 whitespace-nowrap rounded-full border border-white/16 bg-white/7 py-2.5 pl-3.5 pr-[22px] text-[15px] font-semibold text-white">
      <span aria-hidden="true" className={cn("size-[9px] shrink-0 rounded-full", PUNTOS[orden % PUNTOS.length])} />
      {palabra}
    </span>
  )
}

/**
 * El cierre: un bloque navy con los brillos de la paleta, "Deja de
 * complicarte. Pásate a Eli.", el botón para crear la cuenta y dos
 * marquesinas de servicios que van en sentidos opuestos. Arriba, detrás del
 * titular, las líneas que se ondulan.
 *
 * Un solo botón de pausa detiene las dos marquesinas y las líneas; fuera de
 * la pantalla se detienen solas y con el cursor encima se detiene la
 * marquesina que lo tiene. La segunda marquesina repite las palabras de la
 * primera: es decorativa y con movimiento reducido no se muestra (la primera
 * queda quieta, entera y en varias filas).
 */
export function SeccionCierre() {
  const { ref, pausado, setPausado, quieto } = useBloqueEnMovimiento<HTMLElement>()

  return (
    <section
      ref={ref}
      id="empezar"
      aria-labelledby="empezar-titulo"
      // Como el pie: 72px de margen a 1440 y, desde ahí, 1296px al centro. Rangos
      // cerrados: Tailwind escribe `min-[1440px]:` antes que `md:` y `xl:`.
      className="fondo-brillos-navy relative isolate mx-2 overflow-hidden rounded-tarjeta text-white anillo-foco-claro squircle md:max-xl:mx-6 xl:max-[1439px]:mx-18 min-[1440px]:mx-auto min-[1440px]:w-[1296px]"
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-10 -z-10 h-[230px] opacity-50">
        <svg viewBox="0 0 1296 230" width="1296" height="230" className="absolute left-0 top-0 overflow-visible">
          <TrazosOndulantes trazos={TRAZOS_DEL_CIERRE} enPausa={quieto} />
        </svg>
      </div>

      <div className="px-5 pt-16 text-center md:px-12 md:pt-[78px]">
        <h2 id="empezar-titulo" className="titulo-portada mx-auto max-w-[900px] text-balance text-white lg:text-[4.5rem] lg:leading-[1.02]">
          <span className="block">Deja de complicarte.</span>{" "}
          <span className="block">
            Pásate a{" "}
            <span className="resaltado [--resaltado-fondo:var(--color-frambuesa)] [--resaltado-texto:white]">Eli.</span>
          </span>
        </h2>
        <Boton
          href="/crear-cuenta"
          variante="destacado"
          icono={<ArrowUpRight aria-hidden="true" />}
          className="mt-[34px] rounded-boton-lg text-sm"
        >
          Crear mi cuenta
        </Boton>
      </div>

      {/* Cada marquesina deja 14px arriba y 20 abajo de las píldoras: la segunda sube 20 para que queden a 14. */}
      <div className="mt-8 flex flex-col motion-reduce:pb-10 md:mt-12">
        <Marquesina
          palabras={SERVICIOS}
          etiqueta="Servicios que se reservan con Eli"
          pausada={quieto}
          sinEscala
          ficha={(palabra, orden) => <Pildora palabra={palabra} orden={orden} />}
        />
        <div aria-hidden="true" className="-mt-5 motion-reduce:hidden">
          <Marquesina
            palabras={SERVICIOS_AL_REVES}
            etiqueta="Servicios que se reservan con Eli"
            sentido="derecha"
            pausada={quieto}
            sinEscala
            ficha={(palabra, orden) => <Pildora palabra={palabra} orden={orden} />}
          />
        </div>
      </div>

      <div className="flex justify-end px-5 pb-6 md:px-8 md:pb-8 motion-reduce:hidden">
        <BotonDePausa pausado={pausado} alCambiar={setPausado} etiqueta="Pausar el movimiento del cierre" />
      </div>
    </section>
  )
}
