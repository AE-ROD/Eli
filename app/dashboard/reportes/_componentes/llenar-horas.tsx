"use client"

import { useEffect, useId, useState } from "react"
import { CalendarCheck, RefreshCw, UserCheck, UserPlus, UserX } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { Esqueleto } from "@/components/comunes/esqueleto"
import { Selector } from "@/components/comunes/selector"
import { CLASES_DE_ETIQUETA } from "@/components/comunes/estilos-de-campo"
import { Aviso } from "@/components/panel/aviso"
import { EstadoVacio } from "@/components/panel/estado-vacio"
import { CAMPO, TARJETA_DEL_PANEL, TITULO_DE_TARJETA } from "@/components/panel/estilos"
import { comoTexto, desplazarFecha, diasDeLaSemanaDe, limitesDelMesDe } from "@/lib/fechas"
import { DIAS_MAXIMOS } from "@/lib/periodos"
import type { Resultado } from "@/lib/peticiones"
import { cn } from "@/lib/utils"
import {
  formatearCambio,
  formatearMinutos,
  formatearTasa,
  leerLlenarHoras,
  type ComparacionDeMetrica,
  type ReporteLlenarHoras,
} from "../_datos"
import { Cifra } from "./resumen-de-reporte"

type PeriodoDeOcupacion = "semana" | "mes" | "30-dias" | "personalizado"

const OPCIONES: { valor: PeriodoDeOcupacion; texto: string }[] = [
  { valor: "semana", texto: "Esta semana" },
  { valor: "mes", texto: "Este mes" },
  { valor: "30-dias", texto: "Últimos 30 días" },
  { valor: "personalizado", texto: "Personalizado" },
]

/** Los días del período elegido (los dos incluidos), o por qué no sirve. */
function diasElegidos(
  periodo: PeriodoDeOcupacion,
  propio: { desde: string; hasta: string },
  hoy: Date
): { ok: true; desde: string; hasta: string } | { ok: false; error: string } {
  if (periodo === "semana") {
    const dias = diasDeLaSemanaDe(hoy)
    return { ok: true, desde: comoTexto(dias[0]), hasta: comoTexto(dias[6]) }
  }
  if (periodo === "mes") {
    const { desde, hasta } = limitesDelMesDe(hoy)
    return { ok: true, desde: comoTexto(desde), hasta: comoTexto(hasta) }
  }
  if (periodo === "30-dias") return { ok: true, desde: comoTexto(desplazarFecha(hoy, "dia", -29)), hasta: comoTexto(hoy) }

  if (!propio.desde || !propio.hasta) return { ok: false, error: "Elige la fecha de inicio y la de fin." }
  if (propio.hasta < propio.desde) return { ok: false, error: "La fecha de fin no puede ser anterior a la de inicio." }
  const dias = Math.round((Date.parse(propio.hasta) - Date.parse(propio.desde)) / 86_400_000) + 1
  if (dias > DIAS_MAXIMOS) return { ok: false, error: `El período no puede pasar de ${DIAS_MAXIMOS} días.` }
  return { ok: true, desde: propio.desde, hasta: propio.hasta }
}

/** "+25 % vs. período anterior", o por qué no hay comparación. */
function textoDeComparacion(comparacion: ComparacionDeMetrica, tipo: "cantidad" | "tasa"): string {
  const cambio = formatearCambio(comparacion, tipo)
  return cambio === null ? "Sin base en el período anterior" : `${cambio} vs. período anterior`
}

/**
 * "Llenar horas" (#72): cuánto del horario del equipo está ocupado, cuántos
 * clientes son nuevos o vuelven, cuántos no vinieron, y cómo le fue contra el
 * período anterior de igual largo. Los días se cuentan en la zona del
 * negocio. Sólo dueña y encargado (la pestaña y el endpoint lo verifican).
 */
export function LlenarHoras() {
  const idDeOcupacion = useId()
  const idDeInasistencia = useId()
  const idDelDesde = useId()
  const idDelHasta = useId()
  const [periodo, setPeriodo] = useState<PeriodoDeOcupacion>("semana")
  const [propio, setPropio] = useState({ desde: "", hasta: "" })
  const [reintentos, setReintentos] = useState(0)
  const [respuesta, setRespuesta] = useState<{ consulta: string; resultado: Resultado<ReporteLlenarHoras> } | null>(null)
  const [reporte, setReporte] = useState<ReporteLlenarHoras | null>(null)

  const [hoy] = useState(() => new Date())
  const rango = diasElegidos(periodo, propio, hoy)
  const consulta = rango.ok ? `${rango.desde}:${rango.hasta}:${reintentos}` : ""

  useEffect(() => {
    if (!rango.ok) return
    let vigente = true
    leerLlenarHoras(rango.desde, rango.hasta).then((resultado) => {
      if (!vigente) return
      setRespuesta({ consulta, resultado })
      if (resultado.ok) setReporte(resultado.datos)
    })
    return () => {
      vigente = false
    }
    // `consulta` resume el rango y los reintentos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consulta])

  const cargando = rango.ok && respuesta?.consulta !== consulta
  const error = !cargando && respuesta && !respuesta.resultado.ok ? respuesta.resultado.error : ""
  const mostrar = reporte !== null && rango.ok && !error

  return (
    <div className="space-y-6">
      <div className={cn(TARJETA_DEL_PANEL, "flex flex-wrap items-end gap-4 p-5 sm:p-6")}>
        <div className="w-full sm:w-56">
          <Selector
            etiqueta="Período"
            value={periodo}
            opciones={OPCIONES}
            onChange={(evento) => {
              const elegido = evento.target.value as PeriodoDeOcupacion
              if (elegido === "personalizado" && !propio.desde && !propio.hasta) {
                setPropio({ desde: comoTexto(hoy), hasta: comoTexto(hoy) })
              }
              setPeriodo(elegido)
            }}
          />
        </div>
        {periodo === "personalizado" && (
          <>
            <div>
              <label htmlFor={idDelDesde} className={CLASES_DE_ETIQUETA}>
                Desde
              </label>
              <input
                id={idDelDesde}
                type="date"
                value={propio.desde}
                onChange={(evento) => setPropio((previo) => ({ ...previo, desde: evento.target.value }))}
                className={cn(CAMPO, "mt-2")}
              />
            </div>
            <div>
              <label htmlFor={idDelHasta} className={CLASES_DE_ETIQUETA}>
                Hasta
              </label>
              <input
                id={idDelHasta}
                type="date"
                value={propio.hasta}
                onChange={(evento) => setPropio((previo) => ({ ...previo, hasta: evento.target.value }))}
                className={cn(CAMPO, "mt-2")}
              />
            </div>
          </>
        )}
        {!rango.ok && <p className="w-full text-sm font-medium text-error">{rango.error}</p>}
        {cargando && reporte && <p className="text-sm text-texto-2" role="status">Actualizando…</p>}
      </div>

      {error && (
        <Aviso
          accion={
            <Boton variante="secundario" tamano="sm" onClick={() => setReintentos((previos) => previos + 1)}>
              <RefreshCw aria-hidden="true" className="size-4" strokeWidth={2} />
              Reintentar
            </Boton>
          }
        >
          {error}
        </Aviso>
      )}

      {!reporte && cargando && (
        <div role="status" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <span className="sr-only">Cargando el reporte…</span>
          {[0, 1, 2, 3].map((cifra) => (
            <div key={cifra} aria-hidden="true" className={cn(TARJETA_DEL_PANEL, "space-y-4 p-5 sm:p-6")}>
              <Esqueleto className="w-1/2" />
              <Esqueleto className="h-7 w-1/3" />
            </div>
          ))}
        </div>
      )}

      {mostrar && (
        <div aria-busy={cargando} className={cn("space-y-6 transition-opacity duration-200 ease-suave", cargando && "opacity-60")}>
          {reporte.truncado && (
            <Aviso tono="atencion" rol="status">
              El período tiene demasiadas citas o atenciones para sumarlas de una vez: las cifras están incompletas. Acota el
              período.
            </Aviso>
          )}

          <p className="text-sm text-texto-2">
            Comparado con el período anterior de igual largo ({reporte.periodoAnterior.desde} al{" "}
            {reporte.periodoAnterior.hasta}), en la zona horaria del negocio.
          </p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <CifraConComparacion
              titulo="Ocupación del equipo"
              valor={formatearTasa(reporte.ocupacion.total.ocupacion)}
              icono={CalendarCheck}
              comparacion={textoDeComparacion(reporte.comparacion.ocupacion, "tasa")}
              principal
            />
            <CifraConComparacion
              titulo="Clientes nuevos"
              valor={String(reporte.clientes.nuevos)}
              icono={UserPlus}
              comparacion={textoDeComparacion(reporte.comparacion.clientesNuevos, "cantidad")}
            />
            <CifraConComparacion
              titulo="Clientes que volvieron"
              valor={String(reporte.clientes.recurrentes)}
              icono={UserCheck}
              comparacion={textoDeComparacion(reporte.comparacion.clientesRecurrentes, "cantidad")}
            />
            <CifraConComparacion
              titulo="No vinieron"
              valor={formatearTasa(reporte.inasistencia.total.tasa)}
              icono={UserX}
              comparacion={textoDeComparacion(reporte.comparacion.inasistencia, "tasa")}
            />
          </div>

          <section aria-labelledby={idDeOcupacion} className={cn(TARJETA_DEL_PANEL, "p-5 sm:p-6")}>
            <h2 id={idDeOcupacion} className={TITULO_DE_TARJETA}>
              Ocupación por profesional
            </h2>
            <p className="mt-1 text-sm text-texto-2">
              Minutos con citas dentro de su horario, sin bloqueos. Si no cargó horario propio, cuenta el del negocio.
            </p>
            {reporte.ocupacion.porProfesional.length === 0 ? (
              <EstadoVacio className="mt-4">Todavía no hay equipo.</EstadoVacio>
            ) : (
              <ul className="mt-4 space-y-4">
                {reporte.ocupacion.porProfesional.map((profesional) => (
                  <li key={profesional.id} className="text-sm">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 break-words font-medium">{profesional.nombre}</span>
                      <span className="shrink-0 tabular-nums">
                        {profesional.ocupacion === null ? "Sin horario" : formatearTasa(profesional.ocupacion)}
                      </span>
                    </div>
                    <div aria-hidden="true" className="mt-1.5 h-2 overflow-hidden rounded-full bg-superficie">
                      <div
                        className="h-full rounded-full bg-lima"
                        style={{ width: `${Math.min(100, Math.round((profesional.ocupacion ?? 0) * 100))}%` }}
                      />
                    </div>
                    <p className="mt-1 text-texto-2 tabular-nums">
                      {formatearMinutos(profesional.minutosOcupados)} de {formatearMinutos(profesional.minutosDisponibles)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby={idDeInasistencia} className={cn(TARJETA_DEL_PANEL, "p-5 sm:p-6")}>
            <h2 id={idDeInasistencia} className={TITULO_DE_TARJETA}>
              Inasistencia
            </h2>
            <p className="mt-1 text-sm text-texto-2">
              Citas marcadas como &ldquo;no vino&rdquo;, sobre las que ya empezaron y no se cancelaron.
              {reporte.clientes.sinFicha > 0 &&
                ` ${reporte.clientes.sinFicha} atención${reporte.clientes.sinFicha === 1 ? "" : "es"} sin ficha de cliente no entra${reporte.clientes.sinFicha === 1 ? "" : "n"} en nuevos ni recurrentes.`}
            </p>
            {reporte.inasistencia.porProfesional.length === 0 ? (
              <EstadoVacio className="mt-4">No hubo citas pasadas en el período.</EstadoVacio>
            ) : (
              <ul className="mt-4 divide-y divide-borde border-y border-borde">
                {reporte.inasistencia.porProfesional.map((fila) => (
                  <li key={fila.id ?? fila.nombre} className="flex items-baseline justify-between gap-3 py-2.5 text-sm">
                    <span className="min-w-0 break-words">{fila.nombre}</span>
                    <span className="shrink-0 tabular-nums">
                      {fila.noVino} de {fila.citas} · <span className="font-medium">{formatearTasa(fila.tasa)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

function CifraConComparacion({
  comparacion,
  ...props
}: Parameters<typeof Cifra>[0] & { comparacion: string }) {
  return (
    <div className="flex flex-col">
      <Cifra {...props} className="flex-1 rounded-b-none" />
      <p className={cn(TARJETA_DEL_PANEL, "-mt-px rounded-t-none border-t border-borde px-5 py-2.5 text-xs text-texto-2 sm:px-6")}>
        {comparacion}
      </p>
    </div>
  )
}
