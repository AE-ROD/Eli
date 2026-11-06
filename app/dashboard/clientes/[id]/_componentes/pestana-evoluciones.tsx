"use client"

import { useEffect, useId, useState, type FormEvent } from "react"
import { AnimatePresence } from "framer-motion"
import { NotebookPen } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { Esqueleto } from "@/components/comunes/esqueleto"
import { Aviso } from "@/components/panel/aviso"
import { EncabezadoDeTarjeta } from "@/components/panel/encabezado-de-tarjeta"
import { EstadoVacio } from "@/components/panel/estado-vacio"
import { CAMPO, ETIQUETA, TARJETA_DEL_PANEL } from "@/components/panel/estilos"
import { MarcoDeModal } from "@/components/panel/marco-de-modal"
import { MAXIMO_DE_EVOLUCION, type EvolucionRespuesta } from "@/lib/ficha-clinica"
import { cn } from "@/lib/utils"
import { anotarEvolucion, leerCitasDelPaciente, leerEvoluciones, type CitaDelPaciente } from "../_datos"
import { citasParaEvolucion, cuandoEsLaCita, fechaYHora } from "../_formato"

interface PropsDePestanaEvoluciones {
  pacienteId: string
  /** Se piden la primera vez que se abre la pestaña. */
  activa: boolean
  editable: boolean
  zona: string
  hoy: string
}

/**
 * Las evoluciones del paciente, de la más nueva a la más vieja, con su fecha
 * y quién la anotó. Sólo se agregan: no se editan ni se borran (la base
 * tampoco lo deja). De a 30, con "Ver más".
 */
export function PestanaEvoluciones({ pacienteId, activa, editable, zona, hoy }: PropsDePestanaEvoluciones) {
  const [evoluciones, setEvoluciones] = useState<EvolucionRespuesta[]>([])
  const [siguiente, setSiguiente] = useState<string | null>(null)
  const [estado, setEstado] = useState<"sin-pedir" | "cargando" | "lista" | "error">("sin-pedir")
  const [cargandoMas, setCargandoMas] = useState(false)
  const [aviso, setAviso] = useState("")
  const [anotando, setAnotando] = useState(false)
  const [listo, setListo] = useState("")
  const idDelTitulo = useId()

  const cargar = (antes: string | null) =>
    leerEvoluciones(pacienteId, antes).then((resultado) => {
      if (!resultado.ok) {
        setAviso(resultado.error)
        return false
      }
      setAviso("")
      setEvoluciones((previas) => (antes ? [...previas, ...resultado.datos.evoluciones] : resultado.datos.evoluciones))
      setSiguiente(resultado.datos.siguiente)
      return true
    })

  // La primera vez que se abre la pestaña. El estado cambia en la respuesta, no acá.
  useEffect(() => {
    if (!activa || estado !== "sin-pedir") return
    let vigente = true
    leerEvoluciones(pacienteId, null).then((resultado) => {
      if (!vigente) return
      if (!resultado.ok) {
        setAviso(resultado.error)
        setEstado("error")
        return
      }
      setEvoluciones(resultado.datos.evoluciones)
      setSiguiente(resultado.datos.siguiente)
      setEstado("lista")
    })
    return () => {
      vigente = false
    }
  }, [activa, estado, pacienteId])

  const reintentar = async () => {
    setEstado("cargando")
    setEstado((await cargar(null)) ? "lista" : "error")
  }

  const verMas = async () => {
    if (!siguiente) return
    setCargandoMas(true)
    await cargar(siguiente)
    setCargandoMas(false)
  }

  const alAnotar = (evolucion: EvolucionRespuesta) => {
    setEvoluciones((previas) => [evolucion, ...previas])
    setAnotando(false)
    setListo("Evolución anotada.")
  }

  return (
    <section aria-labelledby={idDelTitulo} className={cn(TARJETA_DEL_PANEL, "p-5 sm:p-6")}>
      <EncabezadoDeTarjeta
        id={idDelTitulo}
        titulo="Evoluciones"
        subtitulo="Lo que se hizo en cada atención. Una evolución no se edita ni se borra."
        accion={
          editable && (
            <Boton type="button" variante="secundario" tamano="sm" icono={<NotebookPen aria-hidden="true" />} onClick={() => setAnotando(true)}>
              Anotar evolución
            </Boton>
          )
        }
      />

      <div className="mt-4 space-y-3">
        {listo && (
          <Aviso tono="listo" rol="status">
            {listo}
          </Aviso>
        )}
        {aviso && (
          <Aviso
            accion={
              estado === "error" && (
                <Boton type="button" variante="secundario" tamano="sm" onClick={() => void reintentar()}>
                  Reintentar
                </Boton>
              )
            }
          >
            {aviso}
          </Aviso>
        )}

        {estado === "sin-pedir" || estado === "cargando" ? (
          <div aria-busy="true" className="space-y-3">
            <span className="sr-only">Cargando evoluciones...</span>
            {[0, 1].map((i) => (
              <div key={i} aria-hidden="true" className="space-y-2.5 rounded-[20px] bg-superficie p-4 squircle">
                <Esqueleto className="w-32" />
                <Esqueleto className="w-4/5" />
              </div>
            ))}
          </div>
        ) : estado === "lista" && evoluciones.length === 0 ? (
          <EstadoVacio titulo="Sin evoluciones todavía">
            {editable ? "Anota lo que se hizo en cada atención con «Anotar evolución»." : "Todavía no se anotó ninguna."}
          </EstadoVacio>
        ) : (
          <ol className="space-y-3">
            {evoluciones.map((evolucion) => (
              <li key={evolucion.id} className="flex flex-wrap gap-x-6 gap-y-2 rounded-[20px] bg-superficie px-[18px] py-4 squircle">
                <p className="shrink-0 basis-44">
                  <span className="block font-semibold">{fechaYHora(evolucion.createdAt, zona)}</span>
                  <span className="block text-[13px] text-texto-2">{evolucion.autorNombre}</span>
                </p>
                <p className="min-w-0 flex-[1_1_320px] leading-relaxed break-words whitespace-pre-line">{evolucion.texto}</p>
              </li>
            ))}
          </ol>
        )}

        {siguiente && estado === "lista" && (
          <div className="flex justify-center pt-1">
            <Boton type="button" variante="secundario" cargando={cargandoMas} onClick={() => void verMas()}>
              Ver más
            </Boton>
          </div>
        )}
      </div>

      <AnimatePresence>
        {anotando && (
          <ModalAnotarEvolucion pacienteId={pacienteId} zona={zona} hoy={hoy} alAnotar={alAnotar} alCerrar={() => setAnotando(false)} />
        )}
      </AnimatePresence>
    </section>
  )
}

interface PropsDeModalAnotarEvolucion {
  pacienteId: string
  zona: string
  hoy: string
  alAnotar: (evolucion: EvolucionRespuesta) => void
  alCerrar: () => void
}

/** El texto de la evolución y, si se quiere, la cita en que se atendió (de hoy o antes, sin las canceladas). */
function ModalAnotarEvolucion({ pacienteId, zona, hoy, alAnotar, alCerrar }: PropsDeModalAnotarEvolucion) {
  const [texto, setTexto] = useState("")
  const [citaId, setCitaId] = useState("")
  const [citas, setCitas] = useState<CitaDelPaciente[] | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [aviso, setAviso] = useState("")
  const id = useId()

  useEffect(() => {
    let vigente = true
    leerCitasDelPaciente(pacienteId).then((resultado) => {
      if (vigente) setCitas(resultado.ok ? citasParaEvolucion(resultado.datos, zona, hoy) : [])
    })
    return () => {
      vigente = false
    }
  }, [pacienteId, zona, hoy])

  const anotar = async (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault()
    if (texto.trim() === "") return setAviso("Escribe la evolución")
    setAviso("")
    setGuardando(true)
    const resultado = await anotarEvolucion(pacienteId, { texto: texto.trim(), appointmentId: citaId || null })
    setGuardando(false)
    if (!resultado.ok) return setAviso(resultado.error)
    alAnotar(resultado.datos)
  }

  return (
    <MarcoDeModal
      titulo="Anotar evolución"
      descripcion="Queda con tu nombre y la hora. Después no se edita ni se borra."
      bloqueado={guardando}
      ancho="lg"
      alCerrar={alCerrar}
    >
      <form onSubmit={anotar} className="space-y-5" noValidate>
        <div>
          <label htmlFor={`${id}-texto`} className={ETIQUETA}>
            Qué se hizo
          </label>
          <textarea
            id={`${id}-texto`}
            autoFocus
            rows={6}
            maxLength={MAXIMO_DE_EVOLUCION}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            aria-describedby={`${id}-cuenta`}
            className={cn(CAMPO, "resize-y px-4 py-3 text-base")}
          />
          <p id={`${id}-cuenta`} className="mt-1.5 text-right text-xs text-texto-2 tabular-nums">
            {texto.length} de {MAXIMO_DE_EVOLUCION}
          </p>
        </div>

        <div>
          <label htmlFor={`${id}-cita`} className={ETIQUETA}>
            Cita (opcional)
          </label>
          <select
            id={`${id}-cita`}
            value={citaId}
            onChange={(e) => setCitaId(e.target.value)}
            disabled={citas === null}
            className={cn(CAMPO, "cursor-pointer text-base")}
          >
            <option value="">{citas === null ? "Cargando citas..." : "Sin cita"}</option>
            {(citas ?? []).map((cita) => (
              <option key={cita.id} value={cita.id}>
                {cuandoEsLaCita(cita.startTime, zona, hoy)} · {cita.title}
              </option>
            ))}
          </select>
        </div>

        {aviso && <Aviso>{aviso}</Aviso>}

        <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row">
          <Boton type="button" variante="secundario" className="w-full" disabled={guardando} onClick={alCerrar}>
            Cancelar
          </Boton>
          <Boton type="submit" className="w-full" cargando={guardando}>
            Anotar evolución
          </Boton>
        </div>
      </form>
    </MarcoDeModal>
  )
}
