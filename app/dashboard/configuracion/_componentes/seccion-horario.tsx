"use client"

import { useEffect, useId, useState } from "react"
import { Clock, Save } from "lucide-react"
import { BotonPrimario } from "@/components/comunes/boton-primario"
import { Interruptor } from "@/components/comunes/interruptor"
import { Aviso } from "@/components/panel/aviso"
import { EncabezadoDeTarjeta } from "@/components/panel/encabezado-de-tarjeta"
import { CAMPO, TARJETA_DEL_PANEL } from "@/components/panel/estilos"
import { cn } from "@/lib/utils"
import { guardarHorario, type HorarioDelDia } from "../_datos"

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"]

const HORARIO_INICIAL: HorarioDelDia[] = DIAS.map((_, i) => ({
  dayOfWeek: i,
  startTime: "09:00",
  endTime: "18:00",
  active: i >= 1 && i <= 5, // Lun-Vie activos por defecto
}))

interface PropsDeSeccionHorario {
  horariosIniciales: HorarioDelDia[]
  /** De quién es el horario. Sin él, el propio de quien está en sesión. */
  memberId?: string | null
  titulo?: string
  /** Avisa si hay cambios sin guardar: el selector de personas pregunta antes de descartarlos. */
  alCambiarPendiente?: (pendiente: boolean) => void
  /** Lo que quedó guardado, para que quien lo contiene no vuelva a mostrar lo de antes. */
  alGuardar?: (horarios: HorarioDelDia[]) => void
}

/**
 * Los siete días, aunque la base tenga guardados sólo algunos: los que faltan
 * se muestran como no laborables. Sin nada guardado, el horario de ejemplo
 * (lunes a viernes de 9 a 18), que es sólo una propuesta: la página pública
 * no ofrece horas hasta que se guarda, y la sección lo dice.
 */
function semanaCompleta(guardados: HorarioDelDia[]): HorarioDelDia[] {
  if (guardados.length === 0) return HORARIO_INICIAL
  return DIAS.map((_, i) => {
    const existente = guardados.find((horario) => horario.dayOfWeek === i)
    return existente ?? { dayOfWeek: i, startTime: "09:00", endTime: "18:00", active: false }
  })
}

export function SeccionHorario({
  horariosIniciales,
  memberId,
  titulo,
  alCambiarPendiente,
  alGuardar,
}: PropsDeSeccionHorario) {
  const idDelTitulo = useId()
  const [horarios, setHorarios] = useState<HorarioDelDia[]>(() => semanaCompleta(horariosIniciales))
  // Lo último que está en la base, para saber si hay cambios sin guardar.
  const [enLaBase, setEnLaBase] = useState<HorarioDelDia[]>(() => semanaCompleta(horariosIniciales))
  // Sin nada guardado, lo que se ve es el ejemplo: parece configurado, pero
  // la página pública no ofrece ninguna hora (K1).
  const [nuncaGuardado, setNuncaGuardado] = useState(horariosIniciales.length === 0)
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [aviso, setAviso] = useState("")

  const pendiente = JSON.stringify(horarios) !== JSON.stringify(enLaBase)
  useEffect(() => {
    alCambiarPendiente?.(pendiente)
  }, [pendiente, alCambiarPendiente])

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
          Tus clientes no ven horas hasta que lo guardes. Revisa los días y las horas, y toca &ldquo;Guardar horario&rdquo;.
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
                  <input
                    type="time"
                    aria-label={`${dia}: desde`}
                    value={horario.startTime}
                    onChange={(e) => cambiarHora(horario.dayOfWeek, "startTime", e.target.value)}
                    className={cn(CAMPO, "w-auto min-w-0 flex-1 tabular-nums sm:w-32 sm:flex-none")}
                  />
                  <span className="shrink-0 text-sm text-texto-2">hasta</span>
                  <input
                    type="time"
                    aria-label={`${dia}: hasta`}
                    value={horario.endTime}
                    onChange={(e) => cambiarHora(horario.dayOfWeek, "endTime", e.target.value)}
                    className={cn(CAMPO, "w-auto min-w-0 flex-1 tabular-nums sm:w-32 sm:flex-none")}
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
