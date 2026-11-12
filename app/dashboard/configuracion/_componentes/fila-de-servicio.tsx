"use client"

import { Clock, Pencil, Trash2 } from "lucide-react"
import { Insignia } from "@/components/comunes/insignia"
import { CasillaDeSeleccion } from "@/components/panel/casilla-de-seleccion"
import { formatearMonto } from "@/lib/dinero"
import { formatearDuracionDeServicio } from "@/lib/fechas"
import { cn } from "@/lib/utils"
import type { Servicio } from "../_datos"
import type { frasesDeConfiguracion } from "../_frases"

type FrasesDeServicios = ReturnType<typeof frasesDeConfiguracion>["servicios"]

/** Los botones de sólo ícono de cada servicio: 44 × 44, lo mínimo para un dedo. */
const BOTON_DE_ICONO =
  "grid size-11 shrink-0 place-items-center rounded-[14px] text-navy squircle anillo-foco transition-colors duration-150 ease-suave hover:bg-superficie"

interface PropsDeFilaDeServicio {
  servicio: Servicio
  frases: FrasesDeServicios
  /** Mientras se eligen servicios para cambiarlos a la vez, la fila se marca y no se edita. */
  seleccionando: boolean
  marcado: boolean
  alMarcar: (marcado: boolean) => void
  alAlternarActivo: () => void
  alEditar: () => void
  alEliminar: () => void
}

/**
 * Un servicio de la lista. Uno inactivo se ve atenuado (el nombre pasa al gris
 * de texto secundario, que sigue pasando 4,5:1) y con la etiqueta "Inactivo":
 * el color solo no se lee. En el modo de selección la fila es una casilla y
 * los botones de editar y eliminar se esconden, para no tocarlos sin querer.
 */
export function FilaDeServicio({ servicio, frases, seleccionando, marcado, alMarcar, alAlternarActivo, alEditar, alEliminar }: PropsDeFilaDeServicio) {
  const contenido = (
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <p className={cn("break-words", servicio.active ? "font-medium" : "font-normal text-texto-2")}>{servicio.name}</p>
        {!servicio.active && <Insignia>{frases.lista.inactivo}</Insignia>}
      </div>
      {servicio.description && <p className="mt-0.5 line-clamp-2 text-[13px] text-texto-2">{servicio.description}</p>}
      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-texto-2">
        <span className="flex items-center gap-1">
          <Clock className="size-3.5" aria-hidden="true" strokeWidth={1.75} />
          {formatearDuracionDeServicio(servicio.duration)}
        </span>
        {servicio.price != null && (
          <span className={cn("font-medium tabular-nums", servicio.active ? "text-navy" : "text-texto-2")}>{formatearMonto(servicio.price)}</span>
        )}
      </p>
    </div>
  )

  return (
    // Si no entran los botones al lado (el teléfono), bajan a la derecha, debajo del servicio.
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3.5 first:pt-1.5 last:pb-1.5">
      {seleccionando ? (
        // Mientras se selecciona, la fila entera es la casilla: tocar el nombre también la marca.
        <CasillaDeSeleccion etiqueta={frases.seleccion.marcar(servicio.name)} marcada={marcado} alCambiar={alMarcar} className="min-w-48 flex-1">
          {contenido}
        </CasillaDeSeleccion>
      ) : (
        <div className="flex min-w-48 flex-1">{contenido}</div>
      )}

      {!seleccionando && (
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <InterruptorDelServicio activo={servicio.active} etiqueta={frases.activo(servicio.name)} alCambiar={alAlternarActivo} />
          <button type="button" onClick={alEditar} aria-label={`Editar ${servicio.name}`} title="Editar" className={BOTON_DE_ICONO}>
            <Pencil className="size-4" aria-hidden="true" strokeWidth={1.75} />
          </button>
          <button
            type="button"
            onClick={alEliminar}
            aria-label={`Eliminar ${servicio.name}`}
            title="Eliminar"
            className={cn(BOTON_DE_ICONO, "hover:bg-error/6 hover:text-error")}
          >
            <Trash2 className="size-4" aria-hidden="true" strokeWidth={1.75} />
          </button>
        </div>
      )}
    </li>
  )
}

/**
 * Activo o inactivo: un servicio inactivo no aparece en la página pública de
 * reservas. Es el interruptor de `Interruptor`, sin la etiqueta a la vista: en
 * cada fila el nombre del servicio ya está al lado, y va en su nombre para el
 * lector de pantalla.
 */
function InterruptorDelServicio({ activo, etiqueta, alCambiar }: { activo: boolean; etiqueta: string; alCambiar: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      aria-label={etiqueta}
      title={activo ? "Desactivar" : "Activar"}
      onClick={alCambiar}
      className={cn(
        // 52×32 a la vista; el ::after lleva el área táctil a 60×44.
        "relative mr-1 inline-flex h-8 w-13 shrink-0 cursor-pointer items-center rounded-full p-1",
        "anillo-foco transition-colors duration-150 ease-suave after:absolute after:-inset-x-1 after:-inset-y-1.5",
        activo ? "bg-navy" : "bg-texto-2"
      )}
    >
      <span
        aria-hidden="true"
        className={cn("size-6 rounded-full bg-white shadow-sm transition-transform duration-300 ease-suave", activo && "translate-x-5")}
      />
    </button>
  )
}
