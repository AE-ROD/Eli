"use client"

import { useEffect, useState, useCallback, useMemo } from "react"
import { useSearchParams } from "next/navigation"
import { BarraSuperior } from "@/components/app/layout/barra-superior"
import { SelectorPeriodo, rangoPorDefecto, type RangoPeriodo } from "../../_components/selectorPeriodo"
import { BarraAcciones } from "../../_components/barraAcciones"
import { EstilosImpresion } from "../../_components/estilosImpresion"
import { ModalProgramarReporte } from "../../_components/modalProgramarReporte"
import { ModalGuardarReporte } from "../../_components/modalGuardarReporte"
import { exportarFilasComoCsv } from "../../_components/exportUtils"
import type { TipoReporte } from "../page"
import { VistaIngresos } from "./vistaIngresos"
import { VistaCitas } from "./vistaCitas"
import { VistaServicios } from "./vistaServicios"
import { VistaTrabajadores } from "./vistaTrabajadores"
import { VistaClientes } from "./vistaClientes"
import { VistaOcupacion } from "./vistaOcupacion"
import { VistaCierres, type ShiftClosesResponse } from "./vistaCierres"
import type {
  RevenueResponse,
  AppointmentsResponse,
  ServicesResponse,
  StaffResponse,
  PatientsResponse,
  OccupancyResponse,
} from "./tipos"

interface Props {
  tipo: TipoReporte
  timezone: string
  puedeProgramar: boolean
  trabajadores: { id: string; nombre: string }[]
  servicios: { id: string; nombre: string }[]
}

const TIPO_INFO: Record<TipoReporte, { titulo: string; endpoint: string; reportType: string }> = {
  ingresos: { titulo: "Reporte de Ingresos", endpoint: "/api/reports/revenue", reportType: "INGRESOS" },
  citas: { titulo: "Reporte de Citas", endpoint: "/api/reports/appointments", reportType: "CITAS" },
  servicios: { titulo: "Reporte de Servicios", endpoint: "/api/reports/services", reportType: "SERVICIOS" },
  trabajadores: { titulo: "Reporte de Trabajadores", endpoint: "/api/reports/staff", reportType: "TRABAJADORES" },
  clientes: { titulo: "Reporte de Clientes", endpoint: "/api/reports/patients", reportType: "CLIENTES" },
  ocupacion: { titulo: "Reporte de Ocupación", endpoint: "/api/reports/occupancy", reportType: "OCUPACION" },
  cierres: { titulo: "Reporte de Cierres de Turno", endpoint: "/api/reports/shift-closes", reportType: "CIERRES" },
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DatosReporte = any

export function PaginaReporteDetalle({ tipo, puedeProgramar, trabajadores, servicios }: Props) {
  const searchParams = useSearchParams()
  const savedId = searchParams.get("savedId")

  const [rango, setRango] = useState<RangoPeriodo>(rangoPorDefecto())
  const [workerId, setWorkerId] = useState<string>("")
  const [serviceId, setServiceId] = useState<string>("")
  const [datos, setDatos] = useState<DatosReporte | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState("")
  const [modalProgramarAbierto, setModalProgramarAbierto] = useState(false)
  const [modalGuardarAbierto, setModalGuardarAbierto] = useState(false)
  const [filtrosCargadosDeGuardado, setFiltrosCargadosDeGuardado] = useState(false)

  const info = TIPO_INFO[tipo]

  // Si viene de un reporte guardado, cargar sus filtros una vez
  useEffect(() => {
    if (!savedId || filtrosCargadosDeGuardado) return
    setFiltrosCargadosDeGuardado(true)
    fetch("/api/reports/saved")
      .then((r) => r.json())
      .then((data) => {
        const guardado = data.reports?.find((r: { id: string }) => r.id === savedId)
        if (guardado?.filters) {
          const f = guardado.filters as { from?: string; to?: string; workerId?: string; serviceId?: string }
          if (f.from && f.to) setRango({ from: f.from, to: f.to })
          if (f.workerId) setWorkerId(f.workerId)
          if (f.serviceId) setServiceId(f.serviceId)
        }
      })
      .catch(() => {})
  }, [savedId, filtrosCargadosDeGuardado])

  const cargar = useCallback(async () => {
    setCargando(true)
    setError("")
    const params = new URLSearchParams({ from: rango.from, to: rango.to })
    if (workerId) params.set("workerId", workerId)
    if (serviceId) params.set("serviceId", serviceId)

    const res = await fetch(`${info.endpoint}?${params.toString()}`)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? "Error al cargar el reporte")
      setDatos(null)
      setCargando(false)
      return
    }
    const data = await res.json()
    setDatos(data)
    setCargando(false)
  }, [info.endpoint, rango.from, rango.to, workerId, serviceId])

  useEffect(() => {
    cargar()
  }, [cargar])

  const filtrosActuales = useMemo(
    () => ({ from: rango.from, to: rango.to, workerId: workerId || undefined, serviceId: serviceId || undefined }),
    [rango.from, rango.to, workerId, serviceId]
  )

  const manejarExportarCsv = () => {
    if (!datos) return
    const nombreArchivo = `${tipo}_${rango.from}_${rango.to}.csv`

    let filas: Record<string, unknown>[] = []
    if (tipo === "ingresos") filas = (datos as RevenueResponse).byWorker
    else if (tipo === "citas") filas = (datos as AppointmentsResponse).byService
    else if (tipo === "servicios") filas = (datos as ServicesResponse).ranking
    else if (tipo === "trabajadores") filas = (datos as StaffResponse).workers
    else if (tipo === "clientes") filas = (datos as PatientsResponse).topByVisits
    else if (tipo === "ocupacion") filas = (datos as OccupancyResponse).heatmap.filter((h) => h.available > 0)
    else if (tipo === "cierres") filas = (datos as ShiftClosesResponse).history

    exportarFilasComoCsv(filas, nombreArchivo)
  }

  const mostrarFiltroTrabajador = tipo === "ingresos" || tipo === "citas"
  const mostrarFiltroServicio = tipo === "citas"

  return (
    <div className="min-h-screen">
      <EstilosImpresion />
      <BarraSuperior titulo={info.titulo} subtitulo={`${rango.from} a ${rango.to}`} mostrarBusqueda={false} />

      <div className="p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4" data-no-print>
          <SelectorPeriodo rango={rango} onChange={setRango} />

          <div className="flex flex-wrap items-center gap-2">
            {mostrarFiltroTrabajador && (
              <select
                value={workerId}
                onChange={(e) => setWorkerId(e.target.value)}
                className="px-3 py-2 rounded-lg border border-border bg-card text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="">Todos los trabajadores</option>
                {trabajadores.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre}
                  </option>
                ))}
              </select>
            )}
            {mostrarFiltroServicio && (
              <select
                value={serviceId}
                onChange={(e) => setServiceId(e.target.value)}
                className="px-3 py-2 rounded-lg border border-border bg-card text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="">Todos los servicios</option>
                {servicios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        <BarraAcciones
          onExportarCsv={manejarExportarCsv}
          onProgramar={puedeProgramar ? () => setModalProgramarAbierto(true) : undefined}
          onGuardar={() => setModalGuardarAbierto(true)}
          deshabilitarExport={!datos}
        />

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        {cargando && !datos ? (
          <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">
            Cargando reporte...
          </div>
        ) : datos ? (
          <>
            {tipo === "ingresos" && <VistaIngresos datos={datos as RevenueResponse} />}
            {tipo === "citas" && <VistaCitas datos={datos as AppointmentsResponse} />}
            {tipo === "servicios" && <VistaServicios datos={datos as ServicesResponse} />}
            {tipo === "trabajadores" && <VistaTrabajadores datos={datos as StaffResponse} />}
            {tipo === "clientes" && <VistaClientes datos={datos as PatientsResponse} />}
            {tipo === "ocupacion" && <VistaOcupacion datos={datos as OccupancyResponse} />}
            {tipo === "cierres" && <VistaCierres datos={datos as ShiftClosesResponse} />}
          </>
        ) : null}
      </div>

      <ModalProgramarReporte
        abierto={modalProgramarAbierto}
        onCerrar={() => setModalProgramarAbierto(false)}
        reportType={info.reportType}
        filters={filtrosActuales}
        onProgramado={() => {}}
      />
      <ModalGuardarReporte
        abierto={modalGuardarAbierto}
        onCerrar={() => setModalGuardarAbierto(false)}
        reportType={info.reportType}
        filters={filtrosActuales}
        onGuardado={() => {}}
      />
    </div>
  )
}
