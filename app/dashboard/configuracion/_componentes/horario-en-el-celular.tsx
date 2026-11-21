"use client"

import { useId, type ReactNode } from "react"
import { ChevronRight, Save } from "lucide-react"
import { BotonPrimario } from "@/components/comunes/boton-primario"
import { MarcoDeModal } from "@/components/panel/marco-de-modal"
import { cn } from "@/lib/utils"

/**
 * # El horario semanal en el celular
 *
 * Por debajo de `escritorio` (768 px) cada día del horario es una fila compacta: el día, sus
 * horas en un botón («09:00 – 18:00») y el interruptor. Tocar las horas abre
 * una hoja (`HojaDeHorasDelDia`) con las listas de hora y minutos en grande.
 * Desde `escritorio` el horario se ve como siempre (`FilaDeDia` y `RangoDeHoras`):
 * quien lo usa dibuja las dos versiones y oculta una con `escritorio:hidden` /
 * `max-escritorio:hidden`. Lo usan «Horario» y el editor de la semana de cada sede.
 */

interface PropsDeFilaDeDiaCompacta {
  /** El día: "Lunes". Nombra al interruptor y al botón de las horas. */
  etiqueta: string
  activo: boolean
  alAlternar: () => void
  /** Las franjas del día, ya escritas: ["09:00 – 13:00", "15:00 – 19:00"]. Cada una va entera, sin cortarse. */
  resumen: readonly string[]
  /** Lo que se le dice al lector de pantalla en lugar del resumen: "de 09:00 a 18:00". */
  resumenParaLeer: string
  alAbrirLasHoras: () => void
  /** Si alguna franja del día tiene un problema: el botón se marca y lo dice. */
  conProblema?: boolean
  /** El `id` del interruptor: adonde vuelve el foco si lo que lo tenía desapareció. */
  idDelInterruptor?: string
  /** El `id` del botón de las horas: adonde vuelve el foco al cerrar la hoja. */
  idDeLasHoras?: string
  textoSinAtencion?: string
}

/** Un día del horario en una sola fila de 56 px: día, horas e interruptor. */
export function FilaDeDiaCompacta({
  etiqueta,
  activo,
  alAlternar,
  resumen,
  resumenParaLeer,
  alAbrirLasHoras,
  conProblema = false,
  idDelInterruptor,
  idDeLasHoras,
  textoSinAtencion = "No disponible",
}: PropsDeFilaDeDiaCompacta) {
  const base = useId()
  const idDelDia = `${base}-dia`
  const idDelInterruptorFinal = idDelInterruptor ?? `${base}-interruptor`

  return (
    <li className="flex min-h-14 items-center gap-2 py-1.5">
      <label htmlFor={idDelInterruptorFinal} id={idDelDia} className="w-20 shrink-0 cursor-pointer text-[15px] font-medium text-navy">
        {etiqueta}
      </label>

      <div className="min-w-0 flex-1">
        {activo ? (
          <button
            type="button"
            id={idDeLasHoras}
            onClick={alAbrirLasHoras}
            aria-label={`${etiqueta}: ${resumenParaLeer}${conProblema ? ". Revisa las horas" : ""}. Cambiar las horas`}
            className={cn(
              "flex min-h-11 w-full items-center justify-between gap-1 rounded-campo border bg-tarjeta px-2.5 py-2 text-left text-[15px] tabular-nums text-navy anillo-foco squircle",
              conProblema ? "border-error text-error" : "border-borde"
            )}
          >
            <span className="flex min-w-0 flex-wrap gap-x-2">
              {resumen.map((franja) => (
                <span key={franja} className="whitespace-nowrap">
                  {franja}
                </span>
              ))}
            </span>
            <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-texto-2" strokeWidth={1.75} />
          </button>
        ) : (
          <p className="px-1 text-sm text-texto-2">{textoSinAtencion}</p>
        )}
      </div>

      <button
        id={idDelInterruptorFinal}
        type="button"
        role="switch"
        aria-checked={activo}
        aria-labelledby={idDelDia}
        onClick={alAlternar}
        className={cn(
          // El mismo de `Interruptor`: 52×32 a la vista; el ::after lleva el área táctil a 60×44.
          "relative ml-1 inline-flex h-8 w-13 shrink-0 cursor-pointer items-center rounded-full p-1",
          "anillo-foco transition-colors duration-150 ease-suave after:absolute after:-inset-x-1 after:-inset-y-1.5",
          activo ? "bg-navy" : "bg-texto-2"
        )}
      >
        <span
          aria-hidden="true"
          className={cn("size-6 rounded-full bg-white shadow-sm transition-transform duration-300 ease-suave", activo && "translate-x-5")}
        />
      </button>
    </li>
  )
}

/**
 * La hoja con las horas de un día. Lo que se cambia adentro se aplica al
 * momento (queda pendiente, como cualquier cambio del horario, hasta
 * «Guardar»); «Listo» sólo la cierra.
 */
export function HojaDeHorasDelDia({
  dia,
  descripcion,
  alCerrar,
  children,
}: {
  dia: string
  descripcion: string
  alCerrar: () => void
  children: ReactNode
}) {
  return (
    <MarcoDeModal
      titulo={dia}
      descripcion={descripcion}
      alCerrar={alCerrar}
      pie={
        <BotonPrimario type="button" anchoCompleto onClick={alCerrar}>
          Listo
        </BotonPrimario>
      }
    >
      {children}
    </MarcoDeModal>
  )
}

/**
 * Las listas de la hoja, en grande: 56 px de alto y letra de 18. Envuelve a
 * `CampoHora` o `RangoDeHoras` sin cambiarlos.
 */
export const LISTAS_GRANDES = "[&_select]:min-h-14 [&_select]:text-lg"

/**
 * «Guardar» fijo abajo en el celular mientras hay cambios sin guardar, encima
 * de la barra inferior (64 px más el área segura). Se va con la sección: si su
 * grupo está plegado, tampoco se ve. Desde `escritorio` no existe.
 */
export function BarraParaGuardarEnElCelular({
  visible,
  guardando,
  deshabilitado = false,
  alGuardar,
  children,
}: {
  visible: boolean
  guardando: boolean
  deshabilitado?: boolean
  alGuardar: () => void
  children: ReactNode
}) {
  if (!visible) return null
  return (
    <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 border-t border-borde bg-crema/95 px-4 py-3 backdrop-blur-sm escritorio:hidden">
      <BotonPrimario
        type="button"
        anchoCompleto
        icono={<Save className="h-4 w-4" />}
        cargando={guardando}
        disabled={deshabilitado}
        onClick={alGuardar}
      >
        {children}
      </BotonPrimario>
    </div>
  )
}
