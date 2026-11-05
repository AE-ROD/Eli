"use client"

import { useId, useState, type FormEvent } from "react"
import { Percent, Plus, Save, X } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { Insignia } from "@/components/comunes/insignia"
import { CLASES_DE_ETIQUETA } from "@/components/comunes/estilos-de-campo"
import { Aviso } from "@/components/panel/aviso"
import { EncabezadoDeTarjeta } from "@/components/panel/encabezado-de-tarjeta"
import { CAMPO, CAMPO_CON_ERROR, ERROR_DE_CAMPO, TARJETA_DEL_PANEL } from "@/components/panel/estilos"
import { nombreDelRol } from "@/lib/nombres-de-roles"
import { cn } from "@/lib/utils"
import {
  formatearPorcentaje,
  guardarExcepcion,
  guardarPorcentajeDeMiembro,
  leerPorcentaje,
  porcentajeParaEscribir,
  type MiembroConComision,
} from "../_datos"

interface PropsDeTarjetaDeMiembro {
  miembro: MiembroConComision
  /** Los servicios del catálogo, para elegir dónde va una excepción. */
  servicios: { id: string; nombre: string; activo: boolean }[]
  /** Algo se guardó: la pantalla vuelve a leer (el % y el historial). */
  onCambio: () => void
}

/**
 * Un profesional: su % por defecto, sus excepciones por servicio y cuántos
 * servicios ya cobrados esperan un %. Vacío es "sin configurar", que no es 0.
 */
export function TarjetaDeMiembro({ miembro, servicios, onCambio }: PropsDeTarjetaDeMiembro) {
  const idDelTitulo = useId()
  const idDelCampo = useId()
  const idDelServicio = useId()
  const idDeLaExcepcion = useId()
  const [texto, setTexto] = useState(porcentajeParaEscribir(miembro.porcentaje))
  const [errorDelCampo, setErrorDelCampo] = useState("")
  const [guardando, setGuardando] = useState(false)
  const [aviso, setAviso] = useState("")

  const [servicioElegido, setServicioElegido] = useState("")
  const [textoDeExcepcion, setTextoDeExcepcion] = useState("")
  const [errorDeExcepcion, setErrorDeExcepcion] = useState("")
  const [agregando, setAgregando] = useState(false)
  const [quitando, setQuitando] = useState<string | null>(null)

  // Lo guardado cambió (otra pestaña, o se guardó acá): el campo lo refleja.
  const [guardadoVisto, setGuardadoVisto] = useState(miembro.porcentaje)
  if (guardadoVisto !== miembro.porcentaje) {
    setGuardadoVisto(miembro.porcentaje)
    setTexto(porcentajeParaEscribir(miembro.porcentaje))
  }

  const leido = leerPorcentaje(texto)
  const pendiente = leido.ok && leido.valor !== miembro.porcentaje

  const guardar = async (evento: FormEvent) => {
    evento.preventDefault()
    setAviso("")
    if (!leido.ok) return setErrorDelCampo(leido.error)
    setErrorDelCampo("")
    if (!pendiente) return
    setGuardando(true)
    const resultado = await guardarPorcentajeDeMiembro(miembro.id, leido.valor)
    setGuardando(false)
    if (!resultado.ok) return setAviso(resultado.error)
    onCambio()
  }

  const conExcepcion = new Set(miembro.excepciones.map((excepcion) => excepcion.servicioId))
  const serviciosLibres = servicios.filter((servicio) => servicio.activo && !conExcepcion.has(servicio.id))

  const agregarExcepcion = async (evento: FormEvent) => {
    evento.preventDefault()
    setAviso("")
    if (!servicioElegido) return setErrorDeExcepcion("Elige el servicio.")
    const porcentaje = leerPorcentaje(textoDeExcepcion)
    if (!porcentaje.ok) return setErrorDeExcepcion(porcentaje.error)
    if (porcentaje.valor === null) return setErrorDeExcepcion("Escribe el porcentaje para ese servicio.")
    setErrorDeExcepcion("")
    setAgregando(true)
    const resultado = await guardarExcepcion(miembro.id, servicioElegido, porcentaje.valor)
    setAgregando(false)
    if (!resultado.ok) return setAviso(resultado.error)
    setServicioElegido("")
    setTextoDeExcepcion("")
    onCambio()
  }

  const quitarExcepcion = async (servicioId: string) => {
    setAviso("")
    setQuitando(servicioId)
    const resultado = await guardarExcepcion(miembro.id, servicioId, null)
    setQuitando(null)
    if (!resultado.ok) return setAviso(resultado.error)
    onCambio()
  }

  const sinConfigurar = miembro.porcentaje === null

  return (
    <section aria-labelledby={idDelTitulo} className={cn(TARJETA_DEL_PANEL, "p-5 sm:p-6")}>
      <EncabezadoDeTarjeta
        id={idDelTitulo}
        titulo={miembro.nombre}
        subtitulo={nombreDelRol(miembro.rol)}
        icono={{ figura: Percent }}
        accion={sinConfigurar ? <Insignia tono="naranja">Sin configurar</Insignia> : undefined}
      />

      {miembro.pendientes > 0 && (
        <Aviso tono="atencion" className="mt-4">
          {miembro.pendientes === 1
            ? "1 servicio ya cobrado espera un porcentaje."
            : `${miembro.pendientes} servicios ya cobrados esperan un porcentaje.`}{" "}
          Se congelan al cerrar su liquidación con el % que tenga entonces.
        </Aviso>
      )}

      <form onSubmit={guardar} className="mt-5 flex flex-wrap items-end gap-3" noValidate>
        <div className="min-w-0">
          <label htmlFor={idDelCampo} className={CLASES_DE_ETIQUETA}>
            % por defecto
          </label>
          <input
            id={idDelCampo}
            inputMode="decimal"
            autoComplete="off"
            placeholder="Sin configurar"
            value={texto}
            onChange={(evento) => {
              setTexto(evento.target.value)
              setErrorDelCampo("")
            }}
            aria-invalid={errorDelCampo ? true : undefined}
            aria-describedby={`${idDelCampo}-ayuda${errorDelCampo ? ` ${idDelCampo}-error` : ""}`}
            className={cn(CAMPO, "mt-2 w-36", errorDelCampo && CAMPO_CON_ERROR)}
          />
        </div>
        <Boton
          type="submit"
          tamano="sm"
          variante={pendiente ? "primario" : "secundario"}
          icono={<Save aria-hidden="true" />}
          cargando={guardando}
        >
          Guardar
        </Boton>
      </form>
      {errorDelCampo && (
        <p id={`${idDelCampo}-error`} className={ERROR_DE_CAMPO}>
          {errorDelCampo}
        </p>
      )}
      <p id={`${idDelCampo}-ayuda`} className="mt-2 text-sm text-texto-2">
        Se aplica a todos sus servicios, salvo las excepciones de abajo. Vacío lo deja sin configurar (no es 0 %).
      </p>

      <h3 className="mt-6 text-sm font-semibold">Excepciones por servicio</h3>
      {miembro.excepciones.length === 0 ? (
        <p className="mt-2 text-sm text-texto-2">No tiene: en todos sus servicios rige su % por defecto.</p>
      ) : (
        <ul className="mt-2 divide-y divide-borde border-y border-borde">
          {miembro.excepciones.map((excepcion) => (
            <li key={excepcion.servicioId} className="flex items-center justify-between gap-3 py-2">
              <span className="min-w-0 break-words text-sm">{excepcion.servicio}</span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="text-sm font-medium tabular-nums">{formatearPorcentaje(excepcion.porcentaje)}</span>
                <button
                  type="button"
                  onClick={() => quitarExcepcion(excepcion.servicioId)}
                  disabled={quitando === excepcion.servicioId}
                  aria-label={`Quitar la excepción de ${excepcion.servicio}`}
                  className="grid size-11 place-items-center rounded-[12px] text-texto-2 squircle anillo-foco transition-colors duration-150 ease-suave hover:bg-superficie hover:text-navy disabled:opacity-50"
                >
                  <X className="size-4" aria-hidden="true" strokeWidth={2} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {serviciosLibres.length > 0 && (
        <form onSubmit={agregarExcepcion} className="mt-4 flex flex-wrap items-end gap-3" noValidate>
          <div className="min-w-0 flex-1 basis-48">
            <label htmlFor={idDelServicio} className={CLASES_DE_ETIQUETA}>
              Servicio
            </label>
            <select
              id={idDelServicio}
              value={servicioElegido}
              onChange={(evento) => {
                setServicioElegido(evento.target.value)
                setErrorDeExcepcion("")
              }}
              className={cn(CAMPO, "mt-2")}
            >
              <option value="">Elige un servicio</option>
              {serviciosLibres.map((servicio) => (
                <option key={servicio.id} value={servicio.id}>
                  {servicio.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-0">
            <label htmlFor={idDeLaExcepcion} className={CLASES_DE_ETIQUETA}>
              %
            </label>
            <input
              id={idDeLaExcepcion}
              inputMode="decimal"
              autoComplete="off"
              value={textoDeExcepcion}
              onChange={(evento) => {
                setTextoDeExcepcion(evento.target.value)
                setErrorDeExcepcion("")
              }}
              aria-invalid={errorDeExcepcion ? true : undefined}
              className={cn(CAMPO, "mt-2 w-24", errorDeExcepcion && CAMPO_CON_ERROR)}
            />
          </div>
          <Boton type="submit" tamano="sm" variante="secundario" icono={<Plus aria-hidden="true" />} cargando={agregando}>
            Agregar
          </Boton>
        </form>
      )}
      {errorDeExcepcion && (
        <p role="alert" className={ERROR_DE_CAMPO}>
          {errorDeExcepcion}
        </p>
      )}

      {aviso && <Aviso className="mt-4">{aviso}</Aviso>}
    </section>
  )
}
