"use client"

import { useEffect, useState } from "react"
import { AnimatePresence } from "framer-motion"
import { UserPlus } from "lucide-react"
import { Aviso } from "@/components/panel/aviso"
import { BarraSuperior } from "@/components/panel/barra-superior"
import { ModalConfirmar } from "@/components/panel/modal-confirmar"
import {
  anularInvitacion,
  leerEquipo,
  reenviarInvitacion,
  type InvitacionPendiente,
  type MiembroDelEquipo,
} from "./_datos"
import { ListaEquipo } from "./_componentes/lista-equipo"
import { ModalInvitar } from "./_componentes/modal-invitar"
import { ModalServiciosDelMiembro } from "./_componentes/modal-servicios-del-miembro"

export default function PaginaEquipo() {
  const [miembros, setMiembros] = useState<MiembroDelEquipo[]>([])
  const [invitaciones, setInvitaciones] = useState<InvitacionPendiente[]>([])
  const [cargando, setCargando] = useState(true)
  const [aviso, setAviso] = useState("")
  const [modalAbierto, setModalAbierto] = useState(false)
  // Contra qué instante se mira si una invitación venció: se fija al cargar.
  const [ahora, setAhora] = useState(0)
  const [avisoListo, setAvisoListo] = useState("")
  const [reenviandoId, setReenviandoId] = useState<string | null>(null)
  const [aAnular, setAAnular] = useState<InvitacionPendiente | null>(null)
  const [anulando, setAnulando] = useState(false)
  const [avisoDeAnular, setAvisoDeAnular] = useState("")
  const [serviciosDe, setServiciosDe] = useState<MiembroDelEquipo | null>(null)

  const cargar = async () => {
    setCargando(true)
    setAviso("")
    const resultado = await leerEquipo()
    if (resultado.ok) {
      setMiembros(resultado.datos.miembros)
      setInvitaciones(resultado.datos.invitaciones)
      setAhora(Date.now())
    } else {
      setAviso(resultado.error)
    }
    setCargando(false)
  }

  const reenviar = async (invitacion: InvitacionPendiente) => {
    setAviso("")
    setAvisoListo("")
    setReenviandoId(invitacion.id)
    const resultado = await reenviarInvitacion(invitacion.id)
    setReenviandoId(null)
    if (!resultado.ok) return setAviso(resultado.error)
    setAvisoListo(`Se reenvió la invitación a ${invitacion.email}, con un enlace nuevo que vale 7 días.`)
    cargar()
  }

  const pedirAnular = (invitacion: InvitacionPendiente) => {
    setAvisoDeAnular("")
    setAAnular(invitacion)
  }

  const confirmarAnular = async () => {
    if (!aAnular) return
    setAvisoDeAnular("")
    setAnulando(true)
    const resultado = await anularInvitacion(aAnular.id)
    setAnulando(false)
    if (!resultado.ok) return setAvisoDeAnular(resultado.error)
    setAvisoListo(`Se anuló la invitación de ${aAnular.name}.`)
    setAAnular(null)
    cargar()
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
        {avisoListo && (
          <Aviso tono="listo" rol="status">
            {avisoListo}
          </Aviso>
        )}

        <ListaEquipo
          miembros={miembros}
          invitaciones={invitaciones}
          cargando={cargando}
          ahora={ahora}
          reenviandoId={reenviandoId}
          alReenviar={reenviar}
          alAnular={pedirAnular}
          alEditarServicios={(miembro) => {
            setAvisoListo("")
            setServiciosDe(miembro)
          }}
        />
      </div>

      <AnimatePresence>
        {aAnular && (
          <ModalConfirmar
            titulo={`¿Anular la invitación de ${aAnular.name}?`}
            descripcion={`El enlace que le llegó a ${aAnular.email} deja de servir. Si después quieres sumarla al equipo, la invitas de nuevo.`}
            textoConfirmar="Anular invitación"
            textoCancelar="No anular"
            peligro
            trabajando={anulando}
            aviso={avisoDeAnular}
            onConfirmar={confirmarAnular}
            onCerrar={() => setAAnular(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {serviciosDe && (
          <ModalServiciosDelMiembro
            miembro={serviciosDe}
            alCerrar={() => setServiciosDe(null)}
            alGuardar={(texto) => {
              setServiciosDe(null)
              setAvisoListo(texto)
            }}
          />
        )}
      </AnimatePresence>

      <ModalInvitar abierto={modalAbierto} onCerrar={() => setModalAbierto(false)} onInvitado={cargar} />
    </div>
  )
}
