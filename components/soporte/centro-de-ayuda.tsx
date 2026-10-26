"use client"

import { useEffect, useId, useMemo, useRef, useState, type ReactNode, type RefObject } from "react"
import { motion } from "framer-motion"
import { ArrowLeft, ArrowRight, BookOpen, CircleCheck, MessageSquareWarning, Wrench, type LucideIcon } from "lucide-react"
import { Antetitulo } from "@/components/comunes/antetitulo"
import { Boton } from "@/components/comunes/boton"
import { CuadroDeIcono } from "@/components/comunes/icono-de-modulo"
import { CURVA, DURACION } from "@/components/movimiento/tiempos"
import { AcordeonDePreguntas } from "@/components/soporte/acordeon-de-preguntas"
import { BuscadorDePreguntas } from "@/components/soporte/buscador-de-preguntas"
import { BORRADOR_VACIO, FormularioDeSoporte, type Borrador } from "@/components/soporte/formulario-de-soporte"
import { IconoDeArea } from "@/components/soporte/icono-de-area"
import { FiltroDeAreas, SelectorDeArea } from "@/components/soporte/selector-de-area"
import { buscarPreguntas, preguntasParaFallas, type PreguntaFrecuente } from "@/lib/preguntas-frecuentes"
import { AREAS, LIMITES, etiquetaDeArea, type AreaDeSoporte, type TipoDeSolicitud } from "@/lib/soporte"
import { cn } from "@/lib/utils"

/**
 * El centro de ayuda: el mismo en el panel (/dashboard/ayuda, con sesión) y en
 * la página pública (/soporte, sin sesión).
 *
 * Primero se elige qué se necesita: algo no funciona (falla), un reclamo o
 * información (consulta). Cada camino tiene tres pasos:
 *
 * - falla y reclamo: qué necesitas → el área → el formulario (la falla
 *   muestra antes las preguntas de esa área que responden problemas típicos);
 * - consulta: qué necesitas → las preguntas frecuentes → el formulario, si no
 *   encontró la respuesta.
 *
 * Una búsqueda sin resultados en el inicio lleva directo al formulario
 * ("Escríbenos"): ese camino tiene dos pasos. Por eso se lleva el historial
 * real de pasos: "Atrás" vuelve a donde se venía y el indicador cuenta los
 * pasos que se recorrieron, sin saltarse ninguno.
 *
 * Al cambiar de paso el contenido entra con un fundido y el foco va al título
 * nuevo: el botón que se apretó ya no existe, y sin esto el foco caería al
 * `<body>`. Lo escrito vive acá y no en el formulario: ir atrás no lo borra.
 */

type Paso = "inicio" | "preguntas" | "area" | "formulario" | "listo"

interface Opcion {
  tipo: TipoDeSolicitud
  titulo: string
  texto: string
  icono: LucideIcon
}

const OPCIONES: readonly Opcion[] = [
  {
    tipo: "falla",
    titulo: "Algo no funciona",
    texto: "Un error, algo que no carga o que no hace lo que debería.",
    icono: Wrench,
  },
  {
    tipo: "reclamo",
    titulo: "Quiero hacer un reclamo",
    texto: "Algo no te pareció bien. Queda registrado con un número de caso.",
    icono: MessageSquareWarning,
  },
  {
    tipo: "consulta",
    titulo: "Busco información",
    texto: "Cómo se hace algo, precios, tu cuenta y más.",
    icono: BookOpen,
  },
]

/** Cómo se nombra cada camino arriba de sus pasos. */
const NOMBRE_DEL_CAMINO: Record<TipoDeSolicitud, string> = {
  falla: "Algo no funciona",
  reclamo: "Reclamo",
  consulta: "Información",
}

/** Lo que se recibió, en la confirmación. */
const LO_RECIBIDO: Record<TipoDeSolicitud, string> = {
  falla: "Recibimos tu reporte",
  reclamo: "Recibimos tu reclamo",
  consulta: "Recibimos tu consulta",
}

interface PropsDeCentroDeAyuda {
  /** Con sesión el servidor sabe quién escribe: el formulario no pide nombre ni correo. */
  conSesion: boolean
  /** El correo de la cuenta, para decir a dónde llegará la respuesta. */
  emailDeSesion?: string
}

export function CentroDeAyuda({ conSesion, emailDeSesion }: PropsDeCentroDeAyuda) {
  /** Los pasos recorridos, el actual al final. Nunca está vacío. */
  const [historial, setHistorial] = useState<readonly Paso[]>(["inicio"])
  const paso = historial[historial.length - 1]
  const irA = (siguiente: Paso) => setHistorial((anterior) => [...anterior, siguiente])
  const [tipo, setTipo] = useState<TipoDeSolicitud | null>(null)
  const [area, setArea] = useState<AreaDeSoporte | null>(null)
  const [consulta, setConsulta] = useState("")
  const [filtro, setFiltro] = useState<AreaDeSoporte | null>(null)
  const [borrador, setBorrador] = useState<Borrador>(BORRADOR_VACIO)
  const [numero, setNumero] = useState("")
  /** El correo al que va la respuesta, guardado al enviar: después el borrador se vacía. */
  const [emailDeRespuesta, setEmailDeRespuesta] = useState<string | undefined>(undefined)
  const refDelTitulo = useRef<HTMLHeadingElement>(null)
  const idDelTitulo = useId()

  // Si el paso cambió alguna vez: lo primero que se pinta no se anima ni roba el foco.
  const [pasoAnterior, setPasoAnterior] = useState(paso)
  const [cambio, setCambio] = useState(false)
  if (paso !== pasoAnterior) {
    setPasoAnterior(paso)
    setCambio(true)
  }

  useEffect(() => {
    const titulo = refDelTitulo.current
    if (!cambio || !titulo) return
    titulo.focus({ preventScroll: true })
    // Sólo se desplaza si el título quedó fuera de la vista (por ejemplo, al
    // final de una lista larga de preguntas).
    const { top } = titulo.getBoundingClientRect()
    if (top < 0 || top > window.innerHeight * 0.6) titulo.scrollIntoView({ block: "start" })
  }, [cambio, paso])

  const elegirTipo = (elegido: TipoDeSolicitud) => {
    // Otro camino empieza sin área; lo escrito, en cambio, se conserva.
    if (elegido !== tipo) setArea(null)
    setTipo(elegido)
    irA(elegido === "consulta" ? "preguntas" : "area")
  }

  const elegirArea = (elegida: AreaDeSoporte) => {
    setArea(elegida)
    irA("formulario")
  }

  /**
   * De una búsqueda (en el inicio o en las preguntas frecuentes) al
   * formulario, con el área del filtro si había una. Lo que se buscó pasa a
   * ser la pregunta, salvo que ya hubiera algo escrito: eso no se pisa.
   */
  const escribirnos = () => {
    setTipo("consulta")
    setArea(filtro)
    const buscado = consulta.trim().slice(0, LIMITES.asunto.max)
    if (buscado && !borrador.asunto.trim()) setBorrador({ ...borrador, asunto: buscado })
    irA("formulario")
  }

  const atras = () => setHistorial((anterior) => (anterior.length > 1 ? anterior.slice(0, -1) : anterior))

  const volverAlInicio = () => {
    setTipo(null)
    setArea(null)
    setFiltro(null)
    setConsulta("")
    setNumero("")
    setHistorial(["inicio"])
  }

  const alEnviar = (numeroDeCaso: string) => {
    setNumero(numeroDeCaso)
    setEmailDeRespuesta(conSesion ? emailDeSesion : borrador.email.trim() || undefined)
    setBorrador(BORRADOR_VACIO)
    irA("listo")
  }

  const titulo = (texto: ReactNode) => (
    <TituloDelPaso refDelTitulo={refDelTitulo} id={idDelTitulo}>
      {texto}
    </TituloDelPaso>
  )

  // El paso en que va es cuántos recorrió; el total, 3, salvo que haya llegado
  // al formulario directo desde el inicio (un camino de 2).
  const numeroDePaso = historial.length
  const totalDePasos = paso === "formulario" ? historial.length : 3

  return (
    <motion.section
      key={paso}
      aria-labelledby={idDelTitulo}
      initial={cambio ? { opacity: 0, y: 8 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURACION.pildora, ease: CURVA.fundido }}
    >
      {tipo && (paso === "area" || paso === "preguntas" || paso === "formulario") && (
        <EncabezadoDelCamino
          camino={NOMBRE_DEL_CAMINO[tipo]}
          area={paso === "formulario" && tipo !== "consulta" ? area : null}
          numeroDePaso={numeroDePaso}
          totalDePasos={totalDePasos}
          alVolver={atras}
        />
      )}

      {paso === "inicio" && (
        <PasoDeInicio
          titulo={titulo("¿En qué te ayudamos?")}
          consulta={consulta}
          alCambiarConsulta={setConsulta}
          alElegir={elegirTipo}
          alEscribirnos={escribirnos}
        />
      )}

      {paso === "preguntas" && (
        <PasoDePreguntas
          titulo={titulo("Preguntas frecuentes")}
          consulta={consulta}
          alCambiarConsulta={setConsulta}
          filtro={filtro}
          alCambiarFiltro={setFiltro}
          alEscribirnos={escribirnos}
        />
      )}

      {paso === "area" && tipo && (
        <div>
          {titulo(tipo === "falla" ? "¿Dónde está el problema?" : "¿Sobre qué parte de Eli es tu reclamo?")}
          <p className="mt-2 text-pretty text-texto-2">Elige el área; si no estás seguro, elige Otro.</p>
          <div className="mt-6">
            <SelectorDeArea elegida={area} alElegir={elegirArea} idDelTitulo={idDelTitulo} />
          </div>
        </div>
      )}

      {paso === "formulario" && tipo && (
        <PasoDeFormulario
          titulo={titulo(
            tipo === "falla" ? "Cuéntanos qué pasó" : tipo === "reclamo" ? "Escribe tu reclamo" : "Escríbenos"
          )}
          tipo={tipo}
          area={area}
          alCambiarArea={setArea}
          borrador={borrador}
          alCambiarBorrador={setBorrador}
          conSesion={conSesion}
          emailDeSesion={emailDeSesion}
          alEnviar={alEnviar}
        />
      )}

      {paso === "listo" && tipo && (
        <Confirmacion
          titulo={titulo(LO_RECIBIDO[tipo])}
          numero={numero}
          email={emailDeRespuesta}
          alVolver={volverAlInicio}
        />
      )}
    </motion.section>
  )
}

/** El título de cada paso: recibe el foco por código al cambiar de paso, así que no lleva anillo. */
function TituloDelPaso({
  refDelTitulo,
  id,
  children,
}: {
  refDelTitulo: RefObject<HTMLHeadingElement | null>
  id: string
  children: ReactNode
}) {
  return (
    <h2
      ref={refDelTitulo}
      id={id}
      tabIndex={-1}
      className="titulo-3 scroll-mt-24 font-serif text-balance text-navy outline-none md:text-[32px] md:leading-tight"
    >
      {children}
    </h2>
  )
}

/** Arriba de los pasos 2 y 3: "Atrás", el camino elegido y en qué paso va. */
function EncabezadoDelCamino({
  camino,
  area,
  numeroDePaso,
  totalDePasos,
  alVolver,
}: {
  camino: string
  area: AreaDeSoporte | null
  numeroDePaso: number
  totalDePasos: number
  alVolver: () => void
}) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
      <Boton
        variante="fantasma"
        tamano="sm"
        onClick={alVolver}
        icono={<ArrowLeft aria-hidden="true" strokeWidth={1.75} />}
        className="-ml-1.5"
      >
        Atrás
      </Boton>
      <div className="flex items-center gap-3">
        <Antetitulo className="flex flex-wrap items-center gap-x-1.5">
          <span>{camino}</span>
          {area && (
            <>
              <span aria-hidden="true">·</span>
              <span>{etiquetaDeArea(area)}</span>
            </>
          )}
          <span aria-hidden="true">·</span>
          <span>
            Paso {numeroDePaso} de {totalDePasos}
          </span>
        </Antetitulo>
        <div aria-hidden="true" className="flex gap-1">
          {Array.from({ length: totalDePasos }, (_, i) => i + 1).map((indice) => (
            <span key={indice} className={cn("h-1.5 w-6 rounded-full", indice <= numeroDePaso ? "bg-navy" : "bg-borde")} />
          ))}
        </div>
      </div>
    </div>
  )
}

function PasoDeInicio({
  titulo,
  consulta,
  alCambiarConsulta,
  alElegir,
  alEscribirnos,
}: {
  titulo: ReactNode
  consulta: string
  alCambiarConsulta: (consulta: string) => void
  alElegir: (tipo: TipoDeSolicitud) => void
  alEscribirnos: () => void
}) {
  const resultados = useMemo(() => buscarPreguntas(consulta), [consulta])
  const buscando = consulta.trim() !== ""
  const prefijo = useId()

  return (
    <div>
      {titulo}
      <p className="mt-2 text-pretty text-texto-2">
        Busca una respuesta rápida o elige qué necesitas. Si nos escribes, te respondemos por correo.
      </p>

      <BuscadorDePreguntas
        valor={consulta}
        alCambiar={alCambiarConsulta}
        resultados={resultados.length}
        className="mt-6"
      />

      {buscando && (
        <div className="mt-4">
          {resultados.length > 0 ? (
            <AcordeonDePreguntas preguntas={resultados.slice(0, 6)} />
          ) : (
            <SinResultados consulta={consulta} alEscribirnos={alEscribirnos} />
          )}
          {resultados.length > 6 && (
            <p className="mt-3 text-sm text-texto-2">
              Hay {resultados.length - 6} más: entra a “Busco información” para verlas todas.
            </p>
          )}
        </div>
      )}

      <ul className="mt-8 grid gap-3 md:grid-cols-3">
        {OPCIONES.map((opcion) => (
          <li key={opcion.tipo}>
            {/*
              El nombre del botón es sólo el título; la descripción va aparte
              (`aria-describedby`). Juntos, el lector leía "Algo no funcionaUn
              error…", sin pausa entre los dos.
            */}
            <button
              type="button"
              onClick={() => alElegir(opcion.tipo)}
              aria-labelledby={`${prefijo}-${opcion.tipo}-titulo`}
              aria-describedby={`${prefijo}-${opcion.tipo}-texto`}
              className={cn(
                "group flex h-full min-h-24 w-full items-center gap-4 rounded-panel bg-tarjeta p-5 text-left shadow-sm squircle anillo-foco",
                "transition-[box-shadow,translate] duration-200 ease-suave hover:-translate-y-0.5 hover:shadow-md",
                "md:min-h-52 md:flex-col md:items-start md:justify-between md:p-6"
              )}
            >
              <span
                aria-hidden="true"
                className="grid size-12 shrink-0 place-items-center rounded-campo bg-superficie text-navy squircle transition-colors duration-150 ease-suave group-hover:bg-borde [&_svg]:size-6"
              >
                <opcion.icono strokeWidth={1.75} />
              </span>
              <span className="min-w-0 flex-1 md:flex-none">
                <span id={`${prefijo}-${opcion.tipo}-titulo`} className="block text-lg font-medium text-navy">
                  {opcion.titulo}
                </span>
                <span id={`${prefijo}-${opcion.tipo}-texto`} className="mt-1 block text-sm text-pretty text-texto-2">
                  {opcion.texto}
                </span>
              </span>
              <ArrowRight
                aria-hidden="true"
                strokeWidth={1.75}
                className="size-5 shrink-0 text-navy transition-transform duration-150 ease-suave group-hover:translate-x-0.5 md:hidden"
              />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function SinResultados({ consulta, alEscribirnos }: { consulta: string; alEscribirnos: () => void }) {
  return (
    <div className="rounded-panel border border-dashed border-texto-2/40 px-5 py-6 text-center squircle">
      <p className="font-medium text-pretty break-words text-navy">
        No encontramos preguntas sobre &laquo;{consulta.trim()}&raquo;.
      </p>
      <p className="mt-1 text-sm text-pretty text-texto-2">Prueba con otras palabras o escríbenos.</p>
      <Boton variante="enlace" onClick={alEscribirnos} className="mt-2">
        Escríbenos
      </Boton>
    </div>
  )
}

function PasoDePreguntas({
  titulo,
  consulta,
  alCambiarConsulta,
  filtro,
  alCambiarFiltro,
  alEscribirnos,
}: {
  titulo: ReactNode
  consulta: string
  alCambiarConsulta: (consulta: string) => void
  filtro: AreaDeSoporte | null
  alCambiarFiltro: (area: AreaDeSoporte | null) => void
  alEscribirnos: () => void
}) {
  const resultados = useMemo(() => buscarPreguntas(consulta, { area: filtro }), [consulta, filtro])

  // Agrupadas por área, en el orden de las áreas; dentro de cada una, el de la búsqueda.
  const grupos = useMemo(
    () =>
      AREAS.map((area) => ({
        area: area.valor,
        etiqueta: area.etiqueta,
        preguntas: resultados.filter((pregunta) => pregunta.area === area.valor),
      })).filter((grupo) => grupo.preguntas.length > 0),
    [resultados]
  )

  return (
    <div>
      {titulo}
      <p className="mt-2 text-pretty text-texto-2">Busca o elige un área para ver sus preguntas.</p>

      <BuscadorDePreguntas
        valor={consulta}
        alCambiar={alCambiarConsulta}
        resultados={resultados.length}
        className="mt-6"
      />
      <div className="mt-4">
        <FiltroDeAreas elegida={filtro} alElegir={alCambiarFiltro} />
      </div>

      <div className="mt-8 space-y-8">
        {grupos.length === 0 ? (
          <SinResultados consulta={consulta} alEscribirnos={alEscribirnos} />
        ) : (
          grupos.map((grupo) => <GrupoDePreguntas key={grupo.area} {...grupo} />)
        )}
      </div>

      <div className="mt-10 flex flex-col items-start gap-4 rounded-panel bg-superficie p-6 squircle sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-serif text-xl font-medium text-navy">¿No encontraste lo que buscabas?</p>
          <p className="mt-1 text-sm text-pretty text-texto-2">
            Escríbenos y te respondemos por correo.
          </p>
        </div>
        <Boton onClick={alEscribirnos} icono={<ArrowRight aria-hidden="true" strokeWidth={1.75} />} className="w-full sm:w-auto">
          Escríbenos
        </Boton>
      </div>
    </div>
  )
}

function GrupoDePreguntas({
  area,
  etiqueta,
  preguntas,
}: {
  area: AreaDeSoporte
  etiqueta: string
  preguntas: readonly PreguntaFrecuente[]
}) {
  const idDelGrupo = useId()
  return (
    <section aria-labelledby={idDelGrupo}>
      <h3 id={idDelGrupo} className="mb-3 flex items-center gap-2.5 text-base font-medium text-navy">
        <IconoDeArea area={area} tamano="sm" activo />
        {etiqueta}
      </h3>
      <AcordeonDePreguntas preguntas={preguntas} nivel="h4" />
    </section>
  )
}

function PasoDeFormulario({
  titulo,
  tipo,
  area,
  alCambiarArea,
  borrador,
  alCambiarBorrador,
  conSesion,
  emailDeSesion,
  alEnviar,
}: {
  titulo: ReactNode
  tipo: TipoDeSolicitud
  area: AreaDeSoporte | null
  alCambiarArea: (area: AreaDeSoporte) => void
  borrador: Borrador
  alCambiarBorrador: (borrador: Borrador) => void
  conSesion: boolean
  emailDeSesion?: string
  alEnviar: (numero: string) => void
}) {
  const sugeridas = tipo === "falla" && area ? preguntasParaFallas(area, 3) : []
  const idDeSugeridas = useId()

  return (
    <div>
      {titulo}
      <p className="mt-2 text-pretty text-texto-2">
        {tipo === "reclamo"
          ? "Tu reclamo queda registrado con un número de caso y te respondemos por correo."
          : tipo === "falla"
            ? "Con lo que nos cuentes lo revisamos y te respondemos por correo."
            : "Te respondemos por correo."}
      </p>

      {sugeridas.length > 0 && (
        <section aria-labelledby={idDeSugeridas} className="mt-6">
          <h3 id={idDeSugeridas} className="mb-3 text-base font-medium text-navy">
            Antes de escribirnos, revisa esto
          </h3>
          <AcordeonDePreguntas preguntas={sugeridas} nivel="h4" />
        </section>
      )}

      <div className="mt-8 rounded-panel bg-tarjeta p-5 shadow-sm squircle sm:p-8">
        <FormularioDeSoporte
          tipo={tipo}
          area={area}
          areaEditable={tipo === "consulta"}
          alCambiarArea={alCambiarArea}
          borrador={borrador}
          alCambiarBorrador={alCambiarBorrador}
          conSesion={conSesion}
          emailDeSesion={emailDeSesion}
          alEnviar={alEnviar}
        />
      </div>
    </div>
  )
}

function Confirmacion({
  titulo,
  numero,
  email,
  alVolver,
}: {
  titulo: ReactNode
  numero: string
  email?: string
  alVolver: () => void
}) {
  return (
    <div className="rounded-panel bg-tarjeta px-5 py-8 text-center shadow-sm squircle sm:px-10 sm:py-12">
      <CuadroDeIcono icono={CircleCheck} color="lima" tamano="lg" activo className="mx-auto" />
      <div className="mt-5">{titulo}</div>
      <p className="mt-6 text-sm text-texto-2">Tu número de caso</p>
      <p className="mt-1 font-serif text-5xl font-medium tracking-tight text-navy tabular-nums md:text-6xl">
        {numero}
      </p>
      <p className="mx-auto mt-6 max-w-md text-pretty text-texto-2">
        {email ? (
          <>
            Te enviamos un correo a <strong className="font-medium break-all text-navy">{email}</strong> con este
            número. Te responderemos por ese mismo medio.
          </>
        ) : (
          "Te enviamos un correo con este número. Te responderemos por ese mismo medio."
        )}
      </p>
      <Boton
        variante="secundario"
        onClick={alVolver}
        icono={<ArrowLeft aria-hidden="true" strokeWidth={1.75} />}
        className="mt-8 w-full sm:w-auto"
      >
        Volver al inicio de ayuda
      </Boton>
    </div>
  )
}
