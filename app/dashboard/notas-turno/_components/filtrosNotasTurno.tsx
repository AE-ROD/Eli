"use client"

import { ChevronLeft, ChevronRight, User } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { TIPOS_NOTA, PRIORIDADES_NOTA, ESTADOS_NOTA, type MiembroOpcion } from "./tipos"

interface FiltrosNotasTurnoProps {
  fecha: string
  status: string
  type: string
  priority: string
  assignedTo: string
  soloMias: boolean
  puedeVerHistorial: boolean
  miembros: MiembroOpcion[]
  onFechaAnterior: () => void
  onFechaSiguiente: () => void
  onFechaChange: (v: string) => void
  onStatusChange: (v: string) => void
  onTypeChange: (v: string) => void
  onPriorityChange: (v: string) => void
  onAssignedToChange: (v: string) => void
  onSoloMiasChange: (v: boolean) => void
}

function formatFechaLegible(fechaISO: string) {
  const fecha = new Date(`${fechaISO}T00:00:00.000Z`)
  return fecha.toLocaleDateString("es-MX", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  })
}

export function FiltrosNotasTurno({
  fecha,
  status,
  type,
  priority,
  assignedTo,
  soloMias,
  puedeVerHistorial,
  miembros,
  onFechaAnterior,
  onFechaSiguiente,
  onFechaChange,
  onStatusChange,
  onTypeChange,
  onPriorityChange,
  onAssignedToChange,
  onSoloMiasChange,
}: FiltrosNotasTurnoProps) {
  return (
    <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-6">
      {/* Navegación de fecha */}
      <div className="flex items-center gap-1 bg-card border border-border rounded-lg p-1">
        <button
          onClick={onFechaAnterior}
          className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          aria-label="Turno anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <input
          type="date"
          value={fecha}
          disabled={!puedeVerHistorial}
          onChange={(e) => onFechaChange(e.target.value)}
          className="px-2 py-1.5 text-sm bg-transparent focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
        />
        <span className="hidden sm:inline text-xs text-muted-foreground px-1">
          {formatFechaLegible(fecha)}
        </span>
        <button
          onClick={onFechaSiguiente}
          disabled={!puedeVerHistorial}
          className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Turno siguiente"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Tipo */}
      <Select value={type || "todos"} onValueChange={(v) => onTypeChange(v === "todos" ? "" : v)}>
        <SelectTrigger className="w-full lg:w-40">
          <SelectValue placeholder="Tipo" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="todos">Todos los tipos</SelectItem>
          {TIPOS_NOTA.map((t) => (
            <SelectItem key={t.value} value={t.value}>
              {t.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Prioridad */}
      <Select value={priority || "todas"} onValueChange={(v) => onPriorityChange(v === "todas" ? "" : v)}>
        <SelectTrigger className="w-full lg:w-36">
          <SelectValue placeholder="Prioridad" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="todas">Toda prioridad</SelectItem>
          {PRIORIDADES_NOTA.map((p) => (
            <SelectItem key={p.value} value={p.value}>
              {p.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Estado */}
      <Select value={status || "todos"} onValueChange={(v) => onStatusChange(v === "todos" ? "" : v)}>
        <SelectTrigger className="w-full lg:w-40">
          <SelectValue placeholder="Estado" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="todos">Todo estado</SelectItem>
          {ESTADOS_NOTA.map((e) => (
            <SelectItem key={e.value} value={e.value}>
              {e.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Asignado */}
      <Select value={assignedTo || "todos"} onValueChange={(v) => onAssignedToChange(v === "todos" ? "" : v)}>
        <SelectTrigger className="w-full lg:w-44">
          <SelectValue placeholder="Asignado" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="todos">Cualquier asignado</SelectItem>
          {miembros.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              {m.nombre}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Solo mis notas */}
      <button
        onClick={() => onSoloMiasChange(!soloMias)}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
          soloMias
            ? "bg-primary text-primary-foreground"
            : "bg-card border border-border text-muted-foreground hover:text-foreground hover:bg-muted"
        }`}
      >
        <User className="h-4 w-4" />
        Solo mis notas
      </button>
    </div>
  )
}
