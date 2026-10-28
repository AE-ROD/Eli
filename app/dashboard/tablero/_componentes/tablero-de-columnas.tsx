"use client"

import { useEffect, useId, useRef, useState, useSyncExternalStore, type DragEvent, type ReactNode } from "react"
import { Esqueleto } from "@/components/comunes/esqueleto"
import type { EstadoActivo } from "@/lib/atenciones"
import {
  COLUMNAS_DEL_TABLERO,
  accionAlSoltar,
  atencionesDeColumna,
  destinosDeArrastre,
  estaAtrasada,
  nombreConHora,
  nombresSinRepetir,
  type ColumnaId,
  type TarjetaDelTablero,
} from "@/lib/acciones-del-tablero"
import type { Actor } from "@/lib/permisos"
import { cn } from "@/lib/utils"
import type { Atencion, Reserva, Tablero } from "../_datos"
import { TarjetaDeAtencion } from "./tarjeta-de-atencion"
import { TarjetaDeReserva, type PropsDeArrastre } from "./tarjeta-de-reserva"

/** Lo que dice cada columna cuando no tiene nada. */
const VACIO: Record<ColumnaId, string> = {
  reservas: "No quedan reservas por llegar hoy.",
  "en-espera": "Nadie esperando.",
  "en-atencion": "Nadie en atención.",
  "por-cobrar": "Nada por cobrar.",
  finalizada: "Todavía no se cobró nada hoy.",
}

/**
 * Las columnas: en el teléfono, de 272 px una al lado de la otra, con scroll
 * horizontal que se detiene en cada una; desde md se reparten el ancho con un
 * mínimo de 196 px. Si las cinco no entran (una tableta, o una pantalla
 * mediana con la barra lateral), el tablero se desplaza de costado dentro de
 * su caja y la página no.
 *
 * La caja llega hasta el borde del contenido (el margen negativo deshace el
 * relleno de la página y su propio relleno lo devuelve): al desplazarse, las
 * columnas se pierden en ese borde en vez de cortarse 16 o 24 px antes.
 *
 * `relative` no es decorativo: los textos `sr-only` de adentro (el contador
 * de cada columna, el "Cargando…") son `position: absolute`. Sin un ancestro
 * posicionado dentro del scroll se ubicaban respecto de la página, fuera del
 * contenedor que recorta, y la estiraban: la página entera se desplazaba de
 * costado en el teléfono.
 */
const CONTENEDOR =
  "relative flex gap-3 overflow-x-auto snap-x snap-mandatory md:snap-none pb-3 -mx-4 px-4 scroll-px-4 sm:-mx-6 sm:px-6 sm:scroll-px-6"
const ANCHO_DE_COLUMNA = "w-68 shrink-0 snap-start md:w-auto md:min-w-[196px] md:flex-1 md:shrink"

/**
 * Cada columna es una isla gris de radio 32, con 10 px de relleno: el anillo
 * del foco de lo que tiene adentro (el título, una tarjeta) mide 6 px hacia
 * afuera y entra en ese relleno. Así no lo recorta la caja con scroll, que
 * recorta todo lo que se sale de ella.
 */
const ISLA = "flex flex-col gap-2.5 rounded-panel bg-superficie p-2.5 squircle"

/** El título de la columna, con el contador en una píldora blanca. */
const TITULO_DE_COLUMNA =
  "flex items-center justify-between gap-2 rounded-[20px] px-2.5 pb-1 pt-2 text-[15px] font-semibold leading-[1.3] tracking-[-0.2px] text-navy"

/**
 * Arrastrar sólo donde hay mouse: en pantallas táctiles el arrastre nativo no
 * existe en todos lados y pelea con el scroll. Ahí se usan los botones, que
 * son lo principal en cualquier pantalla.
 */
const CONSULTA_PUNTERO_FINO = "(hover: hover) and (pointer: fine)"

function suscribirAlPuntero(avisar: () => void) {
  const consulta = window.matchMedia(CONSULTA_PUNTERO_FINO)
  consulta.addEventListener("change", avisar)
  return () => consulta.removeEventListener("change", avisar)
}

function usePunteroFino(): boolean {
  return useSyncExternalStore(
    suscribirAlPuntero,
    () => window.matchMedia(CONSULTA_PUNTERO_FINO).matches,
    // En el servidor no hay mouse que mirar: nada se arrastra hasta hidratar.
    () => false
  )
}

type Arrastrada = { tipo: "reserva"; reserva: Reserva } | { tipo: "atencion"; atencion: Atencion }

/**
 * Adonde va el foco después de una acción que saca de la pantalla el botón
 * que se apretó ("Llegó", cobrar, anular, mover), o después de recargar un
 * tablero que había quedado viejo: sin esto caía al <body> y con teclado había
 * que volver a recorrer la página desde arriba.
 */
export interface DestinoDelFoco {
  /** La tarjeta de la atención, si sigue en el tablero (en su columna nueva). */
  atencionId?: string
  /** La tarjeta de la reserva, si sigue en "Reservas de hoy". */
  reservaId?: string
  /** Si no, el título de esta columna: la que la tenía, o adonde volvió. */
  columna: ColumnaId
}

/**
 * Enfoca sin mover el tablero, salvo que se esté usando el teclado: tocar
 * "Llegó" en el teléfono no debe correr la vista a otra columna, pero con
 * teclado el foco tiene que quedar a la vista.
 */
function enfocar(destino: HTMLElement) {
  destino.focus({ preventScroll: true })
  let conTeclado = true
  try {
    conTeclado = destino.matches(":focus-visible")
  } catch {
    // Un navegador sin `:focus-visible`: se muestra siempre.
  }
  if (conTeclado) destino.scrollIntoView({ block: "nearest", inline: "nearest" })
}

const comoTarjeta = (arrastrada: Arrastrada): TarjetaDelTablero =>
  arrastrada.tipo === "reserva" ? { tipo: "reserva" } : { tipo: "atencion", estado: arrastrada.atencion.estado }

interface PropsDeColumna {
  id: ColumnaId
  titulo: string
  cantidad: number
  vacio: string
  /** Mientras se arrastra una tarjeta: si se puede soltar acá. */
  destinoValido: boolean
  arrastrando: boolean
  encima: boolean
  onDragOver: (evento: DragEvent<HTMLElement>) => void
  onDragLeave: (evento: DragEvent<HTMLElement>) => void
  onDrop: (evento: DragEvent<HTMLElement>) => void
  children: ReactNode
}

function Columna({
  id,
  titulo,
  cantidad,
  vacio,
  destinoValido,
  arrastrando,
  encima,
  onDragOver,
  onDragLeave,
  onDrop,
  children,
}: PropsDeColumna) {
  const idDelTitulo = useId()

  return (
    <section
      aria-labelledby={idDelTitulo}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        ANCHO_DE_COLUMNA,
        ISLA,
        "transition-colors duration-150 ease-suave",
        // Mientras se arrastra, las columnas que aceptan la tarjeta se marcan con
        // un borde de trazos, y la que está debajo del puntero toma el naranja
        // del tablero.
        arrastrando && destinoValido && "outline-2 outline-dashed outline-texto-2 -outline-offset-2",
        encima && "bg-naranja-suave"
      )}
    >
      {/*
        El título se enfoca desde el código: es adonde va el foco cuando la
        tarjeta ya no está. El anillo entra en el relleno de la isla.
      */}
      <h2 id={idDelTitulo} data-columna={id} tabIndex={-1} className={cn(TITULO_DE_COLUMNA, "anillo-foco")}>
        <span className="min-w-0 break-words">{titulo}</span>
        <span className="inline-flex h-6 min-w-7 shrink-0 items-center justify-center rounded-full bg-tarjeta px-2 text-[13px] font-semibold tabular-nums">
          <span className="sr-only">, </span>
          {cantidad}
        </span>
      </h2>
      {cantidad === 0 ? (
        <p className="rounded-[24px] border-2 border-dashed border-borde px-3 py-5 text-center text-[13px] leading-snug text-texto-2">
          {vacio}
        </p>
      ) : (
        children
      )}
    </section>
  )
}

interface PropsDeTableroDeColumnas {
  tablero: Tablero
  actor: Actor | null
  /** El mismo instante para todas las tarjetas, en milisegundos. */
  ahora: number
  /** Ids de reservas y atenciones con un pedido en curso. */
  enCurso: ReadonlySet<string>
  /** Adonde llevar el foco en cuanto se dibuje lo que cambió; `null` si no hay que moverlo. */
  foco: DestinoDelFoco | null
  onFocoAplicado: () => void
  onLlego: (reserva: Reserva) => void
  onNoVino: (reserva: Reserva) => void
  onDeshacerLlegada: (atencion: Atencion) => void
  onMover: (atencion: Atencion, hacia: EstadoActivo) => void
  onCobrar: (atencion: Atencion) => void
  onEditar: (atencion: Atencion) => void
  onAnular: (atencion: Atencion) => void
}

/**
 * Las cinco columnas del tablero con sus tarjetas. Las tarjetas se mueven con
 * sus botones, que funcionan en el teléfono y con teclado; en escritorio
 * también se pueden arrastrar a la columna siguiente o a la anterior. Soltar
 * hace exactamente lo mismo que el botón equivalente.
 */
export function TableroDeColumnas({
  tablero,
  actor,
  ahora,
  enCurso,
  foco,
  onFocoAplicado,
  onLlego,
  onNoVino,
  onDeshacerLlegada,
  onMover,
  onCobrar,
  onEditar,
  onAnular,
}: PropsDeTableroDeColumnas) {
  const punteroFino = usePunteroFino()
  const [arrastrada, setArrastrada] = useState<Arrastrada | null>(null)
  const [encima, setEncima] = useState<ColumnaId | null>(null)

  const contenedor = useRef<HTMLDivElement>(null)

  // Después de dibujar lo que cambió: la tarjeta en su lugar nuevo o, si ya
  // no está, el título de la columna. Las tarjetas y los títulos se marcan
  // con `data-atencion`, `data-reserva` y `data-columna`.
  useEffect(() => {
    if (!foco) return
    const raiz = contenedor.current
    const tarjeta = foco.atencionId
      ? raiz?.querySelector<HTMLElement>(`[data-atencion="${CSS.escape(foco.atencionId)}"]`)
      : foco.reservaId
        ? raiz?.querySelector<HTMLElement>(`[data-reserva="${CSS.escape(foco.reservaId)}"]`)
        : null
    const destino = tarjeta ?? raiz?.querySelector<HTMLElement>(`[data-columna="${foco.columna}"]`)
    if (destino) enfocar(destino)
    onFocoAplicado()
  }, [foco, onFocoAplicado])

  const destinos = arrastrada ? destinosDeArrastre(actor, comoTarjeta(arrastrada)) : []

  // Sobre todo el tablero y no por columna: los botones de editar y anular
  // dicen lo mismo en cualquier columna.
  const nombres = nombresSinRepetir(tablero.atenciones)

  // Las reservas, igual: dos de la misma clienta a la misma hora (una para
  // ella y otra para su hija, anotadas a su nombre) daban dos "Llegó: María
  // González, reserva de las 16:00". `nombreConHora` le suma la hora a lo que
  // recibe como nombre, así que queda "María González, reserva de las 16:00",
  // y la segunda, con "(2)".
  const nombresDeReservas = nombresSinRepetir(
    tablero.reservas.map((reserva) => ({
      id: reserva.id,
      estado: "reserva",
      cliente: { nombre: `${reserva.cliente?.nombre ?? "Sin cliente"}, reserva` },
      llegoEn: reserva.inicio,
      cobradaEn: null,
    }))
  )

  const terminarArrastre = () => {
    setArrastrada(null)
    setEncima(null)
  }

  /** Las props que hacen arrastrable a una tarjeta, si tiene adónde ir. */
  const arrastreDe = (tarjeta: Arrastrada, id: string): PropsDeArrastre => ({
    draggable: punteroFino && !enCurso.has(id) && destinosDeArrastre(actor, comoTarjeta(tarjeta)).length > 0,
    onDragStart: (evento) => {
      evento.dataTransfer.effectAllowed = "move"
      // Firefox no empieza el arrastre si no se le da algún dato.
      evento.dataTransfer.setData("text/plain", id)
      setArrastrada(tarjeta)
    },
    onDragEnd: terminarArrastre,
  })

  const soltar = (columna: ColumnaId) => {
    if (!arrastrada) return
    const accion = accionAlSoltar(actor, comoTarjeta(arrastrada), columna)
    terminarArrastre()
    if (!accion) return

    // El mismo manejador que el botón que hace eso mismo.
    if (arrastrada.tipo === "reserva") {
      if (accion.tipo === "llegar") onLlego(arrastrada.reserva)
      return
    }
    if (accion.tipo === "mover") onMover(arrastrada.atencion, accion.hacia)
    else if (accion.tipo === "cobrar") onCobrar(arrastrada.atencion)
  }

  const eventosDeColumna = (columna: ColumnaId) => ({
    onDragOver: (evento: DragEvent<HTMLElement>) => {
      // Sólo una columna válida acepta la tarjeta: sin `preventDefault`, el
      // navegador muestra que ahí no se puede soltar.
      if (!destinos.includes(columna)) return
      evento.preventDefault()
      evento.dataTransfer.dropEffect = "move"
      if (encima !== columna) setEncima(columna)
    },
    onDragLeave: (evento: DragEvent<HTMLElement>) => {
      // Pasar por encima de una tarjeta de la misma columna también dispara
      // `dragleave`: sólo cuenta si el puntero salió de la columna.
      if (evento.currentTarget.contains(evento.relatedTarget as Node | null)) return
      setEncima((actual) => (actual === columna ? null : actual))
    },
    onDrop: (evento: DragEvent<HTMLElement>) => {
      evento.preventDefault()
      soltar(columna)
    },
  })

  return (
    <div ref={contenedor} className={CONTENEDOR}>
      {COLUMNAS_DEL_TABLERO.map(({ id: columna, titulo }) => {
        const propsDeColumna = {
          id: columna,
          titulo,
          vacio: VACIO[columna],
          destinoValido: destinos.includes(columna),
          arrastrando: arrastrada !== null,
          encima: encima === columna,
          ...eventosDeColumna(columna),
        }

        if (columna === "reservas") {
          return (
            <Columna key={columna} cantidad={tablero.reservas.length} {...propsDeColumna}>
              {tablero.reservas.map((reserva) => (
                <TarjetaDeReserva
                  key={reserva.id}
                  reserva={reserva}
                  quien={nombresDeReservas.get(reserva.id) ?? reserva.cliente?.nombre ?? "Sin cliente"}
                  atrasada={estaAtrasada(reserva.inicio, ahora)}
                  enCurso={enCurso.has(reserva.id)}
                  arrastre={arrastreDe({ tipo: "reserva", reserva }, reserva.id)}
                  onLlego={() => onLlego(reserva)}
                  onNoVino={() => onNoVino(reserva)}
                />
              ))}
            </Columna>
          )
        }

        const atenciones = atencionesDeColumna(tablero.atenciones, columna)
        return (
          <Columna key={columna} cantidad={atenciones.length} {...propsDeColumna}>
            {atenciones.map((atencion) => (
              <TarjetaDeAtencion
                key={atencion.id}
                atencion={atencion}
                quien={nombres.get(atencion.id) ?? nombreConHora(atencion)}
                actor={actor}
                ahora={ahora}
                enCurso={enCurso.has(atencion.id)}
                arrastre={arrastreDe({ tipo: "atencion", atencion }, atencion.id)}
                onDeshacerLlegada={() => onDeshacerLlegada(atencion)}
                onMover={(hacia) => onMover(atencion, hacia)}
                onCobrar={() => onCobrar(atencion)}
                onEditar={() => onEditar(atencion)}
                onAnular={() => onAnular(atencion)}
              />
            ))}
          </Columna>
        )
      })}
    </div>
  )
}

/** Mientras llega el tablero: las cinco columnas con tarjetas en gris, sin cifras inventadas. */
export function TableroCargando() {
  return (
    <div className={CONTENEDOR} role="status">
      <span className="sr-only">Cargando el tablero…</span>
      {COLUMNAS_DEL_TABLERO.map(({ id, titulo }) => (
        <div key={id} aria-hidden="true" className={cn(ANCHO_DE_COLUMNA, ISLA)}>
          <p className={TITULO_DE_COLUMNA}>{titulo}</p>
          {[0, 1].map((fila) => (
            <div key={fila} className="flex flex-col gap-3 rounded-[24px] bg-tarjeta p-3.5 shadow-sm squircle">
              <Esqueleto className="w-1/3" />
              <Esqueleto className="h-3.5 w-2/3" />
              <Esqueleto className="w-1/2" />
              <Esqueleto className="h-9 rounded-boton" />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
