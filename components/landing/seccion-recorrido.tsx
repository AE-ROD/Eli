"use client"

import { useId, useState, type AnimationEvent, type CSSProperties, type FocusEvent, type ReactNode } from "react"
import {
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  Check,
  ChartColumn,
  Mail,
  PenLine,
  SquareKanban,
  type LucideIcon,
} from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { MaquetaCliente } from "@/components/landing/maquetas/maqueta-cliente"
import { MaquetaCobro } from "@/components/landing/maquetas/maqueta-cobro"
import { MaquetaReserva } from "@/components/landing/maquetas/maqueta-reserva"
import { MaquetaTablero } from "@/components/landing/maquetas/maqueta-tablero"
import { EncabezadoDeLanding, SeccionDeLanding } from "@/components/landing/seccion-de-landing"
import { CLASES_DE_TONO, type TonoDeLanding } from "@/components/landing/tonos-de-la-landing"
import { TRAZOS_DEL_RECORRIDO } from "@/components/landing/trazos-de-la-landing"
import { BotonDePausa } from "@/components/movimiento/boton-de-pausa"
import { TrazosOndulantes } from "@/components/movimiento/trazos-ondulantes"
import { useBloqueEnMovimiento } from "@/components/movimiento/usar-bloque-en-movimiento"
import { useCoincideMedia } from "@/components/movimiento/usar-coincide-media"
import { moduloPorId, type ModuloId } from "@/lib/modulos"
import { cn } from "@/lib/utils"

/** Lo que dura cada paso antes de pasar solo al siguiente: lo mide la barra de progreso. */
const DURACION_DEL_PASO = "6.5s"

interface EtiquetaFlotante {
  texto: string
  icono: LucideIcon
  /** Dónde va en el escenario y su inclinación, escrito entero. Sacado del diseño (728×716). */
  lugar: string
}

interface Paso {
  id: string
  modulo: ModuloId
  tono: TonoDeLanding
  titulo: string
  texto: string
  puntos: readonly string[]
  /** Todas las maquetas quedan montadas: `activa` vuelve a animar la del paso elegido. */
  maqueta: (activa: boolean) => ReactNode
  /** Dos etiquetas que flotan alrededor de la maqueta. Decorativas: repiten los puntos. */
  etiquetas: readonly [EtiquetaFlotante, EtiquetaFlotante]
}

/** El día de un negocio con Eli, en el orden en que pasa: la reserva, la clienta, el tablero y el cobro. */
const PASOS: readonly Paso[] = [
  {
    id: "agenda",
    modulo: "agenda",
    tono: "ciruela",
    titulo: "Reservan solas",
    texto:
      "Cada negocio tiene su página de reservas. La clienta elige el servicio, el día y la hora, y deja sus datos.",
    puntos: ["Servicio, día y hora, y sus datos", "Recordatorio por correo antes de la cita", "La cita entra a la agenda con su precio"],
    maqueta: (activa) => <MaquetaReserva activa={activa} />,
    etiquetas: [
      { texto: "Recordatorio por correo", icono: Mail, lugar: "left-[2%] top-[3%] -rotate-[4deg]" },
      { texto: "Entra a la agenda · $37.000", icono: CalendarDays, lugar: "right-[5%] top-[76%] rotate-[3deg]" },
    ],
  },
  {
    id: "clientes",
    modulo: "clientes",
    tono: "frambuesa",
    titulo: "Cada clienta, con su historia",
    texto: "Cada clienta tiene su ficha con sus datos, tus notas y el historial de sus visitas.",
    puntos: ["Datos de contacto", "Notas que quedan guardadas", "Visitas con servicio, profesional y precio"],
    maqueta: (activa) => <MaquetaCliente activa={activa} />,
    etiquetas: [
      { texto: "Notas que quedan guardadas", icono: PenLine, lugar: "left-[2%] top-[8%] -rotate-[3deg]" },
      { texto: "Visitas con su precio", icono: BookOpen, lugar: "right-[6%] top-[80%] rotate-[4deg]" },
    ],
  },
  {
    id: "tablero",
    modulo: "tablero",
    tono: "pistacho",
    titulo: "El día, en columnas",
    texto:
      "Las reservas de hoy entran solas y quien llega sin reserva se anota en el momento. Cada visita avanza hasta que se cobra.",
    puntos: ["Reservas de hoy, En espera, En atención", "Por cobrar y Finalizado", "Cada servicio con su profesional y su precio"],
    maqueta: (activa) => <MaquetaTablero activa={activa} />,
    etiquetas: [
      { texto: "Sin reserva, se anota al momento", icono: PenLine, lugar: "left-[5%] top-[9%] -rotate-[3deg]" },
      { texto: "De por cobrar a finalizado", icono: SquareKanban, lugar: "right-[9%] top-[72%] rotate-[3deg]" },
    ],
  },
  {
    id: "reportes",
    modulo: "reportes",
    tono: "anil",
    titulo: "Lo cobrado, cuadrado",
    texto:
      "El pago se divide entre los medios que haga falta y cuadra al centavo. Al cerrar sabes cuánto entró, cómo y quién lo generó.",
    puntos: [
      "Efectivo, débito, crédito, transferencia o billetera digital",
      "Por profesional, servicio o medio de pago",
      "Lo anulado queda registrado",
    ],
    maqueta: (activa) => <MaquetaCobro activa={activa} />,
    etiquetas: [
      { texto: "Cuadra al centavo", icono: Check, lugar: "left-[3%] top-[12%] -rotate-[3deg]" },
      { texto: "Lo anulado queda registrado", icono: ChartColumn, lugar: "right-[6%] top-[71%] rotate-[3deg]" },
    ],
  },
]

/**
 * "Cómo funciona": el recorrido por los cuatro pasos del día, en un acordeón
 * que avanza solo y, al lado, un escenario del color del paso con su número
 * gigante y su maqueta.
 *
 * Cada paso dura 6,5 s: lo mide la barra de progreso del paso abierto, que es
 * una animación de CSS; al terminar, abre el siguiente. Así la pausa congela
 * la barra y el avance a la vez, y sigue desde donde estaba. El avance se
 * detiene con el cursor encima, con el foco del teclado adentro, fuera de la
 * pantalla y con el botón de pausa (que congela también lo que flota). Con
 * movimiento reducido no avanza solo y nada flota: se elige el paso a mano.
 *
 * Cada paso es un botón con `aria-expanded` y `aria-controls`; elegir uno lo
 * abre y vuelve a contar desde ahí.
 */
export function SeccionRecorrido() {
  const base = useId()
  const reducido = useCoincideMedia("(prefers-reduced-motion: reduce)")
  const { ref, pausado, setPausado, quieto } = useBloqueEnMovimiento<HTMLDivElement>()
  const [paso, setPaso] = useState(0)
  // Cambia al elegir un paso a mano: la barra vuelve a empezar aunque sea el mismo.
  const [vuelta, setVuelta] = useState(0)
  const [conCursor, setConCursor] = useState(false)
  const [conFoco, setConFoco] = useState(false)
  const avanzaSolo = !reducido
  const frenado = quieto || conCursor || conFoco
  const actual = PASOS[paso]

  const elegir = (indice: number) => {
    setPaso(indice)
    setVuelta((antes) => antes + 1)
  }

  const alTerminarLaBarra = (evento: AnimationEvent<HTMLSpanElement>) => {
    if (evento.target !== evento.currentTarget) return
    // Con movimiento reducido la animación dura 0,01 ms: si llegó a correr
    // antes de saberlo (mientras hidrata), no cuenta.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    setPaso((antes) => (antes + 1) % PASOS.length)
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
    setPausado(pausar)
  }

  return (
    <SeccionDeLanding id="recorrido" etiquetadaPor="recorrido-titulo" tono="frambuesa">
      <div
        ref={ref}
        onPointerEnter={() => setConCursor(true)}
        onPointerLeave={() => setConCursor(false)}
        onFocus={alRecibirElFoco}
        onBlur={alSalirElFoco}
        className={cn(
          "grid gap-x-12 gap-y-8 [grid-template-areas:'titulo'_'escenario'_'pasos'] lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)] lg:grid-rows-[auto_1fr] lg:gap-x-10 lg:[grid-template-areas:'titulo_escenario'_'pasos_escenario'] xl:grid-cols-[minmax(0,520px)_minmax(0,1fr)] xl:gap-x-12",
          quieto && "animaciones-en-pausa"
        )}
      >
        <EncabezadoDeLanding
          id="recorrido-titulo"
          antetitulo="Cómo funciona"
          className="[grid-area:titulo]"
          titulo={
            <>
              De la reserva al cobro, sin <span className="resaltado">perder el hilo.</span>
            </>
          }
        />

        <div className="[grid-area:pasos]">
          <ol className="flex flex-col gap-3.5">
            {PASOS.map((opcion, indice) => {
              const abierto = indice === paso
              const hecho = indice < paso
              const tono = CLASES_DE_TONO[opcion.tono]
              const idDelBoton = `${base}-boton-${opcion.id}`
              const idDelPanel = `${base}-panel-${opcion.id}`
              const modulo = moduloPorId(opcion.modulo).nombre
              return (
                <li key={opcion.id} className="relative pl-16">
                  {indice < PASOS.length - 1 && (
                    <span
                      aria-hidden="true"
                      className={cn(
                        "absolute -bottom-3 left-[19px] top-12 w-0.5 rounded-full transition-colors duration-600 ease-suave",
                        hecho ? tono.relleno : "bg-borde"
                      )}
                    />
                  )}
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute left-0 top-0.5 grid size-10 place-items-center rounded-full text-[15px] font-semibold transition-[background-color,color,box-shadow] duration-500 ease-suave",
                      abierto
                        ? cn(tono.relleno, tono.anillo, "text-white ring-6")
                        : hecho
                          ? cn(tono.suave, tono.texto)
                          : "border-[1.5px] border-[#d8d3c8] bg-tarjeta text-texto-2"
                    )}
                  >
                    {indice + 1}
                  </span>
                  <h3>
                    <button
                      type="button"
                      id={idDelBoton}
                      aria-expanded={abierto}
                      aria-controls={idDelPanel}
                      onClick={() => elegir(indice)}
                      className="block w-full cursor-pointer rounded-ficha pt-0.5 text-left anillo-foco"
                    >
                      <span className="sr-only">
                        Paso {indice + 1}, {modulo}:{" "}
                      </span>
                      <span
                        aria-hidden="true"
                        className={cn(
                          "block text-xs font-bold uppercase leading-tight tracking-[0.08em] transition-colors duration-300",
                          abierto ? tono.texto : "text-texto-2"
                        )}
                      >
                        0{indice + 1} · {modulo}
                      </span>
                      <span
                        className={cn(
                          "mt-[3px] block text-[1.375rem] font-medium leading-[1.15] tracking-[-0.035em] transition-colors duration-300 md:text-2xl",
                          // Cerrado, navy al 65%: 5,4:1 sobre la crema (en el teléfono baja a 22px: no es texto grande).
                          abierto ? "text-navy" : "text-navy/65"
                        )}
                      >
                        {opcion.titulo}
                      </span>
                    </button>
                  </h3>
                  <div
                    id={idDelPanel}
                    role="region"
                    aria-labelledby={idDelBoton}
                    inert={!abierto}
                    className={cn(
                      "grid transition-[grid-template-rows,opacity] duration-700 ease-llegada",
                      abierto ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                    )}
                  >
                    <div className="overflow-hidden">
                      <p className="mb-3 mt-2.5 text-[15px] leading-normal text-texto-2">{opcion.texto}</p>
                      <ul className="flex flex-col gap-[7px]">
                        {opcion.puntos.map((punto) => (
                          <li key={punto} className="flex items-start gap-2.5 text-sm leading-[1.4]">
                            <span
                              aria-hidden="true"
                              className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full", tono.suave, tono.texto)}
                            >
                              <Check className="size-3.5" strokeWidth={1.75} />
                            </span>
                            {punto}
                          </li>
                        ))}
                      </ul>
                      <div aria-hidden="true" className="mt-3 h-[3px] overflow-hidden rounded-full bg-borde">
                        {abierto && avanzaSolo && (
                          <span
                            key={vuelta}
                            onAnimationEnd={alTerminarLaBarra}
                            className={cn(
                              "block h-full origin-left animate-progreso",
                              tono.relleno,
                              frenado && "[animation-play-state:paused]"
                            )}
                            style={{ "--duracion": DURACION_DEL_PASO } as CSSProperties}
                          />
                        )}
                        {abierto && !avanzaSolo && <span className={cn("block h-full", tono.relleno)} />}
                      </div>
                    </div>
                  </div>
                </li>
              )
            })}
          </ol>

          <div className="mt-6 flex flex-wrap gap-3">
            <Boton
              href="/crear-cuenta"
              variante="destacado"
              icono={<ArrowUpRight aria-hidden="true" />}
              className="rounded-boton-lg text-sm"
            >
              Crear mi cuenta
            </Boton>
            <Boton href="#planes" variante="secundario" className="rounded-boton-lg text-sm">
              Ver planes
            </Boton>
          </div>
        </div>

        <Escenario
          paso={paso}
          numero={`0${paso + 1}`}
          tono={actual.tono}
          quieto={quieto}
          pausa={
            avanzaSolo && (
              <BotonDePausa
                pausado={pausado}
                alCambiar={alternarPausa}
                etiqueta="Pausar el avance de los pasos"
                className="absolute bottom-4 right-4 z-10"
              />
            )
          }
        />
      </div>
    </SeccionDeLanding>
  )
}

interface PropsDeEscenario {
  paso: number
  numero: string
  tono: TonoDeLanding
  quieto: boolean
  pausa: ReactNode
}

/**
 * El escenario del paso abierto: el tinte del paso, su número gigante, las
 * líneas que se ondulan abajo, la maqueta y sus dos etiquetas. Las cuatro
 * maquetas están siempre montadas en la misma celda (el escenario mide lo
 * que la más alta y no salta al cambiar de paso); la que no es del paso se
 * va hacia arriba o hacia abajo y se apaga.
 */
function Escenario({ paso, numero, tono, quieto, pausa }: PropsDeEscenario) {
  const clases = CLASES_DE_TONO[tono]
  return (
    <div
      className={cn(
        "relative grid min-h-[520px] overflow-hidden rounded-bloque border border-borde-suave transition-colors duration-900 ease-suave squircle [grid-area:escenario] lg:min-h-[640px] xl:min-h-[716px]",
        clases.suave
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute right-5 top-2 select-none text-[120px] font-medium leading-none tracking-[-0.06em] opacity-[0.07] md:right-9 md:top-3.5 md:text-[190px]",
          clases.texto
        )}
      >
        {numero}
      </span>

      <svg
        aria-hidden="true"
        viewBox="0 0 728 150"
        width="728"
        height="150"
        className="pointer-events-none absolute bottom-0 left-0 overflow-visible"
      >
        <TrazosOndulantes trazos={TRAZOS_DEL_RECORRIDO} enPausa={quieto} />
      </svg>

      {PASOS.map((opcion, indice) => {
        const activo = indice === paso
        return (
          <div
            key={opcion.id}
            inert={!activo}
            className={cn(
              "@container relative z-[2] col-start-1 row-start-1 flex items-center justify-center px-3 pb-16 pt-24 transition-[opacity,translate,scale] duration-800 ease-llegada md:px-10 md:py-24",
              activo
                ? "translate-y-0 scale-100 opacity-100"
                : cn("pointer-events-none scale-96 opacity-0", indice < paso ? "-translate-y-9" : "translate-y-9")
            )}
          >
            {opcion.maqueta(activo)}
          </div>
        )
      })}

      {/* Las etiquetas: sólo desde md, donde hay lugar alrededor de la maqueta. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-[4] hidden md:block">
        {PASOS.map((opcion, indice) =>
          opcion.etiquetas.map((etiqueta, orden) => (
            <Etiqueta
              key={etiqueta.texto}
              etiqueta={etiqueta}
              tono={opcion.tono}
              orden={orden}
              visible={indice === paso}
            />
          ))
        )}
      </div>

      {pausa}
    </div>
  )
}

interface PropsDeEtiqueta {
  etiqueta: EtiquetaFlotante
  tono: TonoDeLanding
  /** La primera o la segunda del paso: entra un poco después y flota a otro ritmo. */
  orden: number
  visible: boolean
}

function Etiqueta({ etiqueta, tono, orden, visible }: PropsDeEtiqueta) {
  const Icono = etiqueta.icono
  return (
    <span
      className={cn(
        "absolute transition-[opacity,translate] duration-800 ease-llegada",
        etiqueta.lugar,
        visible ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
      )}
      style={{ transitionDelay: `${0.15 + orden * 0.1}s` }}
    >
      <span
        className="flex animate-flotar items-center gap-2 whitespace-nowrap rounded-etiqueta border border-borde bg-tarjeta py-[7px] pl-2 pr-4 text-sm font-semibold text-navy shadow-sm squircle"
        style={{ "--duracion": `${6 + orden}s`, "--retraso": `${-orden * 2}s` } as CSSProperties}
      >
        <span
          className={cn(
            "grid size-7 shrink-0 place-items-center rounded-[10px]",
            CLASES_DE_TONO[tono].suave,
            CLASES_DE_TONO[tono].texto
          )}
        >
          <Icono className="size-[15px]" strokeWidth={1.75} />
        </span>
        {etiqueta.texto}
      </span>
    </span>
  )
}
