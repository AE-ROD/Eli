"use client"

import { useId } from "react"
import { CAMPO, CAMPO_CON_ERROR, ERROR_DE_CAMPO } from "@/components/panel/estilos"
import { MEDIOS_DE_PAGO } from "@/lib/medios-de-pago"
import { PERIODOS, type PeriodoId } from "@/lib/periodos"
import { TURNOS } from "@/lib/reportes"
import { cn } from "@/lib/utils"
import type { OpcionesDeFiltro } from "../_datos"

/** Lo elegido en los filtros, como está en los campos. Vacío es "todos". */
export interface FiltrosElegidos {
  periodo: PeriodoId
  /** Sólo para el período personalizado: `2026-03-01`, como lo da el campo de fecha. */
  desde: string
  hasta: string
  turno: string
  profesional: string
  servicio: string
  medio: string
}

interface FiltrosDeReporteProps {
  filtros: FiltrosElegidos
  /** Nulas mientras cargan o si no se pudieron cargar: los selectores quedan en "Todos". */
  opciones: OpcionesDeFiltro | null
  errorDeOpciones: string
  /** Hasta que llega el primer reporte no se sabe; con `propio` no se filtra por medio ni por profesional. */
  alcance: "negocio" | "propio" | null
  /** Por qué el período personalizado no sirve, si no sirve. */
  errorDeRango: string
  onCambiar: (cambios: Partial<FiltrosElegidos>) => void
}

const ETIQUETA_CHICA = "block text-xs font-medium text-muted-foreground mb-1"

/**
 * Los filtros del reporte, combinables: período, turno, profesional, servicio
 * y medio de pago (docs/PRODUCTO.md, sección 8).
 */
export function FiltrosDeReporte({
  filtros,
  opciones,
  errorDeOpciones,
  alcance,
  errorDeRango,
  onCambiar,
}: FiltrosDeReporteProps) {
  const idBase = useId()
  const id = (campo: string) => `${idBase}-${campo}`
  const delNegocio = alcance === "negocio"

  return (
    <section aria-label="Filtros" className="bg-card border border-border/50 rounded-xl p-4 space-y-4">
      <fieldset>
        <legend className="text-sm font-semibold text-foreground mb-2">Período</legend>
        <div className="flex flex-wrap gap-2">
          {PERIODOS.map((periodo) => (
            <label
              key={periodo.id}
              className={cn(
                "inline-flex items-center rounded-lg border px-3 py-1.5 text-sm font-medium cursor-pointer transition-colors",
                "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary has-[:focus-visible]:ring-offset-2",
                filtros.periodo === periodo.id
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background border-border text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              <input
                type="radio"
                name={id("periodo")}
                value={periodo.id}
                checked={filtros.periodo === periodo.id}
                onChange={() => onCambiar({ periodo: periodo.id })}
                className="sr-only"
              />
              {periodo.nombre}
            </label>
          ))}
        </div>

        {filtros.periodo === "personalizado" && (
          <div className="mt-3 grid grid-cols-2 gap-3 max-w-md">
            <div>
              <label htmlFor={id("desde")} className={ETIQUETA_CHICA}>
                Desde
              </label>
              <input
                id={id("desde")}
                type="date"
                value={filtros.desde}
                required
                aria-invalid={errorDeRango ? true : undefined}
                aria-describedby={errorDeRango ? id("error-rango") : undefined}
                onChange={(evento) => onCambiar({ desde: evento.target.value })}
                className={cn(CAMPO, errorDeRango && CAMPO_CON_ERROR)}
              />
            </div>
            <div>
              <label htmlFor={id("hasta")} className={ETIQUETA_CHICA}>
                Hasta (incluido)
              </label>
              <input
                id={id("hasta")}
                type="date"
                value={filtros.hasta}
                min={filtros.desde || undefined}
                required
                aria-invalid={errorDeRango ? true : undefined}
                aria-describedby={errorDeRango ? id("error-rango") : undefined}
                onChange={(evento) => onCambiar({ hasta: evento.target.value })}
                className={cn(CAMPO, errorDeRango && CAMPO_CON_ERROR)}
              />
            </div>
            {errorDeRango && (
              <p id={id("error-rango")} role="alert" className={cn(ERROR_DE_CAMPO, "col-span-2")}>
                {errorDeRango}
              </p>
            )}
          </div>
        )}
      </fieldset>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div>
          <label htmlFor={id("turno")} className={ETIQUETA_CHICA}>
            Turno
          </label>
          <select
            id={id("turno")}
            value={filtros.turno}
            onChange={(evento) => onCambiar({ turno: evento.target.value })}
            className={CAMPO}
          >
            <option value="">Todo el día</option>
            {TURNOS.map((turno) => (
              <option key={turno.id} value={turno.id}>
                {turno.nombre}
              </option>
            ))}
          </select>
        </div>

        {/* Al profesional el reporte ya le muestra sólo lo suyo: elegirse a sí mismo no filtra nada. */}
        {delNegocio && (
          <div>
            <label htmlFor={id("profesional")} className={ETIQUETA_CHICA}>
              Profesional
            </label>
            <select
              id={id("profesional")}
              value={filtros.profesional}
              onChange={(evento) => onCambiar({ profesional: evento.target.value })}
              className={CAMPO}
            >
              <option value="">Todos</option>
              {opciones?.profesionales.map((profesional) => (
                <option key={profesional.id} value={profesional.id}>
                  {profesional.nombre}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label htmlFor={id("servicio")} className={ETIQUETA_CHICA}>
            Servicio
          </label>
          <select
            id={id("servicio")}
            value={filtros.servicio}
            onChange={(evento) => onCambiar({ servicio: evento.target.value })}
            className={CAMPO}
          >
            <option value="">Todos</option>
            {opciones?.servicios.map((servicio) => (
              <option key={servicio.id} value={servicio.id}>
                {servicio.nombre}
              </option>
            ))}
          </select>
        </div>

        {/* Cómo pagó cada cliente es facturación del negocio: el profesional no lo ve. */}
        {delNegocio && (
          <div>
            <label htmlFor={id("medio")} className={ETIQUETA_CHICA}>
              Medio de pago
            </label>
            <select
              id={id("medio")}
              value={filtros.medio}
              onChange={(evento) => onCambiar({ medio: evento.target.value })}
              className={CAMPO}
            >
              <option value="">Todos</option>
              {MEDIOS_DE_PAGO.map((medio) => (
                <option key={medio.id} value={medio.id}>
                  {medio.nombre}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {errorDeOpciones && (
        <p role="alert" className="text-sm text-red-500">
          {errorDeOpciones}. Los demás filtros funcionan igual.
        </p>
      )}
    </section>
  )
}
