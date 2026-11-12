"use client"

import { useEffect, useId, useMemo, useState } from "react"
import { Check, LoaderCircle } from "lucide-react"
import { BotonPrimario } from "@/components/comunes/boton-primario"
import { CLASES_DE_ETIQUETA } from "@/components/comunes/estilos-de-campo"
import { Aviso } from "@/components/panel/aviso"
import { useRubroDelPanel } from "@/components/panel/contexto-rubro"
import { MarcoDeModal } from "@/components/panel/marco-de-modal"
import { cn } from "@/lib/utils"
import { vocabularioDe } from "@/lib/vocabulario"
import { frasesDeEquipo } from "../_frases"
import {
  guardarServiciosDelMiembro,
  leerCatalogoDeServicios,
  leerServiciosDelMiembro,
  type MiembroDelEquipo,
  type ServicioDelCatalogo,
} from "../_datos"

interface PropsDeModalServiciosDelMiembro {
  miembro: MiembroDelEquipo
  alCerrar: () => void
  /** Se llama con el texto del aviso de éxito, para mostrarlo en la página. */
  alGuardar: (aviso: string) => void
}

/** Una casilla nativa, con el foco y el tamaño de dedo de las demás filas del panel. */
const FILA =
  "flex min-h-11 cursor-pointer items-center gap-3 rounded-campo px-3 py-2 text-sm text-navy hover:bg-superficie has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-(--anillo)"
const CASILLA = "size-4 shrink-0 accent-navy"

/**
 * "Servicios que hace": la opción "Todos" (sin acotar, lo que tiene todo
 * miembro al principio) o una casilla por servicio. En la reserva pública,
 * la persona sólo aparece para los servicios que hace.
 */
export function ModalServiciosDelMiembro({ miembro, alCerrar, alGuardar }: PropsDeModalServiciosDelMiembro) {
  // "Prestaciones" y "tus pacientes" en una clínica dental. Memoizado por rubro: el efecto
  // que carga el catálogo depende de las palabras y no tiene que volver a correr en cada render.
  const rubro = useRubroDelPanel()
  const palabras = useMemo(() => vocabularioDe(rubro).palabras, [rubro])
  const frases = frasesDeEquipo(palabras).servicios
  const [catalogo, setCatalogo] = useState<ServicioDelCatalogo[]>([])
  const [todos, setTodos] = useState(true)
  const [elegidos, setElegidos] = useState<Set<string>>(new Set())
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState("")
  // Si no cargó, no se ofrece guardar: se guardaría "Todos" sin que nadie lo eligiera.
  const [errorDeCarga, setErrorDeCarga] = useState("")
  const idDeLaLista = useId()

  useEffect(() => {
    let vigente = true
    Promise.all([leerCatalogoDeServicios(palabras), leerServiciosDelMiembro(miembro.id, palabras)]).then(([servicios, delMiembro]) => {
      if (!vigente) return
      if (!servicios.ok) setErrorDeCarga(servicios.error)
      else if (!delMiembro.ok) setErrorDeCarga(delMiembro.error)
      else {
        setCatalogo(servicios.datos)
        setTodos(delMiembro.datos.todos)
        setElegidos(new Set(delMiembro.datos.serviceIds))
      }
      setCargando(false)
    })
    return () => {
      vigente = false
    }
  }, [miembro.id, palabras])

  const alternar = (id: string) => {
    setElegidos((actuales) => {
      const nuevos = new Set(actuales)
      if (nuevos.has(id)) nuevos.delete(id)
      else nuevos.add(id)
      return nuevos
    })
  }

  const guardar = async (evento: React.FormEvent) => {
    evento.preventDefault()
    setError("")
    if (!todos && elegidos.size === 0) {
      setError(frases.elegirAlMenosUno)
      return
    }
    setGuardando(true)
    const resultado = await guardarServiciosDelMiembro(miembro.id, todos ? null : [...elegidos], palabras)
    setGuardando(false)
    if (!resultado.ok) return setError(resultado.error)
    alGuardar(frases.guardado(miembro.user.name))
  }

  return (
    <MarcoDeModal
      titulo={frases.titulo(miembro.user.name)}
      antetitulo="Equipo"
      descripcion={frases.descripcion}
      bloqueado={guardando}
      alCerrar={alCerrar}
    >
      {cargando ? (
        <div aria-busy="true" className="grid h-32 place-items-center">
          <LoaderCircle className="size-6 animate-spin text-navy" aria-hidden="true" />
          <span className="sr-only">{frases.cargando}</span>
        </div>
      ) : errorDeCarga ? (
        <Aviso>{errorDeCarga}</Aviso>
      ) : (
        <form onSubmit={guardar} className="space-y-5">
          <fieldset className="min-w-0">
            <legend className={cn(CLASES_DE_ETIQUETA, "mb-2")}>{frases.queHace}</legend>
            <label className={cn(FILA, "font-medium")}>
              <input
                type="checkbox"
                className={CASILLA}
                checked={todos}
                onChange={(evento) => setTodos(evento.target.checked)}
                aria-controls={idDeLaLista}
              />
              {frases.todos}
            </label>
            {catalogo.length === 0 ? (
              <p className="mt-2 px-3 text-sm text-texto-2">{frases.sinCatalogo}</p>
            ) : (
              <ul id={idDeLaLista} className="mt-1 space-y-0.5 border-t border-borde pt-1">
                {catalogo.map((servicio) => (
                  <li key={servicio.id}>
                    <label className={cn(FILA, todos && "cursor-not-allowed opacity-55 hover:bg-transparent")}>
                      <input
                        type="checkbox"
                        className={CASILLA}
                        disabled={todos}
                        checked={todos || elegidos.has(servicio.id)}
                        onChange={() => alternar(servicio.id)}
                      />
                      <span className="min-w-0 break-words">{servicio.name}</span>
                      {!servicio.active && <span className="ml-auto shrink-0 text-xs text-texto-2">Inactivo</span>}
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </fieldset>

          {error && <Aviso>{error}</Aviso>}

          <BotonPrimario type="submit" anchoCompleto cargando={guardando} icono={<Check className="h-4 w-4" />}>
            {frases.guardar}
          </BotonPrimario>
        </form>
      )}
    </MarcoDeModal>
  )
}
