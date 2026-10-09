"use client"

import { useEffect, useId, useRef, useState, useSyncExternalStore, type DragEvent, type ReactNode } from "react"
import { ANILLO_DE_FOCO } from "@/components/panel/estilos"
import type { EstadoActivo } from "@/lib/atenciones"
import {
  COLUMNAS_DEL_TABLERO,
  accionAlSoltar,
  atencionesDeColumna,
  destinosDeArrastre,
  estaAtrasada,
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
 * Las columnas: en el teléfono, una al lado de la otra con scroll horizontal
 * que se detiene en cada una; en escritorio se reparten el ancho. Mínimo
 * 280 px hasta escritorio, donde bajan a 200 para que las cinco entren en una
 * pantalla común sin scroll.
 *
 * `relative` no es decorativo: los textos `sr-only` de adentro (el contador
 * de cada columna, el "Cargando…") son `position: absolute`. Sin un ancestro
 * posicionado dentro del scroll se ubicaban respecto de la página, fuera del
 * contenedor que recorta, y la estiraban: la página entera se desplazaba de
 * costado en el teléfono.
 */
const CONTENEDOR =
  "relative flex gap-3 overflow-x-auto snap-x snap-mandatory lg:snap-none pb-3 -mx-4 px-4 scroll-px-4 sm:mx-0 sm:px-0 sm:scroll-px-0"
const ANCHO_DE_COLUMNA =
  "snap-start shrink-0 w-[85vw] min-w-[280px] max-w-[340px] lg:w-auto lg:max-w-none lg:min-w-[200px] lg:flex-1 lg:shrink"

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
 * que se apretó ("Llegó", cobrar, anular, mover): sin esto caía al <body> y
 * con teclado había que volver a recorrer la página desde arriba.
 */
export interface DestinoDelFoco {
  /** La tarjeta de la atención, si sigue en el tablero (en su columna nueva). */
  atencionId?: string
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

interface ColumnaProps {
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
}: ColumnaProps) {
  const idDelTitulo = useId()

  return (
    <section
      aria-labelledby={idDelTitulo}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        ANCHO_DE_COLUMNA,
        "flex flex-col rounded-xl border border-border/50 bg-muted/40 transition-colors",
        arrastrando && destinoValido && "outline-2 outline-dashed outline-primary/50 -outline-offset-2",
        encima && "bg-primary/10"
      )}
    >
      {/* El título se enfoca desde el código: es adonde va el foco cuando la tarjeta ya no está. */}
      <h2
        id={idDelTitulo}
        data-columna={id}
        tabIndex={-1}
        className={cn(
          "flex items-center justify-between gap-2 px-3 py-2.5 border-b border-border/50 text-sm font-semibold text-foreground rounded-t-xl",
          // Hacia adentro: arriba no hay lugar, el contenedor con scroll recortaría el anillo.
          ANILLO_DE_FOCO,
          "focus-visible:ring-inset focus-visible:ring-offset-0"
        )}
      >
        <span>{titulo}</span>
        <span className="rounded-full bg-background border border-border/70 px-2 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground">
          <span className="sr-only">, </span>
          {cantidad}
        </span>
      </h2>
      <div className="flex-1 space-y-2 p-2 min-h-[120px]">
        {cantidad === 0 ? <p className="px-1 py-6 text-center text-sm text-muted-foreground">{vacio}</p> : children}
      </div>
    </section>
  )
}

interface TableroDeColumnasProps {
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
  onDeshacerLlegada,
  onMover,
  onCobrar,
  onEditar,
  onAnular,
}: TableroDeColumnasProps) {
  const punteroFino = usePunteroFino()
  const [arrastrada, setArrastrada] = useState<Arrastrada | null>(null)
  const [encima, setEncima] = useState<ColumnaId | null>(null)

  const contenedor = useRef<HTMLDivElement>(null)

  // Después de dibujar lo que cambió: la tarjeta en su lugar nuevo o, si ya
  // no está, el título de la columna. Las tarjetas y los títulos se marcan
  // con `data-atencion` y `data-columna`.
  useEffect(() => {
    if (!foco) return
    const raiz = contenedor.current
    const tarjeta = foco.atencionId
      ? raiz?.querySelector<HTMLElement>(`[data-atencion="${CSS.escape(foco.atencionId)}"]`)
      : null
    const destino = tarjeta ?? raiz?.querySelector<HTMLElement>(`[data-columna="${foco.columna}"]`)
    if (destino) enfocar(destino)
    onFocoAplicado()
  }, [foco, onFocoAplicado])

  const destinos = arrastrada ? destinosDeArrastre(actor, comoTarjeta(arrastrada)) : []

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
                  atrasada={estaAtrasada(reserva.inicio, ahora)}
                  enCurso={enCurso.has(reserva.id)}
                  arrastre={arrastreDe({ tipo: "reserva", reserva }, reserva.id)}
                  onLlego={() => onLlego(reserva)}
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
        <div key={id} aria-hidden="true" className={cn(ANCHO_DE_COLUMNA, "rounded-xl border border-border/50 bg-muted/40")}>
          <p className="px-3 py-2.5 border-b border-border/50 text-sm font-semibold text-foreground">{titulo}</p>
          <div className="space-y-2 p-2">
            {[0, 1].map((fila) => (
              <div key={fila} className="rounded-lg border border-border/50 bg-card p-3 animate-pulse space-y-2">
                <div className="h-3.5 w-2/3 rounded bg-muted" />
                <div className="h-3 w-1/2 rounded bg-muted" />
                <div className="h-7 w-full rounded bg-muted" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
