"use client"

import { motion } from "framer-motion"
import { X, User, Phone } from "lucide-react"
import { BotonPrimario } from "@/components/eli/app/boton-primario"
import { CampoFormulario } from "@/components/eli/app/campo-formulario"

export interface FormNuevaConversacion {
  nombre: string
  telefono: string
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
          <h2 className="text-xl font-bold text-foreground">Nueva conversación</h2>
          <button onClick={onCerrar} className="p-1 rounded-lg hover:bg-muted transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <CampoFormulario
            etiqueta="Nombre del cliente"
            placeholder="Nombre completo"
            value={form.nombre}
            onChange={(e) => onFormChange("nombre", e.target.value)}
            icono={<User className="h-4 w-4" />}
            required
          />
          <CampoFormulario
            etiqueta="Teléfono (opcional)"
            type="tel"
            placeholder="+52 555 123 4567"
            value={form.telefono}
            onChange={(e) => onFormChange("telefono", e.target.value)}
            icono={<Phone className="h-4 w-4" />}
          />
          <div className="flex gap-3 pt-2">
            <BotonPrimario type="button" variante="secundario" anchoCompleto onClick={onCerrar}>
              Cancelar
            </BotonPrimario>
            <BotonPrimario type="submit" anchoCompleto cargando={guardando}>
              Crear
            </BotonPrimario>
          </div>
        </form>
      </motion.div>
    </motion.div>
  )
}
