"use client"

import { useId } from "react"
import { CalendarClock, Scissors, Tag } from "lucide-react"
import { BotonPrimario } from "@/components/comunes/boton-primario"
import { CampoFormulario } from "@/components/comunes/campo-formulario"
import { CLASES_DE_ETIQUETA } from "@/components/comunes/estilos-de-campo"
import { Aviso } from "@/components/panel/aviso"
import { MarcoDeModal } from "@/components/panel/marco-de-modal"
import { CAMPO, ETIQUETA } from "@/components/panel/estilos"
import { cn } from "@/lib/utils"
import { FRECUENCIA_MAXIMA_DIAS, FRECUENCIA_MINIMA_DIAS } from "@/lib/frecuencia-de-visitas"
import type { DatosDeServicio } from "../_datos"

const DURACIONES = [
  { valor: 15, etiqueta: "15 min" },
  { valor: 30, etiqueta: "30 min" },
  { valor: 45, etiqueta: "45 min" },
  { valor: 60, etiqueta: "1 hora" },
  { valor: 90, etiqueta: "1h 30min" },
  { valor: 120, etiqueta: "2 horas" },
  { valor: 180, etiqueta: "3 horas" },
]

/** El radio no se ve: el anillo del foco lo dibuja la opción entera cuando el radio de adentro lo tiene. */
const ANILLO_DE_LA_OPCION =
  "has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-(--anillo) has-focus-visible:shadow-[0_0_0_6px_var(--halo)]"

interface PropsDeModalServicio {
  form: DatosDeServicio
  guardando: boolean
  /**
   * Por qué no se pudo guardar el servicio, si falló. Se muestra dentro del
   * modal y no en la sección: mientras el modal está abierto, queda tapada.
   */
  aviso: string
  modoEdicion: boolean
  /** Las categorías que ya usa el catálogo, para sugerirlas al escribir. */
  categorias: string[]
  onCambiarCampo: (campo: keyof DatosDeServicio, valor: string | number) => void
  onSubmit: (e: React.SyntheticEvent<HTMLFormElement>) => void
  onCerrar: () => void
  /**
   * "Cada cuántos días vuelve" (`Service.frecuenciaDias`, #75), como texto del
   * campo: vacío es sin frecuencia. Lo lee `frecuenciaDelFormulario`. El campo
   * se dibuja sólo si viene `onCambiarFrecuencia`.
   */
  frecuenciaDias?: string
  onCambiarFrecuencia?: (valor: string) => void
}

export function ModalServicio({
  form,
  guardando,
  aviso,
  modoEdicion,
  categorias,
  onCambiarCampo,
  onSubmit,
  onCerrar,
  frecuenciaDias = "",
  onCambiarFrecuencia,
}: PropsDeModalServicio) {
  const idDeLaDescripcion = useId()
  const idDeAyudaDeFrecuencia = useId()
  const idDeLasCategorias = useId()
  const nombreDeLaDuracion = useId()

  return (
    <MarcoDeModal
      titulo={modoEdicion ? "Editar servicio" : "Nuevo servicio"}
      antetitulo="Servicios"
      bloqueado={guardando}
      alCerrar={onCerrar}
    >
      <form onSubmit={onSubmit} className="space-y-5">
        <CampoFormulario
          etiqueta="Nombre del servicio"
          placeholder="Ej.: Corte de cabello, Arreglo de barba, Manicura..."
          value={form.name}
          onChange={(e) => onCambiarCampo("name", e.target.value)}
          icono={<Scissors className="h-4 w-4" />}
          required
        />

        {/* Agrupa los servicios en la página pública; los sin categoría van a "Otros". */}
        <CampoFormulario
          etiqueta="Categoría (opcional)"
          placeholder="Ej.: Corte, Color, Uñas..."
          value={form.category}
          onChange={(e) => onCambiarCampo("category", e.target.value)}
          icono={<Tag className="h-4 w-4" />}
          list={idDeLasCategorias}
          maxLength={40}
          autoComplete="off"
        />
        <datalist id={idDeLasCategorias}>
          {categorias.map((categoria) => (
            <option key={categoria} value={categoria} />
          ))}
        </datalist>

        <div>
          <label htmlFor={idDeLaDescripcion} className={ETIQUETA}>
            Descripción (opcional)
          </label>
          <textarea
            id={idDeLaDescripcion}
            value={form.description}
            onChange={(e) => onCambiarCampo("description", e.target.value)}
            placeholder="Describe brevemente el servicio..."
            className={cn(CAMPO, "h-24 resize-none")}
          />
        </div>

        {/*
          Una duración entre siete, todas a la vista. Son radios nativos: el
          lector de pantalla dice cuál está elegida y las flechas pasan de una
          a otra. Antes eran botones que no decían cuál estaba elegida.
        */}
        <fieldset className="min-w-0">
          <legend className={cn(CLASES_DE_ETIQUETA, "mb-2")}>Duración</legend>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {DURACIONES.map(({ valor, etiqueta }) => {
              const elegida = form.duration === valor
              return (
                <label
                  key={valor}
                  className={cn(
                    "relative grid h-11 cursor-pointer place-items-center rounded-campo border px-2 text-center text-sm font-medium squircle transition-[border-color,background-color,color] duration-150 ease-suave",
                    ANILLO_DE_LA_OPCION,
                    elegida ? "border-navy bg-navy text-white" : "border-texto-2 bg-tarjeta text-navy hover:border-navy"
                  )}
                >
                  <input
                    type="radio"
                    name={nombreDeLaDuracion}
                    value={valor}
                    checked={elegida}
                    onChange={() => onCambiarCampo("duration", valor)}
                    className="sr-only"
                  />
                  {etiqueta}
                </label>
              )
            })}
          </div>
        </fieldset>

        <CampoFormulario
          etiqueta="Precio (opcional)"
          // Texto y no número, como el precio del tablero: en un `type="number"`
          // "8.000" llegaba como 8. Lo escrito lo lee `leerMonto`.
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0"
          value={form.price}
          onChange={(e) => onCambiarCampo("price", e.target.value)}
          icono={<span className="text-sm" aria-hidden="true">$</span>}
          className="tabular-nums"
        />

        {onCambiarFrecuencia && (
          <div className="space-y-1.5">
            <CampoFormulario
              etiqueta="Cada cuántos días vuelve un cliente (opcional)"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="Ej.: 30"
              value={frecuenciaDias}
              onChange={(e) => onCambiarFrecuencia(e.target.value.replace(/\D/g, "").slice(0, 3))}
              icono={<CalendarClock className="h-4 w-4" />}
              aria-describedby={idDeAyudaDeFrecuencia}
              className="tabular-nums"
            />
            <p id={idDeAyudaDeFrecuencia} className="text-sm text-texto-2">
              De {FRECUENCIA_MINIMA_DIAS} a {FRECUENCIA_MAXIMA_DIAS} días. Sirve para avisarle a quien todavía no tiene su
              propio ritmo de visitas que ya le toca volver.
            </p>
          </div>
        )}

        {aviso && <Aviso>{aviso}</Aviso>}

        {/* En el teléfono, uno debajo del otro: lado a lado no entraban con "Guardar cambios". */}
        <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row">
          <BotonPrimario type="button" variante="secundario" anchoCompleto onClick={onCerrar} disabled={guardando}>
            Cancelar
          </BotonPrimario>
          <BotonPrimario type="submit" anchoCompleto cargando={guardando}>
            {modoEdicion ? "Guardar cambios" : "Crear servicio"}
          </BotonPrimario>
        </div>
      </form>
    </MarcoDeModal>
  )
}
