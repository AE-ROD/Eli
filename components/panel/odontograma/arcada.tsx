"use client"

import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react"
import {
  carasDe,
  esCara,
  posicionDe,
  type Cara,
  type Denticion,
  type MarcaDelOdontograma,
} from "@/lib/odontograma"
import { cn } from "@/lib/utils"
import {
  COLOR_DE_AUSENTE,
  COLOR_DE_CARA,
  COLOR_DE_CORONA,
  COLOR_DE_ENDODONCIA,
  COLOR_DE_EXTRACCION,
  COLOR_DE_LAS_DIVISIONES,
  COLOR_DEL_CONTORNO,
  FONDO_DE_AUSENTE,
  FONDO_DE_CARA,
  FONDO_DE_PALADAR,
  FONDO_DE_TERCER_MOLAR,
  TEXTO_DE_PALADAR,
} from "./colores"
import {
  ALTO_DE_LA_ARCADA,
  ANCHO_DE_LA_ARCADA,
  LINEA_ENTRE_ARCADAS,
  LINEA_MEDIA,
  TECLAS_DE_LA_ARCADA,
  geometriaDeLaArcada,
  piezaVecina,
  type GeometriaDePieza,
  type LugarDeCara,
  type TeclaDeLaArcada,
} from "./geometria"
import { etiquetaDePieza, marcaDeCara, nombreAccesibleDePieza, tieneMarcaDePieza } from "./marcas"

/**
 * La escala más chica a la que se dibuja la arcada. Más chica, los números
 * dejan de leerse y las piezas no se pueden tocar con el dedo: por debajo
 * de este ancho, la arcada se desplaza de lado dentro de su caja (nunca la
 * página).
 */
const ESCALA_MINIMA = 0.72

/** Cada cara es un trapecio del cuadrado de la pieza (en un lienzo de 100 × 100), y el centro, un cuadrado. */
const POLIGONOS: Record<LugarDeCara, string> = {
  afuera: "0,0 100,0 70,30 30,30",
  izquierda: "0,0 30,30 30,70 0,100",
  derecha: "100,0 100,100 70,70 70,30",
  adentro: "30,70 70,70 100,100 0,100",
  centro: "30,30 70,30 70,70 30,70",
}

const LUGARES: readonly LugarDeCara[] = ["afuera", "izquierda", "derecha", "adentro", "centro"]

/** Lo que no son números de pieza: chico, en mayúsculas y en el gris del texto secundario. */
const ROTULO = "pointer-events-none absolute text-[11px] font-semibold tracking-[0.08em] text-texto-2 uppercase"

interface PropsDeArcada {
  denticion: Denticion
  marcas: readonly MarcaDelOdontograma[]
  seleccionada: number
  /** Sin esto, tocar sólo elige la pieza: no marca nada. */
  editable: boolean
  /** El id del texto que explica cómo se usa con el teclado. */
  idDeLaAyuda?: string
  alElegir: (pieza: number) => void
  alTocarCara: (pieza: number, cara: Cara) => void
  alTocarPieza: (pieza: number) => void
}

/**
 * La arcada del odontograma, como en `Ficha.dc.html`: las piezas en U, cada
 * una con sus cinco caras, su número afuera y las marcas de pieza (corona,
 * endodoncia, ausente, extracción indicada) encima.
 *
 * Cada pieza es UN botón, con nombre accesible ("Pieza 16, primer molar
 * superior derecho: caries oclusal"). Con el mouse o el dedo, tocar una cara
 * la marca con la herramienta elegida, y tocar el número aplica la
 * herramienta de pieza (o borra la pieza entera). Con el teclado:
 *
 * - Tab entra a la pieza elegida (una sola parada para toda la arcada);
 * - las flechas recorren las piezas (a los lados por la fila, arriba y abajo
 *   a la otra arcada) e Inicio y Fin van a las puntas; la pieza enfocada
 *   queda elegida, y sus caras se marcan desde "Pieza seleccionada";
 * - Enter o Espacio es tocar el número; la letra de una cara (V, M, D, O, I,
 *   P, L) es tocar esa cara.
 *
 * Se achica con su caja hasta `ESCALA_MINIMA`; los números siguen a 12px.
 */
export function Arcada({
  denticion,
  marcas,
  seleccionada,
  editable,
  idDeLaAyuda,
  alElegir,
  alTocarCara,
  alTocarPieza,
}: PropsDeArcada) {
  const caja = useRef<HTMLDivElement>(null)
  // Para los ids de las rayas del sellante: sin los signos que no van en `url(#…)`.
  const idBase = `arcada${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`
  const botones = useRef(new Map<number, HTMLButtonElement>())
  const [escala, setEscala] = useState(1)

  // Se mide la caja y no la ventana: al lado del panel de la pieza, la caja
  // es más angosta que la pantalla.
  useLayoutEffect(() => {
    const nodo = caja.current
    if (!nodo) return
    // El observador avisa también apenas empieza a mirar: ésa es la primera medida.
    const observador = new ResizeObserver(() => {
      const ancho = nodo.clientWidth
      if (ancho > 0) setEscala(Math.min(1, Math.max(ESCALA_MINIMA, ancho / ANCHO_DE_LA_ARCADA)))
    })
    observador.observe(nodo)
    return () => observador.disconnect()
  }, [])

  // Si no entra, se desplaza: de entrada se muestra el centro, con los incisivos.
  useLayoutEffect(() => {
    const nodo = caja.current
    if (nodo && nodo.scrollWidth > nodo.clientWidth) nodo.scrollLeft = (nodo.scrollWidth - nodo.clientWidth) / 2
  }, [denticion, escala])

  const piezas = geometriaDeLaArcada(denticion)
  const paradaDelTab = piezas.some((g) => g.pieza === seleccionada) ? seleccionada : piezas[0].pieza
  const temporal = denticion === "temporal"
  const e = (n: number) => n * escala

  const alTeclear = (evento: KeyboardEvent<HTMLButtonElement>, pieza: number) => {
    if (TECLAS_DE_LA_ARCADA.includes(evento.key)) {
      evento.preventDefault()
      const destino = piezaVecina(denticion, pieza, evento.key as TeclaDeLaArcada)
      alElegir(destino)
      botones.current.get(destino)?.focus()
      return
    }
    if (!editable || evento.altKey || evento.ctrlKey || evento.metaKey) return
    const letra = evento.key.toUpperCase()
    if (esCara(letra) && carasDe(pieza).includes(letra)) {
      evento.preventDefault()
      alTocarCara(pieza, letra)
    }
  }

  const alHacerClic = (evento: MouseEvent<HTMLButtonElement>, pieza: number) => {
    alElegir(pieza)
    if (!editable) return
    // Con el mouse o el dedo el clic sale de la cara tocada; con Enter o
    // Espacio, del botón mismo: entonces es tocar la pieza.
    const cara = evento.target instanceof Element ? evento.target.closest("[data-cara]")?.getAttribute("data-cara") : null
    if (cara && esCara(cara)) alTocarCara(pieza, cara)
    else alTocarPieza(pieza)
  }

  return (
    <div ref={caja} className="overflow-x-auto overflow-y-hidden rounded-[24px] bg-crema px-2 py-4 squircle sm:px-3">
      <div
        role="group"
        aria-label={temporal ? "Arcada temporal, 20 piezas" : "Arcada permanente, 32 piezas"}
        aria-describedby={idDeLaAyuda}
        className="relative mx-auto"
        style={{ width: e(ANCHO_DE_LA_ARCADA), height: e(ALTO_DE_LA_ARCADA) }}
      >
        <span className={cn(ROTULO, "top-0 left-0")}>Maxilar superior</span>
        <span className={cn(ROTULO, "bottom-0 left-0")}>Mandíbula</span>

        <div aria-hidden="true" className="absolute w-px bg-borde" style={{ left: e(LINEA_MEDIA) - 0.5, top: e(16), height: e(668) }} />
        <Paladar texto="Paladar" arriba={e(104)} izquierda={e(170)} ancho={e(280)} alto={e(196)} radio="50% 50% 50% 50% / 60% 60% 40% 40%" />
        <Paladar texto="Lengua" arriba={e(418)} izquierda={e(170)} ancho={e(280)} alto={e(196)} radio="50% 50% 50% 50% / 40% 40% 60% 60%" />

        <div
          aria-hidden="true"
          className="absolute inset-x-0 flex h-5 -translate-y-1/2 items-center gap-2.5 text-[11px] text-texto-2"
          style={{ top: e(LINEA_ENTRE_ARCADAS) }}
        >
          <span className="bg-crema pr-0.5 whitespace-nowrap">← Derecha del paciente</span>
          <span className="h-px flex-1 bg-[#c9c3b6]" />
          <span className="bg-crema pl-0.5 whitespace-nowrap">Izquierda del paciente →</span>
        </div>
        <span aria-hidden="true" className={cn(ROTULO, "left-0 tracking-normal normal-case")} style={{ top: e(LINEA_ENTRE_ARCADAS) - 33 }}>
          {temporal ? "Q5" : "Q1"}
        </span>
        <span aria-hidden="true" className={cn(ROTULO, "right-0 tracking-normal normal-case")} style={{ top: e(LINEA_ENTRE_ARCADAS) - 33 }}>
          {temporal ? "Q6" : "Q2"}
        </span>
        <span aria-hidden="true" className={cn(ROTULO, "left-0 tracking-normal normal-case")} style={{ top: e(LINEA_ENTRE_ARCADAS) + 17 }}>
          {temporal ? "Q8" : "Q4"}
        </span>
        <span aria-hidden="true" className={cn(ROTULO, "right-0 tracking-normal normal-case")} style={{ top: e(LINEA_ENTRE_ARCADAS) + 17 }}>
          {temporal ? "Q7" : "Q3"}
        </span>

        {piezas.map((geometria) => (
          <PiezaEnLaArcada
            key={geometria.pieza}
            geometria={geometria}
            escala={escala}
            idBase={idBase}
            marcas={marcas}
            elegida={geometria.pieza === seleccionada}
            enElTab={geometria.pieza === paradaDelTab}
            refDelBoton={(nodo) => {
              if (nodo) botones.current.set(geometria.pieza, nodo)
              else botones.current.delete(geometria.pieza)
            }}
            alHacerClic={(evento) => alHacerClic(evento, geometria.pieza)}
            alTeclear={(evento) => alTeclear(evento, geometria.pieza)}
            alEnfocar={() => alElegir(geometria.pieza)}
          />
        ))}
      </div>
    </div>
  )
}

function Paladar({ texto, arriba, izquierda, ancho, alto, radio }: { texto: string; arriba: number; izquierda: number; ancho: number; alto: number; radio: string }) {
  return (
    <div
      aria-hidden="true"
      className="absolute grid place-items-center"
      style={{ top: arriba, left: izquierda, width: ancho, height: alto, borderRadius: radio, background: FONDO_DE_PALADAR }}
    >
      <span className="text-[11px] font-semibold tracking-[0.08em] uppercase" style={{ color: TEXTO_DE_PALADAR }}>
        {texto}
      </span>
    </div>
  )
}

interface PropsDePiezaEnLaArcada {
  geometria: GeometriaDePieza
  escala: number
  /** Prefijo de los ids de las rayas del sellante, únicos en la página. */
  idBase: string
  marcas: readonly MarcaDelOdontograma[]
  elegida: boolean
  /** La pieza por la que Tab entra a la arcada. */
  enElTab: boolean
  refDelBoton: (nodo: HTMLButtonElement | null) => void
  alHacerClic: (evento: MouseEvent<HTMLButtonElement>) => void
  alTeclear: (evento: KeyboardEvent<HTMLButtonElement>) => void
  alEnfocar: () => void
}

/**
 * Una pieza: un botón sin tamaño en el centro de la pieza, con el cuadrado
 * girado, el número y el triángulo de la endodoncia colgando de él. Así un
 * solo control abarca las caras y el número, y el foco se dibuja en el
 * cuadrado (el botón mismo no tiene área).
 */
function PiezaEnLaArcada({ geometria, escala, idBase, marcas, elegida, enElTab, refDelBoton, alHacerClic, alTeclear, alEnfocar }: PropsDePiezaEnLaArcada) {
  const { pieza, centro, normal, rotacion, caras } = geometria
  const lado = geometria.lado * escala
  const ausente = tieneMarcaDePieza(marcas, pieza, "ausente")
  const extraccion = tieneMarcaDePieza(marcas, pieza, "extraccion")
  const corona = tieneMarcaDePieza(marcas, pieza, "corona")
  const endodoncia = tieneMarcaDePieza(marcas, pieza, "endodoncia")
  const tercerMolar = pieza < 50 && posicionDe(pieza) === 8
  const fondo = ausente ? FONDO_DE_AUSENTE : tercerMolar ? FONDO_DE_TERCER_MOLAR : FONDO_DE_CARA
  const sellanteId = `${idBase}-sellante-${pieza}`
  // El número va afuera de la arcada, y el triángulo de la endodoncia, adentro (hacia la raíz).
  const numero = { x: normal.x * (lado / 2 + 13), y: normal.y * (lado / 2 + 13) }
  const raiz = { x: -normal.x * (lado / 2 + 10), y: -normal.y * (lado / 2 + 10) }

  return (
    <button
      ref={refDelBoton}
      type="button"
      tabIndex={enElTab ? 0 : -1}
      aria-label={nombreAccesibleDePieza(pieza, marcas)}
      aria-pressed={elegida}
      onClick={alHacerClic}
      onKeyDown={alTeclear}
      onFocus={alEnfocar}
      className="group/pieza absolute size-0 cursor-pointer p-0 outline-none"
      style={{ left: centro.x * escala, top: centro.y * escala }}
    >
      <span
        className="absolute block"
        style={{ left: -lado / 2, top: -lado / 2, width: lado, height: lado, transform: `rotate(${rotacion.toFixed(1)}deg)` }}
      >
        <span className="absolute inset-0 block overflow-hidden" style={{ borderRadius: lado * 0.22 }}>
          <svg viewBox="0 0 100 100" aria-hidden="true" className="absolute inset-0 size-full">
            {LUGARES.map((lugar) => {
              const marca = marcaDeCara(marcas, pieza, caras[lugar])
              if (marca === "sellante") {
                return (
                  <g key={lugar}>
                    <defs>
                      <pattern id={`${sellanteId}-${lugar}`} width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                        <rect width="9" height="9" fill={COLOR_DE_CARA.sellante} />
                        <rect width="3" height="9" fill="#ffffff" />
                      </pattern>
                    </defs>
                    <polygon data-cara={caras[lugar]} points={POLIGONOS[lugar]} fill={`url(#${sellanteId}-${lugar})`} />
                  </g>
                )
              }
              return <polygon key={lugar} data-cara={caras[lugar]} points={POLIGONOS[lugar]} fill={marca ? COLOR_DE_CARA[marca] : fondo} />
            })}
          </svg>
        </span>
        <svg viewBox="0 0 100 100" aria-hidden="true" className="pointer-events-none absolute inset-0 size-full overflow-visible">
          <rect x="2" y="2" width="96" height="96" rx="22" fill="none" stroke={COLOR_DEL_CONTORNO} strokeWidth="5" />
          <rect x="30" y="30" width="40" height="40" rx="6" fill="none" stroke={COLOR_DE_LAS_DIVISIONES} strokeWidth="4" />
          <path d="M9 9 30 30M91 9 70 30M9 91 30 70M91 91 70 70" stroke={COLOR_DE_LAS_DIVISIONES} strokeWidth="4" />
          {(ausente || extraccion) && (
            <path
              d="M14 14 86 86M86 14 14 86"
              stroke={extraccion ? COLOR_DE_EXTRACCION : COLOR_DE_AUSENTE}
              strokeWidth="9"
              strokeLinecap="round"
            />
          )}
        </svg>
        {corona && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -inset-1 block border-[2.5px]"
            style={{ borderColor: COLOR_DE_CORONA, borderRadius: lado * 0.22 + 4 }}
          />
        )}
        {/* Elegida: el contorno navy. Con el foco del teclado, además el contorno y el halo de `anillo-foco`. */}
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute -inset-2 block rounded-[12px] border-2",
            elegida ? "border-navy" : "border-transparent",
            "group-focus-visible/pieza:border-navy group-focus-visible/pieza:outline-2 group-focus-visible/pieza:outline-offset-2 group-focus-visible/pieza:outline-navy group-focus-visible/pieza:shadow-[0_0_0_6px_var(--halo)]"
          )}
        />
      </span>

      {endodoncia && (
        <svg
          aria-hidden="true"
          width="12"
          height="11"
          viewBox="0 0 12 11"
          className="pointer-events-none absolute"
          style={{ left: raiz.x - 6, top: raiz.y - 5.5 }}
        >
          <path d="M6 0 12 11H0Z" fill={COLOR_DE_ENDODONCIA} />
        </svg>
      )}

      <span
        aria-hidden="true"
        className={cn(
          "absolute flex h-[22px] min-w-[26px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full px-1.5 text-xs font-semibold whitespace-nowrap tabular-nums",
          elegida ? "bg-navy text-white" : "text-navy"
        )}
        style={{ left: numero.x, top: numero.y }}
      >
        {etiquetaDePieza(pieza)}
      </span>
    </button>
  )
}
