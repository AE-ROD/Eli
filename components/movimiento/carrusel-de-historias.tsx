"use client"

import { AnimatePresence, LayoutGroup, motion, useInView } from "framer-motion"
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react"
import { useCallback, useEffect, useId, useRef, useState, type FocusEvent, type ReactNode } from "react"
import { BotonIcono } from "@/components/comunes/boton-icono"
import { Insignia } from "@/components/comunes/insignia"
import type { ColorDeModulo } from "@/lib/modulos"
import { cn } from "@/lib/utils"
import { useCoincideMedia } from "./usar-coincide-media"
import { CURVA, DURACION } from "./tiempos"

export interface Historia {
  /** Estable: es la clave de la historia. */
  id: string
  /** Quién la vive ("Barbería"): se lee en la píldora y en la insignia. */
  oficio: string
  titulo: string
  texto: string
  color: ColorDeModulo
  /** La maqueta que va en la escena, a la izquierda de la tarjeta. */
  escena: ReactNode
}

interface PropsDeCarruselDeHistorias {
  historias: readonly Historia[]
  /** El nombre del carrusel para el lector de pantalla. */
  etiqueta: string
  className?: string
}

const AVANCE_AUTOMATICO_MS = 5000

/** Del suave al fuerte del pastel: el fondo de la píldora y de la escena. */
const DEGRADADO: Record<ColorDeModulo, string> = {
  azul: "from-azul-suave to-azul",
  naranja: "from-naranja-suave to-naranja",
  lila: "from-lila-suave to-lila",
  lima: "from-lima-suave to-lima",
  turquesa: "from-turquesa-suave to-turquesa",
}

/*
 * Dónde va cada historia según su distancia a la activa. En teléfono y tableta
 * están todas apiladas donde va la tarjeta y sólo se ve la activa. Desde lg
 * las vecinas son píldoras a los lados de la tarjeta; desde xl también las de
 * más allá, más chicas, y así quedan escalonadas.
 *
 * `--ancho` es el ancho de la tarjeta, y las píldoras se ubican contra él: 28px
 * de aire hasta la vecina (88px de ancho) y 16px más hasta la lejana (70px).
 * Las posiciones son de layout, no transformaciones: framer mide cajas y anima
 * el cambio de una a otra con transform.
 */
const LUGARES: Record<number, string> = {
  [-2]: "inset-0 hidden xl:block xl:inset-auto xl:top-[82px] xl:left-[calc(50%_-_var(--ancho)/2_-_202px)] xl:h-[336px] xl:w-[70px]",
  [-1]: "inset-0 lg:inset-auto lg:top-10 lg:left-[calc(50%_-_var(--ancho)/2_-_116px)] lg:h-[420px] lg:w-[88px]",
  0: "inset-0 z-10 lg:inset-y-0 lg:right-auto lg:left-[calc(50%_-_var(--ancho)/2)] lg:w-[var(--ancho)]",
  1: "inset-0 lg:inset-auto lg:top-10 lg:left-[calc(50%_+_var(--ancho)/2_+_28px)] lg:h-[420px] lg:w-[88px]",
  2: "inset-0 hidden xl:block xl:inset-auto xl:top-[82px] xl:left-[calc(50%_+_var(--ancho)/2_+_132px)] xl:h-[336px] xl:w-[70px]",
}

/** Cuántos lugares separan a una historia de la activa, dando la vuelta: de -2 a 2 con cinco. */
function desfaseDe(indice: number, activo: number, total: number): number {
  const desfase = (indice - activo + total) % total
  return desfase > total / 2 ? desfase - total : desfase
}

interface EstadoDelCarrusel {
  activo: number
  /**
   * Una por historia. Mientras la historia pasa entre lugares que se ven,
   * conserva su caja y framer anima el cambio (la píldora que crece hasta ser
   * la tarjeta). Si el salto es largo (la del extremo que da la vuelta al otro
   * lado), o si la caja entra o sale de lo que se ve, la generación sube: la
   * caja vieja se va con un fundido donde estaba y la nueva aparece con otro,
   * en vez de cruzar el escenario entero o de crecer desde una caja oculta.
   */
  generaciones: readonly number[]
}

/** `ladoVisible`: cuántos lugares se ven a cada lado de la tarjeta en este ancho. */
function navegar(estado: EstadoDelCarrusel, destino: number, total: number, ladoVisible: number): EstadoDelCarrusel {
  const activo = ((destino % total) + total) % total
  if (activo === estado.activo) return estado
  const generaciones = Array.from({ length: total }, (_, indice) => {
    const generacion = estado.generaciones[indice] ?? 0
    const antes = desfaseDe(indice, estado.activo, total)
    const despues = desfaseDe(indice, activo, total)
    const cambiaDeVisibilidad = Math.abs(antes) > ladoVisible || Math.abs(despues) > ladoVisible
    const saltaLejos = Math.abs(despues - antes) > 2
    return cambiaDeVisibilidad || saltaLejos ? generacion + 1 : generacion
  })
  return { activo, generaciones }
}

/**
 * Si el foco llegó con el teclado. El foco de un clic no pausa: para el mouse
 * ya está la pausa con el cursor encima, y si no, el avance quedaría frenado
 * después de tocar una flecha aunque el cursor ya se haya ido.
 */
function esFocoDeTeclado(elemento: EventTarget): boolean {
  if (!(elemento instanceof Element)) return false
  try {
    return elemento.matches(":focus-visible")
  } catch {
    // Un navegador que no conoce `:focus-visible`: ante la duda, pausa.
    return true
  }
}

/**
 * Una tarjeta grande en el centro y, a los lados, las demás historias como
 * píldoras verticales escalonadas. Da la vuelta: después de la última viene la
 * primera. Al cambiar, la píldora crece hasta ser la tarjeta y la tarjeta se
 * achica hasta ser píldora (`layoutId`).
 *
 * Avanza solo cada cinco segundos, salvo con el cursor encima, con el foco
 * adentro, fuera de pantalla o en pausa. Con movimiento reducido arranca en
 * pausa. Mientras avanza solo, el lector de pantalla no anuncia cada cambio;
 * cuando se maneja a mano, sí.
 */
export function CarruselDeHistorias({ historias, etiqueta, className }: PropsDeCarruselDeHistorias) {
  const total = historias.length
  const [estado, setEstado] = useState<EstadoDelCarrusel>(() => ({
    activo: 0,
    generaciones: historias.map(() => 0),
  }))

  // En el servidor se asume escritorio ancho; en un teléfono, el CSS ya apila
  // las historias antes de que estas dos se corrijan al hidratar.
  const conPildoras = useCoincideMedia("(min-width: 1024px)", true)
  const conLejanas = useCoincideMedia("(min-width: 1280px)", true)
  const ladoVisible = conLejanas ? 2 : 1

  const reducido = useCoincideMedia("(prefers-reduced-motion: reduce)")
  const [pausaElegida, setPausaElegida] = useState<boolean | null>(null)
  const pausado = pausaElegida ?? reducido
  const [conCursor, setConCursor] = useState(false)
  const [conFoco, setConFoco] = useState(false)
  const raiz = useRef<HTMLDivElement>(null)
  const enPantalla = useInView(raiz, { amount: 0.3 })
  const avanzaSolo = !pausado && !conCursor && !conFoco && enPantalla

  const grupo = useId()

  const mover = useCallback(
    (paso: number) => setEstado((previo) => navegar(previo, previo.activo + paso, total, ladoVisible)),
    [total, ladoVisible]
  )
  const irA = useCallback(
    (destino: number) => setEstado((previo) => navegar(previo, destino, total, ladoVisible)),
    [total, ladoVisible]
  )

  // Depende de `estado.activo` para empezar a contar de nuevo después de cada
  // cambio, también los hechos a mano: nadie quiere que avance a los dos segundos.
  useEffect(() => {
    if (!avanzaSolo) return
    const temporizador = window.setInterval(() => {
      if (!document.hidden) mover(1)
    }, AVANCE_AUTOMATICO_MS)
    return () => window.clearInterval(temporizador)
  }, [avanzaSolo, estado.activo, mover])

  const alSalirElFoco = (evento: FocusEvent<HTMLDivElement>) => {
    const destino = evento.relatedTarget
    if (!(destino instanceof Node) || !evento.currentTarget.contains(destino)) setConFoco(false)
  }

  const alternarPausa = () => {
    // Quien pide reanudar quiere ver el avance aunque el foco siga en el botón.
    if (pausado) setConFoco(false)
    setPausaElegida(!pausado)
  }

  return (
    <LayoutGroup id={grupo}>
      <div
        ref={raiz}
        role="region"
        aria-roledescription="carrusel"
        aria-label={etiqueta}
        onPointerEnter={() => setConCursor(true)}
        onPointerLeave={() => setConCursor(false)}
        onFocus={(evento) => {
          if (esFocoDeTeclado(evento.target)) setConFoco(true)
        }}
        onBlur={alSalirElFoco}
        className={className}
      >
        <div
          aria-live={avanzaSolo ? "off" : "polite"}
          className="relative h-[640px] [--ancho:600px] md:h-[500px] xl:[--ancho:720px]"
        >
          <AnimatePresence initial={false}>
            {historias.map((historia, indice) => {
              const desfase = desfaseDe(indice, estado.activo, total)
              const activa = desfase === 0
              const generacion = estado.generaciones[indice] ?? 0
              return (
                <motion.div
                  key={`${historia.id}-${generacion}`}
                  // Sin píldoras a la vista (teléfono y tableta) todas las cajas
                  // ocupan el mismo lugar: no hay layout que animar y las
                  // historias se cruzan con el fundido de `animate`.
                  layoutId={`${historia.id}-${generacion}`}
                  className={cn(
                    "absolute overflow-hidden bg-linear-160",
                    DEGRADADO[historia.color],
                    LUGARES[desfase] ?? "hidden",
                    activa ? "shadow-md ring-1 ring-borde/70 squircle" : !conPildoras && "pointer-events-none"
                  )}
                  // El radio va en `style` para que framer lo corrija mientras
                  // la caja cambia de tamaño; con una clase se deformaría.
                  style={{ borderRadius: activa ? 48 : 44 }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: activa || conPildoras ? 1 : 0 }}
                  exit={{ opacity: 0 }}
                  transition={{
                    layout: { duration: DURACION.expandir, ease: CURVA.suave },
                    opacity: { duration: DURACION.fundido, ease: CURVA.fundido },
                  }}
                >
                  <AnimatePresence initial={false}>
                    {activa ? (
                      <TarjetaDeHistoria key="tarjeta" historia={historia} posicion={indice + 1} total={total} />
                    ) : (
                      <PildoraDeHistoria key="pildora" oficio={historia.oficio} alElegir={() => irA(indice)} />
                    )}
                  </AnimatePresence>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>

        {/*
          Los puntos primero y los botones después, en el código y en la vista:
          en un teléfono no entran en una fila con áreas táctiles de 44px, y al
          partirse en dos el orden del foco sigue siendo el que se ve.
        */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
          <div className="flex">
            {historias.map((historia, indice) => {
              const actual = indice === estado.activo
              return (
                <button
                  key={historia.id}
                  type="button"
                  aria-label={`Historia ${indice + 1}: ${historia.oficio}`}
                  aria-current={actual ? "true" : undefined}
                  onClick={() => irA(indice)}
                  className="anillo-foco relative grid size-11 place-items-center rounded-[12px]"
                >
                  <span className="size-2 rounded-full bg-texto-2" />
                  {actual && (
                    <motion.span
                      layoutId="punto-activo"
                      className="absolute h-2 w-6 rounded-full bg-navy"
                      transition={{ duration: DURACION.pildora, ease: CURVA.suave }}
                    />
                  )}
                </button>
              )
            })}
          </div>
          <div className="flex items-center gap-2">
            <BotonIcono etiqueta="Historia anterior" icono={<ChevronLeft />} onClick={() => mover(-1)} />
            <BotonIcono etiqueta="Historia siguiente" icono={<ChevronRight />} onClick={() => mover(1)} />
            <BotonIcono
              etiqueta={pausado ? "Reanudar el avance automático" : "Pausar el avance automático"}
              icono={pausado ? <Play /> : <Pause />}
              onClick={alternarPausa}
              className="ml-2"
            />
          </div>
        </div>
      </div>
    </LayoutGroup>
  )
}

interface PropsDeTarjetaDeHistoria {
  historia: Historia
  posicion: number
  total: number
}

/*
 * La tarjeta y la píldora son lo de adentro de la caja. Llevan `layout` para
 * que framer les descuente la escala de la caja mientras crece o se achica:
 * sin eso el texto se vería estirado. La caja, con `overflow-hidden`, las va
 * descubriendo.
 */
function TarjetaDeHistoria({ historia, posicion, total }: PropsDeTarjetaDeHistoria) {
  return (
    <motion.div
      layout
      role="group"
      aria-roledescription="historia"
      aria-label={`${posicion} de ${total}: ${historia.oficio}`}
      className="absolute inset-0 grid grid-rows-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,11fr)_minmax(0,9fr)] md:grid-rows-1"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: DURACION.pildora, ease: CURVA.suave, delay: 0.15 } }}
      exit={{ opacity: 0, transition: { duration: DURACION.hover, ease: CURVA.suave } }}
    >
      <div className="grid min-h-0 place-items-center p-5 md:p-8">
        <div className="w-full max-w-[330px]">{historia.escena}</div>
      </div>
      <div className="flex flex-col bg-tarjeta p-6 md:justify-end md:px-9 md:py-10">
        <Insignia tono={historia.color} className="self-start">
          {historia.oficio}
        </Insignia>
        <h3 className="titulo-3 mt-3.5">{historia.titulo}</h3>
        <p className="mt-3 text-base leading-normal text-texto-2">{historia.texto}</p>
      </div>
    </motion.div>
  )
}

interface PropsDePildoraDeHistoria {
  oficio: string
  alElegir: () => void
}

/**
 * Un atajo para el mouse: fuera del orden del foco y oculta para el lector de
 * pantalla, que ya tiene los puntos y las flechas para lo mismo.
 */
function PildoraDeHistoria({ oficio, alElegir }: PropsDePildoraDeHistoria) {
  return (
    <motion.button
      layout
      type="button"
      tabIndex={-1}
      aria-hidden="true"
      onClick={alElegir}
      className="absolute inset-0 grid cursor-pointer place-items-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: DURACION.pildora, ease: CURVA.suave, delay: 0.1 } }}
      exit={{ opacity: 0, transition: { duration: 0.1 } }}
    >
      <span className="rotate-180 whitespace-nowrap text-[15px] font-medium text-navy [writing-mode:vertical-rl]">
        {oficio}
      </span>
    </motion.button>
  )
}
