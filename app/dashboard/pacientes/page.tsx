"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useSession } from "next-auth/react"
import { AnimatePresence } from "framer-motion"
import { Download, Loader2 } from "lucide-react"
import { BarraSuperior } from "@/components/app/layout/barra-superior"
import { FiltrosPacientes } from "./_components/filtrosPacientes"
import { ListaPacientes } from "./_components/listaPacientes"
import { PanelDetallePaciente, type PacienteAPICompleto } from "./_components/panelDetallePaciente"
import { ModalNuevoPaciente, type FormNuevoPaciente } from "./_components/modalNuevoPaciente"
import type { Paciente } from "@/components/app/tarjetas/tarjeta-paciente"

const ETIQUETAS_VALIDAS = ["VIP", "Frecuente", "Nuevo", "Inactivo"] as const

function formatearFechaRelativa(fechaStr: string): string {
  const diff = Math.floor((Date.now() - new Date(fechaStr).getTime()) / 86400000)
  if (diff === 0) return "Hoy"
  if (diff === 1) return "Ayer"
  if (diff < 7) return `Hace ${diff} días`
  if (diff < 14) return "Hace 1 semana"
  if (diff < 30) return `Hace ${Math.floor(diff / 7)} semanas`
  if (diff < 60) return "Hace 1 mes"
  return `Hace ${Math.floor(diff / 30)} meses`
}

function mapearPaciente(p: PacienteAPICompleto): Paciente {
  const etiqueta = p.tags.find((t) =>
    (ETIQUETAS_VALIDAS as readonly string[]).includes(t)
  ) as Paciente["etiqueta"]
  const ultimaCita = p.appointments[0]
  return {
    id: p.id,
    nombre: p.name,
    email: p.email ?? "Sin email",
    telefono: p.phone ?? "Sin teléfono",
    visitas: p.appointments.length,
    ultimaVisita: ultimaCita ? formatearFechaRelativa(ultimaCita.startTime) : "Sin visitas",
    etiqueta,
  }
}

export default function PaginaPacientes() {
  const { data: session } = useSession()
  const [pacientes, setPacientes] = useState<Paciente[]>([])
  const [rawMap, setRawMap] = useState<Record<string, PacienteAPICompleto>>({})
  const [total, setTotal] = useState(0)
  const [pagina, setPagina] = useState(1)
  const [paginas, setPaginas] = useState(1)
  const [cargando, setCargando] = useState(true)
  const [cargandoMas, setCargandoMas] = useState(false)

  const [busqueda, setBusqueda] = useState("")
  const [etiquetaActiva, setEtiquetaActiva] = useState("Todos")
  const [vista, setVista] = useState<"grid" | "lista">("grid")
  const [pacienteSeleccionado, setPacienteSeleccionado] = useState<Paciente | null>(null)
  const [modalAbierto, setModalAbierto] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [notas, setNotas] = useState("")
  const [guardandoNotas, setGuardandoNotas] = useState(false)
  const [eliminando, setEliminando] = useState(false)
  const [exportando, setExportando] = useState(false)
  const [errorAccion, setErrorAccion] = useState<string | null>(null)
  const [formNuevo, setFormNuevo] = useState<FormNuevoPaciente>({ nombre: "", email: "", telefono: "" })

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const puedeEliminar = ["owner", "admin"].includes(((session?.user as any)?.role as string | undefined) ?? "")

  const fetchPacientes = useCallback(async (q: string, tag: string, pag: number, acumular = false) => {
    acumular ? setCargandoMas(true) : setCargando(true)
    const params = new URLSearchParams({ pagina: String(pag), limite: "18" })
    if (q) params.set("q", q)
    if (tag && tag !== "Todos") params.set("tag", tag)
    try {
      const res = await fetch(`/api/pacientes?${params}`)
      const data = await res.json()
      const mapped = (data.pacientes as PacienteAPICompleto[]).map(mapearPaciente)
      const rawEntries = Object.fromEntries(
        (data.pacientes as PacienteAPICompleto[]).map((p) => [p.id, p])
      )
      setPacientes((prev) => acumular ? [...prev, ...mapped] : mapped)
      setRawMap((prev) => ({ ...(acumular ? prev : {}), ...rawEntries }))
      setTotal(data.total)
      setPagina(data.pagina)
      setPaginas(data.paginas)
    } catch { /* silencioso */ }
    finally {
      setCargando(false)
      setCargandoMas(false)
    }
  }, [])

  useEffect(() => { fetchPacientes("", "Todos", 1) }, [fetchPacientes])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchPacientes(busqueda, etiquetaActiva, 1), 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [busqueda, etiquetaActiva, fetchPacientes])

  useEffect(() => {
    if (pacienteSeleccionado) setNotas(rawMap[pacienteSeleccionado.id]?.notes ?? "")
  }, [pacienteSeleccionado, rawMap])

  const guardarNotas = async () => {
    if (!pacienteSeleccionado) return
    setGuardandoNotas(true)
    await fetch(`/api/pacientes/${pacienteSeleccionado.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: notas }),
    })
    setGuardandoNotas(false)
  }

  const eliminarPaciente = async () => {
    if (!pacienteSeleccionado || eliminando) return
    const confirmado = window.confirm(`¿Eliminar a ${pacienteSeleccionado.nombre}? Esta acción no se puede deshacer.`)
    if (!confirmado) return

    setEliminando(true)
    setErrorAccion(null)
    try {
      const res = await fetch(`/api/pacientes/${pacienteSeleccionado.id}`, { method: "DELETE" })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setErrorAccion(data.error ?? "No pudimos eliminar este usuario.")
        return
      }
      setPacientes((prev) => prev.filter((p) => p.id !== pacienteSeleccionado.id))
      setRawMap((prev) => {
        const siguiente = { ...prev }
        delete siguiente[pacienteSeleccionado.id]
        return siguiente
      })
      setTotal((prev) => Math.max(0, prev - 1))
      setPacienteSeleccionado(null)
    } catch {
      setErrorAccion("No pudimos eliminar este usuario. Revisa tu conexión e inténtalo nuevamente.")
    } finally {
      setEliminando(false)
    }
  }

  const crearPaciente = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    setGuardando(true)
    try {
      const res = await fetch("/api/pacientes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formNuevo.nombre,
          email: formNuevo.email || undefined,
          phone: formNuevo.telefono || undefined,
        }),
      })
      if (res.ok) {
        setModalAbierto(false)
        setFormNuevo({ nombre: "", email: "", telefono: "" })
        fetchPacientes(busqueda, etiquetaActiva, 1)
      }
    } finally {
      setGuardando(false)
    }
  }

  const exportarPacientes = async () => {
    if (exportando) return

    setExportando(true)
    setErrorAccion(null)
    let url: string | null = null

    try {
      const res = await fetch("/api/patients/export")
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setErrorAccion(data.error ?? "No pudimos exportar los usuarios.")
        return
      }

      const blob = await res.blob()
      url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `clientes-eli-${new Date().toISOString().split("T")[0]}.xlsx`
      document.body.appendChild(a)
      a.click()
      a.remove()
    } catch {
      setErrorAccion("No pudimos exportar los usuarios. Revisa tu conexión e inténtalo nuevamente.")
    } finally {
      if (url) {
        const urlDescarga = url
        window.setTimeout(() => URL.revokeObjectURL(urlDescarga), 0)
      }
      setExportando(false)
    }
  }

  return (
    <div className="min-h-screen">
      <BarraSuperior
        titulo="Usuarios"
        subtitulo={cargando ? "Cargando..." : `${total} usuarios registrados`}
        accionPrincipal={{ texto: "Nuevo usuario", onClick: () => setModalAbierto(true) }}
      />

      <div className="p-4 sm:p-6">
        <div className="mb-4 flex justify-end">
          <button
            type="button"
            onClick={exportarPacientes}
            disabled={exportando}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            {exportando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {exportando ? "Exportando..." : "Exportar"}
          </button>
        </div>

        <FiltrosPacientes
          busqueda={busqueda}
          onBusqueda={setBusqueda}
          etiquetaActiva={etiquetaActiva}
          onEtiqueta={setEtiquetaActiva}
          vista={vista}
          onVista={setVista}
        />

        {errorAccion && (
          <p role="alert" className="mb-4 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {errorAccion}
          </p>
        )}

        <div className="flex flex-col gap-6 xl:flex-row">
          <div className="min-w-0 flex-1">
            <ListaPacientes
              pacientes={pacientes}
              cargando={cargando}
              cargandoMas={cargandoMas}
              vista={vista}
              total={total}
              pagina={pagina}
              paginas={paginas}
              panelAbierto={pacienteSeleccionado !== null}
              onSeleccionar={setPacienteSeleccionado}
              onCargarMas={() => fetchPacientes(busqueda, etiquetaActiva, pagina + 1, true)}
            />
          </div>

          <AnimatePresence>
            {pacienteSeleccionado && (
              <PanelDetallePaciente
                paciente={pacienteSeleccionado}
                raw={rawMap[pacienteSeleccionado.id] ?? null}
                notas={notas}
                guardandoNotas={guardandoNotas}
                puedeEliminar={puedeEliminar}
                eliminando={eliminando}
                onCerrar={() => setPacienteSeleccionado(null)}
                onNotasChange={setNotas}
                onNotasBlur={guardarNotas}
                onEliminar={eliminarPaciente}
              />
            )}
          </AnimatePresence>
        </div>
      </div>

      <AnimatePresence>
        {modalAbierto && (
          <ModalNuevoPaciente
            form={formNuevo}
            guardando={guardando}
            onFormChange={(campo, valor) => setFormNuevo((p) => ({ ...p, [campo]: valor }))}
            onSubmit={crearPaciente}
            onCerrar={() => setModalAbierto(false)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
