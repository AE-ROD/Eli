"use client"

import { useId, type ReactNode } from "react"
import { ArrowDown, ArrowUp, Clock, Pencil, Trash2 } from "lucide-react"
import { BotonPrimario } from "@/components/comunes/boton-primario"
import { Insignia } from "@/components/comunes/insignia"
import { BotonDeFila } from "@/components/panel/boton-de-fila"
import { useRubroDelPanel } from "@/components/panel/contexto-rubro"
import { InterruptorDeFila } from "@/components/panel/interruptor-de-fila"
import { mostrarTelefono } from "@/lib/telefono"
import { vocabularioDe } from "@/lib/vocabulario"
import type { Sede } from "../_datos"
import { frasesDeConfiguracion } from "../_frases"
import { horarioEnPalabras } from "../_sedes"

interface PropsDeFilaDeSede {
  sede: Sede
  /** Su lugar en la lista, desde 0, y cuántas hay. */
  indice: number
  total: number
  /** Si su grilla semanal está abierta debajo. */
  horarioAbierto: boolean
  alSubir: () => void
  alBajar: () => void
  alEditar: () => void
  alBorrar: () => void
  alAlternarActivo: () => void
  alAlternarHorario: () => void
  /** La grilla semanal, si está abierta: va debajo de la fila. */
  children?: ReactNode
}

/**
 * Una sede de la lista: su nombre, dónde está, cuándo se atiende ahí y cuántas
 * horas tiene por delante, con subir, bajar, editar, borrar y activar o
 * desactivar. «Horario de la semana» abre su grilla debajo (`children`). Sólo
 * pinta: lo que se hace con cada botón lo decide `SeccionSedes`.
 */
export function FilaDeSede({
  sede,
  indice,
  total,
  horarioAbierto,
  alSubir,
  alBajar,
  alEditar,
  alBorrar,
  alAlternarActivo,
  alAlternarHorario,
  children,
}: PropsDeFilaDeSede) {
  const idDelHorario = useId()
  const { fila: frases } = frasesDeConfiguracion(vocabularioDe(useRubroDelPanel()).palabras).sedes
  const horario = horarioEnPalabras(sede)
  const lugar = [sede.direccion, sede.comuna].filter(Boolean).join(", ")

  return (
    <li data-sede={sede.id} className="py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <div className="min-w-48 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h4 className="font-medium break-words">{sede.nombre}</h4>
            {!sede.activo && <Insignia>{frases.desactivada}</Insignia>}
          </div>
          {lugar && <p className="mt-0.5 text-sm break-words text-texto-2">{lugar}</p>}
          {sede.telefono && <p className="text-[13px] text-texto-2">{mostrarTelefono(sede.telefono)}</p>}
          <p className="mt-1 text-[13px] text-texto-2">{frases.lugar(indice + 1, total)}</p>

          {horario.length > 0 ? (
            <ul className="mt-2 space-y-0.5 text-sm">
              {horario.map((grupo) => (
                <li key={grupo} className="tabular-nums">
                  {grupo}
                </li>
              ))}
            </ul>
          ) : (
            sede.activo && <p className="mt-2 text-sm text-texto-2">{frases.sinHorario}</p>
          )}
          <p className="mt-1 text-[13px] text-texto-2">{frases.horasPorDelante(sede.horasFuturas)}</p>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1">
          <BotonDeFila
            data-mover="subir"
            etiqueta={frases.subir(sede.nombre)}
            titulo="Subir"
            icono={<ArrowUp className="size-4" aria-hidden="true" strokeWidth={1.75} />}
            onClick={alSubir}
            disabled={indice === 0}
          />
          <BotonDeFila
            data-mover="bajar"
            etiqueta={frases.bajar(sede.nombre)}
            titulo="Bajar"
            icono={<ArrowDown className="size-4" aria-hidden="true" strokeWidth={1.75} />}
            onClick={alBajar}
            disabled={indice === total - 1}
          />
          <BotonDeFila
            etiqueta={frases.editar(sede.nombre)}
            titulo="Editar"
            icono={<Pencil className="size-4" aria-hidden="true" strokeWidth={1.75} />}
            onClick={alEditar}
          />
          <BotonDeFila
            etiqueta={frases.borrar(sede.nombre)}
            titulo="Borrar"
            icono={<Trash2 className="size-4" aria-hidden="true" strokeWidth={1.75} />}
            onClick={alBorrar}
          />
          <InterruptorDeFila activo={sede.activo} etiqueta={frases.activa(sede.nombre)} alCambiar={alAlternarActivo} />
        </div>
      </div>

      {/* Justo antes de la grilla en el orden del teclado: Tab entra a ella al abrirla. */}
      <div className="mt-3">
        <BotonPrimario
          type="button"
          tamaño="sm"
          variante="secundario"
          icono={<Clock className="h-4 w-4" />}
          aria-expanded={horarioAbierto}
          aria-controls={idDelHorario}
          onClick={alAlternarHorario}
        >
          {horarioAbierto ? frases.cerrarHorario : frases.verHorario}
        </BotonPrimario>
      </div>
      <div id={idDelHorario} className={horarioAbierto ? "mt-3" : undefined}>
        {horarioAbierto && children}
      </div>
    </li>
  )
}
