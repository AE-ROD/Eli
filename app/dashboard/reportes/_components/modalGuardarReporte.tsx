"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, Save } from "lucide-react"
import { BotonPrimario } from "@/components/app/formularios/boton-primario"
import { CampoFormulario } from "@/components/app/formularios/campo-formulario"

interface Props {
  abierto: boolean
  onCerrar: () => void
  reportType: string
  filters: Record<string, unknown>
  onGuardado: () => void
}

export function ModalGuardarReporte({ abierto, onCerrar, reportType, filters, onGuardado }: Props) {
  const [nombre, setNombre] = useState("")
  const [descripcion, setDescripcion] = useState("")
  const [error, setError] = useState("")
  const [guardando, setGuardando] = useState(false)

  const cerrar = () => {
    setNombre("")
    setDescripcion("")
    setError("")
    setGuardando(false)
    onCerrar()
  }

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (!nombre.trim()) {
      setError("El nombre es requerido")
      return
    }

    setGuardando(true)

    const res = await fetch("/api/reports/saved", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: nombre,
        description: descripcion || undefined,
        reportType,
        filters,
      }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? "Error al guardar el reporte")
      setGuardando(false)
      return
    }

    setGuardando(false)
    onGuardado()
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
            className="relative bg-card rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
          >
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border/50">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-primary/10">
                  <Save className="h-5 w-5 text-primary" />
                </div>
                <h2 className="text-lg font-bold text-foreground">Guardar reporte</h2>
              </div>
              <button onClick={cerrar} className="p-1 rounded-lg hover:bg-muted transition-colors">
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>

            <form onSubmit={enviar} className="px-6 py-6 space-y-5">
              <CampoFormulario
                etiqueta="Nombre"
                type="text"
                placeholder="Ej. Ingresos mensuales por trabajador"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                required
              />
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Descripción (opcional)</label>
                <textarea
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-3 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-200"
                  placeholder="Notas sobre este reporte..."
                />
              </div>

              {error && <p className="text-sm text-red-500">{error}</p>}

              <BotonPrimario type="submit" anchoCompleto cargando={guardando} icono={<Save className="h-4 w-4" />}>
                Guardar con filtros actuales
              </BotonPrimario>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
