"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, UserPlus, Mail, User, ShieldCheck } from "lucide-react"
import { CampoFormulario } from "@/components/eli/app/campo-formulario"
import { BotonPrimario } from "@/components/eli/app/boton-primario"

interface Props {
  abierto: boolean
  onCerrar: () => void
  onInvitado: () => void
}

const roles = [
  {
    id: "worker",
    label: "Trabajador",
    descripcion: "Gestiona su propio horario y citas",
  },
  {
    id: "admin",
    label: "Administrador",
    descripcion: "Acceso completo al negocio, puede invitar otros",
  },
]

export function ModalInvitar({ abierto, onCerrar, onInvitado }: Props) {
  const [nombre, setNombre] = useState("")
  const [email, setEmail] = useState("")
  const [rol, setRol] = useState<"worker" | "admin">("worker")
  const [error, setError] = useState("")
  const [exito, setExito] = useState(false)
  const [enviando, setEnviando] = useState(false)

  const resetear = () => {
    setNombre("")
    setEmail("")
    setRol("worker")
    setError("")
    setExito(false)
    setEnviando(false)
  }

  const cerrar = () => {
    resetear()
    onCerrar()
  }

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setEnviando(true)

    const res = await fetch("/api/equipo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre, email, rol }),
    })

    const data = await res.json()

    if (!res.ok) {
      setError(data.error ?? "Error al enviar la invitación")
      setEnviando(false)
      return
    }

    setExito(true)
    setEnviando(false)
    onInvitado()
  }

  return (
    <AnimatePresence>
      {abierto && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-foreground/20 backdrop-blur-sm" onClick={cerrar} />

          <motion.div
            className="relative bg-card rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
          >
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border/50">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-primary/10">
                  <UserPlus className="h-5 w-5 text-primary" />
                </div>
                <h2 className="text-lg font-bold text-foreground">Invitar trabajador</h2>
              </div>
              <button onClick={cerrar} className="p-1 rounded-lg hover:bg-muted transition-colors">
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>

            <div className="px-6 py-6">
              {exito ? (
                <motion.div
                  className="text-center py-6"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                >
                  <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                    <Mail className="h-7 w-7 text-green-600" />
                  </div>
                  <p className="font-bold text-foreground text-lg mb-2">Invitación enviada</p>
                  <p className="text-sm text-muted-foreground mb-6">
                    <strong>{nombre}</strong> recibirá un correo en <strong>{email}</strong> con el enlace para crear su cuenta.
                  </p>
                  <BotonPrimario onClick={cerrar} anchoCompleto variante="secundario">
                    Cerrar
                  </BotonPrimario>
                </motion.div>
              ) : (
                <form onSubmit={enviar} className="space-y-5">
                  <CampoFormulario
                    etiqueta="Nombre"
                    type="text"
                    placeholder="Nombre del trabajador"
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    icono={<User className="h-4 w-4" />}
                    required
                  />
                  <CampoFormulario
                    etiqueta="Correo electrónico"
                    type="email"
                    placeholder="correo@ejemplo.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    icono={<Mail className="h-4 w-4" />}
                    required
                  />

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Rol</label>
                    <div className="space-y-2">
                      {roles.map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          className={`w-full flex items-start gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                            rol === r.id
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-primary/40"
                          }`}
                          onClick={() => setRol(r.id as "worker" | "admin")}
                        >
                          <ShieldCheck className={`h-4 w-4 mt-0.5 flex-shrink-0 ${rol === r.id ? "text-primary" : "text-muted-foreground"}`} />
                          <div>
                            <p className="text-sm font-semibold text-foreground">{r.label}</p>
                            <p className="text-xs text-muted-foreground">{r.descripcion}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {error && <p className="text-sm text-red-500">{error}</p>}

                  <BotonPrimario
                    type="submit"
                    anchoCompleto
                    cargando={enviando}
                    icono={<Mail className="h-4 w-4" />}
                  >
                    Enviar invitación
                  </BotonPrimario>
                </form>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
