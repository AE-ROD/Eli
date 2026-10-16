"use client"

import { useEffect, useState } from "react"
import { UserPlus } from "lucide-react"
import { Aviso } from "@/components/panel/aviso"
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
    <div className="min-h-dvh">
      <BarraSuperior
        titulo="Equipo"
        subtitulo="Gestiona el equipo de tu negocio"
        accionPrincipal={{
          texto: "Invitar al equipo",
          onClick: () => setModalAbierto(true),
          icono: UserPlus,
        }}
      />

      <div className="space-y-4 px-4 pt-6 pb-10 sm:px-6">
        {aviso && <Aviso>{aviso}</Aviso>}

        <ListaEquipo miembros={miembros} invitaciones={invitaciones} cargando={cargando} />
      </div>

      <ModalInvitar abierto={modalAbierto} onCerrar={() => setModalAbierto(false)} onInvitado={cargar} />
    </div>
  )
}
