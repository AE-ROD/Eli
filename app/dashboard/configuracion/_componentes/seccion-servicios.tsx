"use client"

import { useId, useState } from "react"
import { AnimatePresence } from "framer-motion"
import { Clock, Pencil, Plus, Scissors, Trash2 } from "lucide-react"
import { BotonPrimario } from "@/components/comunes/boton-primario"
import { Insignia } from "@/components/comunes/insignia"
import { Aviso } from "@/components/panel/aviso"
import { EncabezadoDeTarjeta } from "@/components/panel/encabezado-de-tarjeta"
import { EstadoVacio } from "@/components/panel/estado-vacio"
import { TARJETA_DEL_PANEL } from "@/components/panel/estilos"
import { formatearMonto } from "@/lib/dinero"
import { formatearDuracionDeServicio } from "@/lib/fechas"
import { cn } from "@/lib/utils"
import { ModalServicio } from "./modal-servicio"
import {
  crearServicio,
  editarServicio,
  activarODesactivarServicio,
  borrarServicio,
  type DatosDeServicio,
  type Servicio,
} from "../_datos"

const SERVICIO_EN_BLANCO: DatosDeServicio = { name: "", description: "", duration: 30, price: "" }

/** Los botones de sólo ícono de cada servicio: 44 × 44, lo mínimo para un dedo. */
const BOTON_DE_ICONO =
  "grid size-11 shrink-0 place-items-center rounded-[14px] text-navy squircle anillo-foco transition-colors duration-150 ease-suave hover:bg-superficie"

interface SeccionServiciosProps {
  serviciosIniciales: Servicio[]
}

export function SeccionServicios({ serviciosIniciales }: SeccionServiciosProps) {
  const idDelTitulo = useId()
  const [servicios, setServicios] = useState<Servicio[]>(serviciosIniciales)
  const [modalAbierto, setModalAbierto] = useState(false)
  const [servicioEditando, setServicioEditando] = useState<Servicio | null>(null)
  const [form, setForm] = useState<DatosDeServicio>(SERVICIO_EN_BLANCO)
  const [guardando, setGuardando] = useState(false)
  const [aviso, setAviso] = useState("")
  const [avisoDelModal, setAvisoDelModal] = useState("")

  const abrirNuevo = () => {
    setServicioEditando(null)
    setForm(SERVICIO_EN_BLANCO)
    setAvisoDelModal("")
    setModalAbierto(true)
  }

  const abrirEdicion = (servicio: Servicio) => {
    setServicioEditando(servicio)
    setForm({
      name: servicio.name,
      description: servicio.description ?? "",
      duration: servicio.duration,
      price: servicio.price?.toString() ?? "",
    })
    setAvisoDelModal("")
    setModalAbierto(true)
  }

  const cerrarModal = () => {
    setModalAbierto(false)
    setServicioEditando(null)
  }

  /** Pone en la lista el servicio tal como volvió del servidor. */
  const reemplazarEnLista = (actualizado: Servicio) =>
    setServicios((previos) => previos.map((servicio) => (servicio.id === actualizado.id ? actualizado : servicio)))

  const guardar = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    setAvisoDelModal("")
    setGuardando(true)
    const resultado = servicioEditando
      ? await editarServicio(servicioEditando.id, form)
      : await crearServicio(form)
    setGuardando(false)

    // Si el servidor lo rechaza, el modal queda abierto con lo cargado y el
    // motivo: cerrarlo haría parecer que se guardó.
    if (!resultado.ok) return setAvisoDelModal(resultado.error)

    // El aviso de una falla anterior (activar, borrar) ya no corresponde: si
    // quedara, parecería que esto tampoco se guardó.
    setAviso("")
    const guardado = resultado.datos
    if (servicioEditando) reemplazarEnLista(guardado)
    else setServicios((previos) => [...previos, guardado])
    cerrarModal()
  }

  const alternarActivo = async (servicio: Servicio) => {
    setAviso("")
    const resultado = await activarODesactivarServicio(servicio.id, !servicio.active)
    if (resultado.ok) reemplazarEnLista(resultado.datos)
    else setAviso(resultado.error)
  }

  const eliminar = async (id: string) => {
    if (!confirm("¿Eliminar este servicio?")) return
    setAviso("")
    const resultado = await borrarServicio(id)
    if (resultado.ok) setServicios((previos) => previos.filter((servicio) => servicio.id !== id))
    else setAviso(resultado.error)
  }

  return (
    <section aria-labelledby={idDelTitulo} className={cn(TARJETA_DEL_PANEL, "p-5 sm:p-6")}>
      <EncabezadoDeTarjeta
        id={idDelTitulo}
        titulo="Servicios"
        subtitulo="Los servicios que ofreces a tus clientes"
        icono={{ figura: Scissors }}
        accion={
          <BotonPrimario tamaño="sm" icono={<Plus className="h-4 w-4" />} onClick={abrirNuevo}>
            Nuevo servicio
          </BotonPrimario>
        }
      />

      {aviso && <Aviso className="mt-5">{aviso}</Aviso>}

      {servicios.length === 0 ? (
        <EstadoVacio className="mt-5" titulo="Sin servicios aún">
          Agrega el primer servicio que ofreces
        </EstadoVacio>
      ) : (
        <ul className="mt-5 divide-y divide-borde">
          {servicios.map((servicio) => (
            // Si no entran los botones al lado (el teléfono), bajan a la derecha, debajo del servicio.
            <li key={servicio.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3.5 first:pt-0 last:pb-0">
              <div className="min-w-48 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <p className="font-medium break-words">{servicio.name}</p>
                  {!servicio.active && <Insignia>Inactivo</Insignia>}
                </div>
                {servicio.description && (
                  <p className="mt-0.5 line-clamp-2 text-[13px] text-texto-2">{servicio.description}</p>
                )}
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-texto-2">
                  <span className="flex items-center gap-1">
                    <Clock className="size-3.5" aria-hidden="true" strokeWidth={1.75} />
                    {formatearDuracionDeServicio(servicio.duration)}
                  </span>
                  {servicio.price != null && (
                    <span className="font-medium text-navy tabular-nums">{formatearMonto(servicio.price)}</span>
                  )}
                </p>
              </div>

              <div className="ml-auto flex shrink-0 items-center gap-1">
                <InterruptorDelServicio servicio={servicio} alCambiar={() => alternarActivo(servicio)} />
                <button
                  type="button"
                  onClick={() => abrirEdicion(servicio)}
                  aria-label={`Editar ${servicio.name}`}
                  title="Editar"
                  className={BOTON_DE_ICONO}
                >
                  <Pencil className="size-4" aria-hidden="true" strokeWidth={1.75} />
                </button>
                <button
                  type="button"
                  onClick={() => eliminar(servicio.id)}
                  aria-label={`Eliminar ${servicio.name}`}
                  title="Eliminar"
                  className={cn(BOTON_DE_ICONO, "hover:bg-error/6 hover:text-error")}
                >
                  <Trash2 className="size-4" aria-hidden="true" strokeWidth={1.75} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <AnimatePresence>
        {modalAbierto && (
          <ModalServicio
            form={form}
            guardando={guardando}
            aviso={avisoDelModal}
            modoEdicion={!!servicioEditando}
            onCambiarCampo={(campo, valor) => setForm((previo) => ({ ...previo, [campo]: valor }))}
            onSubmit={guardar}
            onCerrar={cerrarModal}
          />
        )}
      </AnimatePresence>
    </section>
  )
}

/**
 * Activo o inactivo: un servicio inactivo no aparece en la página pública de
 * reservas. Es el interruptor de `Interruptor`, sin la etiqueta a la vista: en
 * cada fila el nombre del servicio ya está al lado, y va en su nombre para el
 * lector de pantalla.
 */
function InterruptorDelServicio({ servicio, alCambiar }: { servicio: Servicio; alCambiar: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={servicio.active}
      aria-label={`Servicio activo: ${servicio.name}`}
      title={servicio.active ? "Desactivar" : "Activar"}
      onClick={alCambiar}
      className={cn(
        // 52×32 a la vista; el ::after lleva el área táctil a 60×44.
        "relative mr-1 inline-flex h-8 w-13 shrink-0 cursor-pointer items-center rounded-full p-1",
        "anillo-foco transition-colors duration-150 ease-suave after:absolute after:-inset-x-1 after:-inset-y-1.5",
        servicio.active ? "bg-navy" : "bg-texto-2"
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-6 rounded-full bg-white shadow-sm transition-transform duration-300 ease-suave",
          servicio.active && "translate-x-5"
        )}
      />
    </button>
  )
}
