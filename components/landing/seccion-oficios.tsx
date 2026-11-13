"use client"

import { useEffect, useState, type CSSProperties, type FocusEvent } from "react"
import Image from "next/image"
import { MaquetaVisita } from "@/components/landing/maquetas/maqueta-oficios"
import { OFICIOS, type OficioDelMenu } from "@/components/landing/menu-desplegable"
import { EncabezadoDeLanding, SeccionDeLanding } from "@/components/landing/seccion-de-landing"
import { TRAZOS_DE_OFICIOS } from "@/components/landing/trazos-de-la-landing"
import { BotonDePausa } from "@/components/movimiento/boton-de-pausa"
import { TrazosOndulantes } from "@/components/movimiento/trazos-ondulantes"
import { useBloqueEnMovimiento } from "@/components/movimiento/usar-bloque-en-movimiento"
import { useCoincideMedia } from "@/components/movimiento/usar-coincide-media"
import { cn } from "@/lib/utils"

/** Cada cuánto pasa sola de "con equipo" a "solo" y de vuelta. */
const INTERVALO_MS = 5500

interface FotoDeOficio {
  /**
   * Ruta pública de la foto (`/landing/<oficio>/<archivo>.jpg`, vertical 3:4).
   * Son material de referencia de terceros: hay que cambiarlas por
   * licenciadas antes del lanzamiento (`docs/PRODUCTO.md`, §10). Si el
   * archivo falta, se pinta un reemplazo de color con el ícono del oficio:
   * nunca un `<img>` roto.
   */
  src: string
  /** Lo que muestra, en español. */
  descripcion: string
  /** Las clases de cada color, escritas enteras para que Tailwind las vea. */
  tarjeta: string
  relleno: string
  texto: string
  /** Dónde va en la caja (en %, sacado del diseño de 668×572), su proporción y su inclinación. */
  lugar: string
  /** Segundos de su flotar y cuánto arranca adelantada. */
  duracion: string
  retraso: string
}

/**
 * Una foto por oficio, con la tarjeta de color del oficio detrás. Va en la
 * caja de la derecha y, chica y redonda, en la etiqueta del oficio. Son las
 * mismas fotos de la sección de áreas.
 */
const FOTOS: Record<OficioDelMenu["nombre"], FotoDeOficio> = {
  "Salones de belleza": {
    src: "/landing/peluqueria/pel-pelo.jpg",
    descripcion: "Tres cabelleras vistas de espalda",
    tarjeta: "bg-lavanda",
    relleno: "bg-lavanda/35",
    texto: "text-ciruela",
    lugar: "left-[3.3%] top-[4.5%] w-[22.5%] aspect-[150/190] -rotate-[4deg]",
    duracion: "6s",
    retraso: "0s",
  },
  Barberías: {
    src: "/landing/barberia/bar-barbero.jpg",
    descripcion: "Barbero perfilando la barba de un cliente",
    tarjeta: "bg-pervinca",
    relleno: "bg-pervinca/35",
    texto: "text-ciruela",
    lugar: "left-[74%] top-[8.7%] w-[22.5%] aspect-[150/190] rotate-[4deg]",
    duracion: "7s",
    retraso: "-2s",
  },
  "Salones de uñas": {
    src: "/landing/spa-de-unas/spa-manicura.jpg",
    descripcion: "Manicurista sonriendo mientras trabaja",
    tarjeta: "bg-rosa",
    relleno: "bg-rosa/35",
    texto: "text-frambuesa-texto",
    lugar: "left-[71.3%] top-[59.4%] w-[24.6%] aspect-[164/206] -rotate-[3deg]",
    duracion: "8s",
    retraso: "-4s",
  },
  Odontología: {
    src: "/landing/odontologia/odo-dentista.jpg",
    descripcion: "Dentista atendiendo a una paciente",
    tarjeta: "bg-pistacho",
    relleno: "bg-pistacho/35",
    texto: "text-ciruela",
    lugar: "left-[3.9%] top-[61.5%] w-[25.4%] aspect-[170/200] rotate-[3deg]",
    duracion: "9s",
    retraso: "-6s",
  },
}

/** Los otros oficios (el primero del menú es el de la historia) van en etiquetas. */
const [, ...OTROS] = OFICIOS

const HISTORIA = {
  equipo: {
    titulo: "Color + corte, con dos profesionales",
    texto:
      "En una misma visita pueden atender varias personas. Cada servicio lleva su profesional y su precio, y al cobrar todo suma en una sola cuenta.",
  },
  solo: {
    titulo: "Color + corte, atendido por ti",
    texto: "Cada servicio lleva su precio, y al cobrar todo suma en una sola cuenta.",
  },
} as const

const OPCIONES = [
  { id: "solo", texto: "Si trabajas solo" },
  { id: "equipo", texto: "Si tienes equipo" },
] as const

/**
 * "Hecho para cuatro oficios": el titular, un selector "Si trabajas solo /
 * Si tienes equipo" que cambia la historia y la maqueta de la visita, y las
 * etiquetas de los otros oficios. A la derecha, una caja arena con la
 * maqueta y una foto por oficio alrededor.
 *
 * El selector pasa solo de una opción a la otra cada 5,5 s. Se detiene con
 * el botón de pausa (que congela también lo que flota), con el cursor
 * encima, con el foco del teclado adentro y fuera de la pantalla. Con
 * movimiento reducido no pasa solo y nada flota. Elegir una opción la muestra
 * y vuelve a contar desde ahí. Las opciones son botones con `aria-pressed`.
 */
export function SeccionOficios() {
  const reducido = useCoincideMedia("(prefers-reduced-motion: reduce)")
  const { ref, enPantalla, pausado, setPausado, quieto } = useBloqueEnMovimiento<HTMLDivElement>()
  const [conEquipo, setConEquipo] = useState(true)
  const [reinicio, setReinicio] = useState(0)
  const [conCursor, setConCursor] = useState(false)
  const [conFoco, setConFoco] = useState(false)
  const avanzaSolo = !reducido && !pausado && !conCursor && !conFoco && enPantalla
  const historia = conEquipo ? HISTORIA.equipo : HISTORIA.solo

  useEffect(() => {
    if (!avanzaSolo) return
    const reloj = window.setInterval(() => setConEquipo((antes) => !antes), INTERVALO_MS)
    return () => window.clearInterval(reloj)
  }, [avanzaSolo, reinicio])

  const elegir = (equipo: boolean) => {
    setConEquipo(equipo)
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
    if (!pausar) setConFoco(false)
    setPausado(pausar)
  }

  return (
    <SeccionDeLanding
      id="oficios"
      etiquetadaPor="oficios-titulo"
      // El fondo arena de este bloque (#E0CDB0 → #D8C3A5) es más oscuro que el crema: el gris
      // secundario pasa a #3F2A26 (7,8:1) para que el texto chico siga llegando a 4,5:1.
      className="bg-[linear-gradient(180deg,#e0cdb0,#d8c3a5)] [--color-texto-2:#3f2a26]"
    >
      <div
        ref={ref}
        onPointerEnter={() => setConCursor(true)}
        onPointerLeave={() => setConCursor(false)}
        onFocus={alRecibirElFoco}
        onBlur={alSalirElFoco}
        className={cn(
          // La pausa va primera en el documento y se ve debajo de la maqueta: la
          // pone ahí la grilla ('pausa'), con 16px de separación como antes.
          "grid items-start gap-10 [grid-template-areas:'texto'_'maqueta'_'pausa'] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:grid-rows-[auto_1fr] lg:gap-y-4 lg:[grid-template-areas:'texto_maqueta'_'texto_pausa'] xl:gap-x-[68px]",
          quieto && "animaciones-en-pausa"
        )}
      >
        <div className="-mt-6 flex justify-end [grid-area:pausa] lg:mt-0">
          {!reducido && (
            <BotonDePausa pausado={pausado} alCambiar={alternarPausa} etiqueta="Pausar el cambio entre solo y con equipo" />
          )}
        </div>

        <div className="[grid-area:texto]">
          <EncabezadoDeLanding
            id="oficios-titulo"
            antetitulo="Oficios"
            titulo={
              <>
                Hecho para <span className="resaltado">cuatro oficios.</span>
              </>
            }
            subtitulo="Salones de belleza, barberías, salones de uñas y odontología, trabajes solo o con equipo."
          />

          <div
            role="group"
            aria-label="Tamaño del negocio"
            className="mt-[26px] inline-flex max-w-full gap-0.5 rounded-[16px] bg-[#f2e9da] p-1"
          >
            {OPCIONES.map((opcion) => {
              const elegida = (opcion.id === "equipo") === conEquipo
              return (
                <button
                  key={opcion.id}
                  type="button"
                  aria-pressed={elegida}
                  onClick={() => elegir(opcion.id === "equipo")}
                  className={cn(
                    "min-h-11 cursor-pointer rounded-[13px] px-4 text-sm font-semibold transition-[background-color,color,box-shadow] duration-300 ease-suave anillo-foco sm:px-5",
                    elegida ? "bg-tarjeta text-navy shadow-sm" : "text-texto-2 hover:text-navy"
                  )}
                >
                  {opcion.texto}
                </button>
              )
            })}
          </div>

          <div className="mt-7 max-w-[500px]">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-frambuesa-texto">Salón de belleza</p>
            <h3 className="mt-1.5 text-[1.625rem] font-semibold leading-[1.15] tracking-[-0.035em]">{historia.titulo}</h3>
            <p className="mt-2.5 min-h-[70px] text-[15px] leading-[1.55] text-texto-2">{historia.texto}</p>
          </div>

          <ul aria-label="También para" className="mt-5 flex flex-wrap gap-3">
            {OTROS.map((oficio) => (
              <li key={oficio.nombre}>
                <EtiquetaDeOficio oficio={oficio} />
              </li>
            ))}
          </ul>
        </div>

        <div className="[grid-area:maqueta]">
          <div
            className="relative isolate min-h-[500px] overflow-hidden rounded-bloque border border-borde-suave bg-ciruela-suave squircle md:min-h-0 md:aspect-[668/572]"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 668 150"
              width="668"
              height="150"
              className="pointer-events-none absolute left-0 top-[75%] -z-10 overflow-visible"
            >
              <TrazosOndulantes trazos={TRAZOS_DE_OFICIOS} enPausa={quieto} />
            </svg>
            {OFICIOS.map((oficio) => (
              <FotoGrande key={oficio.nombre} oficio={oficio} />
            ))}
            <div
              className="absolute left-1/2 top-1/2 z-[3] w-[88%] md:top-[45%] max-w-[410px] -translate-x-1/2 -translate-y-1/2 animate-flotar [--giro:0deg] md:w-[61.4%]"
              style={{ "--retraso": "-1s" } as CSSProperties}
            >
              <MaquetaVisita conEquipo={conEquipo} />
            </div>
          </div>
        </div>
      </div>
    </SeccionDeLanding>
  )
}

/**
 * Una foto del oficio (o, si falta el archivo, su reemplazo) con la tarjeta
 * de color inclinada detrás. Decorativa: el oficio ya está en el texto.
 */
function FotoGrande({ oficio }: { oficio: OficioDelMenu }) {
  const foto = FOTOS[oficio.nombre]
  const [faltaElArchivo, setFaltaElArchivo] = useState(false)
  if (!foto) return null
  const Icono = oficio.icono
  return (
    <div aria-hidden="true" className={cn("absolute z-[1]", foto.lugar)}>
      <div
        className="relative size-full animate-flotar"
        style={{ "--duracion": foto.duracion, "--retraso": foto.retraso } as CSSProperties}
      >
        <div className={cn("absolute inset-0 translate-x-3 translate-y-3.5 -rotate-3 rounded-[26px]", foto.tarjeta)} />
        <div className="absolute inset-0 overflow-hidden rounded-[26px] border-[3px] border-white bg-tarjeta shadow-[0_14px_34px_rgba(31,14,14,0.16)]">
          {faltaElArchivo ? (
            <div className={cn("grid size-full place-items-center", foto.relleno)}>
              <Icono strokeWidth={1.25} className={cn("size-[42%]", foto.texto)} />
            </div>
          ) : (
            <Image
              src={foto.src}
              alt={foto.descripcion}
              width={720}
              height={960}
              sizes="(min-width: 1024px) 160px, 22vw"
              loading="lazy"
              onError={() => setFaltaElArchivo(true)}
              className="absolute inset-0 size-full object-cover"
            />
          )}
        </div>
      </div>
    </div>
  )
}

/** Un oficio en una píldora blanca, con su foto chica y redonda (o su ícono si falta el archivo). */
function EtiquetaDeOficio({ oficio }: { oficio: OficioDelMenu }) {
  const foto = FOTOS[oficio.nombre]
  const [faltaElArchivo, setFaltaElArchivo] = useState(false)
  const Icono = oficio.icono
  return (
    <span className="inline-flex items-center gap-2.5 rounded-full border border-borde bg-tarjeta py-[5px] pl-[5px] pr-[18px] text-sm font-semibold shadow-sm">
      {/* El nombre del oficio va al lado: la foto no aporta nada más, `alt` vacío a propósito. */}
      <span aria-hidden="true" className={cn("relative grid size-8 shrink-0 place-items-center overflow-hidden rounded-full", foto?.relleno)}>
        {foto && !faltaElArchivo ? (
          <Image
            src={foto.src}
            alt=""
            width={96}
            height={128}
            loading="lazy"
            onError={() => setFaltaElArchivo(true)}
            className="absolute inset-0 size-full object-cover"
          />
        ) : (
          <Icono strokeWidth={1.75} className={cn("size-4", foto?.texto)} />
        )}
      </span>
      {oficio.nombre}
    </span>
  )
}
