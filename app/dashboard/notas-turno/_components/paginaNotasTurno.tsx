"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { AnimatePresence } from "framer-motion"
import { BarraSuperior } from "@/components/app/layout/barra-superior"
import { FiltrosNotasTurno } from "./filtrosNotasTurno"
import { ListaNotasTurno } from "./listaNotasTurno"
import { PanelDetalleNota } from "./panelDetalleNota"
import { ModalNuevaNota, type FormNuevaNota } from "./modalNuevaNota"
import { ModalTransferirNota } from "./modalTransferirNota"
import type { NotaTurnoAPI, MiembroOpcion, PermissionSetShiftNotes } from "./tipos"

interface PaginaNotasTurnoProps {
  memberIdActual: string
  permissions: { shiftNotes: PermissionSetShiftNotes }
  fechaInicial: string
  miembros: MiembroOpcion[]
}

function sumarDias(fechaISO: string, dias: number): string {
  const fecha = new Date(`${fechaISO}T00:00:00.000Z`)
  fecha.setUTCDate(fecha.getUTCDate() + dias)
  return fecha.toISOString().slice(0, 10)
}

export function PaginaNotasTurno({
  memberIdActual,
  permissions,
  fechaInicial,
  miembros,
}: PaginaNotasTurnoProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const permisos = permissions.shiftNotes

  const fecha = searchParams.get("date") ?? fechaInicial
  const status = searchParams.get("status") ?? ""
  const type = searchParams.get("type") ?? ""
  const priority = searchParams.get("priority") ?? ""
  const assignedTo = searchParams.get("assignedTo") ?? ""
  const soloMias = searchParams.get("mine") === "1"

  const [notas, setNotas] = useState<NotaTurnoAPI[]>([])
  const [cargando, setCargando] = useState(true)
  const [notaSeleccionadaId, setNotaSeleccionadaId] = useState<string | null>(null)
  const [modalNuevaAbierto, setModalNuevaAbierto] = useState(false)
  const [modalTransferirAbierto, setModalTransferirAbierto] = useState(false)
  const [guardando, setGuardando] = useState(false)

  const actualizarParams = useCallback(
    (cambios: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString())
      for (const [clave, valor] of Object.entries(cambios)) {
        if (valor === null || valor === "") params.delete(clave)
        else params.set(clave, valor)
      }
      router.push(`/dashboard/notas-turno?${params.toString()}`)
    },
    [router, searchParams]
  )

  const fetchNotas = useCallback(async () => {
    setCargando(true)
    try {
      const params = new URLSearchParams()
      if (permisos.viewHistory) params.set("date", fecha)
      if (status) params.set("status", status)
      if (type) params.set("type", type)
      if (priority) params.set("priority", priority)
      if (assignedTo) params.set("assignedTo", assignedTo)
      const res = await fetch(`/api/shift-notes?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        let lista = data.notas as NotaTurnoAPI[]
        if (soloMias) lista = lista.filter((n) => n.authorId === memberIdActual)
        setNotas(lista)
      }
    } catch {
      /* silencioso */
    } finally {
      setCargando(false)
    }
  }, [fecha, status, type, priority, assignedTo, soloMias, permisos.viewHistory, memberIdActual])

  useEffect(() => {
    fetchNotas()
  }, [fetchNotas])

  const notaSeleccionada = notas.find((n) => n.id === notaSeleccionadaId) ?? null

  const marcarVista = useCallback(
    async (id: string) => {
      await fetch(`/api/shift-notes/${id}/seen`, { method: "POST" })
      setNotas((prev) =>
        prev.map((n) =>
          n.id === id && !n.seenBy.includes(memberIdActual)
            ? { ...n, seenBy: [...n.seenBy, memberIdActual] }
            : n
        )
      )
    },
    [memberIdActual]
  )

  const seleccionarNota = useCallback(
    (nota: NotaTurnoAPI) => {
      setNotaSeleccionadaId(nota.id)
      if (!nota.seenBy.includes(memberIdActual)) {
        marcarVista(nota.id)
      }
    },
    [memberIdActual, marcarVista]
  )

  const crearNota = async (form: FormNuevaNota) => {
    setGuardando(true)
    try {
      const res = await fetch("/api/shift-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: form.type,
          priority: form.priority,
          title: form.title,
          content: form.content,
          tags: form.tags,
          shiftDate: fecha,
          shiftPeriod: form.shiftPeriod || undefined,
          assignedTo: form.assignedTo || undefined,
        }),
      })
      if (res.ok) {
        setModalNuevaAbierto(false)
        fetchNotas()
      }
    } finally {
      setGuardando(false)
    }
  }

  const actualizarNota = async (id: string, cambios: Record<string, unknown>) => {
    const res = await fetch(`/api/shift-notes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cambios),
    })
    if (res.ok) {
      const actualizada = await res.json()
      setNotas((prev) => prev.map((n) => (n.id === id ? actualizada : n)))
    }
    return res.ok
  }

  const eliminarNota = async (id: string) => {
    const res = await fetch(`/api/shift-notes/${id}`, { method: "DELETE" })
    if (res.ok) {
      setNotas((prev) => prev.filter((n) => n.id !== id))
      if (notaSeleccionadaId === id) setNotaSeleccionadaId(null)
    }
  }

  const resolverNota = (id: string) => actualizarNota(id, { status: "RESUELTA" })

  const transferirNota = async (id: string, transferredToDate: string) => {
    const ok = await actualizarNota(id, { status: "TRANSFERIDA", transferredToDate })
    if (ok) setModalTransferirAbierto(false)
  }

  return (
    <div className="min-h-screen">
      <BarraSuperior
        titulo="Notas de Turno"
        subtitulo={cargando ? "Cargando..." : `${notas.length} notas`}
        accionPrincipal={
          permisos.create ? { texto: "Nueva Nota", onClick: () => setModalNuevaAbierto(true) } : undefined
        }
        mostrarBusqueda={false}
      />

      <div className="p-6">
        <FiltrosNotasTurno
          fecha={fecha}
          status={status}
          type={type}
          priority={priority}
          assignedTo={assignedTo}
          soloMias={soloMias}
          puedeVerHistorial={permisos.viewHistory}
          miembros={miembros}
          onFechaAnterior={() => actualizarParams({ date: sumarDias(fecha, -1) })}
          onFechaSiguiente={() => actualizarParams({ date: sumarDias(fecha, 1) })}
          onFechaChange={(v) => actualizarParams({ date: v })}
          onStatusChange={(v) => actualizarParams({ status: v })}
          onTypeChange={(v) => actualizarParams({ type: v })}
          onPriorityChange={(v) => actualizarParams({ priority: v })}
          onAssignedToChange={(v) => actualizarParams({ assignedTo: v })}
          onSoloMiasChange={(v) => actualizarParams({ mine: v ? "1" : null })}
        />

        <div className="flex gap-6">
          <div className="flex-1 min-w-0">
            <ListaNotasTurno
              notas={notas}
              cargando={cargando}
              memberIdActual={memberIdActual}
              notaSeleccionadaId={notaSeleccionadaId}
              onSeleccionar={seleccionarNota}
            />
          </div>

          <AnimatePresence>
            {notaSeleccionada && (
              <PanelDetalleNota
                nota={notaSeleccionada}
                permisos={permisos}
                memberIdActual={memberIdActual}
                miembros={miembros}
                onCerrar={() => setNotaSeleccionadaId(null)}
                onResolver={() => resolverNota(notaSeleccionada.id)}
                onTransferir={() => setModalTransferirAbierto(true)}
                onEliminar={() => eliminarNota(notaSeleccionada.id)}
                onActualizar={(cambios) => actualizarNota(notaSeleccionada.id, cambios)}
              />
            )}
          </AnimatePresence>
        </div>
      </div>

      <AnimatePresence>
        {modalNuevaAbierto && (
          <ModalNuevaNota
            miembros={miembros}
            guardando={guardando}
            onSubmit={crearNota}
            onCerrar={() => setModalNuevaAbierto(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {modalTransferirAbierto && notaSeleccionada && (
          <ModalTransferirNota
            fechaActual={fecha}
            onConfirmar={(nuevaFecha) => transferirNota(notaSeleccionada.id, nuevaFecha)}
            onCerrar={() => setModalTransferirAbierto(false)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
