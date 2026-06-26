"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { X, AlertTriangle, Eye, ClipboardList, ArrowRightLeft, Bell } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { BotonPrimario } from "@/components/app/formularios/boton-primario"
import { CampoFormulario } from "@/components/app/formularios/campo-formulario"
import {
  TIPOS_NOTA,
  PRIORIDADES_NOTA,
  PERIODOS_TURNO,
  TAGS_DISPONIBLES,
  type TipoNota,
  type PrioridadNota,
  type MiembroOpcion,
} from "./tipos"

export interface FormNuevaNota {
  type: TipoNota
  priority: PrioridadNota
  title: string
  content: string
  tags: string[]
  shiftPeriod: string
  assignedTo: string
}

interface ModalNuevaNotaProps {
  miembros: MiembroOpcion[]
  guardando: boolean
  onSubmit: (form: FormNuevaNota) => void
  onCerrar: () => void
}

const ICONOS_TIPO: Record<TipoNota, typeof ClipboardList> = {
  PENDIENTE: ClipboardList,
  INCIDENTE: AlertTriangle,
  OBSERVACION: Eye,
  TRANSFERENCIA: ArrowRightLeft,
  RECORDATORIO: Bell,
}

export function ModalNuevaNota({ miembros, guardando, onSubmit, onCerrar }: ModalNuevaNotaProps) {
  const [form, setForm] = useState<FormNuevaNota>({
    type: "OBSERVACION",
    priority: "NORMAL",
    title: "",
    content: "",
    tags: [],
    shiftPeriod: "",
    assignedTo: "",
  })

  const toggleTag = (tag: string) => {
    setForm((prev) => ({
      ...prev,
      tags: prev.tags.includes(tag) ? prev.tags.filter((t) => t !== tag) : [...prev.tags, tag],
    }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (form.title.trim().length < 3 || form.content.trim().length < 10) return
    onSubmit(form)
  }

  const IconoTipo = ICONOS_TIPO[form.type]

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-foreground/20 backdrop-blur-sm" onClick={onCerrar} />
      <motion.div
        className="relative bg-card rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-foreground">Nueva Nota de Turno</h2>
          <button onClick={onCerrar} className="p-1 rounded-lg hover:bg-muted transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Tipo</label>
              <Select value={form.type} onValueChange={(v) => setForm((p) => ({ ...p, type: v as TipoNota }))}>
                <SelectTrigger className="w-full">
                  <IconoTipo className="h-4 w-4" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS_NOTA.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Prioridad</label>
              <Select
                value={form.priority}
                onValueChange={(v) => setForm((p) => ({ ...p, priority: v as PrioridadNota }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORIDADES_NOTA.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <CampoFormulario
            etiqueta="Título"
            placeholder="Resumen breve de la nota"
            value={form.title}
            onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
            maxLength={120}
            required
          />

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Contenido</label>
            <textarea
              value={form.content}
              onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))}
              placeholder="Describe la situación con detalle..."
              maxLength={2000}
              required
              className="w-full p-3 rounded-lg border border-border bg-background text-sm resize-none h-28 focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <p className="text-xs text-muted-foreground text-right">{form.content.length}/2000</p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Tags</label>
            <div className="flex flex-wrap gap-2">
              {TAGS_DISPONIBLES.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    form.tags.includes(tag)
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Período del turno</label>
              <Select
                value={form.shiftPeriod || "ninguno"}
                onValueChange={(v) => setForm((p) => ({ ...p, shiftPeriod: v === "ninguno" ? "" : v }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Sin período" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ninguno">Sin período</SelectItem>
                  {PERIODOS_TURNO.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Asignar a</label>
              <Select
                value={form.assignedTo || "nadie"}
                onValueChange={(v) => setForm((p) => ({ ...p, assignedTo: v === "nadie" ? "" : v }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Sin asignar" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nadie">Sin asignar</SelectItem>
                  {miembros.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <BotonPrimario type="button" variante="secundario" anchoCompleto onClick={onCerrar}>
              Cancelar
            </BotonPrimario>
            <BotonPrimario type="submit" anchoCompleto cargando={guardando}>
              Crear Nota
            </BotonPrimario>
          </div>
        </form>
      </motion.div>
    </motion.div>
  )
}
