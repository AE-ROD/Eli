"use client"

import { useEffect, useId, useRef, type ReactNode } from "react"
import { motion } from "framer-motion"
import { X } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { BotonPrimario } from "@/components/comunes/boton-primario"
import { CURVA, DURACION } from "@/components/movimiento/tiempos"
import { AvatarUsuario } from "@/components/panel/avatar-usuario"
import { formatearMonto } from "@/lib/dinero"
import { formatearHora, duracionParaMostrar } from "@/lib/fechas"
import { sePuedeMover } from "@/lib/mover-cita"
import { cn } from "@/lib/utils"
import { nombreDeCliente, type Cita } from "../_datos"
import { estiloDeEstado } from "./estados-de-cita"

/** Un fundido corto al abrir y al cerrar: el panel no se desliza. */
const FUNDIDO = { duration: DURACION.sombra, ease: CURVA.suave }

/** `lunes, 8 de marzo`: el día de la cita, sin la hora. */
function formatearFecha(iso: string) {
  return new Date(iso).toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" })
}

interface PropsDePanelDeCita {
  cita: Cita
  onCerrar: () => void
  onCambiarEstado: (id: string, estado: string) => void
  /** Abre el modal para cambiar la fecha, la hora y (si se puede) el profesional. */
  onMover: (cita: Cita) => void
}

/**
 * El detalle de la cita elegida, al lado del calendario: una isla gris, como
 * las columnas del tablero, con los datos en una tarjeta blanca y las
 * acciones debajo. Desde `lg` queda fija al bajar por la página.
 *
 * Al cerrarlo, el foco vuelve a la cita que lo abrió; si no, el botón de
 * cerrar desaparecía con el foco adentro y el teclado volvía al principio.
 */
export function PanelDeCita({ cita, onCerrar, onCambiarEstado, onMover }: PropsDePanelDeCita) {
  const idDelTitulo = useId()
  const panel = useRef<HTMLElement>(null)
  const titulo = useRef<HTMLHeadingElement>(null)
  const abridor = useRef<HTMLElement | null>(null)
  const ultimaVista = useRef({ id: cita.id, estado: cita.status })
  const estado = estiloDeEstado(cita.status)
  const duracion = duracionParaMostrar(cita.startTime, cita.endTime)

  // Lo que tiene el foco al abrir el panel, o al pasar a otra cita, es lo que lo abrió.
  useEffect(() => {
    const enfocado = document.activeElement
    if (enfocado instanceof HTMLElement && !panel.current?.contains(enfocado)) abridor.current = enfocado
  }, [cita.id])

  // Completar o cancelar la cita saca de la pantalla el botón que se apretó, y
  // el navegador tira el foco al <body>. Va al título del panel: no al otro
  // botón, que puede ser "Cancelar cita".
  useEffect(() => {
    const cambioDeEstado = ultimaVista.current.id === cita.id && ultimaVista.current.estado !== cita.status
    ultimaVista.current = { id: cita.id, estado: cita.status }
    const sinFoco = !document.activeElement || document.activeElement === document.body
    if (cambioDeEstado && sinFoco) titulo.current?.focus({ preventScroll: true })
  }, [cita.id, cita.status])

  const cerrar = () => {
    const destino = abridor.current
    onCerrar()
    if (destino?.isConnected) destino.focus({ preventScroll: true })
  }

  const puedeCompletarse = cita.status !== "completada" && cita.status !== "cancelada"
  const puedeCancelarse = cita.status !== "cancelada"
  const puedeMoverse = sePuedeMover(cita.status)

  return (
    <motion.aside
      ref={panel}
      aria-labelledby={idDelTitulo}
      className="hidden w-80 shrink-0 flex-col gap-3 rounded-panel bg-superficie p-3 text-navy squircle lg:sticky lg:top-6 lg:flex"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={FUNDIDO}
    >
      <div className="flex items-center justify-between gap-2 pl-3">
        <h2 ref={titulo} id={idDelTitulo} tabIndex={-1} className="antetitulo rounded-md anillo-foco">
          Detalle de cita
        </h2>
        <button
          type="button"
          onClick={cerrar}
          aria-label="Cerrar el detalle"
          className="grid size-11 shrink-0 place-items-center rounded-[14px] text-navy squircle anillo-foco transition-colors duration-150 ease-suave hover:bg-borde"
        >
          <X className="size-5" aria-hidden="true" strokeWidth={1.75} />
        </button>
      </div>

      <div className="rounded-[24px] bg-tarjeta p-4 shadow-sm squircle">
        <div className="flex items-center gap-3">
          <AvatarUsuario nombre={nombreDeCliente(cita)} tamaño="lg" />
          <div className="min-w-0">
            <p className="font-semibold break-words">{nombreDeCliente(cita)}</p>
            <p className="text-sm break-words text-texto-2">{cita.title}</p>
          </div>
        </div>

        <dl className="mt-4 divide-y divide-borde border-t border-borde text-sm">
          <Dato termino="Fecha">
            {/* `first-letter` y no `capitalize`, que ponía mayúscula en cada palabra. */}
            <span className="block first-letter:uppercase">{formatearFecha(cita.startTime)}</span>
          </Dato>
          <Dato termino="Horario">
            <span className="tabular-nums">
              {formatearHora(cita.startTime)} – {formatearHora(cita.endTime)}
            </span>
          </Dato>
          <Dato termino="Duración">{duracion} minutos</Dato>
          {cita.price != null && (
            <Dato termino="Precio">
              <span className="tabular-nums">{formatearMonto(cita.price)}</span>
            </Dato>
          )}
          <Dato termino="Estado">
            <span className={cn("inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium", estado.insignia)}>
              {estado.texto}
            </span>
          </Dato>
        </dl>

        {cita.notes && (
          <p className="mt-3 rounded-[16px] bg-superficie p-3 text-sm break-words text-texto-2 squircle">{cita.notes}</p>
        )}
      </div>

      {(puedeCompletarse || puedeCancelarse || puedeMoverse) && (
        <div className="grid gap-2 px-1 pb-1">
          {puedeMoverse && (
            <Boton tamano="sm" variante="secundario" className="w-full" onClick={() => onMover(cita)}>
              Cambiar fecha y hora
            </Boton>
          )}
          {puedeCompletarse && (
            <Boton tamano="sm" className="w-full" onClick={() => onCambiarEstado(cita.id, "completada")}>
              Marcar completada
            </Boton>
          )}
          {puedeCancelarse && (
            <BotonPrimario
              variante="peligro"
              anchoCompleto
              tamaño="sm"
              onClick={() => onCambiarEstado(cita.id, "cancelada")}
            >
              Cancelar cita
            </BotonPrimario>
          )}
        </div>
      )}
    </motion.aside>
  )
}

/** Un renglón del detalle: el nombre del dato a la izquierda, el valor a la derecha. */
function Dato({ termino, children }: { termino: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-texto-2">{termino}</dt>
      <dd className="min-w-0 text-right font-medium break-words">{children}</dd>
    </div>
  )
}
