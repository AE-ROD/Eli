"use client"

import { useEffect, useRef, useState } from "react"
import { useSession } from "next-auth/react"
import { AnimatePresence } from "framer-motion"
import { UserPlus } from "lucide-react"
import { Aviso } from "@/components/panel/aviso"
import { useRubroDelPanel } from "@/components/panel/contexto-rubro"
import { BarraSuperior } from "@/components/panel/barra-superior"
import { ModalConfirmar } from "@/components/panel/modal-confirmar"
import { actorDeSesion, puedeEditarFotoDelMiembro, puedeGestionarEquipo } from "@/lib/permisos"
import { vocabularioDe } from "@/lib/vocabulario"
import {
  anularInvitacion,
  leerEquipo,
  reenviarInvitacion,
  type InvitacionPendiente,
  type MiembroDelEquipo,
} from "../_datos"
import { frasesDeEquipo } from "../_frases"
import { ListaEquipo } from "./lista-equipo"
import { ModalFotoDelMiembro } from "./modal-foto-del-miembro"
import { ModalInvitar } from "./modal-invitar"
import { ModalServiciosDelMiembro } from "./modal-servicios-del-miembro"

export function PantallaDeEquipo() {
  const { data: sesion } = useSession()
  // Invitar es de quien gestiona el equipo (la API ya rechaza al resto). A
  // quien no lo gestiona la página ya lo devolvió al panel (#49); mientras la
  // sesión carga, el botón tampoco se ofrece: falla cerrado.
  const actor = actorDeSesion(sesion)
  const invita = puedeGestionarEquipo(actor)
  const frases = frasesDeEquipo(vocabularioDe(useRubroDelPanel()).palabras)
  const [miembros, setMiembros] = useState<MiembroDelEquipo[]>([])
  const [invitaciones, setInvitaciones] = useState<InvitacionPendiente[]>([])
  const [cargando, setCargando] = useState(true)
  const [aviso, setAviso] = useState("")
  const [modalAbierto, setModalAbierto] = useState(false)
  // Contra qué instante se mira si una invitación venció: se fija al cargar.
  const [ahora, setAhora] = useState(0)
  const [avisoListo, setAvisoListo] = useState("")
  const [reenviandoId, setReenviandoId] = useState<string | null>(null)
  /** La invitación que se va a reenviar: se confirma antes, porque el enlace anterior deja de servir. */
  const [aReenviar, setAReenviar] = useState<InvitacionPendiente | null>(null)
  const [avisoDeReenviar, setAvisoDeReenviar] = useState("")
  /** Un ref y no sólo el estado: un doble clic llega antes de que se dibuje el botón ocupado. */
  const enviado = useRef(false)
  const [aAnular, setAAnular] = useState<InvitacionPendiente | null>(null)
  const [anulando, setAnulando] = useState(false)
  const [avisoDeAnular, setAvisoDeAnular] = useState("")
  const [serviciosDe, setServiciosDe] = useState<MiembroDelEquipo | null>(null)
  /** La persona cuya foto se está cambiando: su id, no la fila, para que el modal vea la foto que se acaba de guardar. */
  const [fotoDeId, setFotoDeId] = useState<string | null>(null)
  const fotoDe = miembros.find((miembro) => miembro.id === fotoDeId) ?? null

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

  const pedirReenviar = (invitacion: InvitacionPendiente) => {
    setAviso("")
    setAvisoListo("")
    setAvisoDeReenviar("")
    setAReenviar(invitacion)
  }

  const confirmarReenviar = async () => {
    if (!aReenviar || enviado.current) return
    enviado.current = true
    const invitacion = aReenviar
    setAvisoDeReenviar("")
    setReenviandoId(invitacion.id)
    const resultado = await reenviarInvitacion(invitacion.id)
    enviado.current = false
    setReenviandoId(null)
    if (!resultado.ok) return setAvisoDeReenviar(resultado.error)
    setAReenviar(null)
    setAvisoListo(`Se reenvió la invitación a ${invitacion.email}, con un enlace nuevo que vale 7 días.`)
    cargar()
  }

  const pedirAnular = (invitacion: InvitacionPendiente) => {
    setAvisoDeAnular("")
    setAAnular(invitacion)
  }

  const confirmarAnular = async () => {
    if (!aAnular || enviado.current) return
    enviado.current = true
    setAvisoDeAnular("")
    setAnulando(true)
    const resultado = await anularInvitacion(aAnular.id)
    enviado.current = false
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
        subtitulo={frases.subtitulo}
        accionPrincipal={
          invita
            ? {
                texto: "Invitar al equipo",
                onClick: () => setModalAbierto(true),
                icono: UserPlus,
              }
            : undefined
        }
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
          alReenviar={pedirReenviar}
          alAnular={pedirAnular}
          alEditarServicios={(miembro) => {
            setAvisoListo("")
            setServiciosDe(miembro)
          }}
          puedeCambiarLaFotoDe={(miembro) => puedeEditarFotoDelMiembro(actor, miembro)}
          alEditarFoto={(miembro) => {
            setAvisoListo("")
            setFotoDeId(miembro.id)
          }}
        />
      </div>

      <AnimatePresence>
        {aReenviar && (
          <ModalConfirmar
            titulo={`¿Reenviar la invitación de ${aReenviar.name}?`}
            descripcion={`Le llega a ${aReenviar.email} un correo con un enlace nuevo que vale 7 días. El enlace que tenía deja de servir.`}
            textoConfirmar="Reenviar invitación"
            textoCancelar="No reenviar"
            trabajando={reenviandoId === aReenviar.id}
            aviso={avisoDeReenviar}
            onConfirmar={confirmarReenviar}
            onCerrar={() => setAReenviar(null)}
          />
        )}
      </AnimatePresence>

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

      <AnimatePresence>
        {fotoDe && (
          <ModalFotoDelMiembro
            miembro={fotoDe}
            alCerrar={() => setFotoDeId(null)}
            // La lista se actualiza detrás sin volver a pedirla: sólo cambió una foto.
            alCambiar={(miembroId, url) =>
              setMiembros((actuales) =>
                actuales.map((miembro) => (miembro.id === miembroId ? { ...miembro, fotoUrl: url } : miembro))
              )
            }
          />
        )}
      </AnimatePresence>

      <ModalInvitar abierto={modalAbierto} onCerrar={() => setModalAbierto(false)} onInvitado={cargar} />
    </div>
  )
}
