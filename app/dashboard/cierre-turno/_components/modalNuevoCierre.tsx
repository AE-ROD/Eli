"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { BotonPrimario } from "@/components/app/formularios/boton-primario"
import { PERIODOS } from "./tipos"

interface ModalNuevoCierreProps {
  abierto: boolean
  onCerrar: () => void
  onCrear: (datos: {
    shiftDate: string
    shiftPeriod?: string
    shiftStartTime?: string
    shiftEndTime?: string
  }) => Promise<void>
}

function hoyISO() {
  return new Date().toISOString().slice(0, 10)
}

export function ModalNuevoCierre({ abierto, onCerrar, onCrear }: ModalNuevoCierreProps) {
  const [shiftDate, setShiftDate] = useState(hoyISO())
  const [shiftPeriod, setShiftPeriod] = useState("Turno completo")
  const [horaInicio, setHoraInicio] = useState("")
  const [horaFin, setHoraFin] = useState("")
  const [creando, setCreando] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreando(true)
    try {
      await onCrear({
        shiftDate,
        shiftPeriod,
        shiftStartTime: horaInicio ? `${shiftDate}T${horaInicio}:00` : undefined,
        shiftEndTime: horaFin ? `${shiftDate}T${horaFin}:00` : undefined,
      })
    } finally {
      setCreando(false)
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={(open) => !open && onCerrar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo cierre de turno</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Fecha del turno</label>
            <input
              type="date"
              required
              value={shiftDate}
              onChange={(e) => setShiftDate(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Período</label>
            <Select value={shiftPeriod} onValueChange={setShiftPeriod}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERIODOS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Hora inicio (opcional)</label>
              <input
                type="time"
                value={horaInicio}
                onChange={(e) => setHoraInicio(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Hora fin (opcional)</label>
              <input
                type="time"
                value={horaFin}
                onChange={(e) => setHoraFin(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
          </div>

          <DialogFooter>
            <BotonPrimario type="button" variante="secundario" onClick={onCerrar}>
              Cancelar
            </BotonPrimario>
            <BotonPrimario type="submit" cargando={creando}>
              Iniciar cierre
            </BotonPrimario>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
