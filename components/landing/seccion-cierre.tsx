"use client"

import { ArrowUpRight } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { TRAZOS_DEL_CIERRE } from "@/components/landing/trazos-de-la-landing"
import { BotonDePausa } from "@/components/movimiento/boton-de-pausa"
import { Marquesina } from "@/components/movimiento/marquesina"
import { TrazosOndulantes } from "@/components/movimiento/trazos-ondulantes"
import { useBloqueEnMovimiento } from "@/components/movimiento/usar-bloque-en-movimiento"
import { cn } from "@/lib/utils"

/** Servicios que se reservan en los cuatro oficios (salones, barberías, salones de uñas y clínicas dentales), para las marquesinas. */
const SERVICIOS = [
  "Pedicura",
  "Uñas esculpidas",
  "Limpieza dental",
  "Cejas",
  "Pestañas",
  "Perfilado",
  "Blanqueamiento",
  "Corte",
  "Barba",
  "Color",
  "Control dental",
  "Mechas",
  "Alisado",
  "Peinado",
  "Manicura",
] as const

/** La segunda fila lleva los mismos servicios al revés, y va hacia el otro lado. */
const SERVICIOS_AL_REVES = [...SERVICIOS].reverse()

/**
 * El punto de cada píldora, en la vuelta de cuatro del diseño: rojo, arena,
 * arena y tierra (#9B6B5F, que no tiene token: sólo lo usa este punto).
 */
const PUNTOS = ["bg-frambuesa", "bg-pistacho", "bg-pistacho", "bg-[#9B6B5F]"] as const

function Pildora({ palabra, orden }: { palabra: string; orden: number }) {
  return (
    <span className="inline-flex items-center gap-2.5 whitespace-nowrap rounded-full border border-white/16 bg-white/7 py-2.5 pl-3.5 pr-[22px] text-[15px] font-semibold text-white">
      <span aria-hidden="true" className={cn("size-[9px] shrink-0 rounded-full", PUNTOS[orden % PUNTOS.length])} />
      {palabra}
    </span>
  )
}

/**
 * El cierre: una caja oscura (#2E1212, con un brillo rojo arriba a la derecha
 * y uno burdeos abajo a la izquierda) sobre el burdeos con que termina la
 * página, con "Deja de complicarte. Pásate a Eli.", el botón para crear la
 * cuenta y dos
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
      // La banda burdeos de la página: 72px de margen a 1440 y 48 arriba y abajo; la caja, de 1296px al centro.
      className="bg-[linear-gradient(180deg,#4A1F1F,#451D1D)] px-2 py-2 md:px-6 md:py-6 xl:px-18 xl:py-12"
    >
      <div className="relative isolate mx-auto max-w-[1296px] overflow-hidden rounded-tarjeta bg-[#2E1212] text-white ring-1 ring-white/[.09] anillo-foco-claro squircle">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(520px_340px_at_86%_8%,rgba(184,29,35,.28),transparent_70%),radial-gradient(560px_360px_at_6%_100%,rgba(74,31,31,.55),transparent_70%)]"
        />
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-10 -z-10 h-[230px] opacity-50">
          <svg viewBox="0 0 1296 230" width="1296" height="230" className="absolute left-0 top-0 overflow-visible">
            <TrazosOndulantes trazos={TRAZOS_DEL_CIERRE} enPausa={quieto} />
          </svg>
        </div>

        <div className="px-5 pt-16 text-center md:px-12 md:pt-[78px]">
          <h2
            id="empezar-titulo"
            className="titulo-portada mx-auto max-w-[900px] text-balance text-white lg:text-[4.5rem] lg:leading-[1.02]"
          >
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
      </div>
    </section>
  )
}
