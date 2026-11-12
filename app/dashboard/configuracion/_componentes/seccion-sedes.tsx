"use client"

import { useEffect, useId, useRef, useState, type Dispatch, type SetStateAction } from "react"
import { useRouter } from "next/navigation"
import { AnimatePresence } from "framer-motion"
import { MapPin, Plus } from "lucide-react"
import { BotonPrimario } from "@/components/comunes/boton-primario"
import { Aviso } from "@/components/panel/aviso"
import { useRubroDelPanel } from "@/components/panel/contexto-rubro"
import { EncabezadoDeTarjeta } from "@/components/panel/encabezado-de-tarjeta"
import { TARJETA_DEL_PANEL } from "@/components/panel/estilos"
import { ModalConfirmar } from "@/components/panel/modal-confirmar"
import { moverEnLaLista } from "@/lib/orden-de-lista"
import { ordenarSedes } from "@/lib/sedes"
import { cn } from "@/lib/utils"
import { vocabularioDe } from "@/lib/vocabulario"
import { borrarSede, editarSede, leerSedes, type Sede } from "../_datos"
import { frasesDeConfiguracion } from "../_frases"
import { cupoDeSedes } from "../_sedes"
import { EditorDeHorarioDeSede } from "./editor-de-horario-de-sede"
import { FilaDeSede } from "./fila-de-sede"
import { ModalConvertirEnSedes } from "./modal-convertir-en-sedes"
import { ModalSede } from "./modal-sede"

interface PropsDeSeccionSedes {
  /** Las sedes que tiene el negocio ahora, leídas en el servidor con `whereDeSedes`. */
  sedesIniciales: Sede[]
  /** La dirección y la comuna que hoy tiene el negocio: la primera sede las trae escritas al pasar a varios lugares. */
  direccionDelNegocio: string
  comunaDelNegocio: string
}

/**
 * «Sedes y horarios» (plan Independiente, sólo la dueña: `page.tsx` la arma
 * con `puedeGestionarSedes`). Sin sedes es un llamado, «Trabajo en más de un
 * lugar», que abre el paso a varias; con una o más es la lista de sedes con su
 * horario por día, y entonces reemplaza a la sección «Horario» (`page.tsx`
 * vuelve a pedir la página cuando se pasa de una a otra, para que el horario
 * de siempre aparezca o desaparezca).
 */
export function SeccionSedes({ sedesIniciales, direccionDelNegocio, comunaDelNegocio }: PropsDeSeccionSedes) {
  const router = useRouter()
  const [sedes, setSedes] = useState<Sede[]>(() => ordenarSedes(sedesIniciales))
  // Recién pasó de un solo lugar a varios en esta pantalla: se lo dice y lleva el foco a la lista.
  const [recienConvertida, setRecienConvertida] = useState(false)
  const sinSedes = sedes.length === 0

  // Si ya hubo sedes en esta pantalla, vaciar la lista (borrar la última) lleva el foco al llamado.
  const [huboSedes, setHuboSedes] = useState(!sinSedes)
  if (!sinSedes && !huboSedes) setHuboSedes(true)

  // Pasar de cero a una o más sedes (o al revés) cambia qué secciones arma el servidor: se vuelve a pedir la página.
  const estabaSinSedes = useRef(sinSedes)
  useEffect(() => {
    if (estabaSinSedes.current === sinSedes) return
    estabaSinSedes.current = sinSedes
    router.refresh()
  }, [sinSedes, router])

  if (sinSedes) {
    return (
      <LlamadoASedes
        direccionDelNegocio={direccionDelNegocio}
        comunaDelNegocio={comunaDelNegocio}
        enfocarAlMontar={huboSedes}
        alConvertir={(nuevas) => {
          setRecienConvertida(true)
          setSedes(ordenarSedes(nuevas))
        }}
      />
    )
  }
  return <AdministradorDeSedes sedes={sedes} alCambiar={setSedes} recienConvertida={recienConvertida} />
}

// ─── Sin sedes: el llamado a trabajar en más de un lugar ─────────────────────

interface PropsDeLlamadoASedes {
  direccionDelNegocio: string
  comunaDelNegocio: string
  enfocarAlMontar: boolean
  alConvertir: (sedes: Sede[]) => void
}

function LlamadoASedes({ direccionDelNegocio, comunaDelNegocio, enfocarAlMontar, alConvertir }: PropsDeLlamadoASedes) {
  const idDelTitulo = useId()
  const idDelBoton = useId()
  const { sedes: frases } = frasesDeConfiguracion(vocabularioDe(useRubroDelPanel()).palabras)
  const [abierto, setAbierto] = useState(false)

  useEffect(() => {
    if (enfocarAlMontar) document.getElementById(idDelBoton)?.focus()
  }, [enfocarAlMontar, idDelBoton])

  return (
    <section aria-labelledby={idDelTitulo} className={cn(TARJETA_DEL_PANEL, "p-5 sm:p-6")}>
      <EncabezadoDeTarjeta
        id={idDelTitulo}
        nivel={3}
        titulo={frases.titulo}
        subtitulo={frases.convertir.descripcion}
        icono={{ figura: MapPin }}
      />
      <div className="mt-5">
        <BotonPrimario id={idDelBoton} type="button" tamaño="sm" icono={<MapPin className="h-4 w-4" />} onClick={() => setAbierto(true)}>
          {frases.convertir.boton}
        </BotonPrimario>
      </div>

      <AnimatePresence>
        {abierto && (
          <ModalConvertirEnSedes
            direccionDelNegocio={direccionDelNegocio}
            comunaDelNegocio={comunaDelNegocio}
            alConvertir={(sedes) => {
              setAbierto(false)
              alConvertir(sedes)
            }}
            alCerrar={() => setAbierto(false)}
          />
        )}
      </AnimatePresence>
    </section>
  )
}

// ─── Con sedes: la lista, el orden y la grilla de cada una ───────────────────

interface PropsDeAdministradorDeSedes {
  sedes: Sede[]
  alCambiar: Dispatch<SetStateAction<Sede[]>>
  recienConvertida: boolean
}

/**
 * Cada sede con su horario. Agregar (hasta `MAX_SEDES` activas), editar,
 * ordenar (subir o bajar de a un lugar), desactivar o reactivar, borrar (con
 * confirmación) y abrir su grilla semanal. Todo lo que el servidor rechaza
 * (un 409 por horas por delante, por un choque o por el máximo) se muestra con
 * su motivo y la lista queda como está guardada.
 *
 * Una sola grilla abierta a la vez: con cambios sin guardar, abrir otra o
 * cerrar ésta pregunta antes de descartarlos. Mientras se guarda un cambio, otro
 * clic no hace nada (los botones no se apagan: el foco se perdería).
 */
function AdministradorDeSedes({ sedes, alCambiar, recienConvertida }: PropsDeAdministradorDeSedes) {
  const idDelTitulo = useId()
  const idDeAgregar = useId()
  const palabras = vocabularioDe(useRubroDelPanel()).palabras
  const { sedes: frases } = frasesDeConfiguracion(palabras)
  const [aviso, setAviso] = useState("")
  const [anuncio, setAnuncio] = useState("")
  const [ocupada, setOcupada] = useState(false)
  // El modal de agregar (`sede: null`) o editar.
  const [modal, setModal] = useState<{ sede: Sede | null } | null>(null)
  const [paraBorrar, setParaBorrar] = useState<Sede | null>(null)
  const [borrando, setBorrando] = useState(false)
  const [avisoDelBorrado, setAvisoDelBorrado] = useState("")
  // La sede cuya grilla está abierta, si hay cambios sin guardar en ella y a qué se quería ir cuando se preguntó si descartarlos.
  const [horarioAbierto, setHorarioAbierto] = useState<string | null>(null)
  const [pendiente, setPendiente] = useState(false)
  const [descartando, setDescartando] = useState<{ destino: string | null } | null>(null)
  const seccion = useRef<HTMLElement>(null)
  const lista = useRef<HTMLUListElement>(null)
  const cupo = cupoDeSedes(sedes)

  // Al pasar a varios lugares, el foco va a la sección: el llamado donde estaba el botón ya no existe.
  useEffect(() => {
    if (recienConvertida) seccion.current?.focus()
  }, [recienConvertida])

  const reemplazar = (actualizada: Sede) =>
    alCambiar((previas) => ordenarSedes(previas.map((sede) => (sede.id === actualizada.id ? actualizada : sede))))

  const alternarActivo = async (sede: Sede) => {
    if (ocupada) return
    setAviso("")
    setAnuncio("")
    setOcupada(true)
    const resultado = await editarSede(sede.id, { activo: !sede.activo }, palabras)
    setOcupada(false)
    if (!resultado.ok) return setAviso(resultado.error)
    reemplazar(resultado.datos)
    setAnuncio(resultado.datos.activo ? frases.anuncios.activada(resultado.datos.nombre) : frases.anuncios.desactivada(resultado.datos.nombre))
  }

  const mover = async (sede: Sede, direccion: -1 | 1) => {
    const movida = moverEnLaLista(sedes, sede.id, direccion)
    if (!movida || ocupada) return
    setAviso("")
    setAnuncio("")
    setOcupada(true)
    const antes = sedes
    alCambiar(movida.lista)

    for (const cambio of movida.cambios) {
      const resultado = await editarSede(cambio.id, { orden: cambio.orden }, palabras)
      if (!resultado.ok) {
        // Lo que quedó a medias se vuelve a leer: la lista dice lo que está guardado.
        const guardadas = await leerSedes(palabras)
        alCambiar(guardadas.ok ? ordenarSedes(guardadas.datos.sedes) : antes)
        setOcupada(false)
        return setAviso(`${resultado.error} El orden quedó como está guardado.`)
      }
    }
    setOcupada(false)

    const lugar = movida.lista.findIndex((otra) => otra.id === sede.id)
    setAnuncio(frases.anuncios.lugar(sede.nombre, lugar + 1, movida.lista.length))
    // Si llegó al principio o al final, el botón que se apretó se apaga y el
    // foco se perdería: pasa al otro botón de la misma fila.
    if (lugar === 0 || lugar === movida.lista.length - 1) {
      requestAnimationFrame(() => {
        const fila = lista.current?.querySelector<HTMLElement>(`[data-sede="${sede.id}"]`)
        fila?.querySelector<HTMLButtonElement>(`[data-mover="${direccion === -1 ? "bajar" : "subir"}"]`)?.focus()
      })
    }
  }

  const pedirAbrirHorario = (destino: string | null) => {
    if (pendiente) return setDescartando({ destino })
    setHorarioAbierto(destino)
  }

  const descartarYAbrir = () => {
    if (!descartando) return
    setHorarioAbierto(descartando.destino)
    setPendiente(false)
    setDescartando(null)
  }

  const borrar = async () => {
    if (!paraBorrar || borrando) return
    setAvisoDelBorrado("")
    setBorrando(true)
    const resultado = await borrarSede(paraBorrar.id, palabras)
    setBorrando(false)
    if (!resultado.ok) return setAvisoDelBorrado(resultado.error)
    const borrada = paraBorrar
    alCambiar((previas) => previas.filter((sede) => sede.id !== borrada.id))
    if (horarioAbierto === borrada.id) {
      setHorarioAbierto(null)
      setPendiente(false)
    }
    setParaBorrar(null)
    setAviso("")
    setAnuncio(frases.anuncios.borrada(borrada.nombre))
    // El botón de borrar de esa sede ya no existe: el foco pasa a «Agregar sede».
    requestAnimationFrame(() => document.getElementById(idDeAgregar)?.focus())
  }

  return (
    <section ref={seccion} tabIndex={-1} aria-labelledby={idDelTitulo} className={cn(TARJETA_DEL_PANEL, "p-5 outline-none sm:p-6")}>
      <EncabezadoDeTarjeta
        id={idDelTitulo}
        nivel={3}
        titulo={frases.titulo}
        subtitulo={frases.subtitulo}
        icono={{ figura: MapPin }}
        accion={
          <BotonPrimario id={idDeAgregar} type="button" tamaño="sm" icono={<Plus className="h-4 w-4" />} disabled={!cupo.hayCupo} onClick={() => setModal({ sede: null })}>
            {frases.agregar}
          </BotonPrimario>
        }
      />

      <p className="mt-4 text-sm text-pretty text-texto-2">{frases.regla}</p>
      <p className="mt-2 text-[13px] text-texto-2">
        {frases.cupo(cupo.activas)}
        {!cupo.hayCupo && <span className="block">{frases.sinCupo}</span>}
      </p>

      {recienConvertida && (
        <Aviso tono="listo" className="mt-5">
          {frases.convertir.listo}
        </Aviso>
      )}
      {aviso && <Aviso className="mt-5">{aviso}</Aviso>}
      {/* Lo que cambió al ordenar, activar o guardar, para el lector de pantalla. */}
      <p role="status" className="sr-only">
        {anuncio}
      </p>

      <ul ref={lista} aria-busy={ocupada || undefined} className="mt-5 divide-y divide-borde">
        {sedes.map((sede, indice) => (
          <FilaDeSede
            key={sede.id}
            sede={sede}
            indice={indice}
            total={sedes.length}
            horarioAbierto={horarioAbierto === sede.id}
            alSubir={() => mover(sede, -1)}
            alBajar={() => mover(sede, 1)}
            alEditar={() => setModal({ sede })}
            alBorrar={() => {
              setAvisoDelBorrado("")
              setParaBorrar(sede)
            }}
            alAlternarActivo={() => alternarActivo(sede)}
            alAlternarHorario={() => pedirAbrirHorario(horarioAbierto === sede.id ? null : sede.id)}
          >
            <EditorDeHorarioDeSede
              key={sede.id}
              sede={sede}
              sedes={sedes}
              alGuardar={(guardada) => {
                reemplazar(guardada)
                setAviso("")
                setAnuncio(frases.anuncios.horarioGuardado(guardada.nombre))
              }}
              alCambiarPendiente={setPendiente}
              alCerrar={() => pedirAbrirHorario(null)}
            />
          </FilaDeSede>
        ))}
      </ul>

      <AnimatePresence>
        {modal && (
          <ModalSede
            sede={modal.sede}
            sedes={sedes}
            alGuardar={(guardada) => {
              setAviso("")
              if (modal.sede) {
                reemplazar(guardada)
                setAnuncio(frases.anuncios.editada(guardada.nombre))
              } else {
                alCambiar((previas) => ordenarSedes([...previas, guardada]))
                setAnuncio(frases.anuncios.agregada(guardada.nombre))
                // Una sede nueva no tiene horario: se abre su grilla para cargarlo, si no hay otra con cambios sin guardar.
                if (!pendiente) setHorarioAbierto(guardada.id)
              }
              setModal(null)
            }}
            alCerrar={() => setModal(null)}
          />
        )}

        {paraBorrar && (
          <ModalConfirmar
            titulo={frases.borrar.titulo(paraBorrar.nombre)}
            descripcion={frases.borrar.descripcion}
            textoConfirmar={frases.borrar.confirmar}
            textoCancelar={frases.borrar.cancelar}
            peligro
            trabajando={borrando}
            aviso={avisoDelBorrado}
            onConfirmar={borrar}
            onCerrar={() => setParaBorrar(null)}
          />
        )}

        {descartando && (
          <ModalConfirmar
            titulo={frases.editor.descartar.titulo}
            descripcion={frases.editor.descartar.descripcion(sedes.find((sede) => sede.id === horarioAbierto)?.nombre ?? "esta sede")}
            textoConfirmar={frases.editor.descartar.confirmar}
            textoCancelar={frases.editor.descartar.cancelar}
            peligro
            onConfirmar={descartarYAbrir}
            onCerrar={() => setDescartando(null)}
          />
        )}
      </AnimatePresence>
    </section>
  )
}
