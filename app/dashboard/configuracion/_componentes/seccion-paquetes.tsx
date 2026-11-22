"use client"

import { useId, useState } from "react"
import { AnimatePresence } from "framer-motion"
import { Pencil, Plus, Ticket, Trash2 } from "lucide-react"
import { BotonPrimario } from "@/components/comunes/boton-primario"
import { Insignia } from "@/components/comunes/insignia"
import { Aviso } from "@/components/panel/aviso"
import { BotonDeFila } from "@/components/panel/boton-de-fila"
import { useRubroDelPanel } from "@/components/panel/contexto-rubro"
import { EncabezadoDeTarjeta } from "@/components/panel/encabezado-de-tarjeta"
import { EstadoVacio } from "@/components/panel/estado-vacio"
import { TARJETA_DEL_PANEL, RELLENO_DE_TARJETA } from "@/components/panel/estilos"
import { ModalConfirmar } from "@/components/panel/modal-confirmar"
import { cn } from "@/lib/utils"
import { vocabularioDe } from "@/lib/vocabulario"
import { ModalPaquete, type ServicioParaPaquete } from "./modal-paquete"
import { crearPaquete, editarPaquete, eliminarPaquete, leerServicios, pausarOReactivarPaquete } from "../_datos"
import {
  PAQUETE_EN_BLANCO,
  datosDelPaquete,
  detalleDelPaquete,
  frasesDeLosPaquetes,
  tituloDelPaquete,
  type DatosDePaquete,
  type Paquete,
} from "../_paquetes"

interface PropsDeSeccionPaquetes {
  paquetesIniciales: Paquete[]
  /** Los servicios del negocio al entrar; al abrir el formulario se vuelven a leer. */
  serviciosIniciales: ServicioParaPaquete[]
}

/**
 * Los paquetes de sesiones que ofrece el negocio ("6 sesiones de Depilación
 * láser por $150.000"). Acá sólo se definen: se venden al cobrar en el
 * tablero. Pausar uno deja de ofrecerlo; eliminarlo borra la definición. En
 * los dos casos los que ya se vendieron siguen valiendo, y editarlo no los
 * cambia. Quién ve la sección lo decide `page.tsx` con `puedeGestionarPaquetes`.
 */
export function SeccionPaquetes({ paquetesIniciales, serviciosIniciales }: PropsDeSeccionPaquetes) {
  const idDelTitulo = useId()
  const palabras = vocabularioDe(useRubroDelPanel()).palabras
  const frases = frasesDeLosPaquetes(palabras)
  const [paquetes, setPaquetes] = useState<Paquete[]>(paquetesIniciales)
  const [servicios, setServicios] = useState<ServicioParaPaquete[]>(serviciosIniciales)
  const [modalAbierto, setModalAbierto] = useState(false)
  const [editando, setEditando] = useState<Paquete | null>(null)
  const [form, setForm] = useState<DatosDePaquete>(PAQUETE_EN_BLANCO)
  const [guardando, setGuardando] = useState(false)
  const [aviso, setAviso] = useState("")
  const [avisoDelModal, setAvisoDelModal] = useState("")
  const [cambiando, setCambiando] = useState<string | null>(null)
  const [aEliminar, setAEliminar] = useState<Paquete | null>(null)
  const [eliminando, setEliminando] = useState(false)
  const [avisoDeEliminar, setAvisoDeEliminar] = useState("")

  /**
   * Los servicios se editan en la sección de arriba sin recargar la página:
   * al abrir el formulario se leen de nuevo, para ofrecer el que se acaba de
   * crear y con su precio de ahora. Si no se puede, quedan los que había.
   */
  const refrescarServicios = async () => {
    const resultado = await leerServicios(palabras)
    if (!resultado.ok) return
    setServicios(resultado.datos.map(({ id, name, price, active }) => ({ id, name, price, active })))
  }

  // Un paquete nuevo se arma sobre un servicio activo; uno que ya existe puede ser de uno desactivado.
  const activos = servicios.filter((servicio) => servicio.active)
  const sinServicios = activos.length === 0
  // El precio suelto con que se compara: el del servicio elegido, o el del paquete que se edita.
  const servicioDelForm = servicios.find((servicio) => servicio.id === form.servicioId)

  const abrirNuevo = () => {
    setEditando(null)
    // Con un solo servicio no hay nada que elegir.
    setForm({ ...PAQUETE_EN_BLANCO, servicioId: activos.length === 1 ? activos[0].id : "" })
    setAvisoDelModal("")
    setModalAbierto(true)
    void refrescarServicios()
  }

  const abrirEdicion = (paquete: Paquete) => {
    setEditando(paquete)
    setForm(datosDelPaquete(paquete))
    setAvisoDelModal("")
    setModalAbierto(true)
    void refrescarServicios()
  }

  const cerrarModal = () => {
    setModalAbierto(false)
    setEditando(null)
  }

  const reemplazarEnLista = (actualizado: Paquete) =>
    setPaquetes((previos) => previos.map((paquete) => (paquete.id === actualizado.id ? actualizado : paquete)))

  const guardar = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    setAvisoDelModal("")
    setGuardando(true)
    const resultado = editando ? await editarPaquete(editando.id, form, palabras) : await crearPaquete(form, palabras)
    setGuardando(false)

    // Si no sirve o el servidor lo rechaza, el modal queda abierto con lo cargado y el motivo.
    if (!resultado.ok) return setAvisoDelModal(resultado.error)

    setAviso("")
    if (editando) reemplazarEnLista(resultado.datos)
    else setPaquetes((previos) => [...previos, resultado.datos])
    cerrarModal()
  }

  const pausarOReactivar = async (paquete: Paquete) => {
    setAviso("")
    setCambiando(paquete.id)
    const resultado = await pausarOReactivarPaquete(paquete.id, !paquete.activo)
    setCambiando(null)
    if (resultado.ok) reemplazarEnLista(resultado.datos)
    else setAviso(resultado.error)
  }

  const pedirEliminar = (paquete: Paquete) => {
    setAvisoDeEliminar("")
    setAEliminar(paquete)
  }

  const confirmarEliminar = async () => {
    if (!aEliminar) return
    setAvisoDeEliminar("")
    setEliminando(true)
    const resultado = await eliminarPaquete(aEliminar.id)
    setEliminando(false)
    if (!resultado.ok) return setAvisoDeEliminar(resultado.error)

    setAviso("")
    setPaquetes((previos) => previos.filter((paquete) => paquete.id !== aEliminar.id))
    setAEliminar(null)
  }


  return (
    <section aria-labelledby={idDelTitulo} className={cn(TARJETA_DEL_PANEL, RELLENO_DE_TARJETA)}>
      <EncabezadoDeTarjeta
        id={idDelTitulo}
        nivel={3}
        titulo={frases.titulo}
        subtitulo={frases.subtitulo}
        icono={{ figura: Ticket }}
        accion={
          !sinServicios && (
            <BotonPrimario tamaño="sm" icono={<Plus className="h-4 w-4" />} onClick={abrirNuevo}>
              Crear paquete
            </BotonPrimario>
          )
        }
      />

      {aviso && <Aviso className="mt-5">{aviso}</Aviso>}

      {paquetes.length === 0 ? (
        <EstadoVacio className="mt-5" titulo={frases.vacioTitulo}>
          {frases.vacio}
          {sinServicios && <span className="mt-2 block">{frases.sinServicios}</span>}
        </EstadoVacio>
      ) : (
        <>
          <ul className="mt-5 divide-y divide-borde">
            {paquetes.map((paquete) => {
              const titulo = tituloDelPaquete(paquete)
              return (
                <li key={paquete.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3.5 first:pt-0 last:pb-0">
                  <div className="min-w-48 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <p className="font-medium break-words">{titulo}</p>
                      {!paquete.activo && <Insignia>Pausado</Insignia>}
                    </div>
                    <p className="mt-1 text-[13px] text-pretty text-texto-2 tabular-nums">{detalleDelPaquete(paquete)}</p>
                  </div>

                  <div className="ml-auto flex shrink-0 items-center gap-1">
                    <BotonPrimario
                      type="button"
                      tamaño="sm"
                      variante="secundario"
                      // 44 px en el celular: lo mínimo para un dedo.
                      className="max-escritorio:min-h-11"
                      aria-label={`${paquete.activo ? "Pausar" : "Reactivar"}: ${titulo}`}
                      cargando={cambiando === paquete.id}
                      onClick={() => pausarOReactivar(paquete)}
                    >
                      {paquete.activo ? "Pausar" : "Reactivar"}
                    </BotonPrimario>
                    <BotonDeFila
                      etiqueta={`Editar: ${titulo}`}
                      titulo="Editar"
                      icono={<Pencil className="size-4" aria-hidden="true" strokeWidth={1.75} />}
                      onClick={() => abrirEdicion(paquete)}
                    />
                    <BotonDeFila
                      etiqueta={`Eliminar: ${titulo}`}
                      titulo="Eliminar"
                      icono={<Trash2 className="size-4" aria-hidden="true" strokeWidth={1.75} />}
                      onClick={() => pedirEliminar(paquete)}
                    />
                  </div>
                </li>
              )
            })}
          </ul>
          <p className="mt-4 text-xs text-texto-2">{frases.dondeSeVende}</p>
        </>
      )}

      <AnimatePresence>
        {modalAbierto && (
          <ModalPaquete
            form={form}
            servicios={activos}
            servicioFijo={editando ? editando.servicio : null}
            precioSuelto={servicioDelForm?.price ?? null}
            guardando={guardando}
            aviso={avisoDelModal}
            onCambiarCampo={(campo, valor) => setForm((previo) => ({ ...previo, [campo]: valor }))}
            onSubmit={guardar}
            onCerrar={cerrarModal}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {aEliminar && (
          <ModalConfirmar
            titulo={`¿Eliminar el paquete de ${tituloDelPaquete(aEliminar)}?`}
            descripcion={frases.eliminar.descripcion}
            textoConfirmar="Eliminar paquete"
            textoCancelar="No eliminar"
            peligro
            trabajando={eliminando}
            aviso={avisoDeEliminar}
            onConfirmar={confirmarEliminar}
            onCerrar={() => setAEliminar(null)}
          />
        )}
      </AnimatePresence>
    </section>
  )
}
