"use client"

import { motion, useInView, type Variants } from "framer-motion"
import { useEffect, useRef, useState } from "react"
import { Pause, Play } from "lucide-react"
import { ChipDePalabra } from "@/components/comunes/chip-de-palabra"
import { cn } from "@/lib/utils"
import { useCoincideMedia } from "./usar-coincide-media"
import { CURVA } from "./tiempos"

/** Píxeles por segundo: una palabra cruza una pantalla de escritorio en unos 30 segundos. */
const VELOCIDAD = 40

/** La escala de una palabra en el borde; en el centro es 1. */
const ESCALA_EN_EL_BORDE = 0.85

/**
 * La pista lleva las palabras tres veces. Da la vuelta al recorrer una copia,
 * así que lo que se ve tiene que caber en las otras dos: con palabras que
 * sumen al menos medio ancho de pantalla, nunca queda un hueco.
 */
const COPIAS = 3

/** Las palabras entran de a una, 80ms después de la anterior. */
const ENTRADA: Variants = {
  oculta: { opacity: 0, y: 16, scale: 0.9 },
  visible: (orden: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.5, ease: CURVA.suave, delay: orden * 0.08 },
  }),
}

interface Medidas {
  /** Lo que avanza la pista hasta que la segunda copia queda donde estaba la primera. */
  anchoDeCopia: number
  centroDelContenedor: number
  /** El centro de cada palabra, medido desde el borde izquierdo de la pista. */
  centros: number[]
}

/** Se mide con `offsetLeft`, que no ve las transformaciones: la pista puede estar en cualquier punto. */
function medir(contenedor: HTMLElement, palabras: HTMLElement[], porCopia: number): Medidas {
  const primera = palabras[0]
  const primeraDeLaSegunda = palabras[porCopia]
  return {
    anchoDeCopia: primera && primeraDeLaSegunda ? primeraDeLaSegunda.offsetLeft - primera.offsetLeft : 0,
    centroDelContenedor: contenedor.clientWidth / 2,
    centros: palabras.map((palabra) => palabra.offsetLeft + palabra.offsetWidth / 2),
  }
}

interface PropsDeMarquesina {
  palabras: readonly string[]
  /** El nombre de la lista para el lector de pantalla. */
  etiqueta: string
  className?: string
}

/**
 * Una fila de palabras que se desplaza sola y sin fin. Cada palabra se achica
 * cuanto más lejos está del centro (de 1 a 0,85). Se detiene con el cursor
 * encima, cuando no está en pantalla y con su botón de pausa: algo que se
 * mueve solo más de cinco segundos tiene que poder detenerse (WCAG 2.2.2), y
 * el cursor no sirve con el teclado ni en el teléfono.
 *
 * El movimiento lo hace un solo `requestAnimationFrame` que escribe `transform`
 * en la pista y en cada palabra, sin pasar por React: un render por cuadro
 * para veinte palabras sería caro, y leer la posición de cada una con
 * `getBoundingClientRect` en cada cuadro, también. Las medidas se toman una
 * vez y se rehacen sólo cuando algo cambia de tamaño.
 *
 * Con movimiento reducido no se desplaza: las palabras quedan quietas y
 * enteras, en varias filas.
 */
export function Marquesina({ palabras, etiqueta, className }: PropsDeMarquesina) {
  const contenedorRef = useRef<HTMLDivElement>(null)
  const pistaRef = useRef<HTMLDivElement>(null)
  // Fuera del estado a propósito: cambia en cada cuadro y no tiene que repintar React.
  const desplazamientoRef = useRef(0)
  const [conCursor, setConCursor] = useState(false)
  const [pausada, setPausada] = useState(false)
  const enPantalla = useInView(contenedorRef, { margin: "100px 0px" })
  const reducido = useCoincideMedia("(prefers-reduced-motion: reduce)")
  const enMarcha = enPantalla && !conCursor && !pausada && !reducido
  const porCopia = palabras.length

  useEffect(() => {
    const contenedor = contenedorRef.current
    const pista = pistaRef.current
    if (!contenedor || !pista) return
    const enLaPista = Array.from(pista.querySelectorAll<HTMLElement>("[data-palabra]"))

    if (reducido) {
      pista.style.transform = ""
      for (const palabra of enLaPista) palabra.style.transform = ""
      return
    }

    let medidas = medir(contenedor, enLaPista, porCopia)

    const pintar = () => {
      const desplazamiento = desplazamientoRef.current
      pista.style.transform = `translate3d(${-desplazamiento}px, 0, 0)`
      const mitad = Math.max(1, medidas.centroDelContenedor)
      enLaPista.forEach((palabra, indice) => {
        const centro = (medidas.centros[indice] ?? 0) - desplazamiento
        const distancia = Math.min(1, Math.abs(centro - medidas.centroDelContenedor) / mitad)
        // Cuadrática: cerca del centro casi no cambia y el achique se nota hacia los bordes.
        const escala = 1 - (1 - ESCALA_EN_EL_BORDE) * distancia * distancia
        palabra.style.transform = `scale(${escala.toFixed(3)})`
      })
    }

    const alCambiarDeTamano = new ResizeObserver(() => {
      medidas = medir(contenedor, enLaPista, porCopia)
      pintar()
    })
    alCambiarDeTamano.observe(contenedor)
    alCambiarDeTamano.observe(pista)
    pintar()

    if (!enMarcha) return () => alCambiarDeTamano.disconnect()

    let anterior = performance.now()
    let cuadro = window.requestAnimationFrame(function avanzar(ahora: number) {
      // Con tope: al volver de otra pestaña no da un salto de varios segundos.
      const transcurrido = Math.min(ahora - anterior, 50)
      anterior = ahora
      if (medidas.anchoDeCopia > 0) {
        desplazamientoRef.current = (desplazamientoRef.current + (VELOCIDAD * transcurrido) / 1000) % medidas.anchoDeCopia
      }
      pintar()
      cuadro = window.requestAnimationFrame(avanzar)
    })

    return () => {
      window.cancelAnimationFrame(cuadro)
      alCambiarDeTamano.disconnect()
    }
  }, [enMarcha, reducido, porCopia])

  return (
    <div className={cn("relative", className)}>
      <div
        ref={contenedorRef}
        onPointerEnter={() => setConCursor(true)}
        onPointerLeave={() => setConCursor(false)}
        className="overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_12%,#000_88%,transparent)] motion-reduce:[mask-image:none]"
      >
        <motion.div initial="oculta" whileInView="visible" viewport={{ once: true, amount: 0.3 }}>
          <div ref={pistaRef} className="relative flex w-max pt-3.5 pb-5 motion-reduce:block motion-reduce:w-auto">
            {Array.from({ length: COPIAS }, (_, copia) => (
              <ul
                key={copia}
                // La primera copia es la lista; las otras son relleno para el lector de pantalla.
                aria-label={copia === 0 ? etiqueta : undefined}
                aria-hidden={copia > 0 || undefined}
                className={cn(
                  "flex shrink-0 motion-reduce:flex-wrap motion-reduce:justify-center motion-reduce:gap-y-3",
                  copia > 0 && "motion-reduce:hidden"
                )}
              >
                {palabras.map((palabra, orden) => (
                  <li key={palabra} data-palabra="" className="mr-3 shrink-0 motion-reduce:mx-1.5">
                    <motion.span className="block" variants={ENTRADA} custom={orden}>
                      <ChipDePalabra>{palabra}</ChipDePalabra>
                    </motion.span>
                  </li>
                ))}
              </ul>
            ))}
          </div>
        </motion.div>
      </div>
      {/*
        Fuera de la máscara, que lo desvanecería, y sobre el borde derecho, donde
        las palabras ya se funden: se ve sin tapar ninguna. Toma el color del
        texto de alrededor, así sirve sobre navy y sobre crema. Con movimiento
        reducido no hace falta: la fila ya está quieta.
      */}
      <button
        type="button"
        aria-label="Pausar el movimiento de las palabras"
        aria-pressed={pausada}
        onClick={() => setPausada((antes) => !antes)}
        className="absolute right-2 top-1/2 grid size-11 -translate-y-1/2 cursor-pointer place-items-center rounded-full bg-current/10 transition-colors duration-150 ease-suave hover:bg-current/20 anillo-foco motion-reduce:hidden md:right-4"
      >
        {pausada ? (
          <Play aria-hidden="true" strokeWidth={1.75} className="size-4" />
        ) : (
          <Pause aria-hidden="true" strokeWidth={1.75} className="size-4" />
        )}
      </button>
    </div>
  )
}
