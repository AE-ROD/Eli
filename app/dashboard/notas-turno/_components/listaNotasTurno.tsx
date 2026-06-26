"use client"

import {
  AlertTriangle,
  Eye,
  ArrowRightLeft,
  Bell,
  ClipboardList,
  Circle,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import type { NotaTurnoAPI, TipoNota } from "./tipos"

interface ListaNotasTurnoProps {
  notas: NotaTurnoAPI[]
  cargando: boolean
  memberIdActual: string
  notaSeleccionadaId: string | null
  onSeleccionar: (nota: NotaTurnoAPI) => void
}

const GRUPOS: { tipo: TipoNota; titulo: string; icono: typeof ClipboardList }[] = [
  { tipo: "PENDIENTE", titulo: "Pendientes", icono: ClipboardList },
  { tipo: "INCIDENTE", titulo: "Incidentes", icono: AlertTriangle },
  { tipo: "OBSERVACION", titulo: "Observaciones", icono: Eye },
  { tipo: "TRANSFERENCIA", titulo: "Transferencias", icono: ArrowRightLeft },
  { tipo: "RECORDATORIO", titulo: "Recordatorios", icono: Bell },
]

function formatearTiempoRelativo(fechaStr: string): string {
  const diffMs = Date.now() - new Date(fechaStr).getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return "Ahora"
  if (diffMin < 60) return `Hace ${diffMin} min`
  const diffHoras = Math.floor(diffMin / 60)
  if (diffHoras < 24) return `Hace ${diffHoras} h`
  const diffDias = Math.floor(diffHoras / 24)
  return `Hace ${diffDias} d`
}

function badgePrioridad(prioridad: NotaTurnoAPI["priority"]) {
  if (prioridad === "URGENTE") {
    return <Badge variant="destructive">Urgente</Badge>
  }
  if (prioridad === "ALTA") {
    return <Badge className="bg-amber-100 text-amber-700 border-transparent hover:bg-amber-100">Alta</Badge>
  }
  return <Badge variant="outline">Normal</Badge>
}

function badgeEstado(estado: NotaTurnoAPI["status"]) {
  const estilos: Record<NotaTurnoAPI["status"], string> = {
    ACTIVA: "bg-blue-100 text-blue-700",
    EN_PROGRESO: "bg-purple-100 text-purple-700",
    RESUELTA: "bg-green-100 text-green-700",
    TRANSFERIDA: "bg-orange-100 text-orange-700",
    ARCHIVADA: "bg-gray-100 text-gray-600",
  }
  const labels: Record<NotaTurnoAPI["status"], string> = {
    ACTIVA: "Activa",
    EN_PROGRESO: "En progreso",
    RESUELTA: "Resuelta",
    TRANSFERIDA: "Transferida",
    ARCHIVADA: "Archivada",
  }
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${estilos[estado]}`}>
      {labels[estado]}
    </span>
  )
}

export function ListaNotasTurno({
  notas,
  cargando,
  memberIdActual,
  notaSeleccionadaId,
  onSeleccionar,
}: ListaNotasTurnoProps) {
  if (cargando) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 bg-card border border-border/50 rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  if (notas.length === 0) {
    return (
      <div className="bg-card border border-border/50 rounded-xl p-12 text-center">
        <ClipboardList className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
        <p className="text-muted-foreground">No hay notas de turno para este filtro</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {GRUPOS.map(({ tipo, titulo, icono: Icono }) => {
        const notasGrupo = notas.filter((n) => n.type === tipo)
        if (notasGrupo.length === 0) return null

        return (
          <div key={tipo}>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground mb-3">
              <Icono className="h-4 w-4 text-muted-foreground" />
              {titulo}
              <span className="text-muted-foreground font-normal">({notasGrupo.length})</span>
            </h3>
            <div className="space-y-2">
              {notasGrupo.map((nota) => {
                const noVista = !nota.seenBy.includes(memberIdActual)
                const seleccionada = nota.id === notaSeleccionadaId
                return (
                  <button
                    key={nota.id}
                    onClick={() => onSeleccionar(nota)}
                    className={`w-full text-left p-4 rounded-xl border transition-colors ${
                      seleccionada
                        ? "border-primary bg-primary/5"
                        : "border-border/50 bg-card hover:bg-muted/50"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {noVista && (
                        <Circle className="h-2 w-2 mt-1.5 flex-shrink-0 fill-primary text-primary" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <h4 className="font-medium text-foreground truncate">{nota.title}</h4>
                          {badgePrioridad(nota.priority)}
                          {badgeEstado(nota.status)}
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-2 mb-2">{nota.content}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{nota.author.user.name}</span>
                          <span>·</span>
                          <span>{formatearTiempoRelativo(nota.createdAt)}</span>
                          {nota.assignee && (
                            <>
                              <span>·</span>
                              <span>Asignado a {nota.assignee.user.name}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
