"use client"

import { useId, useState } from "react"
import { ChevronDown, LoaderCircle, RefreshCw } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { CampoFormulario } from "@/components/comunes/campo-formulario"
import { ErrorDeCampo } from "@/components/comunes/error-de-campo"
import { Selector } from "@/components/comunes/selector"
import { useRubroDelPanel } from "@/components/panel/contexto-rubro"
import { CAMPO_CON_ERROR, ETIQUETA, RELLENO_DE_TARJETA, TARJETA_DEL_PANEL } from "@/components/panel/estilos"
import { MEDIOS_DE_PAGO } from "@/lib/medios-de-pago"
import { PERIODOS, type PeriodoId } from "@/lib/periodos"
import { TURNOS } from "@/lib/reportes"
import { cn } from "@/lib/utils"
import { vocabularioDe } from "@/lib/vocabulario"
import type { OpcionesDeFiltro } from "../_datos"
import { frasesDeLosReportes } from "../_frases"
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

interface PropsDeFiltrosDeReporte {
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
 *
 * En el celular el período es una sola fila de píldoras que se desliza de
 * costado, y los demás filtros quedan detrás de "Más filtros" (con cuántos hay
 * elegidos): cuatro selectores ocupaban media pantalla antes de ver un número.
 * Desde `lg` se ve todo, como siempre.
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
}: PropsDeFiltrosDeReporte) {
  const idBase = useId()
  // "Odontólogo", "Prestación" y "Todas" en una clínica dental.
  const { filtros: frases } = frasesDeLosReportes(vocabularioDe(useRubroDelPanel()).palabras)
  const id = (campo: string) => `${idBase}-${campo}`
  const delNegocio = alcance === "negocio"
  /** Sólo en el celular: si se ven los filtros además del período. */
  const [masFiltros, setMasFiltros] = useState(false)
  const elegidos = [filtros.turno, delNegocio && filtros.profesional, filtros.servicio, delNegocio && filtros.medio].filter(
    Boolean
  ).length

  return (
    <section aria-labelledby={id("titulo")} className={cn(TARJETA_DEL_PANEL, RELLENO_DE_TARJETA, "space-y-4 lg:space-y-5")}>
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
        {/* En el celular, una fila que se desliza; el relleno de arriba y abajo deja ver el anillo del foco. */}
        <div className="flex gap-2 max-lg:-mx-4 max-lg:overflow-x-auto max-lg:px-4 max-lg:py-1.5 lg:flex-wrap">
          {PERIODOS.map((periodo) => {
            const elegido = filtros.periodo === periodo.id
            return (
              <label
                key={periodo.id}
                className={cn(
                  "inline-flex h-11 shrink-0 cursor-pointer items-center rounded-full px-4 text-sm font-medium whitespace-nowrap",
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
          <div className="mt-4 grid max-w-xl grid-cols-2 gap-3 lg:gap-4">
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
              <div role="alert" className="col-span-2">
                <ErrorDeCampo id={id("error-rango")}>{errorDeRango}</ErrorDeCampo>
              </div>
            )}
          </div>
        )}
      </fieldset>

      {soloPeriodo ? (
        <p className="text-sm text-texto-2">Lo anulado se filtra solo por período, por la fecha en que se anuló.</p>
      ) : (
        <>
          <button
            type="button"
            aria-expanded={masFiltros}
            aria-controls={id("mas-filtros")}
            onClick={() => setMasFiltros((previo) => !previo)}
            className="flex min-h-11 w-full items-center justify-between gap-3 rounded-boton px-1 text-sm font-medium text-navy anillo-foco lg:hidden"
          >
            <span>
              Más filtros
              {elegidos > 0 && <span className="text-texto-2"> · {elegidos === 1 ? "1 elegido" : `${elegidos} elegidos`}</span>}
            </span>
            <ChevronDown
              aria-hidden="true"
              className={cn("size-5 transition-transform duration-150 ease-suave", masFiltros && "rotate-180")}
              strokeWidth={2}
            />
          </button>
          <div
            id={id("mas-filtros")}
            className={cn("grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4", !masFiltros && "max-lg:hidden")}
          >
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
                etiqueta={frases.profesional}
                id={id("profesional")}
                value={filtros.profesional}
                onChange={(evento) => onCambiar({ profesional: evento.target.value })}
                opciones={(opciones?.profesionales ?? []).map((profesional) => ({
                  valor: profesional.id,
                  texto: profesional.nombre,
                }))}
              >
                <option value="">{frases.todosLosProfesionales}</option>
              </Selector>
            )}

            <Selector
              etiqueta={frases.servicio}
              id={id("servicio")}
              value={filtros.servicio}
              onChange={(evento) => onCambiar({ servicio: evento.target.value })}
              opciones={(opciones?.servicios ?? []).map((servicio) => ({ valor: servicio.id, texto: servicio.nombre }))}
            >
              <option value="">{frases.todosLosServicios}</option>
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
        </>
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
