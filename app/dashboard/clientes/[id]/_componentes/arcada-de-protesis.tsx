"use client"

import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react"
import { ESCALA_MINIMA } from "@/components/panel/odontograma/arcada"
import { COLOR_DE_CORONA, COLOR_DEL_CONTORNO, FONDO_DE_PALADAR, TEXTO_DE_PALADAR } from "@/components/panel/odontograma/colores"
import {
  ANCHO_DE_LA_ARCADA,
  LINEA_ENTRE_ARCADAS,
  LINEA_MEDIA,
  TECLAS_DE_LA_ARCADA,
  geometriaDePieza,
  type GeometriaDePieza,
  type TeclaDeLaArcada,
} from "@/components/panel/odontograma/geometria"
import { nombreDePieza } from "@/lib/odontograma"
import { esCordal, piezasDeLaArcada, type Arcada } from "@/lib/protesis"
import { cn } from "@/lib/utils"
import {
  TEXTO_DEL_CORDAL,
  estadoDePiezaParaLeer,
  franjaDeLaArcada,
  vecinaEnLaArcada,
  type FaltaEnElOdontograma,
  type MarcaDeProtesis,
} from "../_protesis"

/** Lo que no son números de pieza: chico, en mayúsculas y en el gris del texto secundario. */
const ROTULO = "pointer-events-none absolute text-[11px] font-semibold tracking-[0.08em] text-texto-2 uppercase"

interface PropsDeArcadaDeProtesis {
  arcada: Arcada
  marcas: Readonly<Record<number, MarcaDeProtesis>>
  /** Lo ausente o con extracción indicada en el odontograma guardado: se dibuja punteado. */
  faltas: ReadonlyMap<number, FaltaEnElOdontograma>
  /** Las zonas de la base que se dibujan: el paladar arriba y la barra lingual abajo. */
  conPaladar: boolean
  conBarraLingual: boolean
  /** Sin esto, las piezas sólo se recorren (la total: van todas). */
  editable: boolean
  /** El id del texto que explica cómo se usa con el teclado. */
  idDeLaAyuda?: string
  alTocar: (pieza: number) => void
}

/**
 * La arcada de la prótesis: las mismas piezas en U del odontograma
 * (`geometria.ts`: dónde va cada una, su giro y su número afuera), pero cada
 * pieza es entera, sin caras. Una pieza protésica va en lila con borde navy;
 * un pilar o gancho, blanco con el borde ámbar de la corona; lo ausente o con
 * extracción indicada en el odontograma, punteado sobre gris. Nunca sólo por
 * el color: el número de la protésica va en navy, el del pilar en naranja
 * suave, y el nombre accesible lo dice todo. Los cordales (18, 28, 38, 48) se
 * ven pero no se marcan: van rayados y deshabilitados ("cordal, no entra en
 * una prótesis"); siguen en el recorrido con las flechas para que se lean.
 *
 * Con una sola arcada se muestra sólo su franja del dibujo. Como el
 * odontograma: cada pieza es un botón, Tab entra por una sola (la elegida),
 * las flechas recorren la arcada (arriba y abajo, a la otra si se ve) e
 * Inicio y Fin van a las puntas; Enter o Espacio la tocan con la herramienta.
 * Se achica con su caja hasta la escala mínima del odontograma; más
 * angosta, se desplaza de lado dentro de su caja, empezando por el centro.
 */
export function ArcadaDeProtesis({
  arcada,
  marcas,
  faltas,
  conPaladar,
  conBarraLingual,
  editable,
  idDeLaAyuda,
  alTocar,
}: PropsDeArcadaDeProtesis) {
  const caja = useRef<HTMLDivElement>(null)
  const botones = useRef(new Map<number, HTMLButtonElement>())
  const [escala, setEscala] = useState(1)
  const piezas = piezasDeLaArcada(arcada)
  const [elegida, setElegida] = useState(piezas[0])
  const paradaDelTab = piezas.includes(elegida) ? elegida : piezas[0]

  useLayoutEffect(() => {
    const nodo = caja.current
    if (!nodo) return
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
  }, [arcada, escala])

  const franja = franjaDeLaArcada(arcada)
  const e = (n: number) => n * escala
  const y = (n: number) => (n - franja.arriba) * escala
  const conArriba = arcada !== "inferior"
  const conAbajo = arcada !== "superior"

  const alTeclear = (evento: KeyboardEvent<HTMLButtonElement>, pieza: number) => {
    if (!TECLAS_DE_LA_ARCADA.includes(evento.key)) return
    evento.preventDefault()
    const destino = vecinaEnLaArcada(arcada, pieza, evento.key as TeclaDeLaArcada)
    setElegida(destino)
    botones.current.get(destino)?.focus()
  }

  return (
    <div ref={caja} className="overflow-x-auto overflow-y-hidden rounded-[24px] bg-crema px-2 py-4 squircle sm:px-3">
      <div
        role="group"
        aria-label={
          arcada === "ambas"
            ? "Las dos arcadas, 32 piezas (28 sin los cordales)"
            : `Arcada ${arcada}, 16 piezas (14 sin los cordales)`
        }
        aria-describedby={idDeLaAyuda}
        className="relative mx-auto"
        style={{ width: e(ANCHO_DE_LA_ARCADA), height: e(franja.alto) }}
      >
        {conArriba && <span className={cn(ROTULO, "left-0")} style={{ top: 0 }}>Maxilar superior</span>}
        {conAbajo && <span className={cn(ROTULO, "bottom-0 left-0")}>Mandíbula</span>}

        <div aria-hidden="true" className="absolute w-px bg-borde" style={{ left: e(LINEA_MEDIA) - 0.5, top: e(8), height: e(franja.alto - 16) }} />
        {conArriba && (
          <Zona
            texto="Paladar"
            marcada={conPaladar}
            arriba={y(104)}
            izquierda={e(170)}
            ancho={e(280)}
            alto={e(196)}
            radio="50% 50% 50% 50% / 60% 60% 40% 40%"
          />
        )}
        {conAbajo && (
          <Zona
            texto={conBarraLingual ? "Barra lingual" : "Lengua"}
            marcada={conBarraLingual}
            arriba={y(418)}
            izquierda={e(170)}
            ancho={e(280)}
            alto={e(196)}
            radio="50% 50% 50% 50% / 40% 40% 60% 60%"
          />
        )}

        {arcada === "ambas" && (
          <div
            aria-hidden="true"
            className="absolute inset-x-0 flex h-5 -translate-y-1/2 items-center gap-2.5 text-[11px] text-texto-2"
            style={{ top: y(LINEA_ENTRE_ARCADAS) }}
          >
            <span className="bg-crema pr-0.5 whitespace-nowrap">← Derecha del paciente</span>
            <span className="h-px flex-1 bg-[#c9c3b6]" />
            <span className="bg-crema pl-0.5 whitespace-nowrap">Izquierda del paciente →</span>
          </div>
        )}

        {piezas.map((pieza) => (
          <PiezaDeProtesis
            key={pieza}
            geometria={geometriaDePieza(pieza)}
            escala={escala}
            arriba={franja.arriba}
            marca={esCordal(pieza) ? undefined : marcas[pieza]}
            falta={faltas.get(pieza)}
            cordal={esCordal(pieza)}
            enElTab={pieza === paradaDelTab}
            editable={editable}
            refDelBoton={(nodo) => {
              if (nodo) botones.current.set(pieza, nodo)
              else botones.current.delete(pieza)
            }}
            alTocar={() => {
              setElegida(pieza)
              if (editable && !esCordal(pieza)) alTocar(pieza)
            }}
            alTeclear={(evento) => alTeclear(evento, pieza)}
            alEnfocar={() => setElegida(pieza)}
          />
        ))}
      </div>
      {arcada !== "ambas" && (
        <div aria-hidden="true" className="mx-auto mt-2 flex justify-between gap-4 text-[11px] text-texto-2" style={{ width: e(ANCHO_DE_LA_ARCADA) }}>
          <span>← Derecha del paciente</span>
          <span>Izquierda del paciente →</span>
        </div>
      )}
    </div>
  )
}

/** El paladar o la lengua, de fondo. Marcada (la zona se trabaja), con borde y en negrita. Decorativa: la zona se elige en su botón. */
function Zona({
  texto,
  marcada,
  arriba,
  izquierda,
  ancho,
  alto,
  radio,
}: {
  texto: string
  marcada: boolean
  arriba: number
  izquierda: number
  ancho: number
  alto: number
  radio: string
}) {
  return (
    <div
      aria-hidden="true"
      className={cn("absolute grid place-items-center", marcada && "border-2 border-dashed")}
      style={{
        top: arriba,
        left: izquierda,
        width: ancho,
        height: alto,
        borderRadius: radio,
        background: FONDO_DE_PALADAR,
        borderColor: marcada ? TEXTO_DE_PALADAR : undefined,
        opacity: marcada ? 1 : 0.55,
      }}
    >
      <span className={cn("text-[11px] tracking-[0.08em] uppercase", marcada ? "font-bold" : "font-semibold")} style={{ color: TEXTO_DE_PALADAR }}>
        {texto}
      </span>
    </div>
  )
}

interface PropsDePiezaDeProtesis {
  geometria: GeometriaDePieza
  escala: number
  /** Desde dónde empieza la franja que se ve, en unidades del dibujo. */
  arriba: number
  marca: MarcaDeProtesis | undefined
  falta: FaltaEnElOdontograma | undefined
  /** Un cordal: se ve, pero no se marca. */
  cordal: boolean
  enElTab: boolean
  editable: boolean
  refDelBoton: (nodo: HTMLButtonElement | null) => void
  alTocar: () => void
  alTeclear: (evento: KeyboardEvent<HTMLButtonElement>) => void
  alEnfocar: () => void
}

/** Una pieza: el cuadrado girado es el botón, con su número afuera de la arcada. */
function PiezaDeProtesis({
  geometria,
  escala,
  arriba,
  marca,
  falta,
  cordal,
  enElTab,
  editable,
  refDelBoton,
  alTocar,
  alTeclear,
  alEnfocar,
}: PropsDePiezaDeProtesis) {
  const { pieza, centro, normal, rotacion } = geometria
  const lado = geometria.lado * escala
  const x = centro.x * escala
  const y = (centro.y - arriba) * escala
  const numero = { x: x + normal.x * (lado / 2 + 13), y: y + normal.y * (lado / 2 + 13) }
  const sinMarcaYFalta = !marca && !!falta && !cordal

  return (
    <>
      <button
        ref={refDelBoton}
        type="button"
        tabIndex={enElTab ? 0 : -1}
        aria-label={`Pieza ${pieza}, ${nombreDePieza(pieza)}: ${cordal ? TEXTO_DEL_CORDAL : estadoDePiezaParaLeer(marca, falta)}`}
        aria-pressed={cordal ? undefined : !!marca}
        aria-disabled={!editable || cordal || undefined}
        onClick={alTocar}
        onKeyDown={alTeclear}
        onFocus={alEnfocar}
        className={cn(
          "absolute p-0 anillo-foco shadow-[0_1px_2px_#5f6d7724]",
          editable && !cordal ? "cursor-pointer" : cordal ? "cursor-not-allowed" : "cursor-default",
          marca === "protesica" ? "border-[1.5px] border-navy bg-lila" : marca === "pilar" ? "border-[2.5px] bg-tarjeta" : "border-[1.5px]",
          cordal ? "bg-superficie" : sinMarcaYFalta ? "border-dashed bg-superficie" : !marca && "bg-tarjeta"
        )}
        style={{
          left: x - lado / 2,
          top: y - lado / 2,
          width: lado,
          height: lado,
          borderRadius: "34%",
          transform: `rotate(${rotacion.toFixed(1)}deg)`,
          ...(marca === "pilar" ? { borderColor: COLOR_DE_CORONA } : !marca ? { borderColor: COLOR_DEL_CONTORNO } : {}),
          // El cordal, rayado: se distingue sin depender del color.
          ...(cordal && {
            backgroundImage: "repeating-linear-gradient(45deg, transparent 0 5px, rgb(95 109 119 / 0.28) 5px 6.5px)",
          }),
        }}
      >
        {!sinMarcaYFalta && !cordal && (
          <span
            aria-hidden="true"
            className={cn("absolute inset-[27%] rounded-[32%] border-[1.5px]", marca === "protesica" ? "border-navy/40" : "border-borde")}
          />
        )}
      </button>
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute flex h-[22px] min-w-[26px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full px-1.5 text-xs font-semibold whitespace-nowrap tabular-nums",
          marca === "protesica"
            ? "bg-navy text-white"
            : marca === "pilar"
              ? "bg-naranja-suave text-navy"
              : sinMarcaYFalta || cordal
                ? "text-texto-2"
                : "text-navy"
        )}
        style={{ left: numero.x, top: numero.y }}
      >
        {pieza}
      </span>
    </>
  )
}
