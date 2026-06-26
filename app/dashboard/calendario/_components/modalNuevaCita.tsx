"use client"

import { useState, useRef, useEffect } from "react"
import { motion } from "framer-motion"
import { X, Search, User, Stethoscope, Calendar, Clock, DollarSign, FileText, CreditCard, Gift } from "lucide-react"
import { BotonPrimario } from "@/components/app/formularios/boton-primario"
import { CampoFormulario } from "@/components/app/formularios/campo-formulario"

export const METODOS_PAGO = [
  { value: "EFECTIVO", label: "Efectivo" },
  { value: "DEBITO", label: "Débito" },
  { value: "CREDITO", label: "Crédito" },
  { value: "TRANSFERENCIA", label: "Transferencia" },
  { value: "CORTESIA", label: "Cortesía" },
  { value: "GARANTIA", label: "Garantía" },
  { value: "GIFTCARD", label: "Gift Card" },
  { value: "REEMBOLSO", label: "Reembolso" },
  { value: "FIDELIZACION", label: "Tarjeta de Fidelización" },
  { value: "INTERCAMBIO", label: "Intercambio de Servicio" },
  { value: "dividido", label: "Pago Dividido" },
] as const

export interface FormNuevaCita {
  pacienteId: string
  servicio: string
  fecha: string
  horaInicio: string
  horaFin: string
  precio: string
  notas: string
  metodoPago: string
  propina: string
  metodoPago2: string
  monto2: string
}

interface PacienteSugerido {
  id: string
  nombre: string
  email: string
}

interface ModalNuevaCitaProps {
  form: FormNuevaCita
  guardando: boolean
  onFormChange: (campo: keyof FormNuevaCita, valor: string) => void
  onSubmit: (e: React.SyntheticEvent<HTMLFormElement>) => void
  onCerrar: () => void
  pacienteInicial?: { id: string; nombre: string }
}

export function ModalNuevaCita({ form, guardando, onFormChange, onSubmit, onCerrar, pacienteInicial }: ModalNuevaCitaProps) {
  const [busquedaPaciente, setBusquedaPaciente] = useState(pacienteInicial?.nombre ?? "")
  const [sugerencias, setSugerencias] = useState<PacienteSugerido[]>([])
  const [pacienteNombre, setPacienteNombre] = useState(pacienteInicial?.nombre ?? "")
  const [showSugerencias, setShowSugerencias] = useState(false)

  useEffect(() => {
    if (pacienteInicial) {
      setBusquedaPaciente(pacienteInicial.nombre)
      setPacienteNombre(pacienteInicial.nombre)
      onFormChange("pacienteId", pacienteInicial.id)
    }
  // Solo al montar
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!busquedaPaciente || busquedaPaciente.length < 2) {
      setSugerencias([])
      return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/pacientes?q=${encodeURIComponent(busquedaPaciente)}&limite=8`)
        const data = await res.json()
        setSugerencias(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (data.pacientes ?? []).map((p: any) => ({ id: p.id, nombre: p.name, email: p.email ?? "" }))
        )
        setShowSugerencias(true)
      } catch { /* silencioso */ }
    }, 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [busquedaPaciente])

  function seleccionarPaciente(p: PacienteSugerido) {
    onFormChange("pacienteId", p.id)
    setPacienteNombre(p.nombre)
    setBusquedaPaciente(p.nombre)
    setShowSugerencias(false)
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
          {/* Búsqueda de usuario */}
          <div className="relative">
            <label className="block text-sm font-medium text-foreground mb-1.5">Usuario</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar usuario..."
                value={busquedaPaciente}
                onChange={(e) => {
                  setBusquedaPaciente(e.target.value)
                  if (pacienteNombre && e.target.value !== pacienteNombre) {
                    onFormChange("pacienteId", "")
                    setPacienteNombre("")
                  }
                }}
                className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                required
              />
            </div>
            {showSugerencias && sugerencias.length > 0 && (
              <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-card border border-border rounded-lg shadow-lg overflow-hidden">
                {sugerencias.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted text-left transition-colors"
                    onClick={() => seleccionarPaciente(p)}
                  >
                    <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-foreground">{p.nombre}</p>
                      {p.email && <p className="text-xs text-muted-foreground">{p.email}</p>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <CampoFormulario
            etiqueta="Servicio"
            placeholder="Ej: Consulta, Corte, Masaje..."
            value={form.servicio}
            onChange={(e) => onFormChange("servicio", e.target.value)}
            icono={<Stethoscope className="h-4 w-4" />}
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

          {/* Método de pago */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              <span className="flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                Método de pago (opcional)
              </span>
            </label>
            <select
              value={form.metodoPago}
              onChange={(e) => {
                onFormChange("metodoPago", e.target.value)
                if (e.target.value !== "dividido") {
                  onFormChange("metodoPago2", "")
                  onFormChange("monto2", "")
                }
              }}
              className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            >
              <option value="">Sin especificar</option>
              {METODOS_PAGO.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          {/* Pago dividido */}
          {form.metodoPago === "dividido" && (
            <div className="p-3 rounded-lg border border-border bg-muted/30 space-y-3">
              <p className="text-xs text-muted-foreground font-medium">Segundo método de pago</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">Método</label>
                  <select
                    value={form.metodoPago2}
                    onChange={(e) => onFormChange("metodoPago2", e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="">Seleccionar...</option>
                    {METODOS_PAGO.filter((m) => m.value !== "dividido").map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </div>
                <CampoFormulario
                  etiqueta="Monto"
                  type="number"
                  placeholder="0"
                  value={form.monto2}
                  onChange={(e) => onFormChange("monto2", e.target.value)}
                  icono={<DollarSign className="h-4 w-4" />}
                />
              </div>
            </div>
          )}

          {/* Propina */}
          <CampoFormulario
            etiqueta="Propina (opcional)"
            type="number"
            placeholder="0"
            value={form.propina}
            onChange={(e) => onFormChange("propina", e.target.value)}
            icono={<Gift className="h-4 w-4" />}
          />

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
