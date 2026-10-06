"use client"

import { useId, useRef } from "react"
import Link from "next/link"
import { Plus, Trash2 } from "lucide-react"
import { ANILLO_DE_FOCO, CAMPO, CAMPO_CON_ERROR, ERROR_DE_CAMPO } from "@/components/panel/estilos"
import { deCentavos } from "@/lib/atenciones"
import { totalDeFilasEnCentavos, type ErroresDeFila, type FilaDeServicio } from "@/lib/acciones-del-tablero"
import { formatearMonto } from "@/lib/dinero"
import { cn } from "@/lib/utils"
import type { Catalogo } from "../_datos"

/** Ninguna atención real tiene más; el servidor rechaza más de 20 líneas. */
const MAXIMO_DE_FILAS = 20

/**
 * Las filas que se agregan en esta pestaña. Un contador y no un azar: las
 * claves sólo tienen que ser únicas mientras el modal está abierto.
 */
let filasAgregadas = 0

/**
 * Una fila vacía. Si hay un solo profesional posible (el dueño que atiende
 * solo), ya viene elegido: no hay nada que decidir.
 */
export function filaVacia(catalogo: Catalogo, clave: string): FilaDeServicio {
  const unico = catalogo.profesionales.length === 1 ? catalogo.profesionales[0].id : ""
  return { clave, servicioId: "", profesional: unico, precio: "" }
}

interface EditorDeServiciosProps {
  filas: FilaDeServicio[]
  catalogo: Catalogo
  /** Dueño y encargado eligen quién hace cada servicio; el profesional no, quedan a su nombre. */
  eligeProfesional: boolean
  /** Para el aviso de catálogo vacío: a quien puede cargar servicios se le da el enlace. */
  puedeConfigurarServicios: boolean
  /** Los errores de cada fila, por su clave. Vacío hasta el primer intento de guardar. */
  errores: Record<string, ErroresDeFila>
  deshabilitado?: boolean
  onCambiar: (filas: FilaDeServicio[]) => void
}

/**
 * Las líneas de una atención como filas editables: servicio, profesional y
 * precio. El precio se precarga del catálogo al elegir el servicio y se puede
 * ajustar; el total se suma en vivo, en centavos.
 */
export function EditorDeServicios({
  filas,
  catalogo,
  eligeProfesional,
  puedeConfigurarServicios,
  errores,
  deshabilitado = false,
  onCambiar,
}: EditorDeServiciosProps) {
  const idBase = useId()
  const botonAgregar = useRef<HTMLButtonElement>(null)
  const totalCentavos = totalDeFilasEnCentavos(filas)
  const idDe = (clave: string, campo: string) => `${idBase}-${clave}-${campo}`

  const cambiarFila = (clave: string, cambios: Partial<FilaDeServicio>) =>
    onCambiar(filas.map((fila) => (fila.clave === clave ? { ...fila, ...cambios } : fila)))

  const elegirServicio = (fila: FilaDeServicio, servicioId: string) => {
    const precio = catalogo.servicios.find((servicio) => servicio.id === servicioId)?.precio
    // El precio del catálogo pisa lo escrito: se eligió otro servicio. Sin
    // precio en el catálogo queda vacío, para que alguien lo escriba en vez
    // de cobrar un cero que nadie decidió.
    cambiarFila(fila.clave, { servicioId, precio: precio == null ? "" : String(precio) })
  }

  // El foco sigue a lo que se hace: a la fila nueva al agregar, y al botón de
  // agregar al quitar una, porque el botón que se apretó desaparece con su
  // fila y el foco caería fuera del diálogo.
  const agregar = () => {
    filasAgregadas += 1
    const clave = `nueva-${filasAgregadas}`
    onCambiar([...filas, filaVacia(catalogo, clave)])
    requestAnimationFrame(() => document.getElementById(idDe(clave, "servicio"))?.focus())
  }

  const quitar = (clave: string) => {
    onCambiar(filas.filter((fila) => fila.clave !== clave))
    requestAnimationFrame(() => botonAgregar.current?.focus())
  }

  return (
    <div className="space-y-3">
      {catalogo.servicios.length === 0 && (
        <p className="text-sm rounded-lg border border-amber-200 bg-amber-50 text-amber-900 p-3">
          Todavía no hay servicios en el catálogo.{" "}
          {puedeConfigurarServicios ? (
            <Link href="/dashboard/configuracion" className={cn("font-medium underline rounded", ANILLO_DE_FOCO)}>
              Agrégalos en Configuración
            </Link>
          ) : (
            "Pídele al dueño o al encargado que los cargue en Configuración."
          )}
        </p>
      )}

      {filas.length === 0 && catalogo.servicios.length > 0 && (
        <p className="text-sm text-muted-foreground">Sin servicios todavía.</p>
      )}

      {filas.map((fila, indice) => {
        const numero = indice + 1
        const deLaFila = errores[fila.clave] ?? {}
        const id = (campo: string) => idDe(fila.clave, campo)
        const servicioEnCatalogo = catalogo.servicios.some((servicio) => servicio.id === fila.servicioId)
        const nombreDelServicio =
          catalogo.servicios.find((servicio) => servicio.id === fila.servicioId)?.nombre ?? fila.servicioOriginal

        return (
          <fieldset
            key={fila.clave}
            className="rounded-lg border border-border/70 p-3 grid grid-cols-1 sm:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,1.2fr)_auto] gap-3 items-start"
          >
            <legend className="sr-only">Servicio {numero}</legend>

            <div className={cn(!eligeProfesional && "sm:col-span-2")}>
              <label htmlFor={id("servicio")} className="block text-xs font-medium text-muted-foreground mb-1">
                Servicio
              </label>
              <select
                id={id("servicio")}
                value={fila.servicioId}
                disabled={deshabilitado}
                required
                aria-invalid={deLaFila.servicio ? true : undefined}
                aria-describedby={deLaFila.servicio || (!fila.servicioId && fila.servicioOriginal) ? id("servicio-ayuda") : undefined}
                onChange={(evento) => elegirServicio(fila, evento.target.value)}
                className={cn(CAMPO, deLaFila.servicio && CAMPO_CON_ERROR)}
              >
                <option value="">Elegir servicio</option>
                {catalogo.servicios.map((servicio) => (
                  <option key={servicio.id} value={servicio.id}>
                    {servicio.nombre}
                  </option>
                ))}
                {/* Un servicio desactivado no está en el catálogo, pero la línea lo tiene: se conserva. */}
                {fila.servicioId && !servicioEnCatalogo && (
                  <option value={fila.servicioId}>{fila.servicioOriginal ?? "Servicio"} (fuera del catálogo)</option>
                )}
              </select>
              {deLaFila.servicio ? (
                <p id={id("servicio-ayuda")} className={ERROR_DE_CAMPO}>
                  {deLaFila.servicio}
                  {fila.servicioOriginal && !fila.servicioId && ` «${fila.servicioOriginal}» ya no está en el catálogo.`}
                </p>
              ) : (
                !fila.servicioId &&
                fila.servicioOriginal && (
                  <p id={id("servicio-ayuda")} className="text-xs text-amber-700 mt-1">
                    «{fila.servicioOriginal}» ya no está en el catálogo: elige otro.
                  </p>
                )
              )}
            </div>

            {eligeProfesional && (
              <div>
                <label htmlFor={id("profesional")} className="block text-xs font-medium text-muted-foreground mb-1">
                  Profesional
                </label>
                <select
                  id={id("profesional")}
                  value={fila.profesional}
                  disabled={deshabilitado}
                  required
                  aria-invalid={deLaFila.profesional ? true : undefined}
                  aria-describedby={
                    deLaFila.profesional || (!fila.profesional && fila.profesionalOriginal) ? id("profesional-ayuda") : undefined
                  }
                  onChange={(evento) => cambiarFila(fila.clave, { profesional: evento.target.value })}
                  className={cn(CAMPO, deLaFila.profesional && CAMPO_CON_ERROR)}
                >
                  <option value="">Elegir profesional</option>
                  {catalogo.profesionales.map((profesional) => (
                    <option key={profesional.id} value={profesional.id}>
                      {profesional.nombre}
                    </option>
                  ))}
                </select>
                {!fila.profesional && fila.profesionalOriginal ? (
                  // Quien la hizo dejó el equipo: su nombre ayuda a decidir a quién reasignarla.
                  <p id={id("profesional-ayuda")} className={deLaFila.profesional ? ERROR_DE_CAMPO : "text-xs text-amber-700 mt-1"}>
                    Falta asignar: {fila.profesionalOriginal} ya no está en el equipo.
                  </p>
                ) : (
                  deLaFila.profesional && (
                    <p id={id("profesional-ayuda")} className={ERROR_DE_CAMPO}>
                      {deLaFila.profesional}
                    </p>
                  )
                )}
              </div>
            )}

            <div>
              <label htmlFor={id("precio")} className="block text-xs font-medium text-muted-foreground mb-1">
                Precio
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground" aria-hidden="true">
                  $
                </span>
                <input
                  id={id("precio")}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={fila.precio}
                  disabled={deshabilitado}
                  required
                  aria-invalid={deLaFila.precio ? true : undefined}
                  aria-describedby={deLaFila.precio ? id("precio-error") : undefined}
                  onChange={(evento) => cambiarFila(fila.clave, { precio: evento.target.value })}
                  // La rueda del mouse sobre un campo numérico con foco le
                  // suma o resta el paso: un precio cambiaría sin que nadie lo
                  // note. Se suelta el foco y la rueda sólo desplaza.
                  onWheel={(evento) => evento.currentTarget.blur()}
                  className={cn(CAMPO, "pl-7 tabular-nums", deLaFila.precio && CAMPO_CON_ERROR)}
                />
              </div>
              {deLaFila.precio && (
                <p id={id("precio-error")} className={ERROR_DE_CAMPO}>
                  {deLaFila.precio}
                </p>
              )}
            </div>

            <div className="flex sm:pt-5 justify-end">
              <button
                type="button"
                onClick={() => quitar(fila.clave)}
                disabled={deshabilitado}
                aria-label={`Quitar el servicio ${numero}${nombreDelServicio ? `: ${nombreDelServicio}` : ""}`}
                title="Quitar"
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50",
                  ANILLO_DE_FOCO
                )}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                <span className="sm:hidden">Quitar</span>
              </button>
            </div>
          </fieldset>
        )
      })}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          ref={botonAgregar}
          type="button"
          onClick={agregar}
          disabled={deshabilitado || filas.length >= MAXIMO_DE_FILAS || catalogo.servicios.length === 0}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-sm font-medium text-primary hover:bg-primary/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
            ANILLO_DE_FOCO
          )}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Agregar servicio
        </button>
        <p className="text-sm text-foreground" aria-live="polite">
          {eligeProfesional ? "Total" : "Total de tus servicios"}:{" "}
          <span className="font-semibold tabular-nums">{formatearMonto(deCentavos(totalCentavos))}</span>
        </p>
      </div>
    </div>
  )
}
