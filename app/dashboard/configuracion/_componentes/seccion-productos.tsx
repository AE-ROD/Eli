"use client"

import { useId, useState } from "react"
import { AnimatePresence } from "framer-motion"
import { Package, Pencil, Plus } from "lucide-react"
import { BotonPrimario } from "@/components/comunes/boton-primario"
import { Insignia } from "@/components/comunes/insignia"
import { Aviso } from "@/components/panel/aviso"
import { EncabezadoDeTarjeta } from "@/components/panel/encabezado-de-tarjeta"
import { EstadoVacio } from "@/components/panel/estado-vacio"
import { TARJETA_DEL_PANEL } from "@/components/panel/estilos"
import { formatearMonto, montoParaEscribir } from "@/lib/dinero"
import { cn } from "@/lib/utils"
import { ModalProducto } from "./modal-producto"
import {
  activarODesactivarProducto,
  crearProducto,
  editarProducto,
  type DatosDeProducto,
  type Producto,
} from "../_datos"

const PRODUCTO_EN_BLANCO: DatosDeProducto = { nombre: "", precio: "", porcentaje: "" }

/** Los botones de sólo ícono de cada producto: 44 × 44, lo mínimo para un dedo. */
const BOTON_DE_ICONO =
  "grid size-11 shrink-0 place-items-center rounded-[14px] text-navy squircle anillo-foco transition-colors duration-150 ease-suave hover:bg-superficie"

/** "10 %", "12,5 %": como se lee en Chile. */
function textoDePorcentaje(porcentaje: number): string {
  return `${porcentaje.toLocaleString("es-CL", { maximumFractionDigits: 2 })} %`
}

interface PropsDeSeccionProductos {
  productosIniciales: Producto[]
  /** Sólo la dueña ve y fija el % de comisión de cada producto. */
  conPorcentaje: boolean
}

/**
 * Los productos que vende el local (#67). Dueña y encargado los cargan; el %
 * de comisión, sólo la dueña. No se borran: se desactivan, y dejan de
 * ofrecerse en el tablero. No hay inventario: se anota cada venta.
 */
export function SeccionProductos({ productosIniciales, conPorcentaje }: PropsDeSeccionProductos) {
  const idDelTitulo = useId()
  const [productos, setProductos] = useState<Producto[]>(productosIniciales)
  const [modalAbierto, setModalAbierto] = useState(false)
  const [editando, setEditando] = useState<Producto | null>(null)
  const [form, setForm] = useState<DatosDeProducto>(PRODUCTO_EN_BLANCO)
  const [guardando, setGuardando] = useState(false)
  const [aviso, setAviso] = useState("")
  const [avisoDelModal, setAvisoDelModal] = useState("")

  const abrirNuevo = () => {
    setEditando(null)
    setForm(PRODUCTO_EN_BLANCO)
    setAvisoDelModal("")
    setModalAbierto(true)
  }

  const abrirEdicion = (producto: Producto) => {
    setEditando(producto)
    setForm({
      nombre: producto.nombre,
      precio: producto.precio == null ? "" : montoParaEscribir(producto.precio),
      porcentaje: producto.porcentaje == null ? "" : String(producto.porcentaje).replace(".", ","),
    })
    setAvisoDelModal("")
    setModalAbierto(true)
  }

  const cerrarModal = () => {
    setModalAbierto(false)
    setEditando(null)
  }

  const reemplazarEnLista = (actualizado: Producto) =>
    setProductos((previos) => previos.map((producto) => (producto.id === actualizado.id ? actualizado : producto)))

  const guardar = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    setAvisoDelModal("")
    setGuardando(true)
    const resultado = editando
      ? await editarProducto(editando.id, form, conPorcentaje)
      : await crearProducto(form, conPorcentaje)
    setGuardando(false)

    // Si el servidor lo rechaza, el modal queda abierto con lo cargado y el motivo.
    if (!resultado.ok) return setAvisoDelModal(resultado.error)

    setAviso("")
    if (editando) reemplazarEnLista(resultado.datos)
    else setProductos((previos) => [...previos, resultado.datos])
    cerrarModal()
  }

  const alternarActivo = async (producto: Producto) => {
    setAviso("")
    const resultado = await activarODesactivarProducto(producto.id, !producto.activo)
    if (resultado.ok) reemplazarEnLista(resultado.datos)
    else setAviso(resultado.error)
  }

  return (
    <section aria-labelledby={idDelTitulo} className={cn(TARJETA_DEL_PANEL, "p-5 sm:p-6")}>
      <EncabezadoDeTarjeta
        id={idDelTitulo}
        titulo="Productos"
        subtitulo="Lo que vendes además de tus servicios"
        icono={{ figura: Package }}
        accion={
          <BotonPrimario tamaño="sm" icono={<Plus className="h-4 w-4" />} onClick={abrirNuevo}>
            Nuevo producto
          </BotonPrimario>
        }
      />

      {aviso && <Aviso className="mt-5">{aviso}</Aviso>}

      {productos.length === 0 ? (
        <EstadoVacio className="mt-5" titulo="Sin productos aún">
          Agrega lo que vendes en el local para anotarlo en el tablero
        </EstadoVacio>
      ) : (
        <ul className="mt-5 divide-y divide-borde">
          {productos.map((producto) => (
            <li key={producto.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3.5 first:pt-0 last:pb-0">
              <div className="min-w-48 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <p className="font-medium break-words">{producto.nombre}</p>
                  {!producto.activo && <Insignia>Inactivo</Insignia>}
                </div>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-texto-2">
                  <span className="font-medium text-navy tabular-nums">
                    {producto.precio == null ? "Sin precio" : formatearMonto(producto.precio)}
                  </span>
                  {conPorcentaje && (
                    <span className="tabular-nums">
                      {producto.porcentaje == null
                        ? "Comisión sin configurar"
                        : `Comisión ${textoDePorcentaje(producto.porcentaje)}`}
                    </span>
                  )}
                </p>
              </div>

              <div className="ml-auto flex shrink-0 items-center gap-1">
                <InterruptorDelProducto producto={producto} alCambiar={() => alternarActivo(producto)} />
                <button
                  type="button"
                  onClick={() => abrirEdicion(producto)}
                  aria-label={`Editar ${producto.nombre}`}
                  title="Editar"
                  className={BOTON_DE_ICONO}
                >
                  <Pencil className="size-4" aria-hidden="true" strokeWidth={1.75} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <AnimatePresence>
        {modalAbierto && (
          <ModalProducto
            form={form}
            guardando={guardando}
            aviso={avisoDelModal}
            modoEdicion={!!editando}
            conPorcentaje={conPorcentaje}
            onCambiarCampo={(campo, valor) => setForm((previo) => ({ ...previo, [campo]: valor }))}
            onSubmit={guardar}
            onCerrar={cerrarModal}
          />
        )}
      </AnimatePresence>
    </section>
  )
}

/** Activo o inactivo, como el interruptor de cada servicio: uno inactivo no se ofrece en el tablero. */
function InterruptorDelProducto({ producto, alCambiar }: { producto: Producto; alCambiar: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={producto.activo}
      aria-label={`Producto a la venta: ${producto.nombre}`}
      title={producto.activo ? "Desactivar" : "Activar"}
      onClick={alCambiar}
      className={cn(
        // 52×32 a la vista; el ::after lleva el área táctil a 60×44.
        "relative mr-1 inline-flex h-8 w-13 shrink-0 cursor-pointer items-center rounded-full p-1",
        "anillo-foco transition-colors duration-150 ease-suave after:absolute after:-inset-x-1 after:-inset-y-1.5",
        producto.activo ? "bg-navy" : "bg-texto-2"
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-6 rounded-full bg-white shadow-sm transition-transform duration-300 ease-suave",
          producto.activo && "translate-x-5"
        )}
      />
    </button>
  )
}
