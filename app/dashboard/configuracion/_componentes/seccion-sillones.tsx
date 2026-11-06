"use client"

import { useId, useRef, useState } from "react"
import { AnimatePresence } from "framer-motion"
import { Armchair, ArrowDown, ArrowUp, Pencil, Plus } from "lucide-react"
import { BotonPrimario } from "@/components/comunes/boton-primario"
import { CampoFormulario } from "@/components/comunes/campo-formulario"
import { Insignia } from "@/components/comunes/insignia"
import { Aviso } from "@/components/panel/aviso"
import { EncabezadoDeTarjeta } from "@/components/panel/encabezado-de-tarjeta"
import { EstadoVacio } from "@/components/panel/estado-vacio"
import { TARJETA_DEL_PANEL } from "@/components/panel/estilos"
import { MarcoDeModal } from "@/components/panel/marco-de-modal"
import { LARGO_MAXIMO_DEL_NOMBRE } from "@/lib/sillones"
import { cn } from "@/lib/utils"
import { crearSillon, editarSillon, leerSillonesDeLaClinica, moverSillon, type Sillon } from "../_datos"

/** Los botones de sólo ícono de cada sillón: 44 × 44, lo mínimo para un dedo. */
const BOTON_DE_ICONO =
  "grid size-11 shrink-0 place-items-center rounded-[14px] text-navy squircle anillo-foco transition-colors duration-150 ease-suave hover:bg-superficie disabled:cursor-not-allowed disabled:text-texto-2/50 disabled:hover:bg-transparent"

interface PropsDeSeccionSillones {
  sillonesIniciales: Sillon[]
}

/**
 * Los sillones de la clínica dental (sólo ahí; los gestionan la dueña y el
 * encargado, como los servicios). Se agregan, se renombran, se ordenan (el
 * orden es el de las columnas de la agenda y de "Sillones ahora") y se
 * activan o desactivan. No se borran: un sillón desactivado deja de
 * ofrecerse para citas nuevas, y las que ya lo tienen lo conservan.
 *
 * Ordenar es subir o bajar de a un lugar: cada sillón queda con su posición
 * como orden, y se guardan sólo los que cambian. Mientras se guarda, otro
 * clic no hace nada (los botones no se apagan: el foco se perdería). El foco
 * se queda en el botón que se apretó, y se anuncia el lugar nuevo.
 */
export function SeccionSillones({ sillonesIniciales }: PropsDeSeccionSillones) {
  const idDelTitulo = useId()
  const [sillones, setSillones] = useState<Sillon[]>(sillonesIniciales)
  const [aviso, setAviso] = useState("")
  const [anuncio, setAnuncio] = useState("")
  const [ordenando, setOrdenando] = useState(false)
  // El modal: `null` cerrado; sin sillón, uno nuevo; con sillón, renombrarlo.
  const [modal, setModal] = useState<{ sillon: Sillon | null } | null>(null)
  const lista = useRef<HTMLUListElement>(null)

  const reemplazarEnLista = (actualizado: Sillon) =>
    setSillones((previos) => previos.map((sillon) => (sillon.id === actualizado.id ? actualizado : sillon)))

  const alternarActivo = async (sillon: Sillon) => {
    setAviso("")
    setAnuncio("")
    const resultado = await editarSillon(sillon.id, { activo: !sillon.activo })
    if (!resultado.ok) return setAviso(resultado.error)
    reemplazarEnLista(resultado.datos)
    setAnuncio(resultado.datos.activo ? `${resultado.datos.nombre} quedó activo.` : `${resultado.datos.nombre} quedó desactivado.`)
  }

  const mover = async (sillon: Sillon, direccion: -1 | 1) => {
    const movido = moverSillon(sillones, sillon.id, direccion)
    if (!movido || ordenando) return
    setAviso("")
    setOrdenando(true)
    const antes = sillones
    setSillones(movido.lista)

    for (const cambio of movido.cambios) {
      const resultado = await editarSillon(cambio.id, { orden: cambio.orden })
      if (!resultado.ok) {
        // Lo que quedó a medias se vuelve a leer: la lista dice lo que está guardado.
        const guardados = await leerSillonesDeLaClinica()
        setSillones(guardados.ok ? guardados.datos : antes)
        setOrdenando(false)
        setAnuncio("")
        return setAviso(`${resultado.error}. El orden quedó como está guardado.`)
      }
    }
    setOrdenando(false)

    const lugar = movido.lista.findIndex((otro) => otro.id === sillon.id)
    setAnuncio(`${sillon.nombre} quedó en el lugar ${lugar + 1} de ${movido.lista.length}.`)
    // Si llegó al principio o al final, el botón que se apretó se apaga y el
    // foco se perdería: pasa al otro botón de la misma fila.
    if (lugar === 0 || lugar === movido.lista.length - 1) {
      requestAnimationFrame(() => {
        const fila = lista.current?.querySelector<HTMLElement>(`[data-sillon="${sillon.id}"]`)
        fila?.querySelector<HTMLButtonElement>(`[data-mover="${direccion === -1 ? "bajar" : "subir"}"]`)?.focus()
      })
    }
  }

  return (
    <section aria-labelledby={idDelTitulo} className={cn(TARJETA_DEL_PANEL, "p-5 sm:p-6")}>
      <EncabezadoDeTarjeta
        id={idDelTitulo}
        titulo="Sillones"
        subtitulo="Cada sillón es una columna de la agenda del día y se elige al agendar."
        icono={{ figura: Armchair }}
        accion={
          <BotonPrimario tamaño="sm" icono={<Plus className="h-4 w-4" />} onClick={() => setModal({ sillon: null })}>
            Nuevo sillón
          </BotonPrimario>
        }
      />

      <p className="mt-4 text-sm text-pretty text-texto-2">
        Los sillones no se borran: se desactivan. Uno desactivado no se ofrece para citas nuevas, y las citas que ya lo
        tienen lo conservan.
      </p>

      {aviso && <Aviso className="mt-5">{aviso}</Aviso>}
      {/* Lo que cambió al ordenar o al activar, para el lector de pantalla. */}
      <p role="status" className="sr-only">
        {anuncio}
      </p>

      {sillones.length === 0 ? (
        <EstadoVacio className="mt-5" titulo="Sin sillones aún">
          Agrega los sillones de la clínica para ver la agenda por sillón y asignárselos a las citas.
        </EstadoVacio>
      ) : (
        <ul ref={lista} aria-busy={ordenando || undefined} className="mt-5 divide-y divide-borde">
          {sillones.map((sillon, indice) => (
            <li
              key={sillon.id}
              data-sillon={sillon.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3 first:pt-0 last:pb-0"
            >
              <div className="min-w-40 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <p className="font-medium break-words">{sillon.nombre}</p>
                  {!sillon.activo && <Insignia>Desactivado</Insignia>}
                </div>
                <p className="mt-0.5 text-[13px] text-texto-2">
                  Lugar {indice + 1} de {sillones.length}
                </p>
              </div>

              <div className="ml-auto flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  data-mover="subir"
                  onClick={() => mover(sillon, -1)}
                  disabled={indice === 0}
                  aria-label={`Subir ${sillon.nombre}`}
                  title="Subir"
                  className={BOTON_DE_ICONO}
                >
                  <ArrowUp className="size-4" aria-hidden="true" strokeWidth={1.75} />
                </button>
                <button
                  type="button"
                  data-mover="bajar"
                  onClick={() => mover(sillon, 1)}
                  disabled={indice === sillones.length - 1}
                  aria-label={`Bajar ${sillon.nombre}`}
                  title="Bajar"
                  className={BOTON_DE_ICONO}
                >
                  <ArrowDown className="size-4" aria-hidden="true" strokeWidth={1.75} />
                </button>
                <button
                  type="button"
                  onClick={() => setModal({ sillon })}
                  aria-label={`Renombrar ${sillon.nombre}`}
                  title="Renombrar"
                  className={BOTON_DE_ICONO}
                >
                  <Pencil className="size-4" aria-hidden="true" strokeWidth={1.75} />
                </button>
                <InterruptorDelSillon sillon={sillon} alCambiar={() => alternarActivo(sillon)} />
              </div>
            </li>
          ))}
        </ul>
      )}

      <AnimatePresence>
        {modal && (
          <ModalSillon
            sillon={modal.sillon}
            alGuardar={(guardado) => {
              setAviso("")
              if (modal.sillon) reemplazarEnLista(guardado)
              else setSillones((previos) => [...previos, guardado])
              setAnuncio(modal.sillon ? `Se renombró a ${guardado.nombre}.` : `Se agregó ${guardado.nombre}.`)
              setModal(null)
            }}
            alCerrar={() => setModal(null)}
          />
        )}
      </AnimatePresence>
    </section>
  )
}

/**
 * Activo o desactivado, con `role="switch"`, como el de los servicios. El
 * nombre del sillón va en su nombre accesible: en la fila ya está a la vista.
 */
function InterruptorDelSillon({ sillon, alCambiar }: { sillon: Sillon; alCambiar: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={sillon.activo}
      aria-label={`Sillón activo: ${sillon.nombre}`}
      title={sillon.activo ? "Desactivar" : "Activar"}
      onClick={alCambiar}
      className={cn(
        // 52×32 a la vista; el ::after lleva el área táctil a 60×44.
        "relative ml-1 inline-flex h-8 w-13 shrink-0 cursor-pointer items-center rounded-full p-1",
        "anillo-foco transition-colors duration-150 ease-suave after:absolute after:-inset-x-1 after:-inset-y-1.5",
        sillon.activo ? "bg-navy" : "bg-texto-2"
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-6 rounded-full bg-white shadow-sm transition-transform duration-300 ease-suave",
          sillon.activo && "translate-x-5"
        )}
      />
    </button>
  )
}

interface PropsDeModalSillon {
  /** El sillón a renombrar, o `null` para uno nuevo (va al final). */
  sillon: Sillon | null
  alGuardar: (sillon: Sillon) => void
  alCerrar: () => void
}

/** Agregar un sillón o cambiarle el nombre. Si el servidor lo rechaza (un nombre repetido), el modal sigue abierto con el motivo. */
function ModalSillon({ sillon, alGuardar, alCerrar }: PropsDeModalSillon) {
  const [nombre, setNombre] = useState(sillon?.nombre ?? "")
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState("")

  const guardar = async (evento: React.SyntheticEvent<HTMLFormElement>) => {
    evento.preventDefault()
    if (!nombre.trim()) return setError("Escribe el nombre del sillón")
    setError("")
    setGuardando(true)
    const resultado = sillon ? await editarSillon(sillon.id, { nombre }) : await crearSillon(nombre)
    setGuardando(false)
    if (!resultado.ok) return setError(resultado.error)
    alGuardar(resultado.datos)
  }

  return (
    <MarcoDeModal
      titulo={sillon ? "Renombrar sillón" : "Nuevo sillón"}
      descripcion={sillon ? undefined : "Va al final de la lista; después lo puedes subir."}
      bloqueado={guardando}
      alCerrar={alCerrar}
    >
      <form onSubmit={guardar} className="space-y-5">
        <CampoFormulario
          etiqueta="Nombre"
          placeholder="Ej.: Sillón 1, Box 2"
          value={nombre}
          maxLength={LARGO_MAXIMO_DEL_NOMBRE}
          onChange={(evento) => {
            setNombre(evento.target.value)
            setError("")
          }}
          autoFocus
          required
        />
        {error && <Aviso>{error}</Aviso>}
        <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row">
          <BotonPrimario type="button" variante="secundario" anchoCompleto disabled={guardando} onClick={alCerrar}>
            Cancelar
          </BotonPrimario>
          <BotonPrimario type="submit" anchoCompleto cargando={guardando}>
            {sillon ? "Guardar" : "Agregar sillón"}
          </BotonPrimario>
        </div>
      </form>
    </MarcoDeModal>
  )
}
