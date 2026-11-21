"use client"

import { useEffect, useRef, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { AnimatePresence } from "framer-motion"
import { UserPlus } from "lucide-react"
import { Aviso } from "@/components/panel/aviso"
import { useRubroDelPanel } from "@/components/panel/contexto-rubro"
import { BarraSuperior } from "@/components/panel/barra-superior"
import { ModalConfirmar } from "@/components/panel/modal-confirmar"
import {
  actorDeSesion,
  elPlanNoIncluyeEquipo,
  puedeCambiarDePlan,
  puedeEditarFotoDelMiembro,
  puedeInvitarAlEquipo,
  puedeSacarDelEquipo,
} from "@/lib/permisos"
import { vocabularioDe } from "@/lib/vocabulario"
import {
  anularInvitacion,
  leerEquipo,
  reenviarInvitacion,
  revisarSalida,
  sacarDelEquipo,
  type InvitacionPendiente,
  type ResumenDeSalida,
  type MiembroDelEquipo,
} from "../_datos"
import { frasesDeEquipo } from "../_frases"
import { ListaEquipo } from "./lista-equipo"
import { ModalFotoDelMiembro } from "./modal-foto-del-miembro"
import { ModalInvitar } from "./modal-invitar"
import { PlanSinEquipo } from "./plan-sin-equipo"
import { ModalServiciosDelMiembro } from "./modal-servicios-del-miembro"

export function PantallaDeEquipo() {
  const { data: sesion } = useSession()
  // Invitar es de quien gestiona el equipo, y sólo en un negocio del plan
  // Equipo (la API ya rechaza al resto). A quien no gestiona el equipo la
  // página ya lo devolvió al panel (#49); mientras la sesión carga, o si no
  // dice el plan, el botón tampoco se ofrece: falla cerrado.
  const actor = actorDeSesion(sesion)
  const invita = puedeInvitarAlEquipo(actor)
  // Sólo para explicar por qué no hay a quién invitar: un plan que no se
  // conoce no afirma nada.
  const sinEquipoPorElPlan = elPlanNoIncluyeEquipo(actor)
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
  const router = useRouter()
  /** A quién se va a sacar del equipo, con lo que respondió el servidor al revisar. */
  const [aSacar, setASacar] = useState<{ miembro: MiembroDelEquipo; resumen: ResumenDeSalida } | null>(null)
  const [sacando, setSacando] = useState(false)
  const [avisoDeSacar, setAvisoDeSacar] = useState("")

  const pedirSacar = async (miembro: MiembroDelEquipo) => {
    setAviso("")
    setAvisoListo("")
    setAvisoDeSacar("")
    const resultado = await revisarSalida(miembro.id)
    if (!resultado.ok) return setAviso(resultado.error)
    setASacar({ miembro, resumen: resultado.datos })
  }

  const confirmarSacar = async () => {
    if (!aSacar || enviado.current) return
    const { miembro, resumen } = aSacar
    // Con horas por delante o una atención abierta no se puede: el botón lleva a resolverlo.
    if (resumen.motivoParaNoSacar) {
      setASacar(null)
      router.push(resumen.citasPorDelante > 0 ? "/dashboard/agenda" : "/dashboard/tablero")
      return
    }
    enviado.current = true
    setAvisoDeSacar("")
    setSacando(true)
    const resultado = await sacarDelEquipo(miembro.id)
    enviado.current = false
    setSacando(false)
    if (!resultado.ok) return setAvisoDeSacar(resultado.error)
    setASacar(null)
    setAvisoListo(
      resultado.datos.tienePlataPendiente
        ? `${miembro.user.name} ya no está en el equipo. Lo que le quedó por liquidar sigue en Liquidaciones para pagárselo.`
        : `${miembro.user.name} ya no está en el equipo.`
    )
    cargar()
  }

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

        {sinEquipoPorElPlan && <PlanSinEquipo puedeCambiarDePlan={puedeCambiarDePlan(actor)} />}

        {/*
          En el plan Independiente no hay equipo que listar: la explicación
          ocupa su lugar. Si igual hubiera alguien (una invitación que quedó
          de antes de un cambio de plan), se muestra y se puede anular.
        */}
        {(!sinEquipoPorElPlan || miembros.length > 0 || invitaciones.length > 0) && (
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
            puedeSacarA={(miembro) =>
              !!actor && puedeSacarDelEquipo(actor, { id: miembro.id, businessId: actor.businessId, role: miembro.role })
            }
            alSacar={(miembro) => void pedirSacar(miembro)}
          />
        )}
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
        {aSacar && (
          <ModalConfirmar
            titulo={
              aSacar.resumen.motivoParaNoSacar
                ? `Todavía no puedes sacar a ${aSacar.miembro.user.name}`
                : `¿Sacar a ${aSacar.miembro.user.name} del equipo?`
            }
            descripcion={
              aSacar.resumen.motivoParaNoSacar ??
              `En unos minutos deja de entrar al negocio y ya no aparece en la reserva ni en la agenda. Su horario y sus bloqueos se borran. Sus atenciones pasadas, sus comisiones y sus liquidaciones quedan guardadas.${
                aSacar.resumen.tienePlataPendiente
                  ? " Le queda plata por liquidar: se la puedes pagar después desde Liquidaciones."
                  : ""
              } Si vuelve, la invitas de nuevo.`
            }
            textoConfirmar={
              aSacar.resumen.motivoParaNoSacar
                ? aSacar.resumen.citasPorDelante > 0
                  ? "Ir a la Agenda"
                  : "Ir al Tablero"
                : "Sacar del equipo"
            }
            textoCancelar={aSacar.resumen.motivoParaNoSacar ? "Cerrar" : "No sacar"}
            peligro={!aSacar.resumen.motivoParaNoSacar}
            trabajando={sacando}
            aviso={avisoDeSacar}
            onConfirmar={confirmarSacar}
            onCerrar={() => setASacar(null)}
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
