"use client"

import { useId, useState } from "react"
import { CalendarClock, Scissors, Tag } from "lucide-react"
import { BotonPrimario } from "@/components/comunes/boton-primario"
import { CampoFormulario } from "@/components/comunes/campo-formulario"
import { CLASES_DE_ETIQUETA } from "@/components/comunes/estilos-de-campo"
import { Aviso } from "@/components/panel/aviso"
import { MarcoDeModal } from "@/components/panel/marco-de-modal"
import { useRubroDelPanel } from "@/components/panel/contexto-rubro"
import { CAMPO, ETIQUETA } from "@/components/panel/estilos"
import { ejemplosDe, textoDeEjemplo } from "@/lib/ejemplos-por-rubro"
import { formatearDuracionDeServicio } from "@/lib/fechas"
import { cn } from "@/lib/utils"
import { vocabularioDe } from "@/lib/vocabulario"
import { ayudaDeLaFrecuencia } from "@/lib/frecuencia-de-visitas"
import type { DatosDeServicio } from "../_datos"
import { frasesDeConfiguracion } from "../_frases"

const DURACIONES = [
  { valor: 15, etiqueta: "15 min" },
  { valor: 30, etiqueta: "30 min" },
  { valor: 45, etiqueta: "45 min" },
  { valor: 60, etiqueta: "1 hora" },
  { valor: 90, etiqueta: "1h 30min" },
  { valor: 120, etiqueta: "2 horas" },
  { valor: 180, etiqueta: "3 horas" },
]

/**
 * "Otra duración": de 15 en 15 minutos, de 15 minutos a 8 horas. Es el mismo
 * rango que acepta el servidor (`duracion()` de `lib/campos-del-panel.ts`: de
 * 15 a 480 minutos); por eso no se ofrece nada que lo pase.
 */
const DURACION_MINIMA = 15
const DURACION_MAXIMA = 480
const PASO_DE_DURACION = 15
const OTRAS_DURACIONES = Array.from(
  { length: (DURACION_MAXIMA - DURACION_MINIMA) / PASO_DE_DURACION + 1 },
  (_, i) => DURACION_MINIMA + i * PASO_DE_DURACION
)
const esDeLasDeSiempre = (minutos: number) => DURACIONES.some(({ valor }) => valor === minutos)

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
  /**
   * "Es una urgencia" (`Service.esUrgencia`): en la reserva pública, un motivo
   * así sólo ofrece horas de hoy. La casilla se dibuja sólo si viene
   * `onCambiarUrgencia`, y quien arma el modal lo pasa si
   * `puedeMarcarServicioComoUrgencia` dice que sí (una clínica dental).
   */
  urgencia?: boolean
  onCambiarUrgencia?: (valor: boolean) => void
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
  urgencia = false,
  onCambiarUrgencia,
}: PropsDeModalServicio) {
  const idDeLaDescripcion = useId()
  const idDeLaAyudaDeUrgencia = useId()
  const rubro = useRubroDelPanel()
  const frases = frasesDeConfiguracion(vocabularioDe(rubro).palabras).servicios.modal
  // Los ejemplos, en el oficio del negocio: en una clínica dental no se corta el pelo ni en una barbería se hacen las uñas.
  const ejemplos = ejemplosDe(rubro)
  const idDeAyudaDeFrecuencia = useId()
  const idDeLasCategorias = useId()
  const nombreDeLaDuracion = useId()
  const idDeOtraDuracion = useId()
  const idDeLaAyudaDelPrecio = useId()
  // Una duración guardada que no es de las de siempre (75 minutos) abre con "Otra duración" elegida.
  const [otraDuracion, setOtraDuracion] = useState(() => !esDeLasDeSiempre(form.duration))
  // Las de 15 en 15, más la guardada si es de antes y no cae en el paso (50 minutos): no se pierde al abrir.
  const opcionesDeOtra =
    OTRAS_DURACIONES.includes(form.duration) || form.duration < DURACION_MINIMA || form.duration > DURACION_MAXIMA
      ? OTRAS_DURACIONES
      : [...OTRAS_DURACIONES, form.duration].sort((a, b) => a - b)

  // El pie queda fuera del <form>: su botón de envío lo nombra con `form`.
  const idDelFormulario = useId()

  return (
    <MarcoDeModal
      titulo={frases.titulo(modoEdicion)}
      antetitulo={frases.antetitulo}
      bloqueado={guardando}
      alCerrar={onCerrar}
      // En el teléfono, uno debajo del otro: lado a lado no entraban con "Guardar cambios".
      pie={
        <div className="flex flex-col-reverse gap-3 sm:flex-row lg:pt-1">
          <BotonPrimario type="button" variante="secundario" anchoCompleto onClick={onCerrar} disabled={guardando}>
            Cancelar
          </BotonPrimario>
          <BotonPrimario type="submit" form={idDelFormulario} anchoCompleto cargando={guardando}>
            {modoEdicion ? "Guardar cambios" : frases.crear}
          </BotonPrimario>
        </div>
      }
    >
      <form id={idDelFormulario} onSubmit={onSubmit} className="space-y-5">
        <CampoFormulario
          etiqueta={frases.nombre}
          placeholder={textoDeEjemplo(ejemplos.servicios)}
          value={form.name}
          onChange={(e) => onCambiarCampo("name", e.target.value)}
          icono={<Scissors className="h-4 w-4" />}
          required
        />

        {/* Agrupa los servicios en la página pública; los sin categoría van a "Otros". */}
        <CampoFormulario
          etiqueta="Categoría (opcional)"
          placeholder={textoDeEjemplo(ejemplos.categorias)}
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
            placeholder={frases.descripcionPlaceholder}
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
              const elegida = !otraDuracion && form.duration === valor
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
                    onChange={() => {
                      setOtraDuracion(false)
                      onCambiarCampo("duration", valor)
                    }}
                    className="sr-only"
                  />
                  {etiqueta}
                </label>
              )
            })}
            <label
              className={cn(
                "relative grid h-11 cursor-pointer place-items-center rounded-campo border px-2 text-center text-sm font-medium squircle transition-[border-color,background-color,color] duration-150 ease-suave",
                ANILLO_DE_LA_OPCION,
                otraDuracion ? "border-navy bg-navy text-white" : "border-texto-2 bg-tarjeta text-navy hover:border-navy"
              )}
            >
              <input
                type="radio"
                name={nombreDeLaDuracion}
                value="otra"
                checked={otraDuracion}
                onChange={() => setOtraDuracion(true)}
                className="sr-only"
              />
              {frases.otraDuracion}
            </label>
          </div>
          {otraDuracion && (
            <div className="mt-3">
              <label htmlFor={idDeOtraDuracion} className={ETIQUETA}>
                {frases.duracionExacta}
              </label>
              <select
                id={idDeOtraDuracion}
                value={form.duration}
                onChange={(e) => onCambiarCampo("duration", Number(e.target.value))}
                className={cn(CAMPO, "w-auto min-w-48")}
              >
                {opcionesDeOtra.map((minutos) => (
                  <option key={minutos} value={minutos}>
                    {formatearDuracionDeServicio(minutos)}
                  </option>
                ))}
              </select>
            </div>
          )}
        </fieldset>

        <div className="space-y-1.5">
          <CampoFormulario
            etiqueta="Precio (opcional)"
            // Texto y no número, como el precio del tablero: en un `type="number"`
            // "8.000" llegaba como 8. Lo escrito lo lee `leerMonto`.
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="Ej.: 15.000"
            value={form.price}
            onChange={(e) => onCambiarCampo("price", e.target.value)}
            icono={<span className="text-sm" aria-hidden="true">$</span>}
            aria-describedby={idDeLaAyudaDelPrecio}
            className="tabular-nums"
          />
          {/* Lo que pasa en la página de reservas con el precio vacío: no se muestra ninguno. */}
          <p id={idDeLaAyudaDelPrecio} className="text-sm text-texto-2">
            {frases.precioAyuda}
          </p>
        </div>

        {onCambiarFrecuencia && (
          <div className="space-y-1.5">
            <CampoFormulario
              etiqueta={frases.frecuencia}
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
            {/* El aviso con el nombre del rubro: «Te toca volver» o, en una clínica dental, «Control». */}
            <p id={idDeAyudaDeFrecuencia} className="text-sm text-texto-2">
              {ayudaDeLaFrecuencia(rubro)}
            </p>
          </div>
        )}

        {onCambiarUrgencia && (
          // Toda la fila es el área táctil (44 px de alto); el anillo de foco es el del propio casillero.
          <div>
            <label className="flex min-h-11 cursor-pointer items-start gap-3 py-2 text-sm font-medium text-navy">
              <input
                type="checkbox"
                checked={urgencia}
                onChange={(e) => onCambiarUrgencia(e.target.checked)}
                aria-describedby={idDeLaAyudaDeUrgencia}
                className="anillo-foco mt-0.5 size-5 shrink-0 accent-navy"
              />
              {frases.urgencia}
            </label>
            <p id={idDeLaAyudaDeUrgencia} className="ml-8 text-sm text-texto-2">
              {frases.urgenciaAyuda}
            </p>
          </div>
        )}

        {aviso && <Aviso>{aviso}</Aviso>}
      </form>
    </MarcoDeModal>
  )
}
