"use client"

import { useState, useEffect, useCallback, useId, useRef } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import {
  actorDeSesion,
  esClinicaDental,
  gestionaElNegocio,
  puedeAsignarCitasAOtros,
  puedeGestionarBloqueoDe,
  puedeGestionarSillones,
  puedeVerListaDeEspera,
  veSillones,
} from "@/lib/permisos"
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
  conEstadoNuevo,
  hayProfesionales,
  leerHorarioDeAtencion,
  leerProfesionales,
  leerSillones,
  leerClienteParaLaCita,
  llegadaALaAgenda,
  type Bloqueo,
  type Cita,
  type DatosDeNuevaCita,
  type Profesional,
  type SillonDeLaAgenda,
  type SillonDeLaCita,
} from "./_datos"
import type { VerPor } from "./_grilla-del-dia"
import { Aviso } from "@/components/panel/aviso"
import { useRubroDelPanel } from "@/components/panel/contexto-rubro"
import { vocabularioDe } from "@/lib/vocabulario"
import { ControlesDeAgenda } from "./_componentes/controles-de-agenda"
import { VistaSemana } from "./_componentes/vista-semana"
import { VistaDia } from "./_componentes/vista-dia"
import { GrillaDelDia } from "./_componentes/grilla-del-dia"
import { VistaMes } from "./_componentes/vista-mes"
import { PanelDeCita } from "./_componentes/panel-de-cita"
import { ModalNuevaCita } from "./_componentes/modal-nueva-cita"
import { ModalMoverCita } from "./_componentes/modal-mover-cita"
import { ModalBloquearHorario } from "./_componentes/modal-bloquear-horario"
import { ModalBloqueo } from "./_componentes/modal-bloqueo"
import { ListaDeEsperaDelDia } from "./_componentes/lista-de-espera-del-dia"
import { useZonaDelNegocio } from "./_componentes/zona-del-negocio"
import { useSedesDeLaAgenda } from "./_componentes/sedes-de-la-agenda"
import { sedeDelBorrador } from "./_sedes"
import { useEsEscritorio } from "./_componentes/usar-escritorio"
import { frasesDeLaAgenda } from "./_frases"
import { hoyEn } from "./_hora-del-negocio"

export default function PaginaAgenda() {
  const { data: sesion } = useSession()
  const router = useRouter()
  const actor = actorDeSesion(sesion)
  // Las palabras del rubro: "hora" en un salón, "cita" en una clínica o sin rubro.
  const { palabras } = vocabularioDe(useRubroDelPanel())
  const frases = frasesDeLaAgenda(palabras)
  const puedeAsignarProfesional = puedeAsignarCitasAOtros(actor)
  // Dueño y encargado bloquean a cualquiera o a todo el negocio; el
  // profesional, su agenda. Sin `memberId`, nada (no ve el botón).
  const bloqueaATodos = gestionaElNegocio(actor)
  const miembroPropio = actor?.memberId ? { id: actor.memberId, businessId: actor.businessId } : null
  const puedeBloquear = bloqueaATodos || puedeGestionarBloqueoDe(actor, miembroPropio)
  // Clínica dental: la vista Día en grilla por sillón u odontólogo, el sillón
  // de cada cita y la alerta de alergias. En otro rubro, la agenda de siempre.
  const clinica = esClinicaDental(actor)
  const conSillones = clinica && veSillones(actor)

  // Etapa 9: con varias sedes cada hora dice la suya y "Nueva cita" pide la sede.
  // El servidor decide el modo y trae las sedes activas (layout); con una sola
  // sede o ninguna, la agenda es la de siempre.
  const { modo: modoDeSedes, sedes } = useSedesDeLaAgenda()
  const conVariasSedes = modoDeSedes === "varias"

  // "Hoy" es el del negocio, no el del navegador (#99).
  const zona = useZonaDelNegocio()
  const [fecha, setFecha] = useState(() => hoyEn(zona))
  const [modo, setModo] = useState<UnidadDeTiempo>("semana")
  const [citas, setCitas] = useState<Cita[]>([])
  const [cargando, setCargando] = useState(true)
  const [aviso, setAviso] = useState("")

  const [citaAbierta, setCitaAbierta] = useState<Cita | null>(null)
  // El error de la última acción sobre la cita abierta: en el celular el
  // detalle tapa la página y se repite adentro (#136).
  const [avisoDelDetalle, setAvisoDelDetalle] = useState("")
  const escritorio = useEsEscritorio()
  const [modalAbierto, setModalAbierto] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [avisoDelModal, setAvisoDelModal] = useState("")
  // Clínica dental: el aviso del modal es el 409 del sillón ocupado.
  const [sillonOcupadoEnElModal, setSillonOcupadoEnElModal] = useState(false)
  const [nuevaCita, setNuevaCita] = useState<DatosDeNuevaCita>(() => citaEnBlanco(hoyEn(zona)))
  const [citaAMover, setCitaAMover] = useState<Cita | null>(null)
  // El modal de mover, sólo para elegir el profesional de una cita sin asignar (#103).
  const [soloAsignar, setSoloAsignar] = useState(false)
  // Si hay profesionales a quien asignar: sólo entonces se destacan las citas sin profesional.
  const [conProfesionales, setConProfesionales] = useState(false)
  const [horario, setHorario] = useState<FranjaDelDia[]>([])
  const [bloqueos, setBloqueos] = useState<Bloqueo[]>([])
  const [advertenciasDeNuevaCita, setAdvertenciasDeNuevaCita] = useState<Advertencia[]>([])
  const [bloquearAbierto, setBloquearAbierto] = useState(false)
  const [bloqueoAbierto, setBloqueoAbierto] = useState<Bloqueo | null>(null)
  // Quienes atienden (lo pide sólo quien asigna): las columnas por odontólogo.
  const [equipo, setEquipo] = useState<Profesional[]>([])
  const [sillones, setSillones] = useState<SillonDeLaAgenda[]>([])
  const [avisoDeSillones, setAvisoDeSillones] = useState("")
  const [verPor, setVerPor] = useState<VerPor>("sillon")
  const idDelPeriodo = useId()

  // Las palabras del último render: el aviso de una carga que falla las usa sin
  // volver a crear `recargar` (que recargaría la agenda en cada render).
  const palabrasVigentes = useRef(palabras)
  useEffect(() => {
    palabrasVigentes.current = palabras
  })

  // El número de la última carga pedida: la respuesta de una anterior (pasar
  // rápido de semana, o una recarga lenta) llega tarde y no pisa a la nueva.
  const ultimaCarga = useRef(0)

  const recargar = useCallback(async (fecha: Date, modo: UnidadDeTiempo) => {
    const numero = ++ultimaCarga.current
    setCargando(true)
    const [resultado, deBloqueos] = await Promise.all([leerCitas(fecha, modo, palabrasVigentes.current), leerBloqueos(fecha, modo)])
    if (numero !== ultimaCarga.current) return
    // Si los bloqueos no cargan, la agenda se muestra igual, sin las franjas, y se avisa.
    setBloqueos(deBloqueos.ok ? deBloqueos.datos : [])
    if (resultado.ok) {
      setCitas(resultado.datos)
      // El detalle abierto muestra la cita como quedó (por ejemplo, después de
      // moverla); si ya no está en el período que se mira, se cierra.
      setCitaAbierta((abierta) => (abierta ? (resultado.datos.find((cita) => cita.id === abierta.id) ?? null) : null))
    }
    // Lo que se avisó de una carga anterior se va cuando ésta llega bien.
    setAviso(!resultado.ok ? resultado.error : !deBloqueos.ok ? deBloqueos.error : "")
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

  // Sólo quien asigna (dueña y encargado) lo pide. Si no carga, no se destaca
  // nada: la agenda se ve como antes.
  useEffect(() => {
    if (!puedeAsignarProfesional) return
    leerProfesionales().then((resultado) => {
      if (!resultado.ok) return
      setConProfesionales(hayProfesionales(resultado.datos))
      setEquipo(resultado.datos)
    })
  }, [puedeAsignarProfesional])

  // Clínica dental: los sillones (todo rol de la clínica los lee). Si no
  // cargan, la grilla lo dice y muestra los que traen las citas.
  useEffect(() => {
    if (!conSillones) return
    leerSillones().then((resultado) => {
      if (resultado.ok) {
        setSillones(resultado.datos)
        setAvisoDeSillones("")
      } else setAvisoDeSillones(resultado.error)
    })
  }, [conSillones])

  const abrirMover = (cita: Cita, asignar: boolean) => {
    setSoloAsignar(asignar)
    setCitaAMover(cita)
  }

  /** La cita ya cambió de estado en el servidor: la agenda y el detalle la muestran así. */
  const mostrarEstado = (id: string, estado: string) => {
    setCitas((previas) => previas.map((cita) => (cita.id === id ? { ...cita, status: estado } : cita)))
    setCitaAbierta((abierta) => (abierta?.id === id ? { ...abierta, status: estado } : abierta))
  }

  /**
   * Cambia el estado y muestra la cita como la devolvió el servidor: al
   * cancelarla, el detalle ya dice quién y cuándo. Devuelve el error (vacío
   * si salió bien), para el modal que pidió confirmar.
   */
  const cambiarEstado = async (id: string, estado: string): Promise<string> => {
    setAviso("")
    setAvisoDelDetalle("")
    const resultado = await cambiarEstadoDeCita(id, estado)
    if (!resultado.ok) {
      setAvisoDelDetalle(resultado.error)
      setAviso(resultado.error)
      return resultado.error
    }
    // El 200 es con la cita ya en `estado`; de la respuesta se toma quién y cuándo la canceló.
    const guardada = { ...resultado.datos, status: estado }
    setCitas((previas) => previas.map((cita) => (cita.id === id ? conEstadoNuevo(cita, guardada) : cita)))
    setCitaAbierta((abierta) => (abierta?.id === id ? conEstadoNuevo(abierta, guardada) : abierta))
    return ""
  }

  /** Clínica dental: el sillón ya se asignó en el servidor; la agenda y el detalle lo muestran. */
  const mostrarSillon = (id: string, sillonId: string | null, sillon: SillonDeLaCita | null) => {
    const conSillon = (cita: Cita) => (cita.id === id ? { ...cita, sillonId, sillon } : cita)
    setCitas((previas) => previas.map(conSillon))
    setCitaAbierta((abierta) => abierta && conSillon(abierta))
  }

  const abrirCita = (cita: Cita) => {
    setAvisoDelDetalle("")
    setCitaAbierta(cita)
  }

  // Cada vez que se abre, un borrador nuevo del día que se está mirando. Si
  // se conservaba el anterior, el buscador volvía vacío con el cliente de
  // antes todavía elegido por debajo (A1).
  // `cliente`: el que ya viene elegido (al llegar con `?cliente=<id>`).
  const abrirModal = (cliente?: { id: string; nombre: string }) => {
    setAvisoDelModal("")
    setSillonOcupadoEnElModal(false)
    setAdvertenciasDeNuevaCita([])
    const borrador = cliente
      ? { ...citaEnBlanco(fecha), clienteId: cliente.id, clienteNombre: cliente.nombre }
      : citaEnBlanco(fecha)
    // En la clínica, el borrador lleva el sillón (vacío: sin sillón); en otro rubro, ni la clave.
    // Con varias sedes, la sede (vacía: todavía sin elegir); con una o ninguna, ni la clave.
    setNuevaCita({ ...(conSillones ? { ...borrador, sillonId: "" } : borrador), ...sedeDelBorrador(modoDeSedes) })
    setModalAbierto(true)
  }

  // Desde el inicio ("Nueva cita") se llega con `?nueva=1`, y desde un
  // cliente ("Agendar cita") además con `&cliente=<id>`: se abre el modal,
  // con ese cliente elegido si el servidor lo devuelve (es del negocio; si no,
  // 404 y se abre sin cliente), y se sacan los dos de la dirección para que
  // recargar o volver no lo abra otra vez. El cliente se lee ANTES de abrir:
  // el buscador del modal arranca con el nombre del borrador.
  //
  // La respuesta del cliente llega después: abre con el `abrirModal` del
  // último render (el día y el rubro ya cargados), no con el del primero. Sin
  // cancelar al desmontar a propósito: en desarrollo React monta dos veces y
  // la segunda no vuelve a leer la dirección (`abrirModalAlLlegar`).
  const abrirModalAlLlegar = useRef(true)
  const abrirModalVigente = useRef(abrirModal)
  useEffect(() => {
    abrirModalVigente.current = abrirModal
  })
  useEffect(() => {
    if (!abrirModalAlLlegar.current) return
    abrirModalAlLlegar.current = false
    const llegada = llegadaALaAgenda(window.location.search)
    if (!llegada.nueva) return
    router.replace(`${window.location.pathname}${llegada.resto ? `?${llegada.resto}` : ""}`, { scroll: false })
    if (!llegada.clienteId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- la dirección sólo se lee en el navegador, al llegar
      abrirModal()
      return
    }
    leerClienteParaLaCita(llegada.clienteId).then((cliente) => abrirModalVigente.current(cliente ?? undefined))
    // Sólo al llegar: `abrirModal` cambia en cada render y no debe volver a correr esto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // `confirmar`: el segundo envío, después de ver las advertencias (choque,
  // bloqueo, fuera de horario). Guarda igual, como al mover.
  const guardarNuevaCita = async (confirmar: boolean) => {
    // Escribir el nombre no basta: el buscador es para elegir de la lista. Se
    // dice qué falta en vez de no hacer nada.
    if (!nuevaCita.clienteId) {
      setAdvertenciasDeNuevaCita([])
      setSillonOcupadoEnElModal(false)
      return setAvisoDelModal(frases.elegirClienteDeLaLista)
    }

    setAvisoDelModal("")
    setSillonOcupadoEnElModal(false)
    setGuardando(true)
    const resultado = await crearCita(nuevaCita, zona, { confirmar }, palabras)
    setGuardando(false)

    // El aviso va dentro del modal, que sigue abierto con lo que se cargó: en
    // la página quedaría tapado por el velo del modal.
    if (resultado.tipo === "advertencias") return setAdvertenciasDeNuevaCita(resultado.advertencias)
    setAdvertenciasDeNuevaCita([])
    if (resultado.tipo === "error") {
      setSillonOcupadoEnElModal(resultado.sillonOcupado === true)
      return setAvisoDelModal(resultado.error)
    }

    setModalAbierto(false)
    recargar(fecha, modo)
  }

  return (
    <div className="min-h-dvh">
      <BarraSuperior
        titulo="Agenda"
        subtitulo={frases.resumenDelPeriodo(cargando, citas.length)}
        accionPrincipal={{ texto: frases.nuevaCita, onClick: () => abrirModal() }}
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

        {/* El calendario en una tarjeta blanca y, desde lg, el detalle de la cita elegida al lado (más angosto, encima). */}
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
              onHoy={() => setFecha(hoyEn(zona))}
              onVista={setModo}
            />

            {modo === "semana" && (
              <VistaSemana
                dias={diasDeLaSemanaDe(fecha)}
                citas={citas}
                horario={horario}
                bloqueos={bloqueos}
                onSeleccionar={abrirCita}
                onSeleccionarBloqueo={setBloqueoAbierto}
                destacarSinProfesional={conProfesionales}
              />
            )}
            {modo === "dia" && clinica && (
              <GrillaDelDia
                fecha={fecha}
                citas={citas}
                horario={horario}
                bloqueos={bloqueos}
                sillones={sillones}
                equipo={equipo}
                verPor={verPor}
                onVerPor={setVerPor}
                onSeleccionar={abrirCita}
                onSeleccionarBloqueo={setBloqueoAbierto}
                citaElegidaId={citaAbierta?.id ?? null}
                destacarSinProfesional={conProfesionales}
                gestionaSillones={puedeGestionarSillones(actor)}
                avisoDeSillones={avisoDeSillones}
              />
            )}
            {modo === "dia" && !clinica && (
              <VistaDia
                fecha={fecha}
                citas={citas}
                horario={horario}
                bloqueos={bloqueos}
                onSeleccionar={abrirCita}
                onSeleccionarBloqueo={setBloqueoAbierto}
                destacarSinProfesional={conProfesionales}
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

          {/* En el celular el detalle es un diálogo: mientras se mueve o se asigna la
              cita se aparta, para no tener dos diálogos peleándose el foco, y
              vuelve al cerrar ese modal. */}
          <AnimatePresence>
            {citaAbierta && (escritorio || !citaAMover) && (
              <PanelDeCita
                cita={citaAbierta}
                onCerrar={() => setCitaAbierta(null)}
                onCambiarEstado={cambiarEstado}
                onMover={(cita) => abrirMover(cita, false)}
                onAsignar={(cita) => abrirMover(cita, true)}
                destacarSinProfesional={conProfesionales}
                onReactivada={mostrarEstado}
                aviso={avisoDelDetalle}
                sillones={conSillones ? sillones : null}
                onSillonAsignado={mostrarSillon}
              />
            )}
          </AnimatePresence>
        </div>

        {modo === "dia" && puedeVerListaDeEspera(actor) && <ListaDeEsperaDelDia fecha={fecha} />}
      </div>

      <AnimatePresence>
        {modalAbierto && (
          <ModalNuevaCita
            form={nuevaCita}
            guardando={guardando}
            aviso={avisoDelModal}
            avisoDeSillonOcupado={sillonOcupadoEnElModal}
            sillones={conSillones ? sillones : null}
            sedes={conVariasSedes ? sedes : null}
            advertencias={advertenciasDeNuevaCita}
            onGuardarIgual={() => guardarNuevaCita(true)}
            puedeAsignarProfesional={puedeAsignarProfesional}
            onCambiarCampo={(campo, valor) => {
              setNuevaCita((previa) => ({ ...previa, [campo]: valor }))
              // Las advertencias eran de lo de antes.
              setAdvertenciasDeNuevaCita([])
              // El sillón ocupado también: con otro sillón u otra hora, ya no es ese el aviso.
              if (sillonOcupadoEnElModal) {
                setSillonOcupadoEnElModal(false)
                setAvisoDelModal("")
              }
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
            soloAsignar={soloAsignar}
            sillones={conSillones ? sillones : null}
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
