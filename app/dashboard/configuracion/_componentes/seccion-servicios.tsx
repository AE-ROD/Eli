"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Plus, Pencil, Trash2, Clock, DollarSign, Scissors, ToggleLeft, ToggleRight } from "lucide-react"
import { BotonPrimario } from "@/components/comunes/boton-primario"
import { formatearDuracionDeServicio } from "@/lib/fechas"
import { ModalServicio } from "./modal-servicio"
import {
  crearServicio,
  editarServicio,
  activarODesactivarServicio,
  borrarServicio,
  type DatosDeServicio,
  type Servicio,
} from "../_datos"

const SERVICIO_EN_BLANCO: DatosDeServicio = { name: "", description: "", duration: 30, price: "" }

interface SeccionServiciosProps {
  serviciosIniciales: Servicio[]
}

export function SeccionServicios({ serviciosIniciales }: SeccionServiciosProps) {
  const [servicios, setServicios] = useState<Servicio[]>(serviciosIniciales)
  const [modalAbierto, setModalAbierto] = useState(false)
  const [servicioEditando, setServicioEditando] = useState<Servicio | null>(null)
  const [form, setForm] = useState<DatosDeServicio>(SERVICIO_EN_BLANCO)
  const [guardando, setGuardando] = useState(false)
  const [aviso, setAviso] = useState("")
  const [avisoDelModal, setAvisoDelModal] = useState("")

  const abrirNuevo = () => {
    setServicioEditando(null)
    setForm(SERVICIO_EN_BLANCO)
    setAvisoDelModal("")
    setModalAbierto(true)
  }

  const abrirEdicion = (servicio: Servicio) => {
    setServicioEditando(servicio)
    setForm({
      name: servicio.name,
      description: servicio.description ?? "",
      duration: servicio.duration,
      price: servicio.price?.toString() ?? "",
    })
    setAvisoDelModal("")
    setModalAbierto(true)
  }

  const cerrarModal = () => {
    setModalAbierto(false)
    setServicioEditando(null)
  }

  /** Pone en la lista el servicio tal como volvió del servidor. */
  const reemplazarEnLista = (actualizado: Servicio) =>
    setServicios((previos) => previos.map((servicio) => (servicio.id === actualizado.id ? actualizado : servicio)))

  const guardar = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    setAvisoDelModal("")
    setGuardando(true)
    const resultado = servicioEditando
      ? await editarServicio(servicioEditando.id, form)
      : await crearServicio(form)
    setGuardando(false)

    // Si el servidor lo rechaza, el modal queda abierto con lo cargado y el
    // motivo: cerrarlo haría parecer que se guardó.
    if (!resultado.ok) return setAvisoDelModal(resultado.error)

    const guardado = resultado.datos
    if (servicioEditando) reemplazarEnLista(guardado)
    else setServicios((previos) => [...previos, guardado])
    cerrarModal()
  }

  const alternarActivo = async (servicio: Servicio) => {
    setAviso("")
    const resultado = await activarODesactivarServicio(servicio.id, !servicio.active)
    if (resultado.ok) reemplazarEnLista(resultado.datos)
    else setAviso(resultado.error)
  }

  const eliminar = async (id: string) => {
    if (!confirm("¿Eliminar este servicio?")) return
    setAviso("")
    const resultado = await borrarServicio(id)
    if (resultado.ok) setServicios((previos) => previos.filter((servicio) => servicio.id !== id))
    else setAviso(resultado.error)
  }

  return (
    <div className="bg-card border border-border/50 rounded-xl p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Scissors className="h-5 w-5 text-primary" />
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

      {aviso && (
        <p role="alert" className="text-sm text-red-500 mb-4">
          {aviso}
        </p>
      )}

      {servicios.length === 0 ? (
        <div className="text-center py-10">
          <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
            <Scissors className="h-7 w-7 text-muted-foreground" />
          </div>
          <p className="font-medium text-foreground mb-1">Sin servicios aún</p>
          <p className="text-sm text-muted-foreground">Agrega el primer servicio que ofreces</p>
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence>
            {servicios.map((servicio) => (
              <motion.div
                key={servicio.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className={`flex items-center gap-4 p-4 rounded-xl border transition-all ${
                  servicio.active ? "border-border/50" : "border-border/30 opacity-50"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-medium text-foreground truncate">{servicio.name}</p>
                    {!servicio.active && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                        Inactivo
                      </span>
                    )}
                  </div>
                  {servicio.description && (
                    <p className="text-xs text-muted-foreground truncate mb-1">{servicio.description}</p>
                  )}
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {formatearDuracionDeServicio(servicio.duration)}
                    </span>
                    {servicio.price != null && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <DollarSign className="h-3 w-3" />
                        {servicio.price.toLocaleString("es-ES")}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => alternarActivo(servicio)}
                    className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                    title={servicio.active ? "Desactivar" : "Activar"}
                  >
                    {servicio.active
                      ? <ToggleRight className="h-5 w-5 text-primary" />
                      : <ToggleLeft className="h-5 w-5" />
                    }
                  </button>
                  <button
                    onClick={() => abrirEdicion(servicio)}
                    className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => eliminar(servicio.id)}
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
            aviso={avisoDelModal}
            modoEdicion={!!servicioEditando}
            onFormChange={(campo, valor) => setForm((previo) => ({ ...previo, [campo]: valor }))}
            onSubmit={guardar}
            onCerrar={cerrarModal}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
