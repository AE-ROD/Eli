"use client"

import { useId } from "react"
import { LoaderCircle, RefreshCw } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { CampoFormulario } from "@/components/comunes/campo-formulario"
import { ErrorDeCampo } from "@/components/comunes/error-de-campo"
import { Selector } from "@/components/comunes/selector"
import { CAMPO_CON_ERROR, ETIQUETA, TARJETA_DEL_PANEL } from "@/components/panel/estilos"
import { MEDIOS_DE_PAGO } from "@/lib/medios-de-pago"
import { PERIODOS, type PeriodoId } from "@/lib/periodos"
import { TURNOS } from "@/lib/reportes"
import { cn } from "@/lib/utils"
import type { OpcionesDeFiltro } from "../_datos"
import { Aviso } from "@/components/panel/aviso"

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
  /** Lo anulado se filtra sólo por período: los demás filtros no se muestran. */
  soloPeriodo?: boolean
  /** Lo que se ve debajo está viejo y llega lo de los filtros nuevos (u otra página). */
  actualizando?: boolean
  onCambiar: (cambios: Partial<FiltrosElegidos>) => void
  /** Vuelve a pedir los profesionales y servicios, si no llegaron. */
  onReintentarOpciones: () => void
}

/**
 * El radio no se ve, así que el anillo del foco lo dibuja la píldora entera
 * cuando el radio de adentro lo tiene: el de `anillo-foco`, con las mismas
 * variables (contorno de 2 px separado 2 px y el halo del módulo).
 */
const ANILLO_DE_LA_OPCION =
  "has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-(--anillo) has-focus-visible:shadow-[0_0_0_6px_var(--halo)]"

/**
 * Los filtros del reporte, combinables: período, turno, profesional, servicio
 * y medio de pago (docs/PRODUCTO.md, sección 8).
 *
 * Arriba a la derecha dice "Actualizando…" mientras llega lo nuevo. Va acá y
 * no encima del resumen, donde aparecía y desaparecía empujando todo para
 * abajo: el lugar está siempre, vacío cuando no hay nada que decir, y así el
 * lector de pantalla lo anuncia al cambiar.
 */
export function FiltrosDeReporte({
  filtros,
  opciones,
  errorDeOpciones,
  alcance,
  errorDeRango,
  soloPeriodo = false,
  actualizando = false,
  onCambiar,
  onReintentarOpciones,
}: FiltrosDeReporteProps) {
  const idBase = useId()
  const id = (campo: string) => `${idBase}-${campo}`
  const delNegocio = alcance === "negocio"

  return (
    <section aria-labelledby={id("titulo")} className={cn(TARJETA_DEL_PANEL, "space-y-5 p-5 sm:p-6")}>
      <div className="flex min-h-5 items-center justify-between gap-3">
        <h2 id={id("titulo")} className="antetitulo">
          Filtros
        </h2>
        <p role="status" className="flex items-center gap-1.5 text-sm text-texto-2">
          {actualizando && (
            <>
              <LoaderCircle aria-hidden="true" className="size-4 animate-spin" strokeWidth={2} />
              Actualizando…
            </>
          )}
        </p>
      </div>

      <fieldset>
        <legend className={cn(ETIQUETA, "mb-2")}>Período</legend>
        <div className="flex flex-wrap gap-2">
          {PERIODOS.map((periodo) => {
            const elegido = filtros.periodo === periodo.id
            return (
              <label
                key={periodo.id}
                className={cn(
                  "inline-flex h-11 cursor-pointer items-center rounded-full px-4 text-sm font-medium",
                  "transition-[background-color,color,box-shadow] duration-150 ease-suave",
                  ANILLO_DE_LA_OPCION,
                  elegido
                    ? "bg-navy text-white"
                    : "bg-tarjeta text-navy inset-ring-1 inset-ring-texto-2 hover:inset-ring-navy"
                )}
              >
                <input
                  type="radio"
                  name={id("periodo")}
                  value={periodo.id}
                  checked={elegido}
                  onChange={() => onCambiar({ periodo: periodo.id })}
                  className="sr-only"
                />
                {periodo.nombre}
              </label>
            )
          })}
        </div>

        {filtros.periodo === "personalizado" && (
          <div className="mt-4 grid max-w-xl grid-cols-1 gap-4 sm:grid-cols-2">
            <CampoFormulario
              etiqueta="Desde"
              id={id("desde")}
              type="date"
              value={filtros.desde}
              required
              aria-invalid={errorDeRango ? true : undefined}
              aria-describedby={errorDeRango ? id("error-rango") : undefined}
              onChange={(evento) => onCambiar({ desde: evento.target.value })}
              className={cn(errorDeRango && CAMPO_CON_ERROR)}
            />
            <CampoFormulario
              etiqueta="Hasta (incluido)"
              id={id("hasta")}
              type="date"
              value={filtros.hasta}
              min={filtros.desde || undefined}
              required
              aria-invalid={errorDeRango ? true : undefined}
              aria-describedby={errorDeRango ? id("error-rango") : undefined}
              onChange={(evento) => onCambiar({ hasta: evento.target.value })}
              className={cn(errorDeRango && CAMPO_CON_ERROR)}
            />
            {/* Un solo mensaje para las dos fechas: el rango es el que no sirve. */}
            {errorDeRango && (
              <div role="alert" className="sm:col-span-2">
                <ErrorDeCampo id={id("error-rango")}>{errorDeRango}</ErrorDeCampo>
              </div>
            )}
          </div>
        )}
      </fieldset>

      {soloPeriodo ? (
        <p className="text-sm text-texto-2">Lo anulado se filtra sólo por período, por la fecha en que se anuló.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Selector
            etiqueta="Turno"
            id={id("turno")}
            value={filtros.turno}
            onChange={(evento) => onCambiar({ turno: evento.target.value })}
            opciones={TURNOS.map((turno) => ({ valor: turno.id, texto: turno.nombre }))}
          >
            <option value="">Todo el día</option>
          </Selector>

          {/* Al profesional el reporte ya le muestra sólo lo suyo: elegirse a sí mismo no filtra nada. */}
          {delNegocio && (
            <Selector
              etiqueta="Profesional"
              id={id("profesional")}
              value={filtros.profesional}
              onChange={(evento) => onCambiar({ profesional: evento.target.value })}
              opciones={(opciones?.profesionales ?? []).map((profesional) => ({
                valor: profesional.id,
                texto: profesional.nombre,
              }))}
            >
              <option value="">Todos</option>
            </Selector>
          )}

          <Selector
            etiqueta="Servicio"
            id={id("servicio")}
            value={filtros.servicio}
            onChange={(evento) => onCambiar({ servicio: evento.target.value })}
            opciones={(opciones?.servicios ?? []).map((servicio) => ({ valor: servicio.id, texto: servicio.nombre }))}
          >
            <option value="">Todos</option>
          </Selector>

          {/* Cómo pagó cada cliente es facturación del negocio: el profesional no lo ve. */}
          {delNegocio && (
            <Selector
              etiqueta="Medio de pago"
              id={id("medio")}
              value={filtros.medio}
              onChange={(evento) => onCambiar({ medio: evento.target.value })}
              opciones={MEDIOS_DE_PAGO.map((medio) => ({ valor: medio.id, texto: medio.nombre }))}
            >
              <option value="">Todos</option>
            </Selector>
          )}
        </div>
      )}

      {errorDeOpciones && !soloPeriodo && (
        <Aviso
          tono="error"
          rol="alert"
          accion={
            <Boton variante="secundario" tamano="sm" onClick={onReintentarOpciones}>
              <RefreshCw aria-hidden="true" className="size-4" strokeWidth={2} />
              Reintentar
            </Boton>
          }
        >
          {errorDeOpciones}. Los demás filtros funcionan igual.
        </Aviso>
      )}
    </section>
  )
}
