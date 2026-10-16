"use client"

import { useState, useRef, useEffect, useId } from "react"
import { Search, User, Scissors, Calendar, Clock, DollarSign, Check } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { CampoFormulario } from "@/components/comunes/campo-formulario"
import { ErrorDeCampo } from "@/components/comunes/error-de-campo"
import { Selector } from "@/components/comunes/selector"
import { MarcoDeModal } from "@/components/panel/marco-de-modal"
import { CAMPO, ETIQUETA } from "@/components/panel/estilos"
import { cn } from "@/lib/utils"
import {
  buscarClientes,
  leerProfesionales,
  type ClienteSugerido,
  type DatosDeNuevaCita,
  type Profesional,
} from "../_datos"
import { Aviso } from "@/components/panel/aviso"

/** Con menos letras no se busca. */
const LETRAS_PARA_BUSCAR = 2

/**
 * El foco de una fila de la lista de clientes, hacia adentro: la lista se
 * desplaza y recorta lo que se sale de ella. El contorno queda dentro de la
 * fila y el halo es su fondo. Es el mismo buscador del tablero, al anotar a
 * alguien sin reserva.
 */
const ANILLO_HACIA_ADENTRO =
  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--anillo) focus-visible:bg-(--halo)"

interface ModalNuevaCitaProps {
  form: DatosDeNuevaCita
  guardando: boolean
  /**
   * Por qué no se pudo guardar la cita, si falló. Se muestra dentro del modal y
   * no en la página: mientras el modal está abierto, la página queda tapada.
   */
  aviso: string
  /** Sólo owner y admin asignan profesional; el worker no ve el selector. */
  puedeAsignarProfesional: boolean
  onFormChange: (campo: keyof DatosDeNuevaCita, valor: string) => void
  onSubmit: (e: React.SyntheticEvent<HTMLFormElement>) => void
  onCerrar: () => void
}

export function ModalNuevaCita({
  form,
  guardando,
  aviso,
  puedeAsignarProfesional,
  onFormChange,
  onSubmit,
  onCerrar,
}: ModalNuevaCitaProps) {
  const [busquedaCliente, setBusquedaCliente] = useState("")
  const [sugerencias, setSugerencias] = useState<ClienteSugerido[]>([])
  const [nombreCliente, setNombreCliente] = useState("")
  const [mostrarSugerencias, setMostrarSugerencias] = useState(false)
  const [profesionales, setProfesionales] = useState<Profesional[]>([])
  const [avisoDeBusqueda, setAvisoDeBusqueda] = useState("")
  const [avisoDeEquipo, setAvisoDeEquipo] = useState("")
  const esperaDeBusqueda = useRef<ReturnType<typeof setTimeout> | null>(null)
  const campoBusqueda = useRef<HTMLInputElement>(null)
  const idBase = useId()
  const idDelBuscador = `${idBase}-buscador`
  const idDelEstado = `${idBase}-estado`
  const idDelAvisoDeBusqueda = `${idBase}-aviso-busqueda`
  const idDeNotas = `${idBase}-notas`

  useEffect(() => {
    if (!puedeAsignarProfesional) return
    // Si el equipo no carga, el modal sigue sirviendo: la cita se guarda sin
    // profesional asignado. Pero se avisa, para que el selector no desaparezca
    // sin explicación.
    leerProfesionales().then((resultado) => {
      if (resultado.ok) setProfesionales(resultado.datos)
      else setAvisoDeEquipo(resultado.error)
    })
  }, [puedeAsignarProfesional])

  useEffect(() => {
    if (!busquedaCliente || busquedaCliente.length < LETRAS_PARA_BUSCAR) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- limpia las sugerencias viejas cuando se borra la búsqueda
      setSugerencias([])
      setAvisoDeBusqueda("")
      return
    }
    if (esperaDeBusqueda.current) clearTimeout(esperaDeBusqueda.current)
    esperaDeBusqueda.current = setTimeout(async () => {
      const resultado = await buscarClientes(busquedaCliente)
      if (!resultado.ok) {
        // Las sugerencias que había eran de otra búsqueda: no se dejan como si
        // fueran las de esta.
        setSugerencias([])
        setAvisoDeBusqueda(resultado.error)
        return
      }
      setAvisoDeBusqueda("")
      setSugerencias(resultado.datos)
      setMostrarSugerencias(true)
    }, 300)
    return () => { if (esperaDeBusqueda.current) clearTimeout(esperaDeBusqueda.current) }
  }, [busquedaCliente])

  function seleccionarCliente(cliente: ClienteSugerido, conTeclado: boolean) {
    onFormChange("clienteId", cliente.id)
    setNombreCliente(cliente.nombre)
    setBusquedaCliente(cliente.nombre)
    setMostrarSugerencias(false)
    // Con teclado, la fila elegida sale de la pantalla con la lista y el foco
    // caería fuera del diálogo: vuelve al buscador, que ahora dice el nombre
    // elegido. Con el dedo no: en el teléfono, enfocar el campo volvería a
    // abrir el teclado.
    if (conTeclado) requestAnimationFrame(() => campoBusqueda.current?.focus())
  }

  // Ya se eligió de la lista y lo escrito sigue siendo ese nombre: la lista no
  // se vuelve a abrir con el mismo cliente cuando llega la búsqueda de su nombre.
  const clienteElegido = nombreCliente !== "" && busquedaCliente === nombreCliente
  const listaVisible = mostrarSugerencias && sugerencias.length > 0 && !clienteElegido

  // Lo que dice la línea de debajo del buscador. Se anuncia al cambiar.
  const estadoDeBusqueda =
    busquedaCliente.length < LETRAS_PARA_BUSCAR
      ? `Escribe al menos ${LETRAS_PARA_BUSCAR} letras y elige de la lista.`
      : clienteElegido
        ? "Cliente elegido."
        : listaVisible
          ? `${sugerencias.length === 1 ? "1 cliente coincide" : `${sugerencias.length} clientes coinciden`}. Elige uno de la lista.`
          : "Elige un cliente de la lista."

  return (
    <MarcoDeModal titulo="Nueva cita" bloqueado={guardando} alCerrar={onCerrar}>
      <form onSubmit={onSubmit} className="space-y-5">
        {/* Búsqueda de cliente */}
        <div>
          <label htmlFor={idDelBuscador} className={cn(ETIQUETA, "mb-2")}>
            Cliente
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-texto-2"
              aria-hidden="true"
              strokeWidth={1.75}
            />
            {/* Al abrir, el foco va al buscador: es lo primero que se hace. `MarcoDeModal` anota antes quién lo abrió. */}
            <input
              ref={campoBusqueda}
              id={idDelBuscador}
              autoFocus
              type="text"
              autoComplete="off"
              placeholder="Buscar cliente..."
              value={busquedaCliente}
              aria-describedby={avisoDeBusqueda ? `${idDelEstado} ${idDelAvisoDeBusqueda}` : idDelEstado}
              onChange={(e) => {
                setBusquedaCliente(e.target.value)
                if (nombreCliente && e.target.value !== nombreCliente) {
                  onFormChange("clienteId", "")
                  setNombreCliente("")
                }
              }}
              className={cn(CAMPO, "h-12 pl-11 text-base", clienteElegido && "pr-11")}
              required
            />
            {clienteElegido && (
              <Check
                className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-navy"
                aria-hidden="true"
                strokeWidth={2}
              />
            )}
          </div>

          <p id={idDelEstado} aria-live="polite" className="mt-1.5 text-xs text-texto-2">
            {estadoDeBusqueda}
          </p>

          {avisoDeBusqueda && (
            <div role="alert" className="mt-2">
              <ErrorDeCampo id={idDelAvisoDeBusqueda}>{avisoDeBusqueda}</ErrorDeCampo>
            </div>
          )}

          {listaVisible && (
            <ul
              aria-label="Clientes que coinciden"
              className="mt-2 max-h-56 divide-y divide-borde overflow-y-auto rounded-campo bg-tarjeta inset-ring-1 inset-ring-borde squircle"
            >
              {sugerencias.map((cliente) => (
                <li key={cliente.id}>
                  <button
                    type="button"
                    className={cn(
                      "flex min-h-12 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors duration-150 ease-suave hover:bg-superficie",
                      ANILLO_HACIA_ADENTRO
                    )}
                    // Un clic que llega del teclado (Enter o Espacio) no cuenta pulsaciones: `detail` es 0.
                    onClick={(evento) => seleccionarCliente(cliente, evento.detail === 0)}
                  >
                    <User className="size-4 shrink-0 text-texto-2" aria-hidden="true" strokeWidth={1.75} />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium break-words text-navy">{cliente.nombre}</span>
                      {cliente.email && (
                        <span className="block text-xs wrap-anywhere text-texto-2">{cliente.email}</span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <CampoFormulario
          etiqueta="Servicio"
          placeholder="Ej: Corte, Color, Manicura..."
          value={form.servicio}
          onChange={(e) => onFormChange("servicio", e.target.value)}
          icono={<Scissors className="size-4" aria-hidden="true" strokeWidth={1.75} />}
          required
        />

        <CampoFormulario
          etiqueta="Fecha"
          type="date"
          value={form.fecha}
          onChange={(e) => onFormChange("fecha", e.target.value)}
          icono={<Calendar className="size-4" aria-hidden="true" strokeWidth={1.75} />}
          required
        />

        <div className="grid grid-cols-2 gap-3">
          <CampoFormulario
            etiqueta="Hora inicio"
            type="time"
            value={form.horaInicio}
            onChange={(e) => onFormChange("horaInicio", e.target.value)}
            icono={<Clock className="size-4" aria-hidden="true" strokeWidth={1.75} />}
            required
          />
          <CampoFormulario
            etiqueta="Hora fin"
            type="time"
            value={form.horaFin}
            onChange={(e) => onFormChange("horaFin", e.target.value)}
            icono={<Clock className="size-4" aria-hidden="true" strokeWidth={1.75} />}
            required
          />
        </div>

        <CampoFormulario
          etiqueta="Precio (opcional)"
          type="number"
          placeholder="0.00"
          value={form.precio}
          onChange={(e) => onFormChange("precio", e.target.value)}
          icono={<DollarSign className="size-4" aria-hidden="true" strokeWidth={1.75} />}
        />

        {puedeAsignarProfesional && avisoDeEquipo && <Aviso>{avisoDeEquipo}</Aviso>}

        {puedeAsignarProfesional && profesionales.length > 0 && (
          <Selector
            etiqueta="Profesional"
            value={form.memberId}
            onChange={(e) => onFormChange("memberId", e.target.value)}
            opciones={profesionales.map((profesional) => ({ valor: profesional.id, texto: profesional.nombre }))}
          >
            <option value="">Sin asignar</option>
          </Selector>
        )}

        <div>
          <label htmlFor={idDeNotas} className={cn(ETIQUETA, "mb-2")}>
            Notas (opcional)
          </label>
          {/* 16px de letra, como los otros campos: con menos, el teléfono acerca la pantalla al tocarlo. */}
          <textarea
            id={idDeNotas}
            value={form.notas}
            onChange={(e) => onFormChange("notas", e.target.value)}
            placeholder="Observaciones, instrucciones..."
            className={cn(CAMPO, "h-24 resize-none px-4 py-3 text-base")}
          />
        </div>

        {aviso && <Aviso>{aviso}</Aviso>}

        <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row">
          <Boton type="button" variante="secundario" className="w-full" disabled={guardando} onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton type="submit" className="w-full" cargando={guardando}>
            Guardar cita
          </Boton>
        </div>
      </form>
    </MarcoDeModal>
  )
}
