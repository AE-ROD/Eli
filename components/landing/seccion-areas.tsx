"use client"

import { useEffect, useId, useRef, useState, type CSSProperties, type FocusEvent } from "react"
import Image from "next/image"
import { AnimatePresence, motion, useInView } from "framer-motion"
import { ArrowRight, Hand, Scissors, Smile, Sparkles, type LucideIcon } from "lucide-react"
import { BotonDePausa } from "@/components/movimiento/boton-de-pausa"
import { CURVA, DURACION } from "@/components/movimiento/tiempos"
import { useCoincideMedia } from "@/components/movimiento/usar-coincide-media"
import { cn } from "@/lib/utils"

/** Cada cuánto avanza sola: cambia el lugar de las fotos y, a la tercera vez, el área. */
const INTERVALO_MS = 2800

/** Cuántas veces se reacomodan las fotos de un área antes de pasar a la siguiente. */
const GIROS_POR_AREA = 3

/** Un lugar para una foto: izquierda, arriba y ancho, en % del escenario. El alto sale del ancho (3:4). */
type Lugar = readonly [izquierda: number, arriba: number, ancho: number]

/** Un video corto de una foto: se ve su póster hasta que arranca (y siempre con movimiento reducido o en pausa). */
interface VideoDeFoto {
  /** Ruta pública del `.mp4`, sin audio. */
  src: string
}

interface FotoDeArea {
  /**
   * Ruta pública de la foto (`/landing/<oficio>/<archivo>.jpg`, vertical 3:4).
   * Si es un video, es su póster. Si el archivo falta, se pinta un reemplazo
   * de color con el ícono del área: nunca un `<img>` roto.
   */
  src: string
  /** Lo que muestra, en español: es el `alt` de la foto o el `aria-label` del video. */
  descripcion: string
  video?: VideoDeFoto
}

interface Area {
  id: string
  nombre: string
  icono: LucideIcon
  /** Las clases de cada color, escritas enteras para que Tailwind las vea. */
  fondo: string
  texto: string
  tarjeta: string
  relleno: string
  /** Tres fotos: la grande, la chica y la mediana (en ese orden de lugares al empezar). */
  fotos: readonly [FotoDeArea, FotoDeArea, FotoDeArea]
  /** Los tres lugares de las fotos desde md, sacados del diseño (1440×900). */
  lugares: readonly [Lugar, Lugar, Lugar]
}

/**
 * Las cuatro áreas, en el orden del diseño, con las fotos y videos reales de
 * `public/landing/<oficio>/`. Son material de referencia de terceros: hay que
 * cambiarlos por licenciados antes del lanzamiento (`docs/PRODUCTO.md`, §10).
 * Peluquería y odontología abren con un video; de barbería y salón de uñas
 * todavía no hay videos, sólo fotos.
 */
const AREAS: readonly Area[] = [
  {
    id: "peluqueria",
    nombre: "Peluquería",
    icono: Sparkles,
    fondo: "bg-lavanda-suave",
    texto: "text-ciruela",
    tarjeta: "bg-lavanda",
    relleno: "bg-lavanda/35",
    fotos: [
      {
        src: "/landing/peluqueria/pel-video.jpg",
        descripcion: "Clienta con balayage largo, antes y después",
        video: { src: "/landing/peluqueria/pel-video.mp4" },
      },
      { src: "/landing/peluqueria/pel-pelo.jpg", descripcion: "Tres cabelleras vistas de espalda" },
      { src: "/landing/peluqueria/pel-salon.jpg", descripcion: "Salón de peluquería con espejos y sillones" },
    ],
    lugares: [
      [5, 27.8, 20.83],
      [75.69, 14, 13.19],
      [77.78, 49, 18.06],
    ],
  },
  {
    id: "barberia",
    nombre: "Barbería",
    icono: Scissors,
    fondo: "bg-pervinca-suave",
    texto: "text-ciruela",
    tarjeta: "bg-pervinca",
    relleno: "bg-pervinca/35",
    fotos: [
      { src: "/landing/barberia/bar-barbero.jpg", descripcion: "Barbero perfilando la barba de un cliente" },
      { src: "/landing/barberia/bar-detalle.jpg", descripcion: "Detalle del perfilado de barba" },
      { src: "/landing/barberia/bar-local.jpg", descripcion: "Interior de una barbería clásica" },
    ],
    lugares: [
      [73.61, 25.56, 20.83],
      [17.36, 57.78, 13.19],
      [4.86, 12.22, 17.36],
    ],
  },
  {
    id: "unas",
    nombre: "Salón de uñas",
    icono: Hand,
    fondo: "bg-rosa-suave",
    texto: "text-frambuesa-texto",
    tarjeta: "bg-rosa",
    relleno: "bg-rosa/35",
    fotos: [
      { src: "/landing/spa-de-unas/spa-manicura.jpg", descripcion: "Manicurista sonriendo mientras trabaja" },
      { src: "/landing/spa-de-unas/spa-manos.jpg", descripcion: "Manos con guantes y uñas nude" },
      { src: "/landing/spa-de-unas/spa-lounge.jpg", descripcion: "Salón de pedicure luminoso" },
    ],
    lugares: [
      [6.25, 52.22, 19.44],
      [22.92, 13.33, 13.19],
      [77.08, 33.33, 18.75],
    ],
  },
  {
    id: "odontologia",
    nombre: "Odontología",
    icono: Smile,
    fondo: "bg-pistacho-suave",
    texto: "text-ciruela",
    tarjeta: "bg-pistacho",
    relleno: "bg-pistacho/35",
    fotos: [
      {
        src: "/landing/odontologia/odo-video.jpg",
        descripcion: "Limpieza del sillón dental",
        video: { src: "/landing/odontologia/odo-video.mp4" },
      },
      { src: "/landing/odontologia/odo-tablet.jpg", descripcion: "Tablet mostrando una dentadura" },
      { src: "/landing/odontologia/odo-dentista.jpg", descripcion: "Dentista atendiendo a una paciente" },
    ],
    lugares: [
      [75.69, 10, 20.83],
      [70.83, 62.22, 13.89],
      [6.94, 42.22, 18.06],
    ],
  },
]

/** En el teléfono las fotos van en una franja arriba de las palabras, en estos tres lugares (en % de la franja). */
const LUGARES_EN_TELEFONO: readonly [Lugar, Lugar, Lugar] = [
  [3, 14, 36],
  [41, 2, 25],
  [68, 20, 29],
]

/** Quién queda encima según el lugar: la chica adelante, la grande atrás. */
const CAPA_DEL_LUGAR = [1, 3, 2] as const

/** Cómo flota cada foto: duración, inclinación de reposo y adelanto, para que no vayan juntas. */
const FLOTAR_DE_FOTO = [
  { duracion: "7s", giro: "0.7deg", retraso: "0s" },
  { duracion: "5.5s", giro: "-1.1deg", retraso: "-1.5s" },
  { duracion: "8s", giro: "0.5deg", retraso: "-3s" },
] as const

/**
 * "Reservas para cuatro oficios": los cuatro oficios en letras
 * grandes, y alrededor tres fotos del elegido que flotan.
 *
 * Avanza sola cada 2,8 s: dos veces reacomoda las fotos y a la tercera pasa
 * al oficio siguiente, con el fondo del color de ese oficio. Se detiene con
 * su botón de pausa, con el cursor sobre las palabras, con el foco del
 * teclado adentro y fuera de la pantalla; con movimiento reducido arranca en
 * pausa. Elegir un oficio lo muestra y vuelve a contar desde ahí.
 *
 * Los oficios son un grupo de botones con `aria-pressed`: el apretado es el
 * que se ve. El que no está elegido queda en navy al 55%, que sobre los
 * cuatro fondos llega a 3,8:1 o más (texto grande).
 *
 * Los videos (peluquería y odontología) arrancan sólo mientras su foto está
 * a la vista y la sección en pantalla y sin pausa: con el botón de pausa o
 * con movimiento reducido se ve el póster. No tienen audio.
 */
export function SeccionAreas() {
  const idDelTitulo = useId()
  const escenario = useRef<HTMLDivElement>(null)
  const enPantalla = useInView(escenario, { amount: 0.3 })
  const reducido = useCoincideMedia("(prefers-reduced-motion: reduce)")
  const [pausaElegida, setPausaElegida] = useState<boolean | null>(null)
  const pausado = pausaElegida ?? reducido
  const [conCursor, setConCursor] = useState(false)
  const [conFoco, setConFoco] = useState(false)
  const avanzaSola = !pausado && !conCursor && !conFoco && enPantalla
  // Lo que flota se congela con la pausa y fuera de la pantalla, no con el
  // cursor o el foco: esos sólo frenan el cambio de oficio.
  const congelada = pausado || !enPantalla

  // Un solo contador: el área es cada tres pasos y el giro, lo que sobra.
  const [paso, setPaso] = useState(0)
  // Cambia al elegir un área a mano: el reloj vuelve a contar desde cero.
  const [reinicio, setReinicio] = useState(0)
  const indiceDeArea = Math.floor(paso / GIROS_POR_AREA) % AREAS.length
  const giro = paso % GIROS_POR_AREA
  const area = AREAS[indiceDeArea]

  useEffect(() => {
    if (!avanzaSola) return
    const reloj = window.setInterval(
      () => setPaso((antes) => (antes + 1) % (AREAS.length * GIROS_POR_AREA)),
      INTERVALO_MS
    )
    return () => window.clearInterval(reloj)
  }, [avanzaSola, reinicio])

  const elegir = (indice: number) => {
    setPaso(indice * GIROS_POR_AREA)
    setReinicio((antes) => antes + 1)
  }

  // Sólo el foco del teclado detiene el avance: el de un clic dejaría todo
  // quieto después de elegir, aunque el cursor ya se haya ido.
  const alRecibirElFoco = (evento: FocusEvent<HTMLDivElement>) => {
    if (evento.target instanceof Element && evento.target.matches(":focus-visible")) setConFoco(true)
  }
  const alSalirElFoco = (evento: FocusEvent<HTMLDivElement>) => {
    const destino = evento.relatedTarget
    if (destino instanceof Node && evento.currentTarget.contains(destino)) return
    setConFoco(false)
  }

  const alternarPausa = (pausar: boolean) => {
    // Quien pide que siga quiere verlo avanzar aunque el foco quede en el botón.
    if (!pausar) setConFoco(false)
    setPausaElegida(pausar)
  }

  return (
    <section
      id="areas"
      aria-labelledby={idDelTitulo}
      className={cn(
        "relative overflow-hidden text-navy transition-colors duration-1000 ease-suave",
        area.fondo,
        congelada && "animaciones-en-pausa"
      )}
    >
      <div
        ref={escenario}
        onFocus={alRecibirElFoco}
        onBlur={alSalirElFoco}
        className="contenedor relative flex flex-col px-4 pb-8 pt-12 md:block md:aspect-[16/10] md:p-0"
      >
        <h2 id={idDelTitulo} className="relative z-10 text-center text-base md:absolute md:inset-x-0 md:top-[6%]">
          Reservas para cuatro oficios
        </h2>

        {/*
          La pausa va antes de lo que se mueve en el orden del documento (el
          teclado y el lector de pantalla la encuentran primero), aunque se vea
          abajo: en el teléfono la baja `order-last`, desde md su lugar absoluto.
        */}
        <div className="relative z-10 order-last mt-6 flex justify-center md:absolute md:inset-x-0 md:bottom-[4%] md:mt-0">
          <BotonDePausa
            pausado={pausado}
            alCambiar={alternarPausa}
            etiqueta="Pausar el avance de los oficios y los videos"
          />
        </div>

        {/* Las fotos: decoración, el nombre del oficio ya está en las palabras. */}
        <div aria-hidden="true" className="relative mx-auto mt-6 aspect-[328/200] w-full max-w-md md:absolute md:inset-0 md:mt-0 md:aspect-auto md:max-w-none">
          <AnimatePresence initial={false}>
            {area.fotos.map((foto, orden) => {
              const lugar = (orden + giro) % 3
              return (
                <FotoFlotante
                  key={`${area.id}-${giro}-${orden}`}
                  area={area}
                  foto={foto}
                  reproducir={!congelada}
                  orden={orden}
                  enTelefono={LUGARES_EN_TELEFONO[lugar]}
                  desdeMd={area.lugares[lugar]}
                  capa={CAPA_DEL_LUGAR[lugar]}
                />
              )
            })}
          </AnimatePresence>
        </div>

        {/* Desde md, el grupo va centrado sobre el escenario; el cursor lo frena sólo sobre las palabras. */}
        <div className="pointer-events-none relative z-10 mt-6 flex justify-center md:absolute md:inset-0 md:mt-0 md:items-center">
          <div
            role="group"
            aria-label="Tipos de negocio"
            onPointerEnter={() => setConCursor(true)}
            onPointerLeave={() => setConCursor(false)}
            className="pointer-events-auto flex flex-col items-center gap-[0.25em] text-[length:clamp(2.5rem,6.6vw,6rem)]"
          >
            {AREAS.map((opcion, indice) => {
              const elegida = indice === indiceDeArea
              return (
                <button
                  key={opcion.id}
                  type="button"
                  aria-pressed={elegida}
                  onClick={() => elegir(indice)}
                  className={cn(
                    "relative cursor-pointer rounded-[0.18em] px-[0.08em] py-1 font-normal leading-[0.95] tracking-[-0.03em] transition-colors duration-500 ease-suave anillo-foco",
                    elegida ? opcion.texto : "text-navy/55 hover:text-navy/80"
                  )}
                >
                  {opcion.nombre}
                  <ArrowRight
                    aria-hidden="true"
                    strokeWidth={1.6}
                    className={cn(
                      "absolute left-full top-1/2 ml-[0.18em] size-[0.62em] -translate-y-1/2 transition-[opacity,translate] duration-500 ease-llegada",
                      elegida ? "animate-senalar opacity-100" : "-translate-x-[0.3em] opacity-0"
                    )}
                  />
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}

interface PropsDeFotoFlotante {
  area: Area
  foto: FotoDeArea
  /** Cuál de las tres fotos es: decide cómo flota y cuánto espera para entrar. */
  orden: number
  enTelefono: Lugar
  desdeMd: Lugar
  capa: number
  /** Los videos corren sólo con esto en `true` (sin pausa y con la sección en pantalla). */
  reproducir: boolean
}

/**
 * Una foto o un video del área elegida (o, si falta el archivo, su reemplazo),
 * con una tarjeta de color inclinada detrás. Entra desde abajo y sale hacia arriba, escalonada con las
 * otras dos; mientras está, flota.
 */
function FotoFlotante({ area, foto, orden, enTelefono, desdeMd, capa, reproducir }: PropsDeFotoFlotante) {
  const Icono = area.icono
  // Si el archivo no está, queda el reemplazo de color con el ícono del área.
  const [faltaElArchivo, setFaltaElArchivo] = useState(false)
  const flotar = FLOTAR_DE_FOTO[orden]
  const retraso = orden * 0.07
  const lugar = {
    "--x": `${enTelefono[0]}%`,
    "--y": `${enTelefono[1]}%`,
    "--ancho": `${enTelefono[2]}%`,
    "--x-md": `${desdeMd[0]}%`,
    "--y-md": `${desdeMd[1]}%`,
    "--ancho-md": `${desdeMd[2]}%`,
    zIndex: capa,
  } as CSSProperties

  return (
    <div
      className="absolute left-(--x) top-(--y) w-(--ancho) md:left-(--x-md) md:top-(--y-md) md:w-(--ancho-md)"
      style={lugar}
    >
      <motion.div
        initial={{ opacity: 0, y: 44, scale: 0.94 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -26, scale: 0.94 }}
        transition={{
          opacity: { duration: 0.55, ease: "easeOut", delay: retraso },
          y: { duration: DURACION.llegada, ease: CURVA.llegada, delay: retraso },
          scale: { duration: DURACION.llegada, ease: CURVA.llegada, delay: retraso },
        }}
      >
        <div
          className="relative aspect-[3/4] animate-flotar"
          style={{ rotate: flotar.giro, "--duracion": flotar.duracion, "--retraso": flotar.retraso } as CSSProperties}
        >
          <div className={cn("absolute inset-0 translate-x-[4.7%] translate-y-[4%] -rotate-[3.5deg] rounded-[18px]", area.tarjeta)} />
          <div className="absolute inset-0 overflow-hidden rounded-2xl bg-tarjeta">
            {faltaElArchivo ? (
              <div className={cn("grid h-full place-items-center", area.relleno)}>
                <Icono strokeWidth={1.25} className={cn("size-[38%]", area.texto)} />
              </div>
            ) : foto.video ? (
              <VideoDeFoto foto={foto} video={foto.video} reproducir={reproducir} alFallar={() => setFaltaElArchivo(true)} />
            ) : (
              <Image
                src={foto.src}
                alt={foto.descripcion}
                width={720}
                height={960}
                sizes="(min-width: 768px) 21vw, 36vw"
                loading="lazy"
                onError={() => setFaltaElArchivo(true)}
                className="absolute inset-0 size-full object-cover"
              />
            )}
          </div>
        </div>
      </motion.div>
    </div>
  )
}

interface PropsDeVideoDeFoto {
  foto: FotoDeArea
  video: VideoDeFoto
  reproducir: boolean
  alFallar: () => void
}

/**
 * El video de una foto: sin audio, en bucle, con la foto de póster. Corre
 * sólo mientras `reproducir` sea cierto; si no (pausa, sección fuera de la
 * pantalla, movimiento reducido) se queda quieto en el póster. `preload`
 * "metadata": el video no se descarga entero hasta que hace falta.
 */
function VideoDeFoto({ foto, video, reproducir, alFallar }: PropsDeVideoDeFoto) {
  const elemento = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const v = elemento.current
    if (!v) return
    if (reproducir) {
      // Un navegador que no deja arrancar solo no es un error: queda el póster.
      v.play().catch(() => {})
    } else {
      v.pause()
    }
  }, [reproducir])

  return (
    <video
      ref={elemento}
      src={video.src}
      poster={foto.src}
      aria-label={foto.descripcion}
      muted
      loop
      playsInline
      preload="metadata"
      onError={alFallar}
      className="absolute inset-0 size-full object-cover"
    />
  )
}
