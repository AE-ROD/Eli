"use client"

import { motion } from "framer-motion"
import { BotonPrimario } from "@/components/app/formularios/boton-primario"
import { CampoFormulario } from "@/components/app/formularios/campo-formulario"
import { X, User, Mail, Phone } from "lucide-react"

export interface FormNuevoPaciente {
  nombre: string
  email: string
  telefono: string
}

interface ModalNuevoPacienteProps {
  form: FormNuevoPaciente
  guardando: boolean
  onFormChange: (campo: keyof FormNuevoPaciente, valor: string) => void
  onSubmit: (e: React.SyntheticEvent<HTMLFormElement>) => void
  onCerrar: () => void
}

export function ModalNuevoPaciente({
  form,
  guardando,
  onFormChange,
  onSubmit,
  onCerrar,
}: ModalNuevoPacienteProps) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-foreground/20 backdrop-blur-sm" onClick={onCerrar} />
      <motion.div
        className="relative bg-card rounded-xl shadow-xl w-full max-w-md p-6"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-foreground">Nuevo usuario</h2>
          <button onClick={onCerrar} className="p-1 rounded-lg hover:bg-muted transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <CampoFormulario
            etiqueta="Nombre completo"
            placeholder="Nombre del usuario"
            value={form.nombre}
            onChange={(e) => onFormChange("nombre", e.target.value)}
            icono={<User className="h-4 w-4" />}
            required
          />
          <CampoFormulario
            etiqueta="Correo electrónico"
            type="email"
            placeholder="email@ejemplo.com"
            value={form.email}
            onChange={(e) => onFormChange("email", e.target.value)}
            icono={<Mail className="h-4 w-4" />}
          />
          <CampoFormulario
            etiqueta="Teléfono"
            type="tel"
            placeholder="+52 555 123 4567"
            value={form.telefono}
            onChange={(e) => onFormChange("telefono", e.target.value)}
            icono={<Phone className="h-4 w-4" />}
          />
          <div className="flex gap-3 pt-4">
            <BotonPrimario type="button" variante="secundario" anchoCompleto onClick={onCerrar}>
              Cancelar
            </BotonPrimario>
            <BotonPrimario type="submit" anchoCompleto cargando={guardando}>
              Guardar usuario
            </BotonPrimario>
          </div>
        </form>
      </motion.div>
    </motion.div>
  )
}
