"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { BarraSuperior } from "@/components/app/layout/barra-superior"
import { FiltrosCierreTurno } from "./filtrosCierreTurno"
import { TablaCierresTurno } from "./tablaCierresTurno"
import { ModalNuevoCierre } from "./modalNuevoCierre"
import { PanelDetalleCierre } from "./panelDetalleCierre"
import type { CierreTurnoAPI } from "./tipos"

interface PaginaCierreTurnoProps {
  puedeVerTodo: boolean
  puedeCrear: boolean
  puedeEditar: boolean
  puedeRevisar: boolean
  puedeEliminar: boolean
}

export function PaginaCierreTurno({
  puedeVerTodo,
  puedeCrear,
  puedeEditar,
  puedeRevisar,
  puedeEliminar,
}: PaginaCierreTurnoProps) {
  const [cierres, setCierres] = useState<CierreTurnoAPI[]>([])
  const [total, setTotal] = useState(0)
  const [cargando, setCargando] = useState(true)
  const [modalAbierto, setModalAbierto] = useState(false)
  const [seleccionado, setSeleccionado] = useState<CierreTurnoAPI | null>(null)

  const [periodo, setPeriodo] = useState("Todos")
  const [estado, setEstado] = useState("Todos")
  const [trabajadorId, setTrabajadorId] = useState("Todos")

  const trabajadores = useMemo(() => {
    const mapa = new Map<string, string>()
    cierres.forEach((c) => {
      if (c.closedBy?.user?.name) mapa.set(c.closedById, c.closedBy.user.name)
    })
    return Array.from(mapa.entries()).map(([id, nombre]) => ({ id, nombre }))
  }, [cierres])

  const fetchCierres = useCallback(async () => {
    setCargando(true)
    const params = new URLSearchParams({ page: "1", limit: "50" })
    if (estado !== "Todos") params.set("status", estado)
    if (puedeVerTodo && trabajadorId !== "Todos") params.set("workerId", trabajadorId)
    try {
      const res = await fetch(`/api/shift-close?${params}`)
      const data = await res.json()
      let lista: CierreTurnoAPI[] = data.cierres ?? []
      if (periodo !== "Todos") {
        lista = lista.filter((c) => c.shiftPeriod === periodo)
      }
      setCierres(lista)
      setTotal(data.total ?? lista.length)
    } catch {
      /* silencioso */
    } finally {
      setCargando(false)
    }
  }, [estado, periodo, trabajadorId, puedeVerTodo])

  useEffect(() => {
    fetchCierres()
  }, [fetchCierres])

  const crearCierre = async (datos: {
    shiftDate: string
    shiftPeriod?: string
    shiftStartTime?: string
    shiftEndTime?: string
  }) => {
    const res = await fetch("/api/shift-close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(datos),
    })
    if (res.ok) {
      const nuevo = await res.json()
      setModalAbierto(false)
      await fetchCierres()
      setSeleccionado(nuevo)
    }
  }

  const guardarCierre = async (id: string, datos: Record<string, unknown>) => {
    const res = await fetch(`/api/shift-close/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(datos),
    })
    if (res.ok) {
      const actualizado = await res.json()
      setSeleccionado(actualizado)
      await fetchCierres()
    }
  }

  const recalcularCierre = async (id: string) => {
    const res = await fetch(`/api/shift-close/${id}/recalculate`, { method: "POST" })
    if (res.ok) {
      const actualizado = await res.json()
      setSeleccionado(actualizado)
      await fetchCierres()
    }
  }

  return (
    <div className="min-h-screen">
      <BarraSuperior
        titulo="Cierre de Turno"
        subtitulo={cargando ? "Cargando..." : `${total} cierres registrados`}
        accionPrincipal={puedeCrear ? { texto: "Nuevo Cierre", onClick: () => setModalAbierto(true) } : undefined}
      />

      <div className="p-6">
        <FiltrosCierreTurno
          periodo={periodo}
          onPeriodo={setPeriodo}
          estado={estado}
          onEstado={setEstado}
          trabajadorId={trabajadorId}
          onTrabajador={setTrabajadorId}
          trabajadores={trabajadores}
          mostrarFiltroTrabajador={puedeVerTodo}
        />

        <TablaCierresTurno cierres={cierres} cargando={cargando} onSeleccionar={setSeleccionado} />
      </div>

      {modalAbierto && (
        <ModalNuevoCierre
          abierto={modalAbierto}
          onCerrar={() => setModalAbierto(false)}
          onCrear={crearCierre}
        />
      )}

      {seleccionado && (
        <PanelDetalleCierre
          cierre={seleccionado}
          puedeEditar={puedeEditar}
          puedeRevisar={puedeRevisar}
          onCerrarPanel={() => setSeleccionado(null)}
          onGuardar={guardarCierre}
          onRecalcular={recalcularCierre}
        />
      )}
    </div>
  )
}
