"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { X, CheckCircle2, ArrowRightLeft, Pencil, Trash2, Tag as TagIcon, Eye } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { BotonPrimario } from "@/components/app/formularios/boton-primario"
import { AvatarUsuario } from "@/components/app/comunes/avatar-usuario"
import type { NotaTurnoAPI, MiembroOpcion, PermissionSetShiftNotes } from "./tipos"

interface PanelDetalleNotaProps {
  nota: NotaTurnoAPI
  permisos: PermissionSetShiftNotes
  memberIdActual: string
  miembros: MiembroOpcion[]
  onCerrar: () => void
  onResolver: () => void
  onTransferir: () => void
  onEliminar: () => void
  onActualizar: (cambios: Record<string, unknown>) => Promise<boolean>
}

function formatFechaHora(fechaStr: string) {
  return new Date(fechaStr).toLocaleString("es-MX", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function PanelDetalleNota({
  nota,
  permisos,
  memberIdActual,
  miembros,
  onCerrar,
  onResolver,
  onTransferir,
  onEliminar,
  onActualizar,
}: PanelDetalleNotaProps) {
  const [editando, setEditando] = useState(false)
  const [titulo, setTitulo] = useState(nota.title)
  const [contenido, setContenido] = useState(nota.content)
  const [guardando, setGuardando] = useState(false)
  const [confirmandoEliminar, setConfirmandoEliminar] = useState(false)

  const esAutor = nota.authorId === memberIdActual
  const puedeEditar = permisos.editAll || (permisos.edit && esAutor && nota.status === "ACTIVA")
  const puedeResolver = permisos.resolve && nota.status !== "RESUELTA"
  const puedeTransferir = (permisos.editAll || (permisos.edit && esAutor)) && nota.status !== "TRANSFERIDA"
  const puedeEliminar = permisos.delete

  const vistoPor = miembros.filter((m) => nota.seenBy.includes(m.id))

  const guardarEdicion = async () => {
    setGuardando(true)
    const ok = await onActualizar({ title: titulo, content: contenido })
    setGuardando(false)
    if (ok) setEditando(false)
  }

  return (
    <motion.aside
      className="w-96 bg-card border border-border/50 rounded-xl overflow-hidden hidden lg:flex lg:flex-col flex-shrink-0"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
    >
      <div className="relative bg-primary/5 p-6 pb-4 flex-shrink-0">
        <button
          onClick={onCerrar}
          className="absolute top-4 right-4 p-1 rounded-lg hover:bg-background/50 transition-colors"
        >
          <X className="h-5 w-5 text-muted-foreground" />
        </button>
        <div className="flex items-center gap-2 mb-2">
          <Badge variant={nota.priority === "URGENTE" ? "destructive" : "outline"}>
            {nota.priority === "URGENTE" ? "Urgente" : nota.priority === "ALTA" ? "Alta" : "Normal"}
          </Badge>
          <span className="text-xs text-muted-foreground">{nota.type}</span>
        </div>
        {editando ? (
          <input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            className="w-full text-lg font-bold bg-transparent border-b border-border focus:outline-none"
          />
        ) : (
          <h3 className="text-lg font-bold text-foreground pr-8">{nota.title}</h3>
        )}
      </div>

      <div className="p-6 overflow-y-auto flex-1 space-y-6">
        {/* Contenido */}
        <div>
          {editando ? (
            <textarea
              value={contenido}
              onChange={(e) => setContenido(e.target.value)}
              maxLength={2000}
              className="w-full p-3 rounded-lg border border-border bg-background text-sm resize-none h-32 focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          ) : (
            <p className="text-sm text-foreground whitespace-pre-wrap">{nota.content}</p>
          )}
        </div>

        {/* Tags */}
        {nota.tags.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <TagIcon className="h-3.5 w-3.5 text-muted-foreground" />
            {nota.tags.map((tag) => (
              <span key={tag} className="px-2 py-0.5 rounded-full bg-muted text-xs text-muted-foreground">
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Metadata */}
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <AvatarUsuario nombre={nota.author.user.name} tamaño="xs" />
            <span className="text-foreground">{nota.author.user.name}</span>
            <span className="text-muted-foreground">· {formatFechaHora(nota.createdAt)}</span>
          </div>
          {nota.assignee && (
            <p className="text-muted-foreground">
              Asignado a <span className="text-foreground">{nota.assignee.user.name}</span>
            </p>
          )}
          {nota.shiftPeriod && <p className="text-muted-foreground">Turno: {nota.shiftPeriod}</p>}
          {nota.status === "RESUELTA" && nota.resolvedAt && (
            <p className="text-muted-foreground">Resuelta el {formatFechaHora(nota.resolvedAt)}</p>
          )}
          {nota.status === "TRANSFERIDA" && nota.transferredToDate && (
            <p className="text-muted-foreground">
              Transferida a {new Date(nota.transferredToDate).toLocaleDateString("es-MX", { timeZone: "UTC" })}
            </p>
          )}
        </div>

        {/* Visto por */}
        <div>
          <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground mb-2">
            <Eye className="h-4 w-4" />
            Visto por
          </h4>
          {vistoPor.length > 0 ? (
            <div className="flex items-center gap-1 flex-wrap">
              {vistoPor.map((m) => (
                <span key={m.id} className="px-2 py-0.5 rounded-full bg-muted text-xs text-muted-foreground">
                  {m.nombre}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nadie ha visto esta nota aún</p>
          )}
        </div>
      </div>

      {/* Acciones */}
      <div className="p-6 pt-0 flex-shrink-0 space-y-2">
        {editando ? (
          <div className="flex gap-2">
            <BotonPrimario variante="secundario" tamaño="sm" anchoCompleto onClick={() => setEditando(false)}>
              Cancelar
            </BotonPrimario>
            <BotonPrimario tamaño="sm" anchoCompleto cargando={guardando} onClick={guardarEdicion}>
              Guardar
            </BotonPrimario>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {puedeResolver && (
              <BotonPrimario tamaño="sm" icono={<CheckCircle2 className="h-4 w-4" />} onClick={onResolver}>
                Marcar Resuelta
              </BotonPrimario>
            )}
            {puedeTransferir && (
              <BotonPrimario
                variante="secundario"
                tamaño="sm"
                icono={<ArrowRightLeft className="h-4 w-4" />}
                onClick={onTransferir}
              >
                Transferir
              </BotonPrimario>
            )}
            {puedeEditar && (
              <BotonPrimario
                variante="secundario"
                tamaño="sm"
                icono={<Pencil className="h-4 w-4" />}
                onClick={() => setEditando(true)}
              >
                Editar
              </BotonPrimario>
            )}
            {puedeEliminar && (
              <BotonPrimario
                variante="peligro"
                tamaño="sm"
                icono={<Trash2 className="h-4 w-4" />}
                onClick={() => {
                  if (confirmandoEliminar) onEliminar()
                  else setConfirmandoEliminar(true)
                }}
              >
                {confirmandoEliminar ? "¿Confirmar?" : "Eliminar"}
              </BotonPrimario>
            )}
          </div>
        )}
      </div>
    </motion.aside>
  )
}
