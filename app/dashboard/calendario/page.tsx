"use client"

import { useState, useEffect, useCallback } from "react"
import { AnimatePresence } from "framer-motion"
import { BarraSuperior } from "@/components/app/layout/barra-superior"
import { ControlesCalendario, type VistaCalendario } from "./_components/controlesCalendario"
import { VistaCalendarioSemana } from "./_components/vistaCalendarioSemana"
import { VistaCalendarioDia } from "./_components/vistaCalendarioDia"
import { VistaCalendarioMes } from "./_components/vistaCalendarioMes"
import { PanelDetalleCita, type CitaAPI } from "./_components/panelDetalleCita"
import { ModalNuevaCita, type FormNuevaCita } from "./_components/modalNuevaCita"

function obtenerDiasSemana(fecha: Date): Date[] {
  const inicio = new Date(fecha)
  inicio.setDate(inicio.getDate() - inicio.getDay())
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(inicio)
    d.setDate(d.getDate() + i)
    return d
  })
}

function toISO(fecha: Date): string {
  return fecha.toISOString().split("T")[0]
}

const FORM_INICIAL: FormNuevaCita = {
  pacienteId: "",
  servicio: "",
  fecha: toISO(new Date()),
  horaInicio: "09:00",
  horaFin: "10:00",
  precio: "",
  notas: "",
}

export default function PaginaCalendario() {
  const [fechaActual, setFechaActual] = useState(new Date())
  const [vista, setVista] = useState<VistaCalendario>("semana")
  const [citasAPI, setCitasAPI] = useState<CitaAPI[]>([])
  const [cargando, setCargando] = useState(true)
  const [citaSeleccionada, setCitaSeleccionada] = useState<CitaAPI | null>(null)
  const [modalAbierto, setModalAbierto] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [formNueva, setFormNueva] = useState<FormNuevaCita>(FORM_INICIAL)

  const fetchCitas = useCallback(async (fecha: Date, v: VistaCalendario) => {
    setCargando(true)
    try {
      let url: string
      if (v === "dia") {
        url = `/api/citas?fecha=${toISO(fecha)}`
      } else if (v === "semana") {
        const dias = obtenerDiasSemana(fecha)
        url = `/api/citas?desde=${toISO(dias[0])}&hasta=${toISO(dias[6])}`
      } else {
        const desde = new Date(fecha.getFullYear(), fecha.getMonth(), 1)
        const hasta = new Date(fecha.getFullYear(), fecha.getMonth() + 1, 0)
        url = `/api/citas?desde=${toISO(desde)}&hasta=${toISO(hasta)}`
      }
      const res = await fetch(url)
      if (res.ok) setCitasAPI(await res.json())
    } catch { /* silencioso */ }
    finally { setCargando(false) }
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetches appointments whenever the visible date/view changes
  useEffect(() => { fetchCitas(fechaActual, vista) }, [fechaActual, vista, fetchCitas])

  const irAnterior = () => {
    setFechaActual((prev) => {
      const d = new Date(prev)
      if (vista === "dia") d.setDate(d.getDate() - 1)
      else if (vista === "semana") d.setDate(d.getDate() - 7)
      else d.setMonth(d.getMonth() - 1)
      return d
    })
  }

  const irSiguiente = () => {
    setFechaActual((prev) => {
      const d = new Date(prev)
      if (vista === "dia") d.setDate(d.getDate() + 1)
      else if (vista === "semana") d.setDate(d.getDate() + 7)
      else d.setMonth(d.getMonth() + 1)
      return d
    })
  }

  const cambiarEstado = async (id: string, status: string) => {
    await fetch(`/api/citas/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    })
    setCitasAPI((prev) => prev.map((c) => (c.id === id ? { ...c, status } : c)))
    if (citaSeleccionada?.id === id) setCitaSeleccionada((prev) => prev ? { ...prev, status } : null)
  }

  const crearCita = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!formNueva.pacienteId) return
    setGuardando(true)
    try {
      const startTime = new Date(`${formNueva.fecha}T${formNueva.horaInicio}:00`)
      const endTime = new Date(`${formNueva.fecha}T${formNueva.horaFin}:00`)
      const res = await fetch("/api/citas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formNueva.servicio,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          patientId: formNueva.pacienteId,
          price: formNueva.precio ? parseFloat(formNueva.precio) : undefined,
          notes: formNueva.notas || undefined,
        }),
      })
      if (res.ok) {
        setModalAbierto(false)
        setFormNueva(FORM_INICIAL)
        fetchCitas(fechaActual, vista)
      }
    } finally {
      setGuardando(false)
    }
  }

  const totalCitas = cargando ? null : citasAPI.length

  return (
    <div className="min-h-screen">
      <BarraSuperior
        titulo="Calendario"
        subtitulo={
          cargando ? "Cargando..." :
          totalCitas === 0 ? "Sin citas en este período" :
          `${totalCitas} cita${totalCitas === 1 ? "" : "s"} en este período`
        }
        accionPrincipal={{ texto: "Nueva cita", onClick: () => setModalAbierto(true) }}
      />

      <div className="p-6">
        <ControlesCalendario
          fechaActual={fechaActual}
          vista={vista}
          onAnterior={irAnterior}
          onSiguiente={irSiguiente}
          onHoy={() => setFechaActual(new Date())}
          onVista={setVista}
        />

        <div className="flex gap-6">
          <div className="flex-1 bg-card border border-border/50 rounded-xl overflow-hidden">
            {vista === "semana" && (
              <VistaCalendarioSemana
                dias={obtenerDiasSemana(fechaActual)}
                citasAPI={citasAPI}
                onSeleccionar={setCitaSeleccionada}
              />
            )}
            {vista === "dia" && (
              <VistaCalendarioDia
                fecha={fechaActual}
                citasAPI={citasAPI}
                onSeleccionar={setCitaSeleccionada}
              />
            )}
            {vista === "mes" && (
              <VistaCalendarioMes
                fechaActual={fechaActual}
                citasAPI={citasAPI}
                onDiaClick={(fecha) => {
                  setFechaActual(fecha)
                  setVista("dia")
                }}
              />
            )}
          </div>

          <AnimatePresence>
            {citaSeleccionada && (
              <PanelDetalleCita
                cita={citaSeleccionada}
                onCerrar={() => setCitaSeleccionada(null)}
                onCambiarEstado={cambiarEstado}
              />
            )}
          </AnimatePresence>
        </div>
      </div>

      <AnimatePresence>
        {modalAbierto && (
          <ModalNuevaCita
            form={formNueva}
            guardando={guardando}
            onFormChange={(campo, valor) => setFormNueva((p) => ({ ...p, [campo]: valor }))}
            onSubmit={crearCita}
            onCerrar={() => setModalAbierto(false)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
