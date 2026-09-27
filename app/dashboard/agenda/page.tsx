"use client"

import { useState, useEffect, useCallback } from "react"
import { useSession } from "next-auth/react"
import { AnimatePresence } from "framer-motion"
import { BarraSuperior } from "@/components/app/layout/barra-superior"
import { correr, comoTexto, diasDeLaSemanaDe, type UnidadDeTiempo } from "@/nucleo/fechas"
import { leerCitas, crearCita, cambiarEstadoDeCita, type Cita, type DatosDeNuevaCita } from "./_datos"
import { ControlesDeAgenda } from "./_componentes/controlesDeAgenda"
import { VistaSemana } from "./_componentes/vistaSemana"
import { VistaDia } from "./_componentes/vistaDia"
import { VistaMes } from "./_componentes/vistaMes"
import { PanelDeCita } from "./_componentes/panelDeCita"
import { ModalNuevaCita } from "./_componentes/modalNuevaCita"

const CITA_EN_BLANCO: DatosDeNuevaCita = {
  pacienteId: "",
  servicio: "",
  fecha: comoTexto(new Date()),
  horaInicio: "09:00",
  horaFin: "10:00",
  precio: "",
  notas: "",
  memberId: "",
}

function resumen(cargando: boolean, cantidad: number): string {
  if (cargando) return "Cargando..."
  if (cantidad === 0) return "Sin citas en este período"
  return `${cantidad} cita${cantidad === 1 ? "" : "s"} en este período`
}

export default function PaginaAgenda() {
  const { data: sesion } = useSession()
  const puedeAsignarProfesional = sesion?.user.role === "owner" || sesion?.user.role === "admin"

  const [fecha, setFecha] = useState(new Date())
  const [modo, setModo] = useState<UnidadDeTiempo>("semana")
  const [citas, setCitas] = useState<Cita[]>([])
  const [cargando, setCargando] = useState(true)
  const [aviso, setAviso] = useState("")

  const [citaAbierta, setCitaAbierta] = useState<Cita | null>(null)
  const [modalAbierto, setModalAbierto] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [nuevaCita, setNuevaCita] = useState<DatosDeNuevaCita>(CITA_EN_BLANCO)

  const recargar = useCallback(async (fecha: Date, modo: UnidadDeTiempo) => {
    setCargando(true)
    const resultado = await leerCitas(fecha, modo)
    if (resultado.ok) setCitas(resultado.datos)
    else setAviso(resultado.error)
    setCargando(false)
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect -- recarga cuando cambia lo que se está mirando
  useEffect(() => { recargar(fecha, modo) }, [fecha, modo, recargar])

  const cambiarEstado = async (id: string, estado: string) => {
    setAviso("")
    const resultado = await cambiarEstadoDeCita(id, estado)
    if (!resultado.ok) return setAviso(resultado.error)

    setCitas((previas) => previas.map((c) => (c.id === id ? { ...c, status: estado } : c)))
    setCitaAbierta((abierta) => (abierta?.id === id ? { ...abierta, status: estado } : abierta))
  }

  const guardarNuevaCita = async (evento: React.SyntheticEvent<HTMLFormElement>) => {
    evento.preventDefault()
    if (!nuevaCita.pacienteId) return

    setAviso("")
    setGuardando(true)
    const resultado = await crearCita(nuevaCita)
    setGuardando(false)

    if (!resultado.ok) return setAviso(resultado.error)

    setModalAbierto(false)
    setNuevaCita(CITA_EN_BLANCO)
    recargar(fecha, modo)
  }

  return (
    <div className="min-h-screen">
      <BarraSuperior
        titulo="Agenda"
        subtitulo={resumen(cargando, citas.length)}
        accionPrincipal={{ texto: "Nueva cita", onClick: () => setModalAbierto(true) }}
      />

      <div className="p-6">
        {aviso && (
          <p role="alert" className="text-sm text-red-500 mb-4">
            {aviso}
          </p>
        )}

        <ControlesDeAgenda
          fechaActual={fecha}
          vista={modo}
          onAnterior={() => setFecha((actual) => correr(actual, modo, -1))}
          onSiguiente={() => setFecha((actual) => correr(actual, modo, 1))}
          onHoy={() => setFecha(new Date())}
          onVista={setModo}
        />

        <div className="flex gap-6">
          <div className="flex-1 bg-card border border-border/50 rounded-xl overflow-hidden">
            {modo === "semana" && (
              <VistaSemana dias={diasDeLaSemanaDe(fecha)} citas={citas} onSeleccionar={setCitaAbierta} />
            )}
            {modo === "dia" && (
              <VistaDia fecha={fecha} citas={citas} onSeleccionar={setCitaAbierta} />
            )}
            {modo === "mes" && (
              <VistaMes
                fechaActual={fecha}
                citas={citas}
                onDiaClick={(dia) => {
                  setFecha(dia)
                  setModo("dia")
                }}
              />
            )}
          </div>

          <AnimatePresence>
            {citaAbierta && (
              <PanelDeCita
                cita={citaAbierta}
                onCerrar={() => setCitaAbierta(null)}
                onCambiarEstado={cambiarEstado}
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
            puedeAsignarProfesional={puedeAsignarProfesional}
            onFormChange={(campo, valor) => setNuevaCita((previa) => ({ ...previa, [campo]: valor }))}
            onSubmit={guardarNuevaCita}
            onCerrar={() => setModalAbierto(false)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
