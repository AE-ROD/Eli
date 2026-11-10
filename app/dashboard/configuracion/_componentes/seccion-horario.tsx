"use client"

import { useEffect, useId, useRef, useState } from "react"
import { Clock, Save } from "lucide-react"
import { BotonPrimario } from "@/components/comunes/boton-primario"
import { Interruptor } from "@/components/comunes/interruptor"
import { Aviso } from "@/components/panel/aviso"
import { CampoHora } from "@/components/panel/campo-hora"
import { useRubroDelPanel } from "@/components/panel/contexto-rubro"
import { EncabezadoDeTarjeta } from "@/components/panel/encabezado-de-tarjeta"
import { TARJETA_DEL_PANEL } from "@/components/panel/estilos"
import { cn } from "@/lib/utils"
import { vocabularioDe } from "@/lib/vocabulario"
import { guardarHorario, type HorarioDelDia } from "../_datos"
import { DIAS, horarioParaMostrar } from "../_horario"

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
  const { clientes } = vocabularioDe(useRubroDelPanel())
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

  const guardar = async () => {
    setAviso("")
    setGuardando(true)
    const resultado = await guardarHorario(memberId ?? null, horarios)
    setGuardando(false)

    // Un horario rechazado (por ejemplo, con la hora de fin antes que la de
    // inicio) tiene que decirlo: si no, el botón vuelve a "Guardar" y parece un
    // clic perdido.
    if (!resultado.ok) return setAviso(resultado.error)
    setGuardado(true)
    setNuncaGuardado(false)
    setUsaElDelNegocio(false)
    setEnLaBase(horarios)
    alGuardar?.(horarios)
  }

  return (
    <section aria-labelledby={idDelTitulo} className={cn(TARJETA_DEL_PANEL, "p-5 sm:p-6")}>
      <EncabezadoDeTarjeta
        id={idDelTitulo}
        titulo={titulo ?? "Horario laboral"}
        subtitulo="Define los días y horas de atención"
        icono={{ figura: Clock }}
        accion={
          <BotonPrimario
            tamaño="sm"
            icono={<Save className="h-4 w-4" />}
            cargando={guardando}
            onClick={guardar}
            variante={guardado && !pendiente ? "secundario" : "primario"}
            // Sin nada guardado, el botón se destaca: es lo único que falta para que se reserve.
            className={cn(nuncaGuardado && "ring-2 ring-naranja ring-offset-2")}
          >
            {nuncaGuardado ? "Guardar horario" : guardado && !pendiente ? "Guardado" : "Guardar"}
          </BotonPrimario>
        }
      />
      {/* El botón cambia a "Guardado", pero el lector de pantalla no siempre lo dice: esto sí. */}
      <p role="status" className="sr-only">
        {guardado ? "Horario guardado" : ""}
      </p>

      {nuncaGuardado && (
        <Aviso tono="atencion" titulo="Este horario todavía no está guardado" className="mt-5">
          Tus {clientes} no ven horas hasta que lo guardes. Revisa los días y las horas, y toca &ldquo;Guardar horario&rdquo;.
        </Aviso>
      )}
      {usaElDelNegocio && (
        <Aviso tono="info" titulo="Usa el horario del negocio" className="mt-5">
          {negocioSinHorario
            ? "No tiene horario propio y el negocio todavía no guardó el suyo, así que no ofrece horas. Marca sus días y guarda para darle un horario propio."
            : "No tiene horario propio: atiende en el del negocio, que es el que ves. Si lo cambias y guardas, pasa a tener el suyo."}
        </Aviso>
      )}
      {!nuncaGuardado && pendiente && !guardando && (
        <p className="mt-3 text-sm text-texto-2">Tienes cambios sin guardar.</p>
      )}
      {aviso && <Aviso className="mt-5">{aviso}</Aviso>}

      {/*
        Desde sm, cada día en una fila: el interruptor con su nombre y las
        horas al lado. En el teléfono las horas bajan debajo del día: en una
        sola fila no entraban y la página se ensanchaba a 478 px.
      */}
      <ul className="mt-5 divide-y divide-borde">
        {horarios.map((horario) => {
          const dia = DIAS[horario.dayOfWeek]
          return (
            <li key={horario.dayOfWeek} className="flex flex-wrap items-center gap-x-6 gap-y-2.5 py-3.5 first:pt-0 last:pb-0">
              <div className="w-full sm:w-40">
                <Interruptor etiqueta={dia} activo={horario.active} alCambiar={() => alternarDia(horario.dayOfWeek)} />
              </div>

              {horario.active ? (
                <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto sm:flex-1">
                  <CampoHora
                    etiqueta={`${dia}: desde`}
                    value={horario.startTime}
                    onChange={(valor) => cambiarHora(horario.dayOfWeek, "startTime", valor)}
                    className="min-w-0 flex-1 sm:w-40 sm:flex-none"
                  />
                  <span className="shrink-0 text-sm text-texto-2">hasta</span>
                  <CampoHora
                    etiqueta={`${dia}: hasta`}
                    value={horario.endTime}
                    onChange={(valor) => cambiarHora(horario.dayOfWeek, "endTime", valor)}
                    className="min-w-0 flex-1 sm:w-40 sm:flex-none"
                  />
                </div>
              ) : (
                <p className="text-sm text-texto-2">No disponible</p>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
