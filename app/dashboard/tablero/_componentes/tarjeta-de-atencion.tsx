"use client"

import { useId, type ReactNode } from "react"
import { Ban, Pencil, Undo2 } from "lucide-react"
import { BotonPrimario } from "@/components/comunes/boton-primario"
import { ANILLO_DE_FOCO } from "@/components/panel/estilos"
import { nombreDeEstado, type EstadoActivo } from "@/lib/atenciones"
import { accionPrincipal, accionesSecundarias, faltaAsignar } from "@/lib/acciones-del-tablero"
import { formatearMonto } from "@/lib/dinero"
import { formatearHora, tiempoDesde } from "@/lib/fechas"
import type { Actor } from "@/lib/permisos"
import { cn } from "@/lib/utils"
import type { Atencion } from "../_datos"
import type { PropsDeArrastre } from "./tarjeta-de-reserva"

/**
 * Desde cuándo está en la columna, dicho como se lee en el local: "Llegó
 * hace 5 min", "Empezó hace 40 min". Lo cobrado, con la hora del cobro.
 */
function momentoDe(atencion: Atencion, ahora: number): { texto: string; iso: string } {
  if (atencion.estado === "finalizada" && atencion.cobradaEn) {
    return { texto: `Cobrada a las ${formatearHora(atencion.cobradaEn)}`, iso: atencion.cobradaEn }
  }
  if (atencion.estado === "por-cobrar") {
    const iso = atencion.terminoEn ?? atencion.empezoEn ?? atencion.llegoEn
    return { texto: `Terminó ${tiempoDesde(iso, ahora)}`, iso }
  }
  if (atencion.estado === "en-atencion") {
    const iso = atencion.empezoEn ?? atencion.llegoEn
    return { texto: `Empezó ${tiempoDesde(iso, ahora)}`, iso }
  }
  return { texto: `Llegó ${tiempoDesde(atencion.llegoEn, ahora)}`, iso: atencion.llegoEn }
}

function BotonSecundario({
  onClick,
  disabled,
  etiqueta,
  peligro = false,
  children,
}: {
  onClick: () => void
  disabled: boolean
  /** El nombre completo para el lector de pantalla y el cartel al pasar el mouse. */
  etiqueta: string
  peligro?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={etiqueta}
      title={etiqueta}
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
        peligro ? "text-red-600 hover:bg-red-50" : "text-muted-foreground hover:text-foreground hover:bg-muted",
        ANILLO_DE_FOCO
      )}
    >
      {children}
    </button>
  )
}

interface TarjetaDeAtencionProps {
  atencion: Atencion
  actor: Actor | null
  /** El mismo instante para todo el tablero, en milisegundos. */
  ahora: number
  /** Hay un pedido en curso para esta atención: los botones esperan. */
  enCurso: boolean
  arrastre: PropsDeArrastre
  onMover: (hacia: EstadoActivo) => void
  onCobrar: () => void
  onEditar: () => void
  onAnular: () => void
}

/**
 * Una atención en el tablero: el cliente, desde cuándo está, qué se le hace y
 * quién, y el total si quien mira puede verlo. Los botones son sólo los que
 * quien mira puede usar (`lib/acciones-del-tablero.ts`).
 */
export function TarjetaDeAtencion({
  atencion,
  actor,
  ahora,
  enCurso,
  arrastre,
  onMover,
  onCobrar,
  onEditar,
  onAnular,
}: TarjetaDeAtencionProps) {
  const idDelNombre = useId()
  const nombre = atencion.cliente.nombre
  const momento = momentoDe(atencion, ahora)
  const principal = accionPrincipal(actor, atencion.estado)
  const secundarias = accionesSecundarias(actor, atencion.estado)
  const volverA = secundarias.volverA
  const cobrada = atencion.estado === "finalizada"

  return (
    <article
      aria-labelledby={idDelNombre}
      {...arrastre}
      className={cn(
        "rounded-lg border border-border/70 bg-card p-3 shadow-sm space-y-2",
        arrastre.draggable && "cursor-grab active:cursor-grabbing"
      )}
    >
      <div className="min-w-0">
        <h3 id={idDelNombre} className="text-sm font-semibold text-foreground truncate">
          {nombre}
        </h3>
        <p className="text-xs text-muted-foreground">
          <time dateTime={momento.iso}>{momento.texto}</time>
        </p>
      </div>

      {atencion.lineas.length > 0 ? (
        <ul className="space-y-1" aria-label="Servicios">
          {atencion.lineas.map((linea) => (
            <li key={linea.id} className="text-xs text-foreground leading-snug">
              {linea.servicio} <span className="text-muted-foreground">· {linea.profesional.nombre}</span>
              {faltaAsignar(linea) && (
                <>
                  <span className="sr-only"> (ya no está en el equipo)</span>{" "}
                  <span className="inline-block rounded bg-amber-100 px-1.5 text-[11px] font-semibold text-amber-800">
                    Falta asignar
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">Sin servicios todavía.</p>
      )}

      {atencion.notas && <p className="text-xs text-muted-foreground italic line-clamp-2">{atencion.notas}</p>}

      {atencion.total !== undefined && (
        <p className="flex items-baseline justify-between border-t border-border/60 pt-2 text-sm">
          <span className="text-muted-foreground">Total</span>
          <span className="font-semibold text-foreground tabular-nums">{formatearMonto(atencion.total)}</span>
        </p>
      )}

      {principal && (
        <BotonPrimario
          tamaño="sm"
          anchoCompleto
          onClick={principal.tipo === "cobrar" ? onCobrar : () => onMover(principal.hacia)}
          cargando={enCurso}
          aria-label={enCurso ? `Guardando: ${nombre}` : `${principal.texto}: ${nombre}`}
          className={ANILLO_DE_FOCO}
        >
          {principal.texto}
        </BotonPrimario>
      )}

      {atencion.estado === "por-cobrar" && !principal && (
        <p className="text-xs text-muted-foreground">Lista para cobrar: la cobra el dueño o el encargado.</p>
      )}

      {(secundarias.editar || volverA || secundarias.anular) && (
        <div className="flex flex-wrap gap-1 -mx-1">
          {secundarias.editar && (
            <BotonSecundario onClick={onEditar} disabled={enCurso} etiqueta={`Editar servicios de ${nombre}`}>
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              Servicios
            </BotonSecundario>
          )}
          {volverA && (
            <BotonSecundario
              onClick={() => onMover(volverA)}
              disabled={enCurso}
              etiqueta={`Volver a ${nombreDeEstado(volverA)}: ${nombre}`}
            >
              <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
              Volver
            </BotonSecundario>
          )}
          {secundarias.anular && (
            <BotonSecundario
              onClick={onAnular}
              disabled={enCurso}
              etiqueta={cobrada ? `Anular el cobro de ${nombre}` : `Anular la atención de ${nombre}`}
              peligro
            >
              <Ban className="h-3.5 w-3.5" aria-hidden="true" />
              Anular
            </BotonSecundario>
          )}
        </div>
      )}
    </article>
  )
}
