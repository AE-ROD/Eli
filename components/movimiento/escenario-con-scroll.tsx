"use client"

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react"
import Link from "next/link"
import {
  AnimatePresence,
  motion,
  useInView,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useTransform,
  type PanInfo,
} from "framer-motion"
import { ArrowDown, Check } from "lucide-react"
import { Antetitulo } from "@/components/comunes/antetitulo"
import { FONDO_FUERTE, FONDO_SUAVE, HALO_DE_MODULO } from "@/components/comunes/colores-de-modulo"
import { IconoDeModulo } from "@/components/comunes/icono-de-modulo"
import { Revelar } from "@/components/movimiento/revelar"
import { useCoincideMedia } from "@/components/movimiento/usar-coincide-media"
import { CURVA, DURACION } from "@/components/movimiento/tiempos"
import { moduloPorId, type ColorDeModulo, type ModuloId } from "@/lib/modulos"
import { cn } from "@/lib/utils"

export interface PasoDelEscenario {
  /** Único dentro del escenario. */
  id: string
  modulo: ModuloId
  titulo: string
  texto: string
  puntos?: readonly string[]
  /**
   * La maqueta del paso. Quedan todas montadas, una encima de otra, para que
   * el escenario no cambie de alto entre pasos; `activa` le avisa a cada una
   * cuándo está a la vista, así se vuelve a animar cada vez que su paso queda
   * elegido.
   */
  maqueta: (activa: boolean) => ReactNode
}

interface PropsDeEscenarioConScroll {
  pasos: readonly PasoDelEscenario[]
  /** El nombre de la fila de pestañas para el lector de pantalla. */
  etiqueta: string
  /** El id de lo que sigue en la página: adonde lleva "Saltar el recorrido". */
  saltarA: string
}

/**
 * Cuándo el escenario toma el scroll: desde md, con al menos 640px de alto
 * (por debajo la tarjeta fija no entra) y sin movimiento reducido. Es la misma
 * condición de las clases `md:motion-safe:[@media(min-height:640px)]:` del
 * alto y del `sticky`: el HTML del servidor ya trae la forma correcta para
 * cada pantalla, y JavaScript sólo suma el avance. Hasta hidratar vale falso,
 * y las pestañas cambian el paso a mano.
 *
 * Entre 640 y 820px de alto, los rellenos se achican
 * (`md:[@media(max-height:820px)]:`) para que la maqueta más alta, el
 * calendario, entre en la tarjeta.
 */
const CONSULTA_CON_SCROLL =
  "(min-width: 768px) and (min-height: 640px) and (prefers-reduced-motion: no-preference)"

/** Cuánto mide la tarjeta cuando recién asoma por abajo. Crece hasta 1 al quedar fija. */
const ESCALA_AL_ENTRAR = 0.88

/** Lo que tiene que moverse el dedo de costado para pasar de paso. */
const DESLIZ_MINIMO = 48

/**
 * La malla de cada color: una base suave y tres manchas que se mezclan.
 * Escritas enteras, como en `colores-de-modulo.ts`, para que Tailwind las encuentre.
 */
const MALLA: Record<ColorDeModulo, { base: string; principal: string; vecina: string; suave: string }> = {
  azul: { base: "bg-azul-suave/45", principal: "from-azul/65", vecina: "from-lila/45", suave: "from-azul-suave" },
  naranja: {
    base: "bg-naranja-suave/55",
    principal: "from-naranja/55",
    vecina: "from-lima/40",
    suave: "from-naranja-suave",
  },
  lila: { base: "bg-lila-suave/60", principal: "from-lila/65", vecina: "from-azul/35", suave: "from-lila-suave" },
  lima: { base: "bg-lima-suave/60", principal: "from-lima/70", vecina: "from-turquesa/50", suave: "from-lima-suave" },
  turquesa: {
    base: "bg-turquesa-suave/60",
    principal: "from-turquesa/65",
    vecina: "from-azul/40",
    suave: "from-turquesa-suave",
  },
}

/** El fondo de la escena de cada maqueta: su pastel suave, que se aclara hacia abajo. */
const ESCENA: Record<ColorDeModulo, string> = {
  azul: "from-azul-suave to-azul-suave/35",
  naranja: "from-naranja-suave to-naranja-suave/35",
  lila: "from-lila-suave to-lila-suave/35",
  lima: "from-lima-suave to-lima-suave/35",
  turquesa: "from-turquesa-suave to-turquesa-suave/35",
}

/**
 * Un recorrido por pasos sobre una tarjeta que se queda fija mientras se baja
 * (ScrollStageHero).
 *
 * Desde md (con alto suficiente) y sin movimiento reducido, el contenedor
 * mide el alto de la tarjeta más un tramo por paso, y la tarjeta queda
 * `sticky` a 24px del borde: lo que se baja dentro de ese alto elige el paso
 * (`Math.floor(avance × N)`), y mientras la tarjeta asoma por abajo crece
 * hasta quedar a 24px de los costados. Las pestañas llevan a su paso bajando
 * hasta él.
 *
 * En el teléfono, en ventanas muy bajas y con movimiento reducido no toma el
 * scroll: la tarjeta va con su alto natural, las pestañas cambian el paso y
 * también se pasa de uno a otro deslizando el dedo.
 *
 * Arriba, una pestaña por paso con el ícono de su módulo; el conector blanco
 * se desliza hasta la elegida y la une al cuerpo. El texto se cruza con un
 * fundido, la maqueta también, y el fondo es una malla de pastel que se mueve
 * lento y cambia de tono con el paso.
 */
export function EscenarioConScroll({ pasos, etiqueta, saltarA }: PropsDeEscenarioConScroll) {
  const base = useId()
  const contenedor = useRef<HTMLDivElement>(null)
  const conScroll = useCoincideMedia(CONSULTA_CON_SCROLL)
  const enPantalla = useInView(contenedor)
  const total = pasos.length

  // El paso que marca el scroll se sigue siempre, aunque el escenario no lo
  // use todavía: al hidratar en escritorio con la página ya bajada (el
  // navegador restaura la posición), el paso correcto está listo de entrada.
  const [pasoPorScroll, setPasoPorScroll] = useState(0)
  const [pasoElegido, setPasoElegido] = useState(0)

  // De 0, con el contenedor arriba de la pantalla, a 1, con su final abajo.
  const { scrollYProgress: avance } = useScroll({ target: contenedor, offset: ["start start", "end end"] })
  // De 0, cuando el contenedor asoma por abajo, a 1, cuando llega arriba.
  const { scrollYProgress: llegada } = useScroll({ target: contenedor, offset: ["start end", "start start"] })
  const escala = useTransform(llegada, [0, 1], conScroll ? [ESCALA_AL_ENTRAR, 1] : [1, 1])

  useMotionValueEvent(avance, "change", (valor) => {
    setPasoPorScroll(Math.min(total - 1, Math.max(0, Math.floor(valor * total))))
  })

  if (total === 0) return null
  const activo = Math.min(total - 1, conScroll ? pasoPorScroll : pasoElegido)
  const idDePestana = (indice: number) => `${base}-pestana-${indice}`
  const idDelPanel = `${base}-panel`

  const irAPaso = (indice: number) => {
    const nodo = contenedor.current
    if (!conScroll || !nodo) {
      setPasoElegido(indice)
      return
    }
    // Al medio del tramo del paso: queda elegido aunque el scroll suave se pase un poco.
    const inicio = nodo.getBoundingClientRect().top + window.scrollY
    const recorrido = nodo.offsetHeight - window.innerHeight
    window.scrollTo({ top: inicio + (recorrido * (indice + 0.5)) / total, behavior: "smooth" })
  }

  // Pestañas de ARIA: las flechas, Inicio y Fin pasan de una a otra, y Tab
  // entra sólo a la elegida. El foco se mueve sin saltar: el scroll suave lo
  // hace `irAPaso`.
  const alTeclear = (indice: number, evento: KeyboardEvent<HTMLButtonElement>) => {
    const destino =
      evento.key === "ArrowRight"
        ? (indice + 1) % total
        : evento.key === "ArrowLeft"
          ? (indice - 1 + total) % total
          : evento.key === "Home"
            ? 0
            : evento.key === "End"
              ? total - 1
              : null
    if (destino === null) return
    evento.preventDefault()
    irAPaso(destino)
    document.getElementById(idDePestana(destino))?.focus({ preventScroll: true })
  }

  // Sólo con el dedo o el lápiz, y sólo si el gesto fue más de costado que
  // vertical: el `touch-pan-y` del panel deja que el dedo siga desplazando la página.
  const alDeslizar = (evento: PointerEvent, info: PanInfo) => {
    if (conScroll || evento.pointerType === "mouse") return
    const { x, y } = info.offset
    if (Math.abs(x) < DESLIZ_MINIMO || Math.abs(x) < Math.abs(y)) return
    setPasoElegido((actual) => Math.min(total - 1, Math.max(0, actual + (x < 0 ? 1 : -1))))
  }

  return (
    <div ref={contenedor} className="relative">
      <div className="md:motion-safe:[@media(min-height:640px)]:sticky md:motion-safe:[@media(min-height:640px)]:top-6">
        <Revelar>
          <motion.div
            style={{ scale: escala }}
            className="relative flex origin-top flex-col overflow-hidden rounded-panel bg-tarjeta p-4 squircle md:rounded-tarjeta md:p-6 md:[@media(max-height:820px)]:p-4 md:motion-safe:[@media(min-height:640px)]:h-[min(760px,calc(100svh_-_48px))]"
          >
            <Malla pasos={pasos} activo={activo} enMovimiento={enPantalla} />

            <div className="contenedor relative flex min-h-0 flex-1 flex-col">
              <div role="tablist" aria-label={etiqueta} className="flex justify-center gap-2">
                {pasos.map((paso, indice) => {
                  const elegido = indice === activo
                  return (
                    <button
                      key={paso.id}
                      id={idDePestana(indice)}
                      type="button"
                      role="tab"
                      aria-selected={elegido}
                      aria-controls={idDelPanel}
                      aria-label={`${indice + 1}. ${moduloPorId(paso.modulo).nombre}`}
                      tabIndex={elegido ? 0 : -1}
                      onClick={() => irAPaso(indice)}
                      onKeyDown={(evento) => alTeclear(indice, evento)}
                      className={cn(
                        "relative grid h-14 w-16 cursor-pointer place-items-center rounded-[18px] anillo-foco",
                        HALO_DE_MODULO[paso.modulo]
                      )}
                    >
                      {elegido && (
                        <motion.span
                          layoutId={`${base}-conector`}
                          aria-hidden="true"
                          transition={{ duration: DURACION.pildora, ease: CURVA.suave }}
                          className={cn(
                            // La pestaña blanca baja 16px hasta el cuerpo; las dos esquinas
                            // cóncavas de abajo la unen a él como una pestaña de carpeta.
                            "absolute -left-2 top-0 h-[72px] w-20 rounded-t-[22px] bg-tarjeta",
                            "before:absolute before:-left-4 before:bottom-0 before:size-4 before:bg-[radial-gradient(circle_at_0_0,transparent_15.5px,var(--color-tarjeta)_16px)]",
                            "after:absolute after:-right-4 after:bottom-0 after:size-4 after:bg-[radial-gradient(circle_at_100%_0,transparent_15.5px,var(--color-tarjeta)_16px)]"
                          )}
                        />
                      )}
                      <IconoDeModulo modulo={paso.modulo} activo={elegido} className="relative" />
                    </button>
                  )
                })}
              </div>

              <motion.div
                id={idDelPanel}
                role="tabpanel"
                aria-labelledby={idDePestana(activo)}
                tabIndex={0}
                onPanEnd={alDeslizar}
                className="mt-4 grid min-h-0 flex-1 touch-pan-y items-center gap-6 rounded-[28px] bg-tarjeta px-4 py-6 anillo-foco squircle md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-10 md:rounded-panel md:p-8 lg:gap-12 lg:px-12 md:[@media(max-height:820px)]:py-5"
              >
                <TextoDelEscenario pasos={pasos} activo={activo} />
                <EscenaDelEscenario pasos={pasos} activo={activo} />
              </motion.div>

              {/* En el teléfono va debajo; desde md, arriba a la derecha, a la
                  altura de las pestañas. Es una píldora: no usa `Boton`, que
                  trae `squircle` y le aplanaría las puntas. */}
              <Link
                href={`#${saltarA}`}
                className="mt-3 inline-flex h-11 items-center gap-2 self-center rounded-full bg-white/70 px-4 text-sm font-medium text-navy transition-colors duration-150 ease-suave hover:bg-white anillo-foco md:absolute md:right-0 md:top-1.5 md:mt-0"
              >
                Saltar el recorrido
                <ArrowDown aria-hidden="true" strokeWidth={1.75} className="size-4" />
              </Link>
            </div>
          </motion.div>
        </Revelar>
      </div>

      {/* Un tramo de scroll por paso: dan el alto al contenedor mientras la tarjeta queda fija. */}
      {pasos.map((paso) => (
        <div
          key={paso.id}
          aria-hidden="true"
          className="hidden h-[520px] md:motion-safe:[@media(min-height:640px)]:block"
        />
      ))}
    </div>
  )
}

interface PropsDePasos {
  pasos: readonly PasoDelEscenario[]
  activo: number
}

/**
 * El texto del paso, con fundido cruzado. Debajo van todos los textos
 * invisibles, uno encima del otro: el lugar mide lo que el más largo y el
 * cambio de paso no mueve nada alrededor.
 */
function TextoDelEscenario({ pasos, activo }: PropsDePasos) {
  const paso = pasos[activo]
  return (
    <div className="grid">
      {pasos.map((otro, indice) => (
        <div key={otro.id} aria-hidden="true" className="invisible col-start-1 row-start-1">
          <TextoDelPaso paso={otro} numero={indice + 1} />
        </div>
      ))}
      <div className="relative col-start-1 row-start-1 self-center">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={paso.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DURACION.fundido, ease: CURVA.fundido }}
          >
            <TextoDelPaso paso={paso} numero={activo + 1} />
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}

function TextoDelPaso({ paso, numero }: { paso: PasoDelEscenario; numero: number }) {
  const modulo = moduloPorId(paso.modulo)
  return (
    <>
      <p className="flex items-center gap-2">
        <span aria-hidden="true" className={cn("size-2.5 shrink-0 rounded-full", FONDO_FUERTE[modulo.color])} />
        <Antetitulo como="span">
          {String(numero).padStart(2, "0")} · {modulo.nombre}
        </Antetitulo>
      </p>
      <h3 className="mt-3 text-balance font-serif text-[24px] font-medium leading-[1.15] tracking-[-0.5px] md:mt-4 md:text-[32px] md:leading-[1.1] md:tracking-[-1px] lg:text-[40px] lg:tracking-[-1.5px]">
        {paso.titulo}
      </h3>
      <p className="mt-3 text-[15px] leading-[1.5] text-texto-2 md:mt-4 md:text-lg md:leading-[1.4]">{paso.texto}</p>
      {paso.puntos && paso.puntos.length > 0 && (
        <ul className="mt-5 grid gap-2.5 md:mt-6">
          {paso.puntos.map((punto) => (
            <li key={punto} className="flex items-start gap-2.5 text-[15px] leading-[1.4]">
              <span
                aria-hidden="true"
                className={cn("mt-px grid size-[22px] shrink-0 place-items-center rounded-full", FONDO_SUAVE[modulo.color])}
              >
                <Check className="size-3.5" strokeWidth={2} />
              </span>
              {punto}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

/**
 * Las maquetas, apiladas en la misma celda: la escena mide lo que la más alta
 * y la elegida aparece con un fundido sobre las demás. Las que no están a la
 * vista quedan fuera del orden de Tab y del lector de pantalla. El contenedor
 * responde a su propio ancho (`@container`): cada maqueta decide cuánto
 * mostrar según el lugar que le toca, no según la pantalla.
 */
function EscenaDelEscenario({ pasos, activo }: PropsDePasos) {
  return (
    <div className="@container grid">
      {pasos.map((paso, indice) => {
        const activa = indice === activo
        return (
          <motion.div
            key={paso.id}
            aria-hidden={!activa}
            inert={!activa}
            initial={false}
            animate={activa ? { opacity: 1, visibility: "visible" } : { opacity: 0, transitionEnd: { visibility: "hidden" } }}
            transition={{ duration: DURACION.fundido, ease: CURVA.fundido }}
            className={cn(
              "col-start-1 row-start-1 grid place-items-center rounded-[24px] bg-linear-160 p-3 squircle md:rounded-panel md:p-6 md:[@media(max-height:820px)]:p-3",
              ESCENA[moduloPorId(paso.modulo).color]
            )}
          >
            {paso.maqueta(activa)}
          </motion.div>
        )
      })}
    </div>
  )
}

/** Por dónde va la malla: unos pocos por ciento de su tamaño, para que se note sin marear. */
const DERIVA = { x: ["0%", "3%", "-2%"], y: ["0%", "-2%", "3%"], rotate: [0, 6, -4] }
const QUIETA = { x: "0%", y: "0%", rotate: 0 }
const DERIVA_EN_BUCLE = { duration: 18, ease: "easeInOut", repeat: Infinity, repeatType: "mirror" } as const

/**
 * El fondo de la tarjeta: una capa por paso con las manchas de su color, y
 * la del paso elegido a la vista. Las capas viajan juntas, despacio y en
 * bucle, sólo mientras el escenario está en pantalla (fuera de ella vuelven
 * quietas a su lugar). Con movimiento reducido no viajan: queda sólo el
 * cambio de tono.
 */
function Malla({ pasos, activo, enMovimiento }: PropsDePasos & { enMovimiento: boolean }) {
  const reducido = useReducedMotion()
  const deriva = enMovimiento && !reducido
  return (
    <motion.div
      aria-hidden="true"
      className="pointer-events-none absolute -inset-1/4"
      animate={deriva ? DERIVA : QUIETA}
      transition={deriva ? DERIVA_EN_BUCLE : { duration: 0 }}
    >
      {pasos.map((paso, indice) => {
        const malla = MALLA[moduloPorId(paso.modulo).color]
        return (
          <div
            key={paso.id}
            className={cn(
              "absolute inset-0 transition-opacity duration-600 ease-fundido",
              malla.base,
              indice === activo ? "opacity-100" : "opacity-0"
            )}
          >
            <div className={cn("absolute left-[2%] top-[4%] h-[56%] w-[44%] bg-radial to-transparent to-70%", malla.principal)} />
            <div className={cn("absolute right-[6%] top-[2%] h-[50%] w-[40%] bg-radial to-transparent to-70%", malla.vecina)} />
            <div className={cn("absolute bottom-[4%] left-[30%] h-[56%] w-[52%] bg-radial to-transparent to-70%", malla.suave)} />
          </div>
        )
      })}
    </motion.div>
  )
}
