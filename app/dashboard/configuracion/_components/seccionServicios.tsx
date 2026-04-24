"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Plus, Pencil, Trash2, Clock, DollarSign, Stethoscope, ToggleLeft, ToggleRight } from "lucide-react"
import { BotonPrimario } from "@/components/eli/app/boton-primario"
import { ModalServicio, type FormServicio } from "./modalServicio"

export interface ServicioAPI {
  id: string
  name: string
  description: string | null
  duration: number
  price: number | null
  active: boolean
}

const FORM_INICIAL: FormServicio = { name: "", description: "", duration: 30, price: "" }

function formatDuracion(min: number): string {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? `${h}h` : `${h}h ${m}min`
}

interface SeccionServiciosProps {
  serviciosIniciales: ServicioAPI[]
}

export function SeccionServicios({ serviciosIniciales }: SeccionServiciosProps) {
  const [servicios, setServicios] = useState<ServicioAPI[]>(serviciosIniciales)
  const [modalAbierto, setModalAbierto] = useState(false)
  const [servicioEditando, setServicioEditando] = useState<ServicioAPI | null>(null)
  const [form, setForm] = useState<FormServicio>(FORM_INICIAL)
  const [guardando, setGuardando] = useState(false)

  const abrirNuevo = () => {
    setServicioEditando(null)
    setForm(FORM_INICIAL)
    setModalAbierto(true)
  }

  const abrirEdicion = (s: ServicioAPI) => {
    setServicioEditando(s)
    setForm({ name: s.name, description: s.description ?? "", duration: s.duration, price: s.price?.toString() ?? "" })
    setModalAbierto(true)
  }

  const cerrarModal = () => {
    setModalAbierto(false)
    setServicioEditando(null)
  }

  const guardar = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    setGuardando(true)
    try {
      const payload = {
        name: form.name,
        description: form.description || undefined,
        duration: form.duration,
        price: form.price ? parseFloat(form.price) : undefined,
      }

      if (servicioEditando) {
        const res = await fetch(`/api/configuracion/servicios/${servicioEditando.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
        if (res.ok) {
          const actualizado: ServicioAPI = await res.json()
          setServicios((prev) => prev.map((s) => (s.id === actualizado.id ? actualizado : s)))
        }
      } else {
        const res = await fetch("/api/configuracion/servicios", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
        if (res.ok) {
          const nuevo: ServicioAPI = await res.json()
          setServicios((prev) => [...prev, nuevo])
        }
      }
      cerrarModal()
    } finally {
      setGuardando(false)
    }
  }

  const toggleActivo = async (s: ServicioAPI) => {
    const res = await fetch(`/api/configuracion/servicios/${s.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !s.active }),
    })
    if (res.ok) {
      const actualizado: ServicioAPI = await res.json()
      setServicios((prev) => prev.map((x) => (x.id === actualizado.id ? actualizado : x)))
    }
  }

  const eliminar = async (id: string) => {
    if (!confirm("¿Eliminar este servicio?")) return
    const res = await fetch(`/api/configuracion/servicios/${id}`, { method: "DELETE" })
    if (res.ok) setServicios((prev) => prev.filter((s) => s.id !== id))
  }

  return (
    <div className="bg-card border border-border/50 rounded-xl p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Stethoscope className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="font-semibold text-foreground">Servicios</h2>
            <p className="text-sm text-muted-foreground">Los servicios que ofreces a tus clientes</p>
          </div>
        </div>
        <BotonPrimario tamaño="sm" icono={<Plus className="h-4 w-4" />} onClick={abrirNuevo}>
          Nuevo servicio
        </BotonPrimario>
      </div>

      {servicios.length === 0 ? (
        <div className="text-center py-10">
          <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
            <Stethoscope className="h-7 w-7 text-muted-foreground" />
          </div>
          <p className="font-medium text-foreground mb-1">Sin servicios aún</p>
          <p className="text-sm text-muted-foreground">Agrega el primer servicio que ofreces</p>
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence>
            {servicios.map((s) => (
              <motion.div
                key={s.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className={`flex items-center gap-4 p-4 rounded-xl border transition-all ${
                  s.active ? "border-border/50" : "border-border/30 opacity-50"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-medium text-foreground truncate">{s.name}</p>
                    {!s.active && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                        Inactivo
                      </span>
                    )}
                  </div>
                  {s.description && (
                    <p className="text-xs text-muted-foreground truncate mb-1">{s.description}</p>
                  )}
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {formatDuracion(s.duration)}
                    </span>
                    {s.price != null && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <DollarSign className="h-3 w-3" />
                        {s.price.toLocaleString("es-ES")}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => toggleActivo(s)}
                    className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                    title={s.active ? "Desactivar" : "Activar"}
                  >
                    {s.active
                      ? <ToggleRight className="h-5 w-5 text-primary" />
                      : <ToggleLeft className="h-5 w-5" />
                    }
                  </button>
                  <button
                    onClick={() => abrirEdicion(s)}
                    className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => eliminar(s.id)}
                    className="p-2 rounded-lg hover:bg-red-50 transition-colors text-muted-foreground hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      <AnimatePresence>
        {modalAbierto && (
          <ModalServicio
            form={form}
            guardando={guardando}
            modoEdicion={!!servicioEditando}
            onFormChange={(campo, valor) => setForm((p) => ({ ...p, [campo]: valor }))}
            onSubmit={guardar}
            onCerrar={cerrarModal}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
