"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { AnimatePresence } from "framer-motion"
import { useSession } from "next-auth/react"
import { BarraSuperior } from "@/components/panel/barra-superior"
import { ModalConfirmar } from "@/components/panel/modal-confirmar"
import { Download, Upload } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import {
  actorDeSesion,
  puedeBorrarCliente,
  puedeEditarDatosDeCliente,
  puedeEditarConsentimientoPromocional,
  puedeImportarExportarClientes,
  puedeVerClientesQueSeVan,
} from "@/lib/permisos"
import {
  leerClientes,
  crearCliente,
  editarCliente,
  eliminarCliente,
  guardarNotasDeCliente,
  type Cliente,
  type DatosDeNuevoCliente,
} from "./_datos"
import { Aviso } from "@/components/panel/aviso"
import { FiltrosClientes } from "./_componentes/filtros-clientes"
import { ListaClientes } from "./_componentes/lista-clientes"
import { PanelDetalleCliente } from "./_componentes/panel-detalle-cliente"
import { ModalNuevoCliente } from "./_componentes/modal-nuevo-cliente"
import { ModalExportar } from "./_componentes/modal-exportar"
import { VistaSeVan } from "./_componentes/vista-se-van"
import { clienteParaTarjeta, type ClienteEnTarjeta } from "./_componentes/tarjeta-cliente"
import { mostrarTelefono } from "@/lib/telefono"
import { cn } from "@/lib/utils"

const CLIENTE_EN_BLANCO: DatosDeNuevoCliente = {
  nombre: "",
  email: "",
  telefono: "",
  aceptaWhatsapp: false,
  aceptaCorreoPromo: false,
}

/** Las dos vistas de la página: todos los clientes, o los que se están yendo (#76). */
const VISTAS_DE_CLIENTES = [
  { id: "todos", texto: "Todos" },
  { id: "se-van", texto: "Se están yendo" },
] as const
type VistaDeClientes = (typeof VISTAS_DE_CLIENTES)[number]["id"]

/** `1 cliente registrado`, `12 clientes registrados`. */
function cuantosClientes(total: number): string {
  return total === 1 ? "1 cliente registrado" : `${total} clientes registrados`
}

/** Los mismos clientes, con las notas de uno cambiadas. Si no está en la lista, quedan como estaban. */
function conNotas(clientesPorId: Record<string, Cliente>, clienteId: string, notas: string | null) {
  const cliente = clientesPorId[clienteId]
  return cliente ? { ...clientesPorId, [clienteId]: { ...cliente, notes: notas } } : clientesPorId
}

export default function PaginaClientes() {
  const { data: sesion } = useSession()
  const actor = actorDeSesion(sesion)
  const puedeEditar = puedeEditarDatosDeCliente(actor)
  const puedeEliminar = puedeBorrarCliente(actor)
  const puedeImportarExportar = puedeImportarExportarClientes(actor)
  const puedeVerSeVan = puedeVerClientesQueSeVan(actor)
  const puedeMarcarCorreoPromo = puedeEditarConsentimientoPromocional(actor)
  const nombreNegocio = sesion?.user?.businessName ?? ""
  const [vistaDeClientes, setVistaDeClientes] = useState<VistaDeClientes>("todos")

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
  // El mismo modal del cliente nuevo, con los datos del que se edita.
  const [editandoId, setEditandoId] = useState<string | null>(null)
  // El cliente que se está por eliminar, con su modal de confirmación.
  const [aEliminar, setAEliminar] = useState<ClienteEnTarjeta | null>(null)
  const [eliminando, setEliminando] = useState(false)
  const [avisoDeEliminar, setAvisoDeEliminar] = useState("")
  const [avisoListo, setAvisoListo] = useState("")
  const [exportando, setExportando] = useState(false)

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
    setEditandoId(null)
    setNuevoCliente(CLIENTE_EN_BLANCO)
    setModalAbierto(true)
  }

  /** Abre el formulario con los datos guardados del cliente. Lo que dice "Sin correo" no es un correo. */
  const abrirEdicion = (cliente: ClienteEnTarjeta) => {
    const guardado = clientesPorId[cliente.id]
    setAvisoDelModal("")
    setEditandoId(cliente.id)
    setNuevoCliente({
      nombre: cliente.nombre,
      email: guardado?.email ?? "",
      // Como se muestra, no en E.164: es lo que la persona reconoce y corrige.
      telefono: mostrarTelefono(guardado?.phone),
      aceptaWhatsapp: !!guardado?.whatsappConsentAt,
      aceptaCorreoPromo: !!guardado?.correoPromoConsentAt,
    })
    setModalAbierto(true)
  }

  const cerrarModal = () => {
    setModalAbierto(false)
    setEditandoId(null)
    setNuevoCliente(CLIENTE_EN_BLANCO)
  }

  const guardarNuevoCliente = async (evento: React.SyntheticEvent<HTMLFormElement>) => {
    evento.preventDefault()

    setAvisoDelModal("")
    setAvisoListo("")
    setGuardando(true)
    const resultado = editandoId ? await editarCliente(editandoId, nuevoCliente) : await crearCliente(nuevoCliente)
    setGuardando(false)

    // El aviso va dentro del modal, que sigue abierto con lo que se cargó: en
    // la página quedaría tapado por el velo del modal.
    if (!resultado.ok) return setAvisoDelModal(resultado.error)

    // Al editar, la ficha abierta muestra los datos nuevos: se arma de nuevo
    // cuando vuelve la lista, pero mientras tanto no se queda con los viejos.
    if (editandoId && clienteSeleccionado?.id === editandoId) {
      setClienteSeleccionado({
        ...clienteSeleccionado,
        nombre: nuevoCliente.nombre.trim(),
        email: nuevoCliente.email.trim() || "Sin correo",
        telefono: mostrarTelefono(nuevoCliente.telefono) || "Sin teléfono",
      })
    }
    cerrarModal()
    cargarClientes(busqueda, etiquetaActiva, 1)
  }

  const pedirEliminar = (cliente: ClienteEnTarjeta) => {
    setAvisoDeEliminar("")
    setAEliminar(cliente)
  }

  const confirmarEliminar = async () => {
    if (!aEliminar) return
    setAvisoDeEliminar("")
    setEliminando(true)
    const resultado = await eliminarCliente(aEliminar.id)
    setEliminando(false)

    if (!resultado.ok) return setAvisoDeEliminar(resultado.error)

    const nombre = aEliminar.nombre
    if (clienteSeleccionado?.id === aEliminar.id) setClienteSeleccionado(null)
    setAEliminar(null)
    setAvisoListo(`Se eliminaron los datos de ${nombre}. Sus citas y cobros siguen en la agenda y en los reportes, a nombre de "Cliente eliminado".`)
    cargarClientes(busqueda, etiquetaActiva, 1)
  }

  return (
    <div className="min-h-dvh">
      {/* Sin la búsqueda de la cabecera: la página tiene la suya, justo debajo. */}
      <BarraSuperior
        titulo="Clientes"
        subtitulo={cargando ? "Cargando..." : cuantosClientes(total)}
        accionPrincipal={{ texto: "Nuevo cliente", onClick: abrirModal }}
        mostrarBusqueda={false}
      />

      <div className="space-y-4 px-4 pt-6 pb-10 sm:space-y-6 sm:px-6">
        {aviso && <Aviso>{aviso}</Aviso>}
        {avisoListo && (
          <Aviso tono="listo" rol="status">
            {avisoListo}
          </Aviso>
        )}

        {/* "Se están yendo" (#76): dueña y encargado. El servidor lo vuelve a verificar. */}
        {puedeVerSeVan && (
          <div role="group" aria-label="Qué clientes ver" className="flex w-full gap-1 rounded-full bg-superficie p-1 sm:w-fit">
            {VISTAS_DE_CLIENTES.map(({ id, texto }) => (
              <button
                key={id}
                type="button"
                aria-pressed={vistaDeClientes === id}
                onClick={() => setVistaDeClientes(id)}
                className={cn(
                  "inline-flex min-h-11 flex-1 items-center justify-center rounded-full px-4 text-sm font-medium whitespace-nowrap anillo-foco transition-colors duration-150 ease-suave sm:flex-none",
                  vistaDeClientes === id ? "bg-navy text-white" : "text-navy hover:bg-borde"
                )}
              >
                {texto}
              </button>
            ))}
          </div>
        )}

        {vistaDeClientes === "se-van" && puedeVerSeVan ? (
          <VistaSeVan nombreNegocio={nombreNegocio} />
        ) : (
          <>
            {/* Cargar y llevarse la base: dueño y encargado. El servidor lo vuelve a verificar. */}
            {puedeImportarExportar && (
              <div className="flex flex-wrap gap-3">
                <Boton
                  href="/dashboard/clientes/importar"
                  variante="secundario"
                  tamano="sm"
                  icono={<Upload aria-hidden="true" strokeWidth={1.75} />}
                >
                  Importar CSV
                </Boton>
                <Boton
                  type="button"
                  variante="secundario"
                  tamano="sm"
                  icono={<Download aria-hidden="true" strokeWidth={1.75} />}
                  onClick={() => setExportando(true)}
                >
                  Exportar
                </Boton>
              </div>
            )}

            <FiltrosClientes
              busqueda={busqueda}
              onBusqueda={setBusqueda}
              etiquetaActiva={etiquetaActiva}
              onEtiqueta={setEtiquetaActiva}
              vista={vista}
              onVista={setVista}
            />

            {/* La lista y, desde lg, la ficha del cliente elegido al lado. */}
            <div className="flex items-start gap-6">
              <div className="min-w-0 flex-1">
                <ListaClientes
                  clientes={clientes}
                  cargando={cargando}
                  cargandoMas={cargandoMas}
                  vista={vista}
                  total={total}
                  pagina={pagina}
                  paginas={paginas}
                  seleccionadoId={clienteSeleccionado?.id}
                  onSeleccionar={seleccionarCliente}
                  onCargarMas={() => cargarClientes(busqueda, etiquetaActiva, pagina + 1, true)}
                />
              </div>

              <AnimatePresence>
                {clienteSeleccionado && (
                  <PanelDetalleCliente
                    cliente={clienteSeleccionado}
                    citas={clientesPorId[clienteSeleccionado.id]?.appointments ?? []}
                  avisosPorCorreo={!!clientesPorId[clienteSeleccionado.id]?.correoPromoConsentAt}
                    notas={notas}
                    guardandoNotas={guardandoNotas}
                    avisoDeNotas={avisoDeNotas?.clienteId === clienteSeleccionado.id ? avisoDeNotas.mensaje : ""}
                    puedeEditar={puedeEditar}
                    puedeEliminar={puedeEliminar}
                    onEditar={() => abrirEdicion(clienteSeleccionado)}
                    onEliminar={() => pedirEliminar(clienteSeleccionado)}
                    onCerrar={() => setClienteSeleccionado(null)}
                    onCambiarNotas={setNotas}
                    onNotasBlur={guardarNotas}
                  />
                )}
              </AnimatePresence>
            </div>
          </>
        )}
      </div>

      <AnimatePresence>
        {modalAbierto && (
          <ModalNuevoCliente
            editando={editandoId !== null}
            form={nuevoCliente}
            guardando={guardando}
            aviso={avisoDelModal}
            onCambiarCampo={(campo, valor) => setNuevoCliente((previo) => ({ ...previo, [campo]: valor }))}
            onCambiarWhatsapp={(acepta) => setNuevoCliente((previo) => ({ ...previo, aceptaWhatsapp: acepta }))}
            nombreNegocio={nombreNegocio}
            onCambiarCorreoPromo={
              puedeMarcarCorreoPromo
                ? (acepta) => setNuevoCliente((previo) => ({ ...previo, aceptaCorreoPromo: acepta }))
                : undefined
            }
            onSubmit={guardarNuevoCliente}
            onCerrar={cerrarModal}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>{exportando && <ModalExportar alCerrar={() => setExportando(false)} />}</AnimatePresence>

      <AnimatePresence>
        {aEliminar && (
          <ModalConfirmar
            titulo={`¿Eliminar a ${aEliminar.nombre}?`}
            descripcion="Se borran sus datos personales y no se pueden recuperar."
            textoConfirmar="Eliminar cliente"
            textoCancelar="No eliminar"
            peligro
            trabajando={eliminando}
            aviso={avisoDeEliminar}
            onConfirmar={confirmarEliminar}
            onCerrar={() => setAEliminar(null)}
          >
            <div className="space-y-3 text-sm text-texto-2">
              <div>
                <p className="font-medium text-navy">Se borra</p>
                <p className="mt-1">
                  Su nombre, correo, teléfono, cédula, notas y etiquetas; su nombre en cada cobro, que pasa a decir &ldquo;Cliente eliminado&rdquo;; y las notas y comentarios de sus citas y atenciones. Deja de aparecer en Clientes y en los buscadores.
                </p>
              </div>
              <div>
                <p className="font-medium text-navy">Queda</p>
                <p className="mt-1">
                  Sus citas y sus cobros, con sus fechas, servicios, profesionales y montos, para que la agenda y los reportes sumen lo mismo.
                </p>
              </div>
            </div>
          </ModalConfirmar>
        )}
      </AnimatePresence>
    </div>
  )
}
