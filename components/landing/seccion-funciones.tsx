"use client"

import { useEffect, useRef, useState, type CSSProperties } from "react"
import {
  CalendarDays,
  ChartColumn,
  Clock,
  CreditCard,
  FileText,
  Link2,
  Mail,
  RotateCcw,
  SquareKanban,
  UsersRound,
  type LucideIcon,
} from "lucide-react"
import { EncabezadoDeLanding, SeccionDeLanding } from "@/components/landing/seccion-de-landing"
import { CLASES_DE_TONO, tonoEn } from "@/components/landing/tonos-de-la-landing"
import { BotonDePausa } from "@/components/movimiento/boton-de-pausa"
import { useBloqueEnMovimiento } from "@/components/movimiento/usar-bloque-en-movimiento"
import { cn } from "@/lib/utils"

/** Lo que el producto hace hoy, en el orden del diseño. */
const FUNCIONES: readonly { id: string; titulo: string; icono: LucideIcon }[] = [
  { id: "agenda", titulo: "Agenda por profesional", icono: CalendarDays },
  { id: "pagina-de-reservas", titulo: "Página de reservas", icono: Link2 },
  { id: "recordatorios", titulo: "Recordatorios por correo", icono: Mail },
  { id: "clientes", titulo: "Clientes con notas", icono: FileText },
  { id: "equipo", titulo: "Equipo con roles", icono: UsersRound },
  { id: "tablero", titulo: "Tablero del día", icono: SquareKanban },
  { id: "pago-dividido", titulo: "Pago dividido", icono: CreditCard },
  { id: "reportes", titulo: "Reportes", icono: ChartColumn },
  { id: "anulaciones", titulo: "Anulaciones con registro", icono: RotateCcw },
  {
    id: "servicios-y-horarios",
    titulo: "Servicios y horarios",
    icono: Clock,
  },
]

/** Desde aquí van en dos filas de cinco, unidas por el camino en S. */
const DOS_FILAS = "(min-width: 64rem)"

/** Cada pieza flota a su ritmo: 6, 7 y 8 s, con adelantos de 0,7 s. */
function flotarDe(indice: number): CSSProperties {
  return {
    "--duracion": `${6 + (indice % 3)}s`,
    "--retraso": `${-indice * 0.7}s`,
  } as CSSProperties
}

interface Camino {
  /** Del borde izquierdo de la pantalla, en píxeles del bloque. */
  izquierda: number
  ancho: number
  alto: number
  d: string
}

/**
 * El camino en S, medido sobre las piezas: entra por el borde izquierdo de
 * la pantalla a la altura de la primera fila, da la vuelta a la derecha y
 * vuelve por el hueco entre las filas, da la vuelta a la izquierda y sale
 * por el borde derecho a la altura de la segunda. Las vueltas son las del
 * diseño: 13px afuera de las piezas, con 52px de curva.
 *
 * Se mide con `getBoundingClientRect` sobre cada `<li>`, que no flota (flota
 * lo de adentro): el camino no tiembla con las piezas.
 */
function medirCamino(bloque: HTMLElement, piezas: HTMLElement[]): Camino | null {
  const primera = piezas[0]
  const quinta = piezas[4]
  const sexta = piezas[5]
  if (!primera || !quinta || !sexta) return null
  const caja = bloque.getBoundingClientRect()
  const a = primera.getBoundingClientRect()
  const b = sexta.getBoundingClientRect()
  const izquierda = a.left
  const derecha = quinta.getBoundingClientRect().right
  const y1 = a.top - caja.top + a.height / 2
  const y2 = b.top - caja.top + b.height / 2
  const medio = (a.bottom - caja.top + (b.top - caja.top)) / 2
  const ancho = document.documentElement.clientWidth
  const r = (n: number) => Math.round(n * 10) / 10
  const d = [
    `M -40 ${r(y1)}`,
    `L ${r(derecha + 13)} ${r(y1)}`,
    `C ${r(derecha + 65)} ${r(y1)} ${r(derecha + 65)} ${r(medio)} ${r(derecha + 13)} ${r(medio)}`,
    `L ${r(izquierda - 12)} ${r(medio)}`,
    `C ${r(izquierda - 64)} ${r(medio)} ${r(izquierda - 64)} ${r(y2)} ${r(izquierda - 12)} ${r(y2)}`,
    `L ${r(ancho + 40)} ${r(y2)}`,
  ].join(" ")
  return { izquierda: -caja.left, ancho, alto: caja.height, d }
}

/**
 * "Lo que trae Eli": las diez piezas del producto. Desde lg, en dos filas de
 * cinco unidas por un camino en S que entra y sale por los bordes de la
 * pantalla, con un punto de arena que lo recorre; en el teléfono y la
 * tableta, una columna unida por una línea, sin el punto.
 *
 * Las piezas flotan y el punto avanza sin fin: el botón de pausa lo congela,
 * y fuera de la pantalla se congela solo. Con movimiento reducido nada se
 * mueve.
 */
export function SeccionFunciones() {
  const { ref, pausado, setPausado, quieto } = useBloqueEnMovimiento<HTMLDivElement>()
  const lista = useRef<HTMLUListElement>(null)
  const [camino, setCamino] = useState<Camino | null>(null)

  useEffect(() => {
    const bloque = ref.current
    const ul = lista.current
    if (!bloque || !ul) return
    const consulta = window.matchMedia(DOS_FILAS)
    const rehacer = () => {
      const piezas = Array.from(ul.children) as HTMLElement[]
      setCamino(consulta.matches ? medirCamino(bloque, piezas) : null)
    }
    const alCambiarDeTamano = new ResizeObserver(rehacer)
    alCambiarDeTamano.observe(bloque)
    consulta.addEventListener("change", rehacer)
    window.addEventListener("resize", rehacer)
    rehacer()
    return () => {
      alCambiarDeTamano.disconnect()
      consulta.removeEventListener("change", rehacer)
      window.removeEventListener("resize", rehacer)
    }
  }, [ref])

  return (
    // La página empieza a oscurecerse: de la arena de Oficios (#D8C3A5) al tono con que sigue Precios (#C9B297).
    <SeccionDeLanding id="funciones" etiquetadaPor="funciones-titulo" className="bg-[linear-gradient(180deg,#D8C3A5,#C9B297)]">
      <EncabezadoDeLanding
        id="funciones-titulo"
        antetitulo="Funciones"
        alineacion="centro"
        // Sobre la arena, el gris de la bajada no llega a 4,5:1: va en el marrón oscuro del diseño.
        className="[&>p:last-child]:text-[#3F2A26]"
        titulo={
          <>
            Lo que trae <span className="resaltado">Eli.</span>
          </>
        }
        subtitulo="Las piezas del día a día de tu negocio, conectadas de la reserva al reporte."
      />

      <div ref={ref} className={cn("relative mt-10 md:mt-14", quieto && "animaciones-en-pausa")}>
        {camino && (
          <svg
            aria-hidden="true"
            width={camino.ancho}
            height={camino.alto}
            viewBox={`0 0 ${camino.ancho} ${camino.alto}`}
            className="pointer-events-none absolute top-0 hidden overflow-visible lg:block"
            style={{ left: camino.izquierda }}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d={camino.d} strokeWidth={3} strokeOpacity={0.85} className="stroke-ciruela" />
            {/* El punto: un trazo de largo casi cero y punta redonda que avanza por el camino. */}
            <g className="motion-reduce:hidden">
              <path
                d={camino.d}
                pathLength={1000}
                strokeDasharray="0.001 999.999"
                strokeWidth={19}
                className="animate-recorrer-camino stroke-white"
              />
              <path
                d={camino.d}
                pathLength={1000}
                strokeDasharray="0.001 999.999"
                strokeWidth={14}
                className="animate-recorrer-camino stroke-pistacho"
              />
            </g>
          </svg>
        )}

        <div className="relative">
          {/* Por debajo de lg, la línea de la columna, detrás de los íconos: del primero al último. */}
          <span aria-hidden="true" className="absolute bottom-7 left-[35px] top-7 w-[3px] rounded-full bg-ciruela/85 lg:hidden" />

          <ul ref={lista} className="relative flex flex-col gap-3 lg:grid lg:grid-cols-5 lg:gap-x-5 lg:gap-y-9">
            {FUNCIONES.map((funcion, indice) => {
              const tono = CLASES_DE_TONO[tonoEn(indice)]
              const Icono = funcion.icono
              return (
                <li key={funcion.id} className="relative lg:h-[150px]">
                  <div
                    className={cn(
                      "relative flex h-full animate-flotar items-center gap-4 rounded-[22px] border border-white px-4 py-3 shadow-sm squircle [--giro:0deg] lg:block lg:rounded-[28px] lg:p-0",
                      tono.suave,
                    )}
                    style={flotarDe(indice)}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "grid size-10 shrink-0 place-items-center rounded-[14px] bg-tarjeta shadow-sm lg:absolute lg:left-5 lg:top-5 lg:size-[46px] lg:rounded-[16px]",
                        tono.texto,
                      )}
                    >
                      <Icono className="size-5 lg:size-[22px]" strokeWidth={1.75} />
                    </span>
                    <span className="min-w-0 flex-1 text-base font-semibold leading-[1.2] tracking-[-0.025em] lg:absolute lg:bottom-5 lg:left-[22px] lg:right-[18px] lg:text-lg">
                      {funcion.titulo}
                    </span>
                    <span
                      aria-hidden="true"
                      className={cn("text-xs font-semibold opacity-70 lg:absolute lg:right-[18px] lg:top-6", tono.texto)}
                    >
                      {String(indice + 1).padStart(2, "0")}
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>

        <div className="mt-6 flex justify-end motion-reduce:hidden">
          <BotonDePausa pausado={pausado} alCambiar={setPausado} etiqueta="Pausar la animación de las funciones" />
        </div>
      </div>
    </SeccionDeLanding>
  )
}
