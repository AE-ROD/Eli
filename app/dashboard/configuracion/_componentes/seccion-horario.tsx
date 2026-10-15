"use client"

import { useId, useState } from "react"
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

interface SeccionHorarioProps {
  horariosIniciales: HorarioDelDia[]
  /** De quién es el horario. Sin él, el propio de quien está en sesión. */
  memberId?: string | null
  titulo?: string
}

/**
 * Los siete días, aunque la base tenga guardados sólo algunos: los que faltan
 * se muestran como no laborables. Sin nada guardado, el horario de ejemplo.
 */
function semanaCompleta(guardados: HorarioDelDia[]): HorarioDelDia[] {
  if (guardados.length === 0) return HORARIO_INICIAL
  return DIAS.map((_, i) => {
    const existente = guardados.find((horario) => horario.dayOfWeek === i)
    return existente ?? { dayOfWeek: i, startTime: "09:00", endTime: "18:00", active: false }
  })
}

export function SeccionHorario({ horariosIniciales, memberId, titulo }: SeccionHorarioProps) {
  const idDelTitulo = useId()
  const [horarios, setHorarios] = useState<HorarioDelDia[]>(() => semanaCompleta(horariosIniciales))
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [aviso, setAviso] = useState("")

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
    if (resultado.ok) setGuardado(true)
    else setAviso(resultado.error)
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
            variante={guardado ? "secundario" : "primario"}
          >
            {guardado ? "Guardado" : "Guardar"}
          </BotonPrimario>
        }
      />
      {/* El botón cambia a "Guardado", pero el lector de pantalla no siempre lo dice: esto sí. */}
      <p role="status" className="sr-only">
        {guardado ? "Horario guardado" : ""}
      </p>

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
