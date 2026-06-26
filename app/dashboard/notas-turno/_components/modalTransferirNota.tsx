"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { X, ArrowRightLeft } from "lucide-react"
import { BotonPrimario } from "@/components/app/formularios/boton-primario"

interface ModalTransferirNotaProps {
  fechaActual: string
  onConfirmar: (nuevaFecha: string) => void
  onCerrar: () => void
}

function sumarDias(fechaISO: string, dias: number): string {
  const fecha = new Date(`${fechaISO}T00:00:00.000Z`)
  fecha.setUTCDate(fecha.getUTCDate() + dias)
  return fecha.toISOString().slice(0, 10)
}

export function ModalTransferirNota({ fechaActual, onConfirmar, onCerrar }: ModalTransferirNotaProps) {
  const [fechaDestino, setFechaDestino] = useState(sumarDias(fechaActual, 1))
  const [confirmando, setConfirmando] = useState(false)

  const handleConfirmar = () => {
    setConfirmando(true)
    onConfirmar(fechaDestino)
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
        className="relative bg-card rounded-xl shadow-xl w-full max-w-sm p-6"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5" />
            Transferir Nota
          </h2>
          <button onClick={onCerrar} className="p-1 rounded-lg hover:bg-muted transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Fecha destino</label>
            <input
              type="date"
              value={fechaDestino}
              onChange={(e) => setFechaDestino(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>
          <p className="text-sm text-muted-foreground">
            La nota se marcará como transferida y quedará vinculada al turno del{" "}
            {new Date(`${fechaDestino}T00:00:00.000Z`).toLocaleDateString("es-MX", { timeZone: "UTC" })}.
          </p>

          <div className="flex gap-3 pt-2">
            <BotonPrimario variante="secundario" anchoCompleto onClick={onCerrar}>
              Cancelar
            </BotonPrimario>
            <BotonPrimario anchoCompleto cargando={confirmando} onClick={handleConfirmar}>
              Confirmar
            </BotonPrimario>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
