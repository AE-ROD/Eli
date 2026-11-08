"use client"

import { useId, useState } from "react"
import { AnimatePresence } from "framer-motion"
import { FlaskConical, Pencil, Plus } from "lucide-react"
import { BotonPrimario } from "@/components/comunes/boton-primario"
import { CampoFormulario } from "@/components/comunes/campo-formulario"
import { Insignia } from "@/components/comunes/insignia"
import { Aviso } from "@/components/panel/aviso"
import { EncabezadoDeTarjeta } from "@/components/panel/encabezado-de-tarjeta"
import { EstadoVacio } from "@/components/panel/estado-vacio"
import { TARJETA_DEL_PANEL } from "@/components/panel/estilos"
import { MarcoDeModal } from "@/components/panel/marco-de-modal"
import { LARGO_MAXIMO_DEL_CONTACTO, LARGO_MAXIMO_DEL_NOMBRE } from "@/lib/edicion-de-protesis"
import { cn } from "@/lib/utils"
import { crearLaboratorio, editarLaboratorio, type Laboratorio } from "../_datos"

/** Los botones de sólo ícono: 44 × 44, lo mínimo para un dedo. */
const BOTON_DE_ICONO =
  "grid size-11 shrink-0 place-items-center rounded-[14px] text-navy squircle anillo-foco transition-colors duration-150 ease-suave hover:bg-superficie"

interface PropsDeSeccionLaboratorios {
  laboratoriosIniciales: Laboratorio[]
}

/**
 * Los laboratorios de la clínica dental (sólo ahí, y sólo la dueña): a quién
 * se le encargan las prótesis y se le paga la parte del técnico. Externos:
 * no tienen cuenta en Eli. Se agregan, se renombran, se les anota un
 * contacto y se activan o desactivan. No se borran: las prótesis que ya lo
 * tienen lo siguen nombrando, y uno desactivado deja de ofrecerse en las
 * prótesis nuevas y como laboratorio por defecto de un material.
 */
export function SeccionLaboratorios({ laboratoriosIniciales }: PropsDeSeccionLaboratorios) {
  const idDelTitulo = useId()
  const [laboratorios, setLaboratorios] = useState<Laboratorio[]>(laboratoriosIniciales)
  const [aviso, setAviso] = useState("")
  const [anuncio, setAnuncio] = useState("")
  // El modal: `null` cerrado; sin laboratorio, uno nuevo; con laboratorio, editarlo.
  const [modal, setModal] = useState<{ laboratorio: Laboratorio | null } | null>(null)

  /** Por nombre, como los lee el servidor. */
  const enOrden = (lista: Laboratorio[]) => [...lista].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))

  const reemplazar = (actualizado: Laboratorio) =>
    setLaboratorios((previos) => enOrden(previos.map((otro) => (otro.id === actualizado.id ? actualizado : otro))))

  const alternarActivo = async (laboratorio: Laboratorio) => {
    setAviso("")
    setAnuncio("")
    const resultado = await editarLaboratorio(laboratorio.id, { activo: !laboratorio.activo })
    if (!resultado.ok) return setAviso(resultado.error)
    reemplazar(resultado.datos)
    setAnuncio(resultado.datos.activo ? `${resultado.datos.nombre} quedó activo.` : `${resultado.datos.nombre} quedó desactivado.`)
  }

  return (
    <section aria-labelledby={idDelTitulo} className={cn(TARJETA_DEL_PANEL, "p-5 sm:p-6")}>
      <EncabezadoDeTarjeta
        id={idDelTitulo}
        titulo="Laboratorios"
        subtitulo="Los laboratorios a los que la clínica encarga las prótesis. No tienen cuenta en Eli."
        icono={{ figura: FlaskConical }}
        accion={
          <BotonPrimario tamaño="sm" icono={<Plus className="h-4 w-4" />} onClick={() => setModal({ laboratorio: null })}>
            Nuevo laboratorio
          </BotonPrimario>
        }
      />

      <p className="mt-4 text-sm text-pretty text-texto-2">
        Los laboratorios no se borran: se desactivan. Uno desactivado no se ofrece en las prótesis nuevas, y las que ya lo
        tienen lo conservan.
      </p>

      {aviso && <Aviso className="mt-5">{aviso}</Aviso>}
      <p role="status" className="sr-only">
        {anuncio}
      </p>

      {laboratorios.length === 0 ? (
        <EstadoVacio className="mt-5" titulo="Sin laboratorios aún">
          Agrega los laboratorios con que trabaja la clínica para elegirlos al crear una prótesis.
        </EstadoVacio>
      ) : (
        <ul className="mt-5 divide-y divide-borde">
          {laboratorios.map((laboratorio) => (
            <li key={laboratorio.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3 first:pt-0 last:pb-0">
              <div className="min-w-40 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <p className="font-medium break-words">{laboratorio.nombre}</p>
                  {!laboratorio.activo && <Insignia>Desactivado</Insignia>}
                </div>
                <p className="mt-0.5 text-[13px] break-words text-texto-2">{laboratorio.contacto ?? "Sin contacto anotado"}</p>
              </div>

              <div className="ml-auto flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => setModal({ laboratorio })}
                  aria-label={`Editar ${laboratorio.nombre}`}
                  title="Editar"
                  className={BOTON_DE_ICONO}
                >
                  <Pencil className="size-4" aria-hidden="true" strokeWidth={1.75} />
                </button>
                <button
                  type="button"
                  role="switch"
                  aria-checked={laboratorio.activo}
                  aria-label={`Laboratorio activo: ${laboratorio.nombre}`}
                  title={laboratorio.activo ? "Desactivar" : "Activar"}
                  onClick={() => void alternarActivo(laboratorio)}
                  className={cn(
                    // 52×32 a la vista; el ::after lleva el área táctil a 60×44.
                    "relative ml-1 inline-flex h-8 w-13 shrink-0 cursor-pointer items-center rounded-full p-1",
                    "anillo-foco transition-colors duration-150 ease-suave after:absolute after:-inset-x-1 after:-inset-y-1.5",
                    laboratorio.activo ? "bg-navy" : "bg-texto-2"
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn("size-6 rounded-full bg-white shadow-sm transition-transform duration-300 ease-suave", laboratorio.activo && "translate-x-5")}
                  />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <AnimatePresence>
        {modal && (
          <ModalLaboratorio
            laboratorio={modal.laboratorio}
            alGuardar={(guardado) => {
              setAviso("")
              if (modal.laboratorio) reemplazar(guardado)
              else setLaboratorios((previos) => enOrden([...previos, guardado]))
              setAnuncio(modal.laboratorio ? `Se guardó ${guardado.nombre}.` : `Se agregó ${guardado.nombre}.`)
              setModal(null)
            }}
            alCerrar={() => setModal(null)}
          />
        )}
      </AnimatePresence>
    </section>
  )
}

interface PropsDeModalLaboratorio {
  /** El laboratorio a editar, o `null` para uno nuevo. */
  laboratorio: Laboratorio | null
  alGuardar: (laboratorio: Laboratorio) => void
  alCerrar: () => void
}

/** Agregar un laboratorio o cambiar su nombre y contacto. Si el servidor lo rechaza (un nombre repetido), sigue abierto con el motivo. */
function ModalLaboratorio({ laboratorio, alGuardar, alCerrar }: PropsDeModalLaboratorio) {
  const [nombre, setNombre] = useState(laboratorio?.nombre ?? "")
  const [contacto, setContacto] = useState(laboratorio?.contacto ?? "")
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState("")

  const guardar = async (evento: React.SyntheticEvent<HTMLFormElement>) => {
    evento.preventDefault()
    if (!nombre.trim()) return setError("Escribe el nombre del laboratorio")
    setError("")
    setGuardando(true)
    const datos = { nombre: nombre.trim(), contacto: contacto.trim() || null }
    const resultado = laboratorio ? await editarLaboratorio(laboratorio.id, datos) : await crearLaboratorio(datos)
    setGuardando(false)
    if (!resultado.ok) return setError(resultado.error)
    alGuardar(resultado.datos)
  }

  return (
    <MarcoDeModal
      titulo={laboratorio ? "Editar laboratorio" : "Nuevo laboratorio"}
      descripcion={laboratorio ? "Las prótesis que ya lo tienen siguen nombrándolo." : undefined}
      bloqueado={guardando}
      alCerrar={alCerrar}
    >
      <form onSubmit={guardar} className="space-y-5">
        <CampoFormulario
          etiqueta="Nombre"
          placeholder="Ej.: Laboratorio Dental Andes"
          value={nombre}
          maxLength={LARGO_MAXIMO_DEL_NOMBRE}
          onChange={(evento) => {
            setNombre(evento.target.value)
            setError("")
          }}
          autoFocus
          required
        />
        <CampoFormulario
          etiqueta="Contacto (opcional)"
          placeholder="Teléfono, correo o a quién llamar"
          value={contacto}
          maxLength={LARGO_MAXIMO_DEL_CONTACTO}
          onChange={(evento) => setContacto(evento.target.value)}
        />
        {error && <Aviso>{error}</Aviso>}
        <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row">
          <BotonPrimario type="button" variante="secundario" anchoCompleto disabled={guardando} onClick={alCerrar}>
            Cancelar
          </BotonPrimario>
          <BotonPrimario type="submit" anchoCompleto cargando={guardando}>
            {laboratorio ? "Guardar" : "Agregar laboratorio"}
          </BotonPrimario>
        </div>
      </form>
    </MarcoDeModal>
  )
}
