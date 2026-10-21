"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { BotonIcono } from "@/components/comunes/boton-icono"
import type { UnidadDeTiempo } from "@/lib/fechas"
import { cn } from "@/lib/utils"

export const diasSemana = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"]
const meses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]

/** El nombre de las flechas según lo que se mira: sin él, el lector de pantalla decía "botón" a secas. */
const PASOS: Record<UnidadDeTiempo, { anterior: string; siguiente: string }> = {
  dia: { anterior: "Día anterior", siguiente: "Día siguiente" },
  semana: { anterior: "Semana anterior", siguiente: "Semana siguiente" },
  mes: { anterior: "Mes anterior", siguiente: "Mes siguiente" },
}

const VISTAS: { id: UnidadDeTiempo; texto: string }[] = [
  { id: "dia", texto: "Día" },
  { id: "semana", texto: "Semana" },
  { id: "mes", texto: "Mes" },
]

interface PropsDeControlesDeAgenda {
  fechaActual: Date
  vista: UnidadDeTiempo
  /** El `id` del título del período: la tarjeta del calendario se nombra con él. */
  idDelTitulo: string
  onAnterior: () => void
  onSiguiente: () => void
  onHoy: () => void
  onVista: (v: UnidadDeTiempo) => void
}

function formatoFecha(fecha: Date, vista: UnidadDeTiempo): string {
  if (vista === "dia") {
    return fecha.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })
  }
  return `${meses[fecha.getMonth()]} ${fecha.getFullYear()}`
}

/**
 * La cabecera de la tarjeta del calendario: las flechas y "Hoy", el período
 * que se está mirando (en la serif de los titulares) y la vista. Lo que no
 * entra en una fila baja a la siguiente; en el teléfono la vista ocupa el
 * ancho, a mano del pulgar.
 */
export function ControlesDeAgenda({
  fechaActual,
  vista,
  idDelTitulo,
  onAnterior,
  onSiguiente,
  onHoy,
  onVista,
}: PropsDeControlesDeAgenda) {
  const pasos = PASOS[vista]

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4 px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-4">
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex shrink-0 items-center gap-2">
          <BotonIcono
            etiqueta={pasos.anterior}
            icono={<ChevronLeft aria-hidden="true" strokeWidth={1.75} />}
            tamano="sm"
            onClick={onAnterior}
          />
          <Boton variante="secundario" tamano="sm" onClick={onHoy}>
            Hoy
          </Boton>
          <BotonIcono
            etiqueta={pasos.siguiente}
            icono={<ChevronRight aria-hidden="true" strokeWidth={1.75} />}
            tamano="sm"
            onClick={onSiguiente}
          />
        </div>
        {/*
          Se anuncia al cambiar: quien no ve el calendario sabe a qué día,
          semana o mes pasó. `first-letter` y no `capitalize`, que ponía
          mayúscula en cada palabra ("Martes, 6 De Octubre").
        */}
        <h2 id={idDelTitulo} aria-live="polite" className="titulo-3 min-w-0 font-serif break-words first-letter:uppercase">
          {formatoFecha(fechaActual, vista)}
        </h2>
      </div>

      {/* Botones que dicen cuál está elegido (`aria-pressed`): lo elegido, en navy. */}
      <div
        role="group"
        aria-label="Vista de la agenda"
        className="flex w-full gap-1 rounded-full bg-superficie p-1 sm:w-auto"
      >
        {VISTAS.map(({ id, texto }) => {
          const elegida = vista === id
          return (
            <button
              key={id}
              type="button"
              aria-pressed={elegida}
              onClick={() => onVista(id)}
              className={cn(
                // 36px a la vista; el ::after lleva el área que se toca a 44.
                "relative inline-flex h-9 flex-1 items-center justify-center rounded-full px-4 text-sm font-medium sm:flex-none",
                "after:absolute after:inset-x-0 after:-inset-y-1 anillo-foco transition-colors duration-150 ease-suave",
                elegida ? "bg-navy text-white" : "text-navy hover:bg-borde"
              )}
            >
              {texto}
            </button>
          )
        })}
      </div>
    </div>
  )
}
