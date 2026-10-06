"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { AnimatePresence } from "framer-motion"
import { BarraSuperior } from "@/components/panel/barra-superior"
import { FiltrosClientes } from "./_componentes/filtros-clientes"
import { ListaClientes } from "./_componentes/lista-clientes"
import { PanelDetalleCliente, type ClienteAPICompleto } from "./_componentes/panel-detalle-cliente"
import { ModalNuevoCliente, type FormNuevoCliente } from "./_componentes/modal-nuevo-cliente"
import type { Cliente } from "./_componentes/tarjeta-cliente"

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

function mapearCliente(c: ClienteAPICompleto): Cliente {
  const etiqueta = c.tags.find((t) =>
    (ETIQUETAS_VALIDAS as readonly string[]).includes(t)
  ) as Cliente["etiqueta"]
  const ultimaCita = c.appointments[0]
  return {
    id: c.id,
    nombre: c.name,
    email: c.email ?? "Sin email",
    telefono: c.phone ?? "Sin teléfono",
    visitas: c.appointments.length,
    ultimaVisita: ultimaCita ? formatearFechaRelativa(ultimaCita.startTime) : "Sin visitas",
    etiqueta,
  }
}

export default function PaginaClientes() {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [rawMap, setRawMap] = useState<Record<string, ClienteAPICompleto>>({})
  const [total, setTotal] = useState(0)
  const [pagina, setPagina] = useState(1)
  const [paginas, setPaginas] = useState(1)
  const [cargando, setCargando] = useState(true)
  const [cargandoMas, setCargandoMas] = useState(false)

  const [busqueda, setBusqueda] = useState("")
  const [etiquetaActiva, setEtiquetaActiva] = useState("Todos")
  const [vista, setVista] = useState<"grid" | "lista">("grid")
  const [clienteSeleccionado, setClienteSeleccionado] = useState<Cliente | null>(null)
  const [modalAbierto, setModalAbierto] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [notas, setNotas] = useState("")
  const [guardandoNotas, setGuardandoNotas] = useState(false)
  const [formNuevo, setFormNuevo] = useState<FormNuevoCliente>({ nombre: "", email: "", telefono: "" })

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchClientes = useCallback(async (q: string, tag: string, pag: number, acumular = false) => {
    acumular ? setCargandoMas(true) : setCargando(true)
    const params = new URLSearchParams({ pagina: String(pag), limite: "18" })
    if (q) params.set("q", q)
    if (tag && tag !== "Todos") params.set("tag", tag)
    try {
      const res = await fetch(`/api/clientes?${params}`)
      const data = await res.json()
      const mapped = (data.clientes as ClienteAPICompleto[]).map(mapearCliente)
      const rawEntries = Object.fromEntries(
        (data.clientes as ClienteAPICompleto[]).map((c) => [c.id, c])
      )
      setClientes((prev) => acumular ? [...prev, ...mapped] : mapped)
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

  // eslint-disable-next-line react-hooks/set-state-in-effect -- carga la lista de clientes al montar
  useEffect(() => { fetchClientes("", "Todos", 1) }, [fetchClientes])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchClientes(busqueda, etiquetaActiva, 1), 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [busqueda, etiquetaActiva, fetchClientes])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza el borrador de notas cuando cambia el cliente seleccionado
    if (clienteSeleccionado) setNotas(rawMap[clienteSeleccionado.id]?.notes ?? "")
  }, [clienteSeleccionado, rawMap])

  const guardarNotas = async () => {
    if (!clienteSeleccionado) return
    setGuardandoNotas(true)
    await fetch(`/api/clientes/${clienteSeleccionado.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: notas }),
    })
    setGuardandoNotas(false)
  }

  const crearCliente = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    setGuardando(true)
    try {
      const res = await fetch("/api/clientes", {
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
        fetchClientes(busqueda, etiquetaActiva, 1)
      }
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="min-h-screen">
      <BarraSuperior
        titulo="Clientes"
        subtitulo={cargando ? "Cargando..." : `${total} clientes registrados`}
        accionPrincipal={{ texto: "Nuevo cliente", onClick: () => setModalAbierto(true) }}
      />

      <div className="p-6">
        <FiltrosClientes
          busqueda={busqueda}
          onBusqueda={setBusqueda}
          etiquetaActiva={etiquetaActiva}
          onEtiqueta={setEtiquetaActiva}
          vista={vista}
          onVista={setVista}
        />

        <div className="flex gap-6">
          <div className="flex-1">
            <ListaClientes
              clientes={clientes}
              cargando={cargando}
              cargandoMas={cargandoMas}
              vista={vista}
              total={total}
              pagina={pagina}
              paginas={paginas}
              onSeleccionar={setClienteSeleccionado}
              onCargarMas={() => fetchClientes(busqueda, etiquetaActiva, pagina + 1, true)}
            />
          </div>

          <AnimatePresence>
            {clienteSeleccionado && (
              <PanelDetalleCliente
                cliente={clienteSeleccionado}
                raw={rawMap[clienteSeleccionado.id] ?? null}
                notas={notas}
                guardandoNotas={guardandoNotas}
                onCerrar={() => setClienteSeleccionado(null)}
                onNotasChange={setNotas}
                onNotasBlur={guardarNotas}
              />
            )}
          </AnimatePresence>
        </div>
      </div>

      <AnimatePresence>
        {modalAbierto && (
          <ModalNuevoCliente
            form={formNuevo}
            guardando={guardando}
            onFormChange={(campo, valor) => setFormNuevo((p) => ({ ...p, [campo]: valor }))}
            onSubmit={crearCliente}
            onCerrar={() => setModalAbierto(false)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
