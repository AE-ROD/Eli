"use client"

import { useEffect, useState } from "react"
import { BarraSuperior } from "@/components/eli/app/barra-superior"
import { ListaEquipo } from "./_components/listaEquipo"
import { ModalInvitar } from "./_components/modalInvitar"

export interface MiembroAPI {
  id: string
  role: string
  createdAt: string
  user: { id: string; name: string; email: string }
}

export interface InvitacionAPI {
  id: string
  name: string
  email: string
  role: string
  expiresAt: string
  createdAt: string
}

export default function PaginaEquipo() {
  const [miembros, setMiembros] = useState<MiembroAPI[]>([])
  const [invitaciones, setInvitaciones] = useState<InvitacionAPI[]>([])
  const [cargando, setCargando] = useState(true)
  const [modalAbierto, setModalAbierto] = useState(false)

  const cargar = async () => {
    setCargando(true)
    const res = await fetch("/api/equipo")
    if (res.ok) {
      const data = await res.json()
      setMiembros(data.miembros)
      setInvitaciones(data.invitaciones)
    }
    setCargando(false)
  }

  useEffect(() => { cargar() }, [])

  return (
    <div className="min-h-screen">
      <BarraSuperior
        titulo="Equipo"
        subtitulo="Gestiona los trabajadores de tu negocio"
        accionPrincipal={{
          texto: "Invitar trabajador",
          onClick: () => setModalAbierto(true),
        }}
      />

      <div className="p-6">
        <ListaEquipo
          miembros={miembros}
          invitaciones={invitaciones}
          cargando={cargando}
        />
      </div>

      <ModalInvitar
        abierto={modalAbierto}
        onCerrar={() => setModalAbierto(false)}
        onInvitado={cargar}
      />
    </div>
  )
}
