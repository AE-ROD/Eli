"use client"

import { useState, useRef, useEffect } from "react"
import { motion } from "framer-motion"
import { X, Search, User, Scissors, Calendar, Clock, DollarSign, FileText } from "lucide-react"
import { BotonPrimario } from "@/components/comunes/boton-primario"
import { CampoFormulario } from "@/components/comunes/campo-formulario"
import {
  buscarClientes,
  leerProfesionales,
  type ClienteSugerido,
  type DatosDeNuevaCita,
  type Profesional,
} from "../_datos"

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
    if (!busquedaCliente || busquedaCliente.length < 2) {
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

  function seleccionarCliente(cliente: ClienteSugerido) {
    onFormChange("clienteId", cliente.id)
    setNombreCliente(cliente.nombre)
    setBusquedaCliente(cliente.nombre)
    setMostrarSugerencias(false)
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-foreground/20 backdrop-blur-sm" onClick={onCerrar} />
      <motion.div
        className="relative bg-card rounded-xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-foreground">Nueva cita</h2>
          <button onClick={onCerrar} className="p-1 rounded-lg hover:bg-muted transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          {/* Búsqueda de cliente */}
          <div className="relative">
            <label className="block text-sm font-medium text-foreground mb-1.5">Cliente</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar cliente..."
                value={busquedaCliente}
                onChange={(e) => {
                  setBusquedaCliente(e.target.value)
                  if (nombreCliente && e.target.value !== nombreCliente) {
                    onFormChange("clienteId", "")
                    setNombreCliente("")
                  }
                }}
                className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                required
              />
            </div>
            {avisoDeBusqueda && (
              <p role="alert" className="text-sm text-red-500 mt-1.5">
                {avisoDeBusqueda}
              </p>
            )}
            {mostrarSugerencias && sugerencias.length > 0 && (
              <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-card border border-border rounded-lg shadow-lg overflow-hidden">
                {sugerencias.map((cliente) => (
                  <button
                    key={cliente.id}
                    type="button"
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted text-left transition-colors"
                    onClick={() => seleccionarCliente(cliente)}
                  >
                    <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-foreground">{cliente.nombre}</p>
                      {cliente.email && <p className="text-xs text-muted-foreground">{cliente.email}</p>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <CampoFormulario
            etiqueta="Servicio"
            placeholder="Ej: Corte, Color, Manicura..."
            value={form.servicio}
            onChange={(e) => onFormChange("servicio", e.target.value)}
            icono={<Scissors className="h-4 w-4" />}
            required
          />

          <CampoFormulario
            etiqueta="Fecha"
            type="date"
            value={form.fecha}
            onChange={(e) => onFormChange("fecha", e.target.value)}
            icono={<Calendar className="h-4 w-4" />}
            required
          />

          <div className="grid grid-cols-2 gap-3">
            <CampoFormulario
              etiqueta="Hora inicio"
              type="time"
              value={form.horaInicio}
              onChange={(e) => onFormChange("horaInicio", e.target.value)}
              icono={<Clock className="h-4 w-4" />}
              required
            />
            <CampoFormulario
              etiqueta="Hora fin"
              type="time"
              value={form.horaFin}
              onChange={(e) => onFormChange("horaFin", e.target.value)}
              icono={<Clock className="h-4 w-4" />}
              required
            />
          </div>

          <CampoFormulario
            etiqueta="Precio (opcional)"
            type="number"
            placeholder="0.00"
            value={form.precio}
            onChange={(e) => onFormChange("precio", e.target.value)}
            icono={<DollarSign className="h-4 w-4" />}
          />

          {puedeAsignarProfesional && avisoDeEquipo && (
            <p role="alert" className="text-sm text-red-500">
              {avisoDeEquipo}
            </p>
          )}

          {puedeAsignarProfesional && profesionales.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                <span className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Profesional
                </span>
              </label>
              <select
                value={form.memberId}
                onChange={(e) => onFormChange("memberId", e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              >
                <option value="">Sin asignar</option>
                {profesionales.map((profesional) => (
                  <option key={profesional.id} value={profesional.id}>{profesional.nombre}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              <span className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Notas (opcional)
              </span>
            </label>
            <textarea
              value={form.notas}
              onChange={(e) => onFormChange("notas", e.target.value)}
              placeholder="Observaciones, instrucciones..."
              className="w-full p-3 rounded-lg border border-border bg-background text-sm resize-none h-20 focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          {aviso && (
            <p role="alert" className="text-sm text-red-500">
              {aviso}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <BotonPrimario type="button" variante="secundario" anchoCompleto onClick={onCerrar}>
              Cancelar
            </BotonPrimario>
            <BotonPrimario type="submit" anchoCompleto cargando={guardando}>
              Guardar cita
            </BotonPrimario>
          </div>
        </form>
      </motion.div>
    </motion.div>
  )
}
