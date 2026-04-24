"use client"

import { useState } from "react"
import { Clock, Save } from "lucide-react"
import { BotonPrimario } from "@/components/eli/app/boton-primario"

export interface HorarioAPI {
  id?: string
  dayOfWeek: number
  startTime: string
  endTime: string
  active: boolean
}

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"]
const DIAS_CORTO = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"]

const HORARIO_INICIAL: HorarioAPI[] = DIAS.map((_, i) => ({
  dayOfWeek: i,
  startTime: "09:00",
  endTime: "18:00",
  active: i >= 1 && i <= 5, // Lun-Vie activos por defecto
}))

interface SeccionHorarioProps {
  horariosIniciales: HorarioAPI[]
}

export function SeccionHorario({ horariosIniciales }: SeccionHorarioProps) {
  const [horarios, setHorarios] = useState<HorarioAPI[]>(() => {
    if (horariosIniciales.length === 0) return HORARIO_INICIAL
    return DIAS.map((_, i) => {
      const existente = horariosIniciales.find((h) => h.dayOfWeek === i)
      return existente ?? { dayOfWeek: i, startTime: "09:00", endTime: "18:00", active: false }
    })
  })
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)

  const toggleDia = (idx: number) => {
    setHorarios((prev) =>
      prev.map((h) => (h.dayOfWeek === idx ? { ...h, active: !h.active } : h))
    )
    setGuardado(false)
  }

  const cambiarHora = (idx: number, campo: "startTime" | "endTime", valor: string) => {
    setHorarios((prev) =>
      prev.map((h) => (h.dayOfWeek === idx ? { ...h, [campo]: valor } : h))
    )
    setGuardado(false)
  }

  const guardar = async () => {
    setGuardando(true)
    try {
      const res = await fetch("/api/configuracion/horarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(horarios),
      })
      if (res.ok) setGuardado(true)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="bg-card border border-border/50 rounded-xl p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Clock className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="font-semibold text-foreground">Horario laboral</h2>
            <p className="text-sm text-muted-foreground">Define los días y horas en que atiendes</p>
          </div>
        </div>
        <BotonPrimario
          tamaño="sm"
          icono={<Save className="h-4 w-4" />}
          cargando={guardando}
          onClick={guardar}
          variante={guardado ? "secundario" : "primario"}
        >
          {guardado ? "Guardado" : "Guardar"}
        </BotonPrimario>
      </div>

      <div className="space-y-3">
        {horarios.map((horario) => (
          <div
            key={horario.dayOfWeek}
            className={`flex items-center gap-4 p-4 rounded-xl border transition-all ${
              horario.active
                ? "border-primary/20 bg-primary/5"
                : "border-border/50 bg-muted/30 opacity-60"
            }`}
          >
            {/* Toggle día */}
            <button
              onClick={() => toggleDia(horario.dayOfWeek)}
              className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
                horario.active ? "bg-primary" : "bg-muted-foreground/30"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  horario.active ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>

            {/* Nombre del día */}
            <span className={`w-24 font-medium text-sm ${horario.active ? "text-foreground" : "text-muted-foreground"}`}>
              <span className="hidden sm:inline">{DIAS[horario.dayOfWeek]}</span>
              <span className="sm:hidden">{DIAS_CORTO[horario.dayOfWeek]}</span>
            </span>

            {/* Horas */}
            {horario.active ? (
              <div className="flex items-center gap-3 flex-1">
                <input
                  type="time"
                  value={horario.startTime}
                  onChange={(e) => cambiarHora(horario.dayOfWeek, "startTime", e.target.value)}
                  className="px-3 py-1.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                <span className="text-muted-foreground text-sm">hasta</span>
                <input
                  type="time"
                  value={horario.endTime}
                  onChange={(e) => cambiarHora(horario.dayOfWeek, "endTime", e.target.value)}
                  className="px-3 py-1.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">No disponible</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
