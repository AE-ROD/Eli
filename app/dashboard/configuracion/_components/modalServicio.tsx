"use client"

import { motion } from "framer-motion"
import { X, Stethoscope, Clock, DollarSign, FileText } from "lucide-react"
import { BotonPrimario } from "@/components/eli/app/boton-primario"
import { CampoFormulario } from "@/components/eli/app/campo-formulario"

export interface FormServicio {
  name: string
  description: string
  duration: number
  price: string
}

const DURACIONES = [
  { valor: 15, etiqueta: "15 min" },
  { valor: 30, etiqueta: "30 min" },
  { valor: 45, etiqueta: "45 min" },
  { valor: 60, etiqueta: "1 hora" },
  { valor: 90, etiqueta: "1h 30min" },
  { valor: 120, etiqueta: "2 horas" },
  { valor: 180, etiqueta: "3 horas" },
]

interface ModalServicioProps {
  form: FormServicio
  guardando: boolean
  modoEdicion: boolean
  onFormChange: (campo: keyof FormServicio, valor: string | number) => void
  onSubmit: (e: React.SyntheticEvent<HTMLFormElement>) => void
  onCerrar: () => void
}

export function ModalServicio({
  form,
  guardando,
  modoEdicion,
  onFormChange,
  onSubmit,
  onCerrar,
}: ModalServicioProps) {
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
          <h2 className="text-xl font-bold text-foreground">
            {modoEdicion ? "Editar servicio" : "Nuevo servicio"}
          </h2>
          <button onClick={onCerrar} className="p-1 rounded-lg hover:bg-muted transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <CampoFormulario
            etiqueta="Nombre del servicio"
            placeholder="Ej: Corte de cabello, Masaje, Consulta..."
            value={form.name}
            onChange={(e) => onFormChange("name", e.target.value)}
            icono={<Stethoscope className="h-4 w-4" />}
            required
          />

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              <span className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Descripción (opcional)
              </span>
            </label>
            <textarea
              value={form.description}
              onChange={(e) => onFormChange("description", e.target.value)}
              placeholder="Describe brevemente el servicio..."
              className="w-full p-3 rounded-lg border border-border bg-background text-sm resize-none h-20 focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          {/* Duración */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              <span className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Duración
              </span>
            </label>
            <div className="grid grid-cols-4 gap-2">
              {DURACIONES.map(({ valor, etiqueta }) => (
                <button
                  key={valor}
                  type="button"
                  onClick={() => onFormChange("duration", valor)}
                  className={`py-2 rounded-lg text-sm font-medium transition-all border ${
                    form.duration === valor
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                  }`}
                >
                  {etiqueta}
                </button>
              ))}
            </div>
          </div>

          <CampoFormulario
            etiqueta="Precio (opcional)"
            type="number"
            placeholder="0.00"
            value={form.price}
            onChange={(e) => onFormChange("price", e.target.value)}
            icono={<DollarSign className="h-4 w-4" />}
          />

          <div className="flex gap-3 pt-2">
            <BotonPrimario type="button" variante="secundario" anchoCompleto onClick={onCerrar}>
              Cancelar
            </BotonPrimario>
            <BotonPrimario type="submit" anchoCompleto cargando={guardando}>
              {modoEdicion ? "Guardar cambios" : "Crear servicio"}
            </BotonPrimario>
          </div>
        </form>
      </motion.div>
    </motion.div>
  )
}
