"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { UserCircle2, Loader2 } from "lucide-react"
import { SeccionHorario } from "./seccion-horario"
import { leerHorario, type HorarioDelDia } from "../_datos"

export interface MiembroHorario {
  id: string        // BusinessMember.id
  nombre: string
  email: string
  role: string
}

interface SelectorHorarioMiembroProps {
  horariosOwner: HorarioDelDia[]
  miembros: MiembroHorario[]
  nombreOwner: string
}

export function SelectorHorarioMiembro({ horariosOwner, miembros, nombreOwner }: SelectorHorarioMiembroProps) {
  // null = owner; string = memberId del trabajador
  const [seleccionado, setSeleccionado] = useState<string | null>(null)
  const [horariosActivos, setHorariosActivos] = useState<HorarioDelDia[]>(horariosOwner)
  const [cargando, setCargando] = useState(false)
  const [aviso, setAviso] = useState("")

  const pestañas = [
    { id: null, nombre: nombreOwner, sufijo: "(tú)" },
    ...miembros.map((miembro) => ({
      id: miembro.id,
      nombre: miembro.nombre,
      sufijo: miembro.role === "admin" ? "Admin" : "Trabajador",
    })),
  ]

  const cambiarDePestaña = async (memberId: string | null) => {
    if (memberId === seleccionado) return
    setSeleccionado(memberId)
    setAviso("")

    if (memberId === null) {
      setHorariosActivos(horariosOwner)
      return
    }

    setCargando(true)
    const resultado = await leerHorario(memberId)
    setCargando(false)

    // Si no cargó, no se deja a la vista el horario de la pestaña anterior con
    // el nombre de esta: guardarlo pisaría el horario de este miembro con el
    // de otro.
    if (resultado.ok) setHorariosActivos(resultado.datos)
    else setAviso(resultado.error)
  }

  const pestañaActiva = pestañas.find((pestaña) => pestaña.id === seleccionado)

  return (
    <div className="space-y-4">
      {/* Pestañas de miembros */}
      <div className="flex gap-2 flex-wrap">
        {pestañas.map((pestaña) => {
          const activa = pestaña.id === seleccionado
          return (
            <button
              key={pestaña.id ?? "owner"}
              onClick={() => cambiarDePestaña(pestaña.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all border ${
                activa
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card border-border/50 text-muted-foreground hover:border-primary/40 hover:text-foreground"
              }`}
            >
              <UserCircle2 className="h-4 w-4" />
              <span>{pestaña.nombre}</span>
              <span className={`text-xs ${activa ? "text-primary-foreground/70" : "text-muted-foreground/70"}`}>
                {pestaña.sufijo}
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
        ) : aviso ? (
          <p key="aviso" role="alert" className="text-sm text-red-500">
            {aviso}
          </p>
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
                  : `Horario de ${pestañaActiva?.nombre}`
              }
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
