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

/** Los mismos clientes, con las notas de uno cambiadas. Si no está en la lista, quedan como estaban. */
function conNotas(clientesPorId: Record<string, Cliente>, clienteId: string, notas: string | null) {
  const cliente = clientesPorId[clienteId]
  return cliente ? { ...clientesPorId, [clienteId]: { ...cliente, notes: notas } } : clientesPorId
}

export default function PaginaClientes() {
  const [clientes, setClientes] = useState<ClienteEnTarjeta[]>([])
  // Lo que devolvió el servidor de cada cliente de la lista: el panel de
  // detalle saca de acá el historial y las notas, que la tarjeta no guarda.
  // Las notas que se mandan a guardar se anotan acá, para que reabrir el panel
  // muestre lo último y no lo que vino con la lista.
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
  // Va junto al campo de notas y no arriba de la página: el guardado sale del
  // blur de ese campo, al final del panel, y un aviso arriba no se ve. Recuerda
  // de qué cliente es porque el blur también salta al tocar otra tarjeta: si
  // ese guardado falla, el aviso no debe aparecer bajo las notas del nuevo.
  const [avisoDeNotas, setAvisoDeNotas] = useState<{ clienteId: string; mensaje: string } | null>(null)
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

  /**
   * Abre el panel de un cliente con sus notas como están guardadas. El
   * borrador se carga sólo al abrir otro cliente, no cada vez que cambia
   * `clientesPorId`: eso pasa al guardar o al recargar la lista, y pisaría lo
   * que se está escribiendo. Tocar la tarjeta del que ya está abierto lo deja
   * como está: ese clic hizo blur en las notas, que se están guardando.
   */
  const seleccionarCliente = (cliente: ClienteEnTarjeta) => {
    if (cliente.id !== clienteSeleccionado?.id) setNotas(clientesPorId[cliente.id]?.notes ?? "")
    setClienteSeleccionado(cliente)
  }

  const guardarNotas = async () => {
    if (!clienteSeleccionado) return
    const clienteId = clienteSeleccionado.id
    const texto = notas
    const enLaLista = clientesPorId[clienteId]
    const guardadas = enLaLista?.notes ?? null

    // Un blur sin cambios no manda nada. Si el cliente ya no está en la lista
    // (se buscó otra cosa con el panel abierto), no se sabe qué hay guardado
    // y se manda igual.
    if (enLaLista && texto === (guardadas ?? "")) return

    setAvisoDeNotas(null)
    setGuardandoNotas(true)
    // Se anotan como guardadas al mandarlas y no al volver la respuesta: si el
    // panel se cierra y se reabre mientras tanto, tiene que mostrar éstas. Con
    // las de antes, un blur sin tocarlas las volvería a mandar y pisaría éstas.
    setClientesPorId((previos) => conNotas(previos, clienteId, texto))
    const resultado = await guardarNotasDeCliente(clienteId, texto)
    setGuardandoNotas(false)
    if (resultado.ok) return

    // No se guardaron: vuelve lo que hay en la base, así el próximo blur las
    // reintenta. Salvo que entretanto se hayan mandado otras: ésas mandan.
    setClientesPorId((previos) =>
      previos[clienteId]?.notes === texto ? conNotas(previos, clienteId, guardadas) : previos
    )
    setAvisoDeNotas({ clienteId, mensaje: resultado.error })
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
              onSeleccionar={seleccionarCliente}
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
                avisoDeNotas={avisoDeNotas?.clienteId === clienteSeleccionado.id ? avisoDeNotas.mensaje : ""}
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
