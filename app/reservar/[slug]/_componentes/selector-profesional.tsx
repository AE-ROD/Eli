"use client"

import { useId } from "react"
import { UsersRound } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ProfesionalDelEquipo } from "../_datos"

interface PropsDeSelectorProfesional {
  /** Entre quienes se elige: en el primer paso, el equipo; en el segundo, los que hacen lo elegido. */
  profesionales: Pick<ProfesionalDelEquipo, "id" | "nombre" | "especialidad" | "fotoUrl">[]
  /** `null`: cualquiera disponible. */
  elegido: string | null
  onElegir: (profesionalId: string | null) => void
  /**
   * Cómo se dice "cualquiera". Sin él, el de siempre; en una clínica dental,
   * "La primera hora disponible · Con cualquier odontólogo".
   */
  cualquiera?: { nombre: string; detalle: string }
}

const CUALQUIERA_DE_SIEMPRE = { nombre: "Cualquiera disponible", detalle: "Te asignamos a quien esté libre" }

const ELEGIDO = "bg-azul-suave font-semibold text-navy inset-ring-2 inset-ring-navy"
const EN_REPOSO = "bg-tarjeta font-medium text-navy inset-ring-1 inset-ring-texto-2 hover:bg-azul-suave hover:inset-ring-navy"

/** Las iniciales, para quien no tiene foto. */
function iniciales(nombre: string): string {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase() ?? "")
    .join("")
}

/**
 * "¿Con quién?": cualquiera disponible (lo primero, y lo que viene elegido)
 * o una persona del equipo. Son botones que dicen cuál está elegido
 * (`aria-pressed`), como los días y las horas del calendario. Se usa en el
 * primer paso (elegir a quién, y de ahí qué servicios) y en el segundo (para
 * cambiar de profesional sin cambiar los servicios).
 */
export function SelectorProfesional({
  profesionales,
  elegido,
  onElegir,
  cualquiera = CUALQUIERA_DE_SIEMPRE,
}: PropsDeSelectorProfesional) {
  const idDelTitulo = useId()
  const opciones: { id: string | null; nombre: string; detalle: string | null; fotoUrl: string | null }[] = [
    { id: null, nombre: cualquiera.nombre, detalle: cualquiera.detalle, fotoUrl: null },
    ...profesionales.map((profesional) => ({
      id: profesional.id,
      nombre: profesional.nombre,
      detalle: profesional.especialidad,
      fotoUrl: profesional.fotoUrl,
    })),
  ]

  return (
    <div>
      <h3 id={idDelTitulo} className="font-medium text-navy">
        ¿Con quién?
      </h3>
      <div role="group" aria-labelledby={idDelTitulo} className="mt-3 flex flex-wrap gap-2">
        {opciones.map((opcion) => {
          const activo = opcion.id === elegido
          return (
            <button
              key={opcion.id ?? "cualquiera"}
              type="button"
              aria-pressed={activo}
              onClick={() => onElegir(opcion.id)}
              className={cn(
                "flex min-h-11 max-w-full items-center gap-2.5 rounded-campo py-1.5 pr-4 pl-1.5 text-left text-sm squircle anillo-foco",
                "transition-[background-color,box-shadow] duration-150 ease-suave",
                activo ? ELEGIDO : EN_REPOSO
              )}
            >
              <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-full bg-superficie text-xs font-semibold text-navy">
                {opcion.id === null ? (
                  <UsersRound className="size-4" strokeWidth={1.75} />
                ) : opcion.fotoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- la foto es una URL que carga el negocio; no pasa por el optimizador
                  <img src={opcion.fotoUrl} alt="" className="size-full object-cover" />
                ) : (
                  iniciales(opcion.nombre)
                )}
              </span>
              <span className="min-w-0">
                <span className="block break-words">{opcion.nombre}</span>
                {opcion.detalle && <span className="block text-xs font-normal text-texto-2">{opcion.detalle}</span>}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
