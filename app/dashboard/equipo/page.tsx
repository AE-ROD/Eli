"use client"

import { useEffect, useState } from "react"
import { BarraSuperior } from "@/components/panel/barra-superior"
import { leerEquipo, type InvitacionPendiente, type MiembroDelEquipo } from "./_datos"
import { ListaEquipo } from "./_componentes/lista-equipo"
import { ModalInvitar } from "./_componentes/modal-invitar"

export default function PaginaEquipo() {
  const [miembros, setMiembros] = useState<MiembroDelEquipo[]>([])
  const [invitaciones, setInvitaciones] = useState<InvitacionPendiente[]>([])
  const [cargando, setCargando] = useState(true)
  const [aviso, setAviso] = useState("")
  const [modalAbierto, setModalAbierto] = useState(false)

  const cargar = async () => {
    setCargando(true)
    setAviso("")
    const resultado = await leerEquipo()
    if (resultado.ok) {
      setMiembros(resultado.datos.miembros)
      setInvitaciones(resultado.datos.invitaciones)
    } else {
      setAviso(resultado.error)
    }
    setCargando(false)
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect -- carga los miembros y las invitaciones al montar
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
        {aviso && (
          <p role="alert" className="text-sm text-red-500 mb-4">
            {aviso}
          </p>
        )}

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
