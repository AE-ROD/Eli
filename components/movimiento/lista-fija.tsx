"use client"

import { AnimatePresence, motion, useMotionValue, type MotionValue } from "framer-motion"
import { useEffect, useRef, useState, type ReactNode } from "react"
import { cn } from "@/lib/utils"
import { useCoincideMedia } from "./usar-coincide-media"
import { CURVA, DURACION } from "./tiempos"

export interface ItemDeListaFija {
  /** Estable: es la clave del ítem y la de su visual. */
  id: string
  /** El ícono ya en su cuadro de color. Es decoración. */
  icono: ReactNode
  titulo: string
  texto: string
  /** Lo que muestra el visual fijo mientras este ítem es el activo (una maqueta). */
  visual: ReactNode
}

interface PropsDeListaFija {
  /** Antetítulo y titular: van en la columna fija, arriba del visual. */
  encabezado: ReactNode
  items: readonly ItemDeListaFija[]
  /** La columna fija a la izquierda y la lista a la derecha. Por defecto, al revés. */
  invertida?: boolean
  /** Las clases del fondo del visual, por lo general un degradado. */
  fondoDelVisual?: string
  className?: string
}

/**
 * La franja del medio de la pantalla, un 10% de alto: el ítem que la cruza es
 * el activo. Uno solo la cruza a la vez, y el activo no cambia hasta que otro
 * llega, así que arriba de la lista queda el primero y abajo, el último.
 */
const FRANJA_CENTRAL = "-45% 0px -45% 0px"

/**
 * Dos columnas: una fija con el titular y un visual, y una lista que pasa por
 * al lado. El ítem que cruza el centro de la pantalla es el activo: se ve
 * entero (los demás, al 30%), lleva debajo una barra con lo que lleva
 * recorrido, y el visual cambia a su maqueta con un fundido cruzado.
 *
 * En pantallas angostas es una columna: titular, visual y la lista entera, sin
 * atenuar ni barras, porque ahí el visual no acompaña al ítem.
 */
export function ListaFija({ encabezado, items, invertida = false, fondoDelVisual, className }: PropsDeListaFija) {
  const [activo, setActivo] = useState(0)
  // Lo que lleva recorrido el ítem activo, de 0 a 1. Es un valor de framer y
  // no un estado: cambia en cada cuadro de scroll y mueve la barra sin repintar React.
  const recorrido = useMotionValue(0)
  const reducido = useCoincideMedia("(prefers-reduced-motion: reduce)")
  const visible = items[activo] ?? items[0]

  return (
    // `grid-cols-1` y no la columna automática: con `minmax(0, 1fr)` una maqueta
    // más ancha que un teléfono se acomoda adentro en vez de ensanchar la página.
    <div className={cn("grid grid-cols-1 items-start gap-10 lg:grid-cols-2 lg:gap-14 xl:gap-24", className)}>
      {/* Primero en el código aunque a veces quede a la derecha: el titular se lee antes que la lista. */}
      <div className="lg:sticky lg:top-30">
        {encabezado}
        <div
          className={cn(
            "mt-7 grid place-items-center overflow-hidden rounded-[24px] p-4 squircle sm:p-6",
            "lg:mt-10 lg:min-h-[420px] lg:rounded-tarjeta lg:p-10",
            fondoDelVisual
          )}
        >
          <div className="grid w-full max-w-[440px]">
            {/*
              Todas las maquetas, invisibles y apiladas en la misma celda: el
              recuadro toma el alto de la más alta y no cambia de tamaño al
              pasar de una a otra. En una columna, el cambio movería la lista.
            */}
            {items.map((item) => (
              <div key={item.id} aria-hidden="true" inert className="invisible [grid-area:1/1]">
                {item.visual}
              </div>
            ))}
            {visible && (
              <AnimatePresence initial={false}>
                <motion.div
                  key={visible.id}
                  className="[grid-area:1/1]"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: DURACION.fundido, ease: CURVA.fundido }}
                >
                  {visible.visual}
                </motion.div>
              </AnimatePresence>
            )}
          </div>
        </div>
      </div>

      <ol className={cn("lg:pb-40", !invertida && "lg:order-first")}>
        {items.map((item, indice) => (
          <FilaDeListaFija
            key={item.id}
            item={item}
            indice={indice}
            activo={indice === activo}
            recorrido={recorrido}
            reducido={reducido}
            alCruzarElCentro={setActivo}
          />
        ))}
      </ol>
    </div>
  )
}

interface PropsDeFila {
  item: ItemDeListaFija
  indice: number
  activo: boolean
  recorrido: MotionValue<number>
  reducido: boolean
  alCruzarElCentro: (indice: number) => void
}

function FilaDeListaFija({ item, indice, activo, recorrido, reducido, alCruzarElCentro }: PropsDeFila) {
  const fila = useRef<HTMLLIElement>(null)

  // Sólo la fila activa mide su recorrido: 0 cuando su borde de arriba llega
  // al centro de la pantalla y 1 cuando llega el de abajo. Mide una vez por
  // cuadro, no en cada evento de scroll. Con movimiento reducido no se mide:
  // nada se ata al scroll y la barra va llena.
  useEffect(() => {
    const elemento = fila.current
    if (!activo || reducido || !elemento) return
    let cuadro = 0
    const medir = () => {
      cuadro = 0
      const caja = elemento.getBoundingClientRect()
      const avance = (window.innerHeight / 2 - caja.top) / Math.max(1, caja.height)
      recorrido.set(Math.min(1, Math.max(0, avance)))
    }
    const pedirMedida = () => {
      if (cuadro === 0) cuadro = window.requestAnimationFrame(medir)
    }
    medir()
    window.addEventListener("scroll", pedirMedida, { passive: true })
    window.addEventListener("resize", pedirMedida, { passive: true })
    return () => {
      window.removeEventListener("scroll", pedirMedida)
      window.removeEventListener("resize", pedirMedida)
      if (cuadro !== 0) window.cancelAnimationFrame(cuadro)
    }
  }, [activo, reducido, recorrido])

  useEffect(() => {
    const elemento = fila.current
    if (!elemento) return
    const observador = new IntersectionObserver(
      ([entrada]) => {
        if (entrada?.isIntersecting) alCruzarElCentro(indice)
      },
      { rootMargin: FRANJA_CENTRAL }
    )
    observador.observe(elemento)
    return () => observador.disconnect()
  }, [alCruzarElCentro, indice])

  return (
    <li
      ref={fila}
      className={cn(
        "flex gap-5 pt-8 transition-opacity duration-300 ease-suave first:pt-0 lg:min-h-[260px] lg:pt-10 lg:first:pt-2",
        activo ? "opacity-100" : "lg:opacity-30"
      )}
    >
      {item.icono}
      <div className="min-w-0 flex-1">
        {/* El número ya lo dice la lista ordenada: es sólo para la vista. */}
        <span aria-hidden="true" className="antetitulo block">
          {String(indice + 1).padStart(2, "0")}
        </span>
        <h3 className="titulo-3 mt-1.5">{item.titulo}</h3>
        <p className="cuerpo-xl mt-3 text-texto-2">{item.texto}</p>
        <div
          aria-hidden="true"
          className={cn(
            "mt-7 hidden h-[3px] overflow-hidden rounded-full bg-borde transition-opacity duration-300 ease-suave lg:block",
            activo ? "opacity-100" : "opacity-0"
          )}
        >
          <motion.span
            className="block h-full origin-left bg-navy"
            style={{ scaleX: reducido ? 1 : activo ? recorrido : 0 }}
          />
        </div>
      </div>
    </li>
  )
}
