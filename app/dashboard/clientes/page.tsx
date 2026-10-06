"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { AnimatePresence } from "framer-motion"
import { BarraSuperior } from "@/components/panel/barra-superior"
import {
  leerClientes,
  crearCliente,
  guardarNotasDeCliente,
  type Cliente,
  type DatosDeNuevoCliente,
} from "./_datos"
import { FiltrosClientes } from "./_componentes/filtros-clientes"
import { ListaClientes } from "./_componentes/lista-clientes"
import { PanelDetalleCliente } from "./_componentes/panel-detalle-cliente"
import { ModalNuevoCliente } from "./_componentes/modal-nuevo-cliente"
import { clienteParaTarjeta, type ClienteEnTarjeta } from "./_componentes/tarjeta-cliente"

const CLIENTE_EN_BLANCO: DatosDeNuevoCliente = { nombre: "", email: "", telefono: "" }

export default function PaginaClientes() {
  const [clientes, setClientes] = useState<ClienteEnTarjeta[]>([])
  // Lo que devolvió el servidor de cada cliente de la lista: el panel de
  // detalle saca de acá el historial y las notas, que la tarjeta no guarda.
  const [clientesPorId, setClientesPorId] = useState<Record<string, Cliente>>({})
  const [total, setTotal] = useState(0)
  const [pagina, setPagina] = useState(1)
  const [paginas, setPaginas] = useState(1)
  const [cargando, setCargando] = useState(true)
  const [cargandoMas, setCargandoMas] = useState(false)
  const [aviso, setAviso] = useState("")

  const [busqueda, setBusqueda] = useState("")
  const [etiquetaActiva, setEtiquetaActiva] = useState("Todos")
  const [vista, setVista] = useState<"grid" | "lista">("grid")
  const [clienteSeleccionado, setClienteSeleccionado] = useState<ClienteEnTarjeta | null>(null)
  const [modalAbierto, setModalAbierto] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [avisoDelModal, setAvisoDelModal] = useState("")
  const [notas, setNotas] = useState("")
  const [guardandoNotas, setGuardandoNotas] = useState(false)
  const [nuevoCliente, setNuevoCliente] = useState<DatosDeNuevoCliente>(CLIENTE_EN_BLANCO)

  const esperaDeBusqueda = useRef<ReturnType<typeof setTimeout> | null>(null)

  /**
   * Trae una página del listado. Con `acumular` la suma a la que ya se ve (el
   * botón "Cargar más"); si no, la reemplaza (una búsqueda o un filtro nuevos).
   * Si falla, la lista que se estaba viendo se queda como estaba.
   */
  const cargarClientes = useCallback(
    async (textoBuscado: string, etiqueta: string, paginaPedida: number, acumular = false) => {
      if (acumular) setCargandoMas(true)
      else setCargando(true)
      setAviso("")

      const resultado = await leerClientes({ busqueda: textoBuscado, etiqueta, pagina: paginaPedida })

      if (resultado.ok) {
        const recibidos = resultado.datos.clientes
        const enTarjeta = recibidos.map(clienteParaTarjeta)
        const recibidosPorId = Object.fromEntries(recibidos.map((cliente) => [cliente.id, cliente]))
        setClientes((previos) => (acumular ? [...previos, ...enTarjeta] : enTarjeta))
        setClientesPorId((previos) => ({ ...(acumular ? previos : {}), ...recibidosPorId }))
        setTotal(resultado.datos.total)
        setPagina(resultado.datos.pagina)
        setPaginas(resultado.datos.paginas)
      } else {
        setAviso(resultado.error)
      }

      setCargando(false)
      setCargandoMas(false)
    },
    []
  )

  // eslint-disable-next-line react-hooks/set-state-in-effect -- carga la lista de clientes al montar
  useEffect(() => { cargarClientes("", "Todos", 1) }, [cargarClientes])

  useEffect(() => {
    if (esperaDeBusqueda.current) clearTimeout(esperaDeBusqueda.current)
    esperaDeBusqueda.current = setTimeout(() => cargarClientes(busqueda, etiquetaActiva, 1), 300)
    return () => { if (esperaDeBusqueda.current) clearTimeout(esperaDeBusqueda.current) }
  }, [busqueda, etiquetaActiva, cargarClientes])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza el borrador de notas cuando cambia el cliente seleccionado
    if (clienteSeleccionado) setNotas(clientesPorId[clienteSeleccionado.id]?.notes ?? "")
  }, [clienteSeleccionado, clientesPorId])

  const guardarNotas = async () => {
    if (!clienteSeleccionado) return

    setAviso("")
    setGuardandoNotas(true)
    const resultado = await guardarNotasDeCliente(clienteSeleccionado.id, notas)
    setGuardandoNotas(false)

    if (!resultado.ok) setAviso(resultado.error)
  }

  const abrirModal = () => {
    setAvisoDelModal("")
    setModalAbierto(true)
  }

  const guardarNuevoCliente = async (evento: React.SyntheticEvent<HTMLFormElement>) => {
    evento.preventDefault()

    setAvisoDelModal("")
    setGuardando(true)
    const resultado = await crearCliente(nuevoCliente)
    setGuardando(false)

    // El aviso va dentro del modal, que sigue abierto con lo que se cargó: en
    // la página quedaría tapado por el velo del modal.
    if (!resultado.ok) return setAvisoDelModal(resultado.error)

    setModalAbierto(false)
    setNuevoCliente(CLIENTE_EN_BLANCO)
    cargarClientes(busqueda, etiquetaActiva, 1)
  }

  return (
    <div className="min-h-screen">
      <BarraSuperior
        titulo="Clientes"
        subtitulo={cargando ? "Cargando..." : `${total} clientes registrados`}
        accionPrincipal={{ texto: "Nuevo cliente", onClick: abrirModal }}
      />

      <div className="p-6">
        {aviso && (
          <p role="alert" className="text-sm text-red-500 mb-4">
            {aviso}
          </p>
        )}

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
              onCargarMas={() => cargarClientes(busqueda, etiquetaActiva, pagina + 1, true)}
            />
          </div>

          <AnimatePresence>
            {clienteSeleccionado && (
              <PanelDetalleCliente
                cliente={clienteSeleccionado}
                citas={clientesPorId[clienteSeleccionado.id]?.appointments ?? []}
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
            form={nuevoCliente}
            guardando={guardando}
            aviso={avisoDelModal}
            onFormChange={(campo, valor) => setNuevoCliente((previo) => ({ ...previo, [campo]: valor }))}
            onSubmit={guardarNuevoCliente}
            onCerrar={() => setModalAbierto(false)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
