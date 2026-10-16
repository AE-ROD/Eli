"use client"

import { motion, useReducedMotion } from "framer-motion"
import { ArrowUpRight } from "lucide-react"
import { Antetitulo } from "@/components/comunes/antetitulo"
import { Boton } from "@/components/comunes/boton"
import { ChipDePalabra } from "@/components/comunes/chip-de-palabra"
import { CURVA, DURACION } from "@/components/movimiento/tiempos"
import { cn } from "@/lib/utils"

interface ChipFlotante {
  palabra: string
  /** Dónde va respecto del título. */
  lugar: string
  giro: string
}

/**
 * Servicios que se reservan con Eli, flotando alrededor del título. Van sólo
 * desde 1360px, donde sobra lugar a los costados; los lugares salen de la
 * referencia aprobada.
 */
const CHIPS_FLOTANTES: readonly ChipFlotante[] = [
  { palabra: "Corte", lugar: "-left-[150px] -top-1.5", giro: "-rotate-6" },
  { palabra: "Manicura", lugar: "-right-[170px] top-[26px]", giro: "rotate-[5deg]" },
  { palabra: "Barba", lugar: "-bottom-[34px] -left-[104px]", giro: "rotate-[4deg]" },
  { palabra: "Color", lugar: "-bottom-[58px] -right-[112px]", giro: "-rotate-[4deg]" },
]

/** Con menos ancho, dos chips en fila debajo de los botones. */
const CHIPS_EN_FILA = [
  { palabra: "Pago dividido", giro: "-rotate-3" },
  { palabra: "Al centavo", giro: "rotate-2" },
] as const

/** Entran escalonados: 80ms entre uno y otro, después de que se pintó el título. */
const entrada = (orden: number) => ({
  initial: { opacity: 0, y: 16, scale: 0.9 },
  animate: { opacity: 1, y: 0, scale: 1 },
  transition: { duration: DURACION.fundido, ease: CURVA.suave, delay: 0.2 + orden * 0.08 },
})

/**
 * La portada. El título, el subtítulo y los botones no se animan al entrar:
 * son lo primero que se pinta y no esperan a JavaScript. Sólo entran y flotan
 * las palabras de alrededor, que son decoración.
 *
 * En el teléfono es una isla con tres manchas pastel; desde md queda sobre la
 * crema de la página, como en la referencia de escritorio.
 */
export function SeccionPortada() {
  // Con movimiento reducido las palabras entran con un fundido y se quedan quietas.
  const reducido = useReducedMotion()
  return (
    <section
      id="inicio"
      aria-labelledby="portada-titulo"
      className="isla relative overflow-hidden max-md:bg-superficie max-md:bg-[image:radial-gradient(120%_60%_at_0%_0%,var(--color-azul-suave),transparent_55%),radial-gradient(90%_55%_at_100%_8%,var(--color-lila-suave),transparent_60%),radial-gradient(120%_55%_at_50%_108%,var(--color-naranja-suave),transparent_60%)]"
    >
      <div className="contenedor px-5 pb-12 pt-10 text-center md:px-12 md:pb-[88px] md:pt-[72px] xl:px-18 xl:pb-[104px] xl:pt-[88px]">
        <Antetitulo>Salones · Barberías · Spas de uñas</Antetitulo>

        <div className="relative mx-auto mt-4 max-w-[980px] md:mt-5">
          {CHIPS_FLOTANTES.map((chip, orden) => (
            <motion.span
              key={chip.palabra}
              aria-hidden="true"
              className={cn("absolute hidden min-[1360px]:block", chip.lugar)}
              {...entrada(orden)}
            >
              <motion.span
                className="block"
                animate={reducido ? undefined : { y: [0, -10, 0] }}
                transition={{ duration: 7, ease: "easeInOut", repeat: Infinity, delay: 0.8 + orden * 0.9 }}
              >
                <ChipDePalabra className={cn("shadow-md", chip.giro)}>{chip.palabra}</ChipDePalabra>
              </motion.span>
            </motion.span>
          ))}
          <h1 id="portada-titulo" className="titulo-1 text-balance">
            Cada reserva, cada servicio y cada pago, en su lugar.
          </h1>
        </div>

        <p className="cuerpo-xl mx-auto mt-5 max-w-[560px] text-texto-2 md:mt-7">
          Eli ordena el día de tu salón, barbería o spa de uñas: las reservas entran solas, el tablero muestra quién
          espera y quién se atiende, y al cobrar sabes cuánto entró y quién lo generó.
        </p>

        <div className="mt-8 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:justify-center md:mt-10 md:gap-3">
          <Boton href="/crear-cuenta" tamano="lg" icono={<ArrowUpRight aria-hidden="true" />}>
            Crear mi cuenta
          </Boton>
          <Boton href="#recorrido" variante="secundario" tamano="lg">
            Ver cómo funciona
          </Boton>
        </div>

        <div aria-hidden="true" className="mt-6 flex flex-wrap justify-center gap-2.5 min-[1360px]:hidden">
          {CHIPS_EN_FILA.map((chip, orden) => (
            <motion.span key={chip.palabra} className="block" {...entrada(orden)}>
              <ChipDePalabra className={chip.giro}>{chip.palabra}</ChipDePalabra>
            </motion.span>
          ))}
        </div>
      </div>
    </section>
  )
}
