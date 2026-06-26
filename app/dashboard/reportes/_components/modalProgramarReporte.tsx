"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, CalendarClock, Plus, Trash2, Mail } from "lucide-react"
import { BotonPrimario } from "@/components/app/formularios/boton-primario"
import { CampoFormulario } from "@/components/app/formularios/campo-formulario"

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"]

interface Props {
  abierto: boolean
  onCerrar: () => void
  reportType: string
  filters: Record<string, unknown>
  onProgramado: () => void
}

export function ModalProgramarReporte({ abierto, onCerrar, reportType, filters, onProgramado }: Props) {
  const [nombre, setNombre] = useState("")
  const [frecuencia, setFrecuencia] = useState<"DIARIO" | "SEMANAL" | "MENSUAL">("SEMANAL")
  const [diaSemana, setDiaSemana] = useState(1)
  const [diaMes, setDiaMes] = useState(1)
  const [horaEnvio, setHoraEnvio] = useState("08:00")
  const [destinatarios, setDestinatarios] = useState<string[]>([])
  const [nuevoEmail, setNuevoEmail] = useState("")
  const [error, setError] = useState("")
  const [enviando, setEnviando] = useState(false)

  const resetear = () => {
    setNombre("")
    setFrecuencia("SEMANAL")
    setDiaSemana(1)
    setDiaMes(1)
    setHoraEnvio("08:00")
    setDestinatarios([])
    setNuevoEmail("")
    setError("")
    setEnviando(false)
  }

  const cerrar = () => {
    resetear()
    onCerrar()
  }

  const agregarEmail = () => {
    const email = nuevoEmail.trim()
    if (!email) return
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Email inválido")
      return
    }
    if (destinatarios.includes(email)) {
      setNuevoEmail("")
      return
    }
    setDestinatarios([...destinatarios, email])
    setNuevoEmail("")
    setError("")
  }

  const quitarEmail = (email: string) => {
    setDestinatarios(destinatarios.filter((e) => e !== email))
  }

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (!nombre.trim()) {
      setError("El nombre es requerido")
      return
    }
    if (destinatarios.length === 0) {
      setError("Agrega al menos un destinatario")
      return
    }

    setEnviando(true)

    const res = await fetch("/api/reports/scheduled", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: nombre,
        reportType,
        filters,
        frequency: frecuencia,
        dayOfWeek: frecuencia === "SEMANAL" ? diaSemana : undefined,
        dayOfMonth: frecuencia === "MENSUAL" ? diaMes : undefined,
        sendTime: horaEnvio,
        recipients: destinatarios,
      }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? "Error al programar el reporte")
      setEnviando(false)
      return
    }

    setEnviando(false)
    onProgramado()
    cerrar()
  }

  return (
    <AnimatePresence>
      {abierto && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-foreground/20 backdrop-blur-sm" onClick={cerrar} />

          <motion.div
            className="relative bg-card rounded-2xl shadow-2xl w-full max-w-md overflow-hidden max-h-[90vh] overflow-y-auto"
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
          >
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border/50">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-primary/10">
                  <CalendarClock className="h-5 w-5 text-primary" />
                </div>
                <h2 className="text-lg font-bold text-foreground">Programar reporte</h2>
              </div>
              <button onClick={cerrar} className="p-1 rounded-lg hover:bg-muted transition-colors">
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>

            <form onSubmit={enviar} className="px-6 py-6 space-y-5">
              <CampoFormulario
                etiqueta="Nombre del reporte programado"
                type="text"
                placeholder="Ej. Ingresos semanales"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                required
              />

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Frecuencia</label>
                <div className="grid grid-cols-3 gap-2">
                  {(["DIARIO", "SEMANAL", "MENSUAL"] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFrecuencia(f)}
                      className={`py-2 rounded-lg text-sm font-medium border-2 transition-colors ${
                        frecuencia === f
                          ? "border-primary bg-primary/5 text-primary"
                          : "border-border text-muted-foreground hover:border-primary/40"
                      }`}
                    >
                      {f === "DIARIO" ? "Diario" : f === "SEMANAL" ? "Semanal" : "Mensual"}
                    </button>
                  ))}
                </div>
              </div>

              {frecuencia === "SEMANAL" && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Día de la semana</label>
                  <select
                    value={diaSemana}
                    onChange={(e) => setDiaSemana(Number(e.target.value))}
                    className="w-full px-4 py-3 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  >
                    {DIAS.map((d, i) => (
                      <option key={i} value={i}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {frecuencia === "MENSUAL" && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Día del mes</label>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={diaMes}
                    onChange={(e) => setDiaMes(Number(e.target.value))}
                    className="w-full px-4 py-3 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>
              )}

              <CampoFormulario
                etiqueta="Hora de envío"
                type="time"
                value={horaEnvio}
                onChange={(e) => setHoraEnvio(e.target.value)}
                required
              />

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Destinatarios</label>
                <div className="flex gap-2">
                  <input
                    type="email"
                    placeholder="correo@ejemplo.com"
                    value={nuevoEmail}
                    onChange={(e) => setNuevoEmail(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        agregarEmail()
                      }
                    }}
                    className="flex-1 px-4 py-2.5 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                  <button
                    type="button"
                    onClick={agregarEmail}
                    className="px-3 rounded-lg bg-muted hover:bg-muted/80 transition-colors"
                  >
                    <Plus className="h-4 w-4 text-foreground" />
                  </button>
                </div>
                {destinatarios.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    {destinatarios.map((email) => (
                      <div
                        key={email}
                        className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-muted text-sm"
                      >
                        <span className="flex items-center gap-2 text-foreground truncate">
                          <Mail className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                          {email}
                        </span>
                        <button
                          type="button"
                          onClick={() => quitarEmail(email)}
                          className="text-muted-foreground hover:text-destructive transition-colors flex-shrink-0"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {error && <p className="text-sm text-red-500">{error}</p>}

              <BotonPrimario type="submit" anchoCompleto cargando={enviando} icono={<CalendarClock className="h-4 w-4" />}>
                Programar reporte
              </BotonPrimario>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
