import type { PermissionSet } from "@/lib/permissions/types"

export type TipoNota = "INCIDENTE" | "OBSERVACION" | "PENDIENTE" | "TRANSFERENCIA" | "RECORDATORIO"
export type PrioridadNota = "NORMAL" | "ALTA" | "URGENTE"
export type EstadoNota = "ACTIVA" | "EN_PROGRESO" | "RESUELTA" | "TRANSFERIDA" | "ARCHIVADA"

export interface MiembroResumen {
  id: string
  rol: string
  user: { id: string; name: string }
}

export interface NotaTurnoAPI {
  id: string
  businessId: string
  authorId: string
  author: MiembroResumen
  assignedTo: string | null
  assignee: MiembroResumen | null
  resolvedBy: string | null
  resolver?: MiembroResumen | null
  type: TipoNota
  priority: PrioridadNota
  status: EstadoNota
  title: string
  content: string
  tags: string[]
  shiftDate: string
  shiftPeriod: string | null
  resolvedAt: string | null
  transferredToDate: string | null
  seenBy: string[]
  createdAt: string
  updatedAt: string
}

export interface MiembroOpcion {
  id: string
  nombre: string
  rol: string
}

export const TIPOS_NOTA: { value: TipoNota; label: string }[] = [
  { value: "PENDIENTE", label: "Pendiente" },
  { value: "INCIDENTE", label: "Incidente" },
  { value: "OBSERVACION", label: "Observación" },
  { value: "TRANSFERENCIA", label: "Transferencia" },
  { value: "RECORDATORIO", label: "Recordatorio" },
]

export const PRIORIDADES_NOTA: { value: PrioridadNota; label: string }[] = [
  { value: "NORMAL", label: "Normal" },
  { value: "ALTA", label: "Alta" },
  { value: "URGENTE", label: "Urgente" },
]

export const ESTADOS_NOTA: { value: EstadoNota; label: string }[] = [
  { value: "ACTIVA", label: "Activa" },
  { value: "EN_PROGRESO", label: "En progreso" },
  { value: "RESUELTA", label: "Resuelta" },
  { value: "TRANSFERIDA", label: "Transferida" },
  { value: "ARCHIVADA", label: "Archivada" },
]

export const PERIODOS_TURNO: { value: string; label: string }[] = [
  { value: "Mañana", label: "Mañana" },
  { value: "Tarde", label: "Tarde" },
  { value: "Noche", label: "Noche" },
]

export const TAGS_DISPONIBLES = [
  "caja",
  "cliente",
  "equipamiento",
  "seguridad",
  "limpieza",
  "salud",
  "otros",
] as const

export type PermissionSetShiftNotes = PermissionSet["shiftNotes"]
