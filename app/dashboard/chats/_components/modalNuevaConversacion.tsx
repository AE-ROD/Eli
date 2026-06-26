"use client"

import { motion } from "framer-motion"
import { MessageSquareText, NotebookText, X } from "lucide-react"
import { BotonPrimario } from "@/components/app/formularios/boton-primario"
import { CampoFormulario } from "@/components/app/formularios/campo-formulario"

export interface FormNuevaConversacion {
  titulo: string
  contexto: string
}

interface ModalNuevaConversacionProps {
  form: FormNuevaConversacion
  guardando: boolean
  onFormChange: (campo: keyof FormNuevaConversacion, valor: string) => void
  onSubmit: (e: React.SyntheticEvent<HTMLFormElement>) => void
  onCerrar: () => void
}

export function ModalNuevaConversacion({
  form,
  guardando,
  onFormChange,
  onSubmit,
  onCerrar,
}: ModalNuevaConversacionProps) {
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
          <h2 className="text-xl font-bold text-foreground">Nueva conversación interna</h2>
          <button onClick={onCerrar} className="p-1 rounded-lg hover:bg-muted transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <CampoFormulario
            etiqueta="Tema o destinatario"
            placeholder="Ej: Turno de hoy, Recepción, Problema con agenda"
            value={form.titulo}
            onChange={(e) => onFormChange("titulo", e.target.value)}
            icono={<MessageSquareText className="h-4 w-4" />}
            required
          />
          <CampoFormulario
            etiqueta="Contexto breve (opcional)"
            placeholder="Ej: Coordinación del staff para las próximas citas"
            value={form.contexto}
            onChange={(e) => onFormChange("contexto", e.target.value)}
            icono={<NotebookText className="h-4 w-4" />}
          />
          <div className="flex gap-3 pt-2">
            <BotonPrimario type="button" variante="secundario" anchoCompleto onClick={onCerrar}>
              Cancelar
            </BotonPrimario>
            <BotonPrimario type="submit" anchoCompleto cargando={guardando}>
              Crear conversación
            </BotonPrimario>
          </div>
        </form>
      </motion.div>
    </motion.div>
  )
}
