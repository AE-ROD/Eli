"use client"

import { useEffect, useId, useRef, useState } from "react"
import { AnimatePresence } from "framer-motion"
import { CalendarCheck, Clock, Copy, Save } from "lucide-react"
import { BotonPrimario } from "@/components/comunes/boton-primario"
import { Aviso } from "@/components/panel/aviso"
import { useRubroDelPanel } from "@/components/panel/contexto-rubro"
import { EncabezadoDeTarjeta } from "@/components/panel/encabezado-de-tarjeta"
import { TARJETA_DEL_PANEL, RELLENO_DE_TARJETA } from "@/components/panel/estilos"
import { CampoHora } from "@/components/panel/campo-hora"
import { FilaDeDia } from "@/components/panel/fila-de-dia"
import { RangoDeHoras } from "@/components/panel/rango-de-horas"
import { cn } from "@/lib/utils"
import { vocabularioDe } from "@/lib/vocabulario"
import { guardarHorario, type HorarioDelDia } from "../_datos"
import { frasesDeConfiguracion } from "../_frases"
import { DIAS, HORARIO_INICIAL, horarioParaMostrar } from "../_horario"
import { BarraParaGuardarEnElCelular, FilaDeDiaCompacta, HojaDeHorasDelDia, LISTAS_GRANDES } from "./horario-en-el-celular"

interface PropsDeSeccionHorario {
  horariosIniciales: HorarioDelDia[]
  /** De quién es el horario. Sin él, el propio de quien está en sesión. */
  memberId?: string | null
  /**
   * El horario general del negocio, para el horario de una persona del
   * equipo. Quien no tiene horario propio atiende en el del negocio
   * (`lib/agenda-publica.ts`): eso es lo que se le muestra, y no el ejemplo de
   * lunes a viernes, que al guardarlo le borraba los sábados.
   */
  horarioDelNegocio?: HorarioDelDia[]
  titulo?: string
  /** Avisa si hay cambios sin guardar: el selector de personas pregunta antes de descartarlos. */
  alCambiarPendiente?: (pendiente: boolean) => void
  /** Lo que quedó guardado, para que quien lo contiene no vuelva a mostrar lo de antes. */
  alGuardar?: (horarios: HorarioDelDia[]) => void
}

export function SeccionHorario({
  horariosIniciales,
  memberId,
  horarioDelNegocio,
  titulo,
  alCambiarPendiente,
  alGuardar,
}: PropsDeSeccionHorario) {
  const idDelTitulo = useId()
  const { horario: frases } = frasesDeConfiguracion(vocabularioDe(useRubroDelPanel()).palabras)
  const [alAbrir] = useState(() => horarioParaMostrar(horariosIniciales, memberId ? horarioDelNegocio : undefined))
  const [horarios, setHorarios] = useState<HorarioDelDia[]>(alAbrir.semana)
  // Lo último que está en la base, para saber si hay cambios sin guardar.
  const [enLaBase, setEnLaBase] = useState<HorarioDelDia[]>(alAbrir.semana)
  // Sin horario propio, atiende en el del negocio, que es lo que se ve.
  const [usaElDelNegocio, setUsaElDelNegocio] = useState(alAbrir.usaElDelNegocio)
  // Sin nada guardado, lo que se ve es el ejemplo: parece configurado, pero
  // la página pública no ofrece ninguna hora (K1).
  const [nuncaGuardado, setNuncaGuardado] = useState(horariosIniciales.length === 0 && !alAbrir.usaElDelNegocio)
  const negocioSinHorario = usaElDelNegocio && !alAbrir.semana.some((dia) => dia.active)
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [aviso, setAviso] = useState("")
  // Lo que se anuncia al copiar un día a los demás (el botón no cambia de texto).
  const [anuncio, setAnuncio] = useState("")
  // En el celular, el día cuyas horas se están cambiando en la hoja.
  const [diaEnLaHoja, setDiaEnLaHoja] = useState<number | null>(null)

  const pendiente = JSON.stringify(horarios) !== JSON.stringify(enLaBase)
  useEffect(() => {
    alCambiarPendiente?.(pendiente)
  }, [pendiente, alCambiarPendiente])
  // Al irse (otra persona, otra carga), deja de haber cambios sin guardar de
  // esta sección: si no, el selector seguía preguntando por ellos.
  const avisarAlIrse = useRef(alCambiarPendiente)
  useEffect(() => {
    avisarAlIrse.current = alCambiarPendiente
  }, [alCambiarPendiente])
  useEffect(() => () => avisarAlIrse.current?.(false), [])

  const diasMarcados = horarios.filter((horario) => horario.active).length

  const alternarDia = (dia: number) => {
    setHorarios((previos) =>
      previos.map((horario) => (horario.dayOfWeek === dia ? { ...horario, active: !horario.active } : horario))
    )
    setGuardado(false)
  }

  const cambiarHora = (dia: number, campo: "startTime" | "endTime", valor: string) => {
    setHorarios((previos) =>
      previos.map((horario) => (horario.dayOfWeek === dia ? { ...horario, [campo]: valor } : horario))
    )
    setGuardado(false)
  }

  /** El horario de un día, en todos los días marcados. No guarda: queda pendiente, como cualquier cambio. */
  const copiarATodos = (dia: number) => {
    const origen = horarios.find((horario) => horario.dayOfWeek === dia)
    if (!origen) return
    setHorarios((previos) =>
      previos.map((horario) =>
        horario.active ? { ...horario, startTime: origen.startTime, endTime: origen.endTime } : horario
      )
    )
    setGuardado(false)
    setAnuncio(frases.copiado(DIAS[dia], origen.startTime, origen.endTime))
  }

  const guardar = async (semana: HorarioDelDia[] = horarios) => {
    setAviso("")
    setAnuncio("")
    setGuardando(true)
    const resultado = await guardarHorario(memberId ?? null, semana)
    setGuardando(false)

    // Un horario rechazado (por ejemplo, con la hora de fin antes que la de
    // inicio) tiene que decirlo: si no, el botón vuelve a "Guardar" y parece un
    // clic perdido.
    if (!resultado.ok) return setAviso(resultado.error)
    setGuardado(true)
    setNuncaGuardado(false)
    setUsaElDelNegocio(false)
    setEnLaBase(semana)
    alGuardar?.(semana)
  }

  /** El atajo del horario nunca guardado: lunes a viernes de 9 a 18, guardado de una vez. */
  const usarSugerido = () => {
    setHorarios(HORARIO_INICIAL)
    guardar(HORARIO_INICIAL)
  }

  return (
    <section aria-labelledby={idDelTitulo} className={cn(TARJETA_DEL_PANEL, RELLENO_DE_TARJETA)}>
      <EncabezadoDeTarjeta
        id={idDelTitulo}
        nivel={3}
        titulo={titulo ?? "Horario laboral"}
        subtitulo="Define los días y horas de atención"
        icono={{ figura: Clock }}
        accion={
          <BotonPrimario
            tamaño="sm"
            icono={<Save className="h-4 w-4" />}
            cargando={guardando}
            onClick={() => guardar()}
            variante={guardado && !pendiente ? "secundario" : "primario"}
            // Sin nada guardado, el botón se destaca: es lo único que falta para que se reserve.
            // En el celular, con cambios sin guardar, el que se ve es el fijo de abajo.
            className={cn(nuncaGuardado && "ring-2 ring-naranja ring-offset-2", pendiente && "max-lg:hidden")}
          >
            {nuncaGuardado ? "Guardar horario" : guardado && !pendiente ? "Guardado" : "Guardar"}
          </BotonPrimario>
        }
      />
      {/* El botón cambia a "Guardado", pero el lector de pantalla no siempre lo dice: esto sí. */}
      <p role="status" className="sr-only">
        {guardado ? "Horario guardado" : anuncio}
      </p>

      {nuncaGuardado && (
        <Aviso tono="atencion" titulo="Este horario todavía no está guardado" className="mt-5">
          {frases.sinGuardar}
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <BotonPrimario
              type="button"
              tamaño="sm"
              variante="secundario"
              icono={<CalendarCheck className="h-4 w-4" />}
              cargando={guardando}
              onClick={usarSugerido}
            >
              {frases.usarSugerido}
            </BotonPrimario>
            <span className="text-[13px]">{frases.usarSugeridoAyuda}</span>
          </div>
        </Aviso>
      )}
      {usaElDelNegocio && (
        <Aviso tono="info" titulo={frases.usaElDelNegocio} className="mt-5">
          {negocioSinHorario ? frases.negocioSinHorario : frases.atiendeEnElDelNegocio}
        </Aviso>
      )}
      {!nuncaGuardado && pendiente && !guardando && (
        <p className="mt-3 text-sm text-texto-2">Tienes cambios sin guardar.</p>
      )}
      {aviso && <Aviso className="mt-5">{aviso}</Aviso>}

      {/*
        En el celular, cada día en una fila compacta: el día, sus horas en un
        botón que abre la hoja y el interruptor (`horario-en-el-celular.tsx`).
      */}
      <ul className="mt-3 divide-y divide-borde lg:hidden">
        {horarios.map((horario) => {
          const dia = DIAS[horario.dayOfWeek]
          return (
            <FilaDeDiaCompacta
              key={horario.dayOfWeek}
              etiqueta={dia}
              activo={horario.active}
              alAlternar={() => alternarDia(horario.dayOfWeek)}
              resumen={`${horario.startTime} – ${horario.endTime}`}
              resumenParaLeer={`de ${horario.startTime} a ${horario.endTime}`}
              alAbrirLasHoras={() => {
                setAnuncio("")
                setDiaEnLaHoja(horario.dayOfWeek)
              }}
            />
          )
        })}
      </ul>

      {/*
        Desde lg, cada día en una fila: el interruptor con su nombre y las
        horas al lado.
      */}
      <ul className="mt-5 divide-y divide-borde max-lg:hidden">
        {horarios.map((horario) => {
          const dia = DIAS[horario.dayOfWeek]
          return (
            <FilaDeDia key={horario.dayOfWeek} etiqueta={dia} activo={horario.active} alAlternar={() => alternarDia(horario.dayOfWeek)}>
              <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
                <RangoDeHoras
                  etiqueta={dia}
                  desde={horario.startTime}
                  hasta={horario.endTime}
                  alCambiarDesde={(valor) => cambiarHora(horario.dayOfWeek, "startTime", valor)}
                  alCambiarHasta={(valor) => cambiarHora(horario.dayOfWeek, "endTime", valor)}
                />
                {/* Sólo sirve con otro día marcado al que copiarlo. */}
                {diasMarcados > 1 && (
                  <button
                    type="button"
                    onClick={() => copiarATodos(horario.dayOfWeek)}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-boton text-left text-[13px] font-medium text-navy underline-offset-4 hover:underline anillo-foco"
                  >
                    <Copy aria-hidden="true" className="size-4 shrink-0" strokeWidth={2} />
                    {frases.copiarATodos}
                    <span className="sr-only">: {dia}</span>
                  </button>
                )}
              </div>
            </FilaDeDia>
          )
        })}
      </ul>

      <AnimatePresence>
        {diaEnLaHoja !== null && hojaDelDia(diaEnLaHoja)}
      </AnimatePresence>

      <BarraParaGuardarEnElCelular visible={pendiente} guardando={guardando} alGuardar={() => guardar()}>
        Guardar horario
      </BarraParaGuardarEnElCelular>
    </section>
  )

  /** La hoja del celular con las horas de un día (una función y no un componente: así no se vuelve a montar al cambiar una hora). */
  function hojaDelDia(dayOfWeek: number) {
    const horario = horarios.find((otro) => otro.dayOfWeek === dayOfWeek)
    if (!horario) return null
    const dia = DIAS[horario.dayOfWeek]
    return (
      <HojaDeHorasDelDia key="hoja-del-dia" dia={dia} descripcion="Desde qué hora y hasta qué hora atiendes ese día." alCerrar={() => setDiaEnLaHoja(null)}>
        <div className={cn("space-y-4", LISTAS_GRANDES)}>
          <div>
            <p className="mb-1.5 text-sm font-medium text-navy">
              Desde
            </p>
            <CampoHora
              etiqueta={`${dia}: desde`}
              value={horario.startTime}
              onChange={(valor) => cambiarHora(horario.dayOfWeek, "startTime", valor)}
            />
          </div>
          <div>
            <p className="mb-1.5 text-sm font-medium text-navy">Hasta</p>
            <CampoHora
              etiqueta={`${dia}: hasta`}
              value={horario.endTime}
              onChange={(valor) => cambiarHora(horario.dayOfWeek, "endTime", valor)}
            />
          </div>
          {diasMarcados > 1 && (
            <button
              type="button"
              onClick={() => copiarATodos(horario.dayOfWeek)}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-boton text-left text-sm font-medium text-navy underline-offset-4 hover:underline anillo-foco"
            >
              <Copy aria-hidden="true" className="size-4 shrink-0" strokeWidth={2} />
              {frases.copiarATodos}
            </button>
          )}
          {/* El anuncio de la copia, también a la vista: con la hoja abierta no se ven los demás días. */}
          {anuncio && <p className="text-[13px] text-texto-2">{anuncio}</p>}
        </div>
      </HojaDeHorasDelDia>
    )
  }
}
