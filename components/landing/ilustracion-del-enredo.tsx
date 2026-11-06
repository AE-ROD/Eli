"use client"

import { useRef, useState, type CSSProperties } from "react"
import { useInView } from "framer-motion"
import { BookOpen, Check, MessageCircle, PenLine, Phone, Sheet, type LucideIcon } from "lucide-react"
import { LogoEli } from "@/components/comunes/logo-eli"
import { ICONOS_DE_MODULO } from "@/components/comunes/icono-de-modulo"
import { BotonDePausa } from "@/components/movimiento/boton-de-pausa"
import { TrazosOndulantes, type TrazoOndulante } from "@/components/movimiento/trazos-ondulantes"
import { moduloPorId, type ModuloId } from "@/lib/modulos"
import { cn } from "@/lib/utils"

/**
 * Lo que la ilustración dice, para quien no la ve. Lo de la izquierda es cómo
 * se lleva hoy un negocio, no algo con lo que Eli se conecte: Eli no se
 * integra con WhatsApp ni importa planillas.
 */
const DESCRIPCION =
  "Ilustración: lo que hoy se lleva a mano, por WhatsApp, por llamadas, en un cuaderno o en Excel, enredado, y con Eli ordenado en la agenda, los clientes, el tablero y los reportes."

interface Fuente {
  texto: string
  icono: LucideIcon
  /** Dónde va en la composición ancha, en píxeles de la caja de 1280×400. */
  x: number
  y: number
  /** La inclinación de reposo, escrita entera para Tailwind. */
  giro: string
  /** Segundos de su flotar y cuánto arranca adelantado, para que no vayan juntas. */
  duracion: string
  retraso: string
}

/** Las cinco maneras de llevar el negocio que hoy se enredan. Los lugares salen del diseño. */
const FUENTES: readonly Fuente[] = [
  { texto: "Todo a mano", icono: PenLine, x: 28, y: 44, giro: "-rotate-[5deg]", duracion: "7s", retraso: "-0.3s" },
  { texto: "WhatsApp", icono: MessageCircle, x: 300, y: 36, giro: "rotate-[4deg]", duracion: "6.6s", retraso: "-3s" },
  { texto: "Llamadas", icono: Phone, x: 56, y: 196, giro: "rotate-[3deg]", duracion: "6.2s", retraso: "-0.6s" },
  { texto: "Cuaderno", icono: BookOpen, x: 250, y: 306, giro: "-rotate-[4deg]", duracion: "6.6s", retraso: "-2.5s" },
  { texto: "Excel", icono: Sheet, x: 418, y: 150, giro: "rotate-[5deg]", duracion: "7s", retraso: "-4.2s" },
]

interface Destino {
  modulo: ModuloId
  /** El cuadro del ícono: fondo y color, escritos enteros. */
  cuadro: string
}

/** Los cuatro lugares donde Eli lo acomoda. Nombre e ícono, los de `lib/modulos.ts`; el color, el de la landing. */
const DESTINOS: readonly Destino[] = [
  { modulo: "agenda", cuadro: "bg-ciruela-suave text-ciruela" },
  { modulo: "clientes", cuadro: "bg-frambuesa-suave text-frambuesa" },
  { modulo: "tablero", cuadro: "bg-pistacho-suave text-pistacho-oscuro" },
  { modulo: "reportes", cuadro: "bg-ciruela-suave text-ciruela" },
]

/** Las líneas enredadas de la composición ancha: de fuera de la caja, a la izquierda, al nodo de Eli. */
const ENREDO: readonly TrazoOndulante[] = [
  {
    color: "stroke-frambuesa",
    grosor: 3.5,
    duracion: 8,
    formas: [
      "M -80 80 C 160 10 260 300 360 160 S 520 300 604 200",
      "M -80 44.9 C 193.4 35.3 236.5 299.6 355.2 174.6 S 547.7 261 604 200",
      "M -80 123.8 C 203 -10 220.1 332.2 382.7 176.3 S 501.6 310.2 604 200",
      "M -80 80 C 160 10 260 300 360 160 S 520 300 604 200",
    ],
  },
  {
    color: "stroke-ciruela",
    grosor: 3.5,
    duracion: 9.7,
    desfase: 1.3,
    formas: [
      "M -80 340 C 140 390 280 60 380 220 S 500 80 604 200",
      "M -80 313.8 C 184.4 354.1 299.7 20.2 355.8 267.9 S 472.1 93.6 604 200",
      "M -80 336.4 C 127.8 355.3 315.2 12.6 380.3 258.2 S 459.8 85.2 604 200",
      "M -80 340 C 140 390 280 60 380 220 S 500 80 604 200",
    ],
  },
  {
    color: "stroke-frambuesa",
    opacidad: 0.55,
    duracion: 11.4,
    desfase: 2.6,
    formas: [
      "M -80 200 C 120 40 200 380 320 240 S 440 20 520 150 S 580 190 604 200",
      "M -80 244.7 C 73.1 62.7 167.2 410 273.6 276.4 S 457.4 54.3 568 125 S 575.3 196 604 200",
      "M -80 186.7 C 118.1 32 194.9 371.3 335.1 216.9 S 453 -10 501 134.2 S 569.7 197 604 200",
      "M -80 200 C 120 40 200 380 320 240 S 440 20 520 150 S 580 190 604 200",
    ],
  },
  {
    color: "stroke-pistacho",
    grosor: 3.5,
    duracion: 13.1,
    desfase: 3.9,
    formas: [
      "M -80 130 C 200 330 240 10 340 110 S 420 360 500 260 S 570 210 604 200",
      "M -80 174 C 165.5 284.3 287.9 -10 303.6 124.5 S 405.2 397.4 474.2 304.1 S 564.8 212.9 604 200",
      "M -80 170.8 C 243.1 367.7 200 18.8 332.7 112.9 S 384.5 330.4 494.7 233.2 S 568.7 196.3 604 200",
      "M -80 130 C 200 330 240 10 340 110 S 420 360 500 260 S 570 210 604 200",
    ],
  },
  {
    color: "stroke-ciruela",
    opacidad: 0.5,
    duracion: 8,
    desfase: 5.2,
    formas: [
      "M -80 280 C 100 120 220 390 300 140 S 480 380 560 240 S 590 205 604 200",
      "M -80 284.6 C 85.2 153.1 199.7 391 285 131.9 S 525.5 342 558.4 232.1 S 585.7 219.4 604 200",
      "M -80 283.8 C 79.8 74.9 234.7 362.2 276.7 130.1 S 493.6 410 558.9 254.2 S 604.2 197.6 604 200",
      "M -80 280 C 100 120 220 390 300 140 S 480 380 560 240 S 590 205 604 200",
    ],
  },
  {
    color: "stroke-navy",
    opacidad: 0.3,
    duracion: 9.7,
    desfase: 6.5,
    formas: [
      "M -80 40 C 180 200 120 360 260 300 S 400 10 480 120 S 570 200 604 200",
      "M -80 23.6 C 226.4 244.1 160.2 387.8 296 252 S 412.2 -10 502.1 113.5 S 571.7 201.2 604 200",
      "M -80 57.5 C 140.8 211.3 152.8 392.1 261.4 312.6 S 387.4 12.7 442.4 137.6 S 572.9 193.7 604 200",
      "M -80 40 C 180 200 120 360 260 300 S 400 10 480 120 S 570 200 604 200",
    ],
  },
  {
    color: "stroke-frambuesa",
    opacidad: 0.35,
    duracion: 11.4,
    desfase: 7.8,
    formas: [
      "M -80 370 C 160 280 120 120 280 90 S 460 390 550 300 S 590 215 604 200",
      "M -80 325.7 C 178.8 245.8 116.4 136.5 308.1 85.5 S 459.8 343.8 548.1 296.3 S 600.1 216.4 604 200",
      "M -80 361.2 C 164 314.8 89 93.6 234.8 53.2 S 412.8 357 550.4 314.1 S 595.6 211.5 604 200",
      "M -80 370 C 160 280 120 120 280 90 S 460 390 550 300 S 590 215 604 200",
    ],
  },
]

/** El alto, en la caja de 1280×400, del centro de cada ficha: ahí llega su línea. */
const ALTURAS_DE_DESTINO = [74, 158, 242, 326] as const

/** Las líneas enredadas de la versión angosta: de debajo de las etiquetas al nodo de Eli. Quietas. */
const ENREDO_ANGOSTO = [
  { d: "M 40 0 C 40 40 230 30 200 70 S 150 100 160 112", color: "stroke-frambuesa" },
  { d: "M 280 0 C 280 50 60 40 110 78 S 170 96 160 112", color: "stroke-ciruela" },
  { d: "M 160 0 C 100 30 250 50 180 80 S 150 104 160 112", color: "stroke-pistacho" },
  { d: "M 100 0 C 140 50 20 60 120 90 S 160 104 160 112", color: "stroke-frambuesa", opacidad: 0.55 },
  { d: "M 220 0 C 160 40 300 70 200 92 S 162 108 160 112", color: "stroke-navy", opacidad: 0.3 },
] as const

/**
 * El enredo de la portada: cinco maneras de llevar el negocio, con líneas
 * enredadas que llegan a Eli, y de Eli, líneas ordenadas a la agenda, los
 * clientes, el tablero y los reportes, cada uno con su tilde.
 *
 * Desde lg es la composición del diseño, en una caja de 1280×400 que se
 * achica entera por escalones (no se reacomoda: es un dibujo). Por debajo,
 * una versión angosta de arriba abajo: las etiquetas, el nudo, Eli y los
 * cuatro destinos en dos columnas.
 *
 * Es decorativa (`aria-hidden`); lo que dice va en un texto para el lector de
 * pantalla. Las etiquetas flotan y las líneas se ondulan sin fin: el botón de
 * pausa congela las dos cosas, y fuera de la pantalla se congelan solas. Con
 * movimiento reducido nada se mueve y el botón no hace falta.
 */
export function IlustracionDelEnredo({ className }: { className?: string }) {
  const raiz = useRef<HTMLDivElement>(null)
  const enPantalla = useInView(raiz, { margin: "100px 0px" })
  const [pausado, setPausado] = useState(false)
  const quieto = pausado || !enPantalla

  return (
    <div ref={raiz} className={cn("relative", className)}>
      <p className="sr-only">{DESCRIPCION}</p>

      <div aria-hidden="true" className={cn(quieto && "animaciones-en-pausa")}>
        <ComposicionAncha quieto={quieto} />
        <ComposicionAngosta />
      </div>

      {/* Debajo del dibujo y a la derecha: encima taparía alguna ficha en algún ancho. */}
      <div className="mt-4 flex justify-end motion-reduce:hidden">
        <BotonDePausa pausado={pausado} alCambiar={setPausado} etiqueta="Pausar la animación del enredo" />
      </div>
    </div>
  )
}

/**
 * La composición del diseño. Se dibuja en 1280×400 y se achica con `scale`
 * por escalones, con el lugar que ocupa ajustado a mano en cada uno: 0,7 en
 * lg, 0,9 en xl y entera desde 1376px (1280 más el relleno). Las letras
 * crecen un poco en los escalones chicos para seguir siendo legibles.
 *
 * Cada escalón es un rango cerrado (`lg:max-xl:`, `xl:max-[1375px]:`) y no
 * un "desde": Tailwind escribe `min-[1376px]:` antes que `xl:`, y con dos
 * "desde" que valen a la vez ganaba el de xl.
 */
function ComposicionAncha({ quieto }: { quieto: boolean }) {
  return (
    <div className="relative mx-auto hidden h-[400px] w-[1280px] lg:block lg:max-xl:h-[280px] lg:max-xl:w-[896px] xl:max-[1375px]:h-[360px] xl:max-[1375px]:w-[1152px]">
      <div className="absolute left-0 top-0 h-[400px] w-[1280px] origin-top-left text-left lg:max-xl:scale-[0.7] xl:max-[1375px]:scale-[0.9]">
        <svg
          viewBox="0 0 1280 400"
          width="1280"
          height="400"
          className="pointer-events-none absolute inset-0 overflow-visible"
        >
          <TrazosOndulantes trazos={ENREDO} enPausa={quieto} />
          <g fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} className="stroke-ciruela">
            {ALTURAS_DE_DESTINO.map((y) => (
              <path key={y} d={`M 672 200 C 750 200 770 ${y} 850 ${y} L 976 ${y}`} />
            ))}
          </g>
          {ALTURAS_DE_DESTINO.map((y) => (
            <circle key={y} cx={976} cy={y} r={5.5} strokeWidth={3} className="fill-pistacho stroke-crema" />
          ))}
        </svg>

        {FUENTES.map((fuente) => (
          <EtiquetaDeFuente
            key={fuente.texto}
            fuente={fuente}
            className="absolute text-sm lg:max-xl:text-[17px] xl:max-[1375px]:text-[15px]"
            style={{ left: fuente.x, top: fuente.y }}
          />
        ))}

        <NodoEli className="absolute left-[608px] top-[168px]" />

        {DESTINOS.map((destino, orden) => (
          <FichaDeDestino
            key={destino.modulo}
            destino={destino}
            className="absolute left-[988px] h-14 w-[264px] px-3.5 text-[15px] lg:max-xl:text-[18px] xl:max-[1375px]:text-base"
            style={{ top: ALTURAS_DE_DESTINO[orden] - 28 }}
          />
        ))}
      </div>
    </div>
  )
}

/** De arriba abajo, para teléfono y tableta: no desborda a 360px. Las líneas quedan quietas. */
function ComposicionAngosta() {
  return (
    <div className="mx-auto max-w-[26rem] lg:hidden">
      <div className="flex flex-wrap justify-center gap-x-2 gap-y-3 px-1">
        {FUENTES.map((fuente) => (
          <EtiquetaDeFuente key={fuente.texto} fuente={fuente} className="text-sm" />
        ))}
      </div>

      <svg viewBox="0 0 320 112" className="mt-2 block h-auto w-full overflow-visible">
        <g fill="none" strokeLinecap="round" strokeWidth={2.5}>
          {ENREDO_ANGOSTO.map((trazo) => (
            <path key={trazo.d} d={trazo.d} className={trazo.color} strokeOpacity={"opacidad" in trazo ? trazo.opacidad : 1} />
          ))}
        </g>
      </svg>

      <NodoEli className="relative mx-auto" />

      <svg viewBox="0 0 320 40" className="block h-auto w-full">
        <g fill="none" strokeLinecap="round" strokeWidth={2.5} className="stroke-ciruela">
          <path d="M 160 0 C 160 24 80 16 80 40" />
          <path d="M 160 0 C 160 24 240 16 240 40" />
        </g>
      </svg>

      <div className="grid grid-cols-2 gap-2">
        {DESTINOS.map((destino) => (
          <FichaDeDestino key={destino.modulo} destino={destino} compacta className="min-h-12 px-2.5 py-2 text-sm" />
        ))}
      </div>
    </div>
  )
}

interface PropsDeEtiquetaDeFuente {
  fuente: Fuente
  className?: string
  style?: CSSProperties
}

/** Una manera de llevar el negocio, en una etiqueta blanca que flota inclinada. */
function EtiquetaDeFuente({ fuente, className, style }: PropsDeEtiquetaDeFuente) {
  const Icono = fuente.icono
  return (
    <span
      className={cn(
        "inline-flex animate-flotar items-center gap-2 whitespace-nowrap rounded-etiqueta border border-borde bg-tarjeta py-[7px] pl-2 pr-4 font-semibold leading-tight text-navy shadow-sm squircle",
        fuente.giro,
        className
      )}
      style={{ ...style, "--duracion": fuente.duracion, "--retraso": fuente.retraso } as CSSProperties}
    >
      <span className="grid size-[26px] shrink-0 place-items-center rounded-[9px] bg-frambuesa-suave text-frambuesa">
        <Icono strokeWidth={1.75} className="size-3.5" />
      </span>
      {fuente.texto}
    </span>
  )
}

/** El nudo: donde lo enredado llega y sale ordenado. */
function NodoEli({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "grid size-16 place-items-center rounded-[20px] bg-tarjeta shadow-lg shadow-ciruela/20 ring-[10px] ring-ciruela/10 squircle",
        className
      )}
    >
      <LogoEli className="text-[26px]" />
    </span>
  )
}

interface PropsDeFichaDeDestino {
  destino: Destino
  /** Más chica, para la versión angosta. */
  compacta?: boolean
  className?: string
  style?: CSSProperties
}

/** Un módulo de Eli con su tilde: ya está en su lugar. */
function FichaDeDestino({ destino, compacta = false, className, style }: PropsDeFichaDeDestino) {
  const modulo = moduloPorId(destino.modulo)
  const Icono = ICONOS_DE_MODULO[destino.modulo]
  return (
    <span
      className={cn(
        "flex items-center rounded-ficha border border-borde bg-tarjeta text-left font-semibold text-navy shadow-sm squircle",
        compacta ? "gap-2.5" : "gap-3",
        className
      )}
      style={style}
    >
      <span
        className={cn(
          "grid shrink-0 place-items-center squircle",
          compacta ? "size-8 rounded-[10px]" : "size-9 rounded-[12px]",
          destino.cuadro
        )}
      >
        <Icono strokeWidth={1.75} className="size-4" />
      </span>
      <span className="min-w-0 flex-1 truncate">{modulo.nombre}</span>
      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-pistacho-suave text-pistacho-oscuro">
        <Check strokeWidth={2} className="size-3" />
      </span>
    </span>
  )
}
