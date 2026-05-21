"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { UserCircle2, Loader2 } from "lucide-react"
import { SeccionHorario, type HorarioAPI } from "./seccionHorario"

export interface MiembroHorario {
  id: string        // BusinessMember.id
  nombre: string
  email: string
  role: string
}

interface Props {
  horariosOwner: HorarioAPI[]
  miembros: MiembroHorario[]
  nombreOwner: string
}

export function SelectorHorarioMiembro({ horariosOwner, miembros, nombreOwner }: Props) {
  // null = owner; string = memberId del trabajador
  const [seleccionado, setSeleccionado] = useState<string | null>(null)
  const [horariosActivos, setHorariosActivos] = useState<HorarioAPI[]>(horariosOwner)
  const [cargando, setCargando] = useState(false)

  const tabs = [
    { id: null, nombre: nombreOwner, sufijo: "(tú)" },
    ...miembros.map((m) => ({ id: m.id, nombre: m.nombre, sufijo: m.role === "admin" ? "Admin" : "Trabajador" })),
  ]

  const cambiarTab = async (memberId: string | null) => {
    if (memberId === seleccionado) return
    setSeleccionado(memberId)

    if (memberId === null) {
      setHorariosActivos(horariosOwner)
      return
    }

    setCargando(true)
    try {
      const res = await fetch(`/api/configuracion/horarios?memberId=${memberId}`)
      if (res.ok) {
        const data = await res.json()
        setHorariosActivos(data)
      }
    } finally {
      setCargando(false)
    }
  }

  const tabActivo = tabs.find((t) => t.id === seleccionado)

  return (
    <div className="space-y-4">
      {/* Tabs de miembros */}
      <div className="flex gap-2 flex-wrap">
        {tabs.map((tab) => {
          const activo = tab.id === seleccionado
          return (
            <button
              key={tab.id ?? "owner"}
              onClick={() => cambiarTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all border ${
                activo
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card border-border/50 text-muted-foreground hover:border-primary/40 hover:text-foreground"
              }`}
            >
              <UserCircle2 className="h-4 w-4" />
              <span>{tab.nombre}</span>
              <span className={`text-xs ${activo ? "text-primary-foreground/70" : "text-muted-foreground/70"}`}>
                {tab.sufijo}
              </span>
            </button>
          )
        })}
      </div>

      {/* Contenido */}
      <AnimatePresence mode="wait">
        {cargando ? (
          <motion.div
            key="cargando"
            className="flex items-center justify-center h-48"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </motion.div>
        ) : (
          <motion.div
            key={seleccionado ?? "owner"}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
          >
            <SeccionHorario
              horariosIniciales={horariosActivos}
              memberId={seleccionado}
              titulo={
                seleccionado === null
                  ? "Mi horario"
                  : `Horario de ${tabActivo?.nombre}`
              }
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
