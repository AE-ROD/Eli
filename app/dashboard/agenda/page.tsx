"use client"

import { useState, useEffect, useCallback, useId } from "react"
import { useSession } from "next-auth/react"
import { actorDeSesion, gestionaElNegocio, puedeAsignarCitasAOtros, puedeGestionarBloqueoDe } from "@/lib/permisos"
import type { Advertencia } from "@/lib/mover-cita"
import { Ban } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { AnimatePresence } from "framer-motion"
import { BarraSuperior } from "@/components/panel/barra-superior"
import { desplazarFecha, diasDeLaSemanaDe, type UnidadDeTiempo } from "@/lib/fechas"
import type { FranjaDelDia } from "@/lib/horario-de-atencion"
import {
  leerCitas,
  leerBloqueos,
  crearCita,
  cambiarEstadoDeCita,
  citaEnBlanco,
  leerHorarioDeAtencion,
  type Bloqueo,
  type Cita,
  type DatosDeNuevaCita,
} from "./_datos"
import { Aviso } from "@/components/panel/aviso"
import { ControlesDeAgenda } from "./_componentes/controles-de-agenda"
import { VistaSemana } from "./_componentes/vista-semana"
import { VistaDia } from "./_componentes/vista-dia"
import { VistaMes } from "./_componentes/vista-mes"
import { PanelDeCita } from "./_componentes/panel-de-cita"
import { ModalNuevaCita } from "./_componentes/modal-nueva-cita"
import { ModalMoverCita } from "./_componentes/modal-mover-cita"
import { ModalBloquearHorario } from "./_componentes/modal-bloquear-horario"
import { ModalBloqueo } from "./_componentes/modal-bloqueo"

function resumen(cargando: boolean, cantidad: number): string {
  if (cargando) return "Cargando..."
  if (cantidad === 0) return "Sin citas en este período"
  return `${cantidad} cita${cantidad === 1 ? "" : "s"} en este período`
}

export default function PaginaAgenda() {
  const { data: sesion } = useSession()
  const actor = actorDeSesion(sesion)
  const puedeAsignarProfesional = puedeAsignarCitasAOtros(actor)
  // Dueño y encargado bloquean a cualquiera o a todo el negocio; el
  // profesional, su agenda. Sin `memberId`, nada (no ve el botón).
  const bloqueaATodos = gestionaElNegocio(actor)
  const miembroPropio = actor?.memberId ? { id: actor.memberId, businessId: actor.businessId } : null
  const puedeBloquear = bloqueaATodos || puedeGestionarBloqueoDe(actor, miembroPropio)

  const [fecha, setFecha] = useState(new Date())
  const [modo, setModo] = useState<UnidadDeTiempo>("semana")
  const [citas, setCitas] = useState<Cita[]>([])
  const [cargando, setCargando] = useState(true)
  const [aviso, setAviso] = useState("")

  const [citaAbierta, setCitaAbierta] = useState<Cita | null>(null)
  const [modalAbierto, setModalAbierto] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [avisoDelModal, setAvisoDelModal] = useState("")
  const [nuevaCita, setNuevaCita] = useState<DatosDeNuevaCita>(() => citaEnBlanco(new Date()))
  const [citaAMover, setCitaAMover] = useState<Cita | null>(null)
  const [horario, setHorario] = useState<FranjaDelDia[]>([])
  const [bloqueos, setBloqueos] = useState<Bloqueo[]>([])
  const [advertenciasDeNuevaCita, setAdvertenciasDeNuevaCita] = useState<Advertencia[]>([])
  const [bloquearAbierto, setBloquearAbierto] = useState(false)
  const [bloqueoAbierto, setBloqueoAbierto] = useState<Bloqueo | null>(null)
  const idDelPeriodo = useId()

  const recargar = useCallback(async (fecha: Date, modo: UnidadDeTiempo) => {
    setCargando(true)
    const [resultado, deBloqueos] = await Promise.all([leerCitas(fecha, modo), leerBloqueos(fecha, modo)])
    // Si los bloqueos no cargan, la agenda se muestra igual, sin las franjas, y se avisa.
    if (deBloqueos.ok) setBloqueos(deBloqueos.datos)
    else {
      setBloqueos([])
      setAviso(deBloqueos.error)
    }
    if (resultado.ok) {
      setCitas(resultado.datos)
      // El detalle abierto muestra la cita como quedó (por ejemplo, después de
      // moverla); si ya no está en el período que se mira, se cierra.
      setCitaAbierta((abierta) => (abierta ? (resultado.datos.find((cita) => cita.id === abierta.id) ?? null) : null))
    } else setAviso(resultado.error)
    setCargando(false)
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect -- recarga cuando cambia lo que se está mirando
  useEffect(() => { recargar(fecha, modo) }, [fecha, modo, recargar])

  // Si el horario no carga, la agenda se dibuja igual de 8 a 20 y con las
  // horas de las citas que haya: no hace falta avisar.
  useEffect(() => {
    leerHorarioDeAtencion().then((resultado) => {
      if (resultado.ok) setHorario(resultado.datos)
    })
  }, [])

  /** La cita ya cambió de estado en el servidor: la agenda y el detalle la muestran así. */
  const mostrarEstado = (id: string, estado: string) => {
    setCitas((previas) => previas.map((cita) => (cita.id === id ? { ...cita, status: estado } : cita)))
    setCitaAbierta((abierta) => (abierta?.id === id ? { ...abierta, status: estado } : abierta))
  }

  const cambiarEstado = async (id: string, estado: string) => {
    setAviso("")
    const resultado = await cambiarEstadoDeCita(id, estado)
    if (!resultado.ok) return setAviso(resultado.error)
    mostrarEstado(id, estado)
  }

  // Cada vez que se abre, un borrador nuevo del día que se está mirando. Si
  // se conservaba el anterior, el buscador volvía vacío con el cliente de
  // antes todavía elegido por debajo (A1).
  const abrirModal = () => {
    setAvisoDelModal("")
    setAdvertenciasDeNuevaCita([])
    setNuevaCita(citaEnBlanco(fecha))
    setModalAbierto(true)
  }

  // `confirmar`: el segundo envío, después de ver las advertencias (choque,
  // bloqueo, fuera de horario). Guarda igual, como al mover.
  const guardarNuevaCita = async (confirmar: boolean) => {
    if (!nuevaCita.clienteId) return

    setAvisoDelModal("")
    setGuardando(true)
    const resultado = await crearCita(nuevaCita, { confirmar })
    setGuardando(false)

    // El aviso va dentro del modal, que sigue abierto con lo que se cargó: en
    // la página quedaría tapado por el velo del modal.
    if (resultado.tipo === "advertencias") return setAdvertenciasDeNuevaCita(resultado.advertencias)
    setAdvertenciasDeNuevaCita([])
    if (resultado.tipo === "error") return setAvisoDelModal(resultado.error)

    setModalAbierto(false)
    recargar(fecha, modo)
  }

  return (
    <div className="min-h-dvh">
      <BarraSuperior
        titulo="Agenda"
        subtitulo={resumen(cargando, citas.length)}
        accionPrincipal={{ texto: "Nueva cita", onClick: abrirModal }}
      />

      <div className="space-y-4 px-4 pt-6 pb-10 sm:space-y-6 sm:px-6">
        {aviso && <Aviso>{aviso}</Aviso>}

        {puedeBloquear && (
          <div className="flex justify-end">
            <Boton
              variante="secundario"
              tamano="sm"
              icono={<Ban aria-hidden="true" strokeWidth={1.75} />}
              onClick={() => setBloquearAbierto(true)}
            >
              Bloquear horario
            </Boton>
          </div>
        )}

        {/* El calendario en una tarjeta blanca y, desde lg, el detalle de la cita elegida al lado. */}
        <div className="flex items-start gap-6">
          <section
            aria-labelledby={idDelPeriodo}
            aria-busy={cargando}
            className="min-w-0 flex-1 rounded-panel bg-tarjeta text-navy shadow-sm squircle"
          >
            <ControlesDeAgenda
              fechaActual={fecha}
              vista={modo}
              idDelTitulo={idDelPeriodo}
              onAnterior={() => setFecha((actual) => desplazarFecha(actual, modo, -1))}
              onSiguiente={() => setFecha((actual) => desplazarFecha(actual, modo, 1))}
              onHoy={() => setFecha(new Date())}
              onVista={setModo}
            />

            {modo === "semana" && (
              <VistaSemana
                dias={diasDeLaSemanaDe(fecha)}
                citas={citas}
                horario={horario}
                bloqueos={bloqueos}
                onSeleccionar={setCitaAbierta}
                onSeleccionarBloqueo={setBloqueoAbierto}
              />
            )}
            {modo === "dia" && (
              <VistaDia
                fecha={fecha}
                citas={citas}
                horario={horario}
                bloqueos={bloqueos}
                onSeleccionar={setCitaAbierta}
                onSeleccionarBloqueo={setBloqueoAbierto}
              />
            )}
            {modo === "mes" && (
              <VistaMes
                fechaActual={fecha}
                citas={citas}
                onElegirDia={(dia) => {
                  setFecha(dia)
                  setModo("dia")
                }}
              />
            )}
          </section>

          <AnimatePresence>
            {citaAbierta && (
              <PanelDeCita
                cita={citaAbierta}
                onCerrar={() => setCitaAbierta(null)}
                onCambiarEstado={cambiarEstado}
                onMover={setCitaAMover}
                onReactivada={mostrarEstado}
              />
            )}
          </AnimatePresence>
        </div>
      </div>

      <AnimatePresence>
        {modalAbierto && (
          <ModalNuevaCita
            form={nuevaCita}
            guardando={guardando}
            aviso={avisoDelModal}
            advertencias={advertenciasDeNuevaCita}
            onGuardarIgual={() => guardarNuevaCita(true)}
            puedeAsignarProfesional={puedeAsignarProfesional}
            onCambiarCampo={(campo, valor) => {
              setNuevaCita((previa) => ({ ...previa, [campo]: valor }))
              // Las advertencias eran de lo de antes.
              setAdvertenciasDeNuevaCita([])
            }}
            onSubmit={(evento) => {
              evento.preventDefault()
              guardarNuevaCita(false)
            }}
            onCerrar={() => setModalAbierto(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {bloquearAbierto && (
          <ModalBloquearHorario
            dia={fecha}
            eligeAQuien={bloqueaATodos}
            memberIdPropio={actor?.memberId ?? null}
            onCreado={() => {
              setBloquearAbierto(false)
              recargar(fecha, modo)
            }}
            onCerrar={() => setBloquearAbierto(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {bloqueoAbierto && (
          <ModalBloqueo
            bloqueo={bloqueoAbierto}
            puedeQuitar={puedeGestionarBloqueoDe(
              actor,
              bloqueoAbierto.memberId && actor ? { id: bloqueoAbierto.memberId, businessId: actor.businessId } : null
            )}
            onQuitado={() => {
              setBloqueoAbierto(null)
              recargar(fecha, modo)
            }}
            onCerrar={() => setBloqueoAbierto(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {citaAMover && (
          <ModalMoverCita
            cita={citaAMover}
            puedeAsignarProfesional={puedeAsignarProfesional}
            onMovida={() => {
              setCitaAMover(null)
              recargar(fecha, modo)
            }}
            onCerrar={() => setCitaAMover(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
