"use client"

import { Ban, Plus } from "lucide-react"
import { useRubroDelPanel } from "@/components/panel/contexto-rubro"
import { EstadoVacio } from "@/components/panel/estado-vacio"
import type { FranjaDelDia } from "@/lib/horario-de-atencion"
import { horaAMinutos, minutosAHora } from "@/lib/horario-dia"
import { cn } from "@/lib/utils"
import { vocabularioDe } from "@/lib/vocabulario"
import { aQuienBloquea, citaPorConfirmar, destacaSinProfesional, nombreDeCliente, type Bloqueo, type Cita } from "../_datos"
import { frasesDeLaAgenda } from "../_frases"
import { esHoyEn, horaEn } from "../_hora-del-negocio"
import { elementosDelDia } from "../_lista-del-dia"
import { sedeParaMostrar } from "../_sedes"
import { estiloDeEstado } from "./estados-de-cita"
import { useAhora } from "./usar-ahora"
import { useSedesDeLaAgenda } from "./sedes-de-la-agenda"
import { useZonaDelNegocio } from "./zona-del-negocio"

interface PropsDeListaDelDia {
  fecha: Date
  citas: Cita[]
  horario: FranjaDelDia[]
  bloqueos: Bloqueo[]
  onSeleccionar: (cita: Cita) => void
  onSeleccionarBloqueo: (bloqueo: Bloqueo) => void
  /** "+ Agendar" en un hueco: abre la cita nueva ese día, de `inicio` a `fin` ("HH:MM"). */
  onAgendarEn: (inicio: string, fin: string) => void
  destacarSinProfesional?: boolean
  /** Mientras carga, un día sin nada no dice "Sin horas": todavía no se sabe. */
  cargando?: boolean
}

/** La columna de la hora: inicio arriba y fin abajo, en chico. */
function Horas({ inicio, fin }: { inicio: string; fin: string }) {
  return (
    <span className="w-12 shrink-0 text-[13px] leading-tight font-semibold tabular-nums">
      {inicio}
      <span className="sr-only"> a </span>
      <span className="block font-normal text-texto-2">{fin}</span>
    </span>
  )
}

/**
 * La vista Día del celular: una lista con las citas y los bloqueos del día en
 * orden y, entre ellos, los huecos libres del horario de atención como filas
 * punteadas que agendan ahí mismo (`_lista-del-dia.ts`). Cada cita es una
 * tarjeta compacta con un borde del color de su estado, que además va dicho en
 * palabras. En el computador la vista Día sigue siendo la de siempre
 * (`VistaDia`).
 */
export function ListaDelDia({
  fecha,
  citas,
  horario,
  bloqueos,
  onSeleccionar,
  onSeleccionarBloqueo,
  onAgendarEn,
  destacarSinProfesional = false,
  cargando = false,
}: PropsDeListaDelDia) {
  const zona = useZonaDelNegocio()
  const { modo: modoDeSedes } = useSedesDeLaAgenda()
  const { palabras } = vocabularioDe(useRubroDelPanel())
  const frases = frasesDeLaAgenda(palabras)
  const ahora = useAhora(fecha.toDateString())
  // Hoy, los huecos se ofrecen desde ahora (redondeado a los 5 minutos siguientes).
  const desdeMin = esHoyEn(fecha, zona, new Date(ahora))
    ? Math.ceil(horaAMinutos(horaEn(new Date(ahora).toISOString(), zona)) / 5) * 5
    : 0
  const elementos = elementosDelDia({ fecha, zona, citas, bloqueos, horario, desdeMin })

  if (elementos.length === 0) {
    return (
      <div className="px-3 pt-1 pb-4">
        <EstadoVacio>{cargando ? "Cargando..." : `${frases.sinCitas.charAt(0).toUpperCase()}${frases.sinCitas.slice(1)} este día`}</EstadoVacio>
      </div>
    )
  }

  return (
    <ol className="space-y-2 px-3 pt-1 pb-4">
      {elementos.map((elemento) => {
        if (elemento.tipo === "libre") {
          const inicio = minutosAHora(elemento.inicioMin)
          const fin = minutosAHora(elemento.finMin)
          return (
            <li key={`libre-${elemento.inicioMin}`}>
              <button
                type="button"
                onClick={() => onAgendarEn(inicio, minutosAHora(Math.min(elemento.inicioMin + 60, elemento.finMin)))}
                aria-label={`Libre de ${inicio} a ${fin}. Agendar a las ${inicio}`}
                className="flex min-h-11 w-full items-center justify-between gap-3 rounded-[14px] border-[1.5px] border-dashed border-borde px-3 py-2 text-left text-[13px] text-texto-2 squircle anillo-foco transition-colors duration-150 ease-suave hover:bg-superficie"
              >
                <span className="tabular-nums">
                  {inicio} – {fin} · Libre
                </span>
                <span className="flex shrink-0 items-center gap-1 font-medium text-navy">
                  <Plus className="size-4" aria-hidden="true" strokeWidth={2} />
                  Agendar
                </span>
              </button>
            </li>
          )
        }

        if (elemento.tipo === "bloqueo") {
          const { bloqueo } = elemento
          return (
            <li key={`bloqueo-${bloqueo.id}`}>
              <button
                type="button"
                onClick={() => onSeleccionarBloqueo(bloqueo)}
                className="flex min-h-14 w-full items-center gap-3 rounded-[14px] border-l-4 border-l-texto-2/40 bg-superficie px-3 py-2.5 text-left text-navy squircle anillo-foco"
              >
                <Horas inicio={horaEn(bloqueo.startTime, zona)} fin={horaEn(bloqueo.endTime, zona)} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-[15px] font-medium">
                    <Ban className="size-4 shrink-0 text-texto-2" aria-hidden="true" strokeWidth={1.75} />
                    <span className="truncate">{bloqueo.motivo || "Bloqueado"}</span>
                  </span>
                  <span className="block truncate text-[13px] text-texto-2">
                    Horario bloqueado · {aQuienBloquea(bloqueo, palabras)}
                  </span>
                </span>
              </button>
            </li>
          )
        }

        const { cita } = elemento
        const estado = estiloDeEstado(cita.status, citaPorConfirmar(cita), palabras)
        const profesional = cita.member?.user?.name
        const sinProfesional = destacaSinProfesional(cita, destacarSinProfesional)
        const sede = sedeParaMostrar(cita, modoDeSedes)
        const detalle = [
          cita.title,
          profesional ?? (sinProfesional ? frases.profesional.sin : null),
          sede,
          estado.texto,
        ].filter(Boolean)
        return (
          <li key={`cita-${cita.id}`}>
            <button
              type="button"
              onClick={() => onSeleccionar(cita)}
              className={cn(
                // El color del estado en el borde de la izquierda (el de la semana), sobre blanco.
                estado.bloque,
                "flex min-h-14 w-full items-center gap-3 rounded-[14px] border-l-4 bg-tarjeta px-3 py-2.5 text-left shadow-sm squircle anillo-foco",
                sinProfesional && "outline-2 -outline-offset-2 outline-dashed outline-naranja"
              )}
            >
              <Horas inicio={horaEn(cita.startTime, zona)} fin={horaEn(cita.endTime, zona)} />
              <span className="min-w-0 flex-1 contain-inline-size">
                <span
                  className={cn(
                    "block truncate text-[15px] font-medium",
                    cita.status === "cancelada" && "line-through"
                  )}
                >
                  {nombreDeCliente(cita, palabras.cliente.singular)}
                </span>
                <span className="block truncate text-[13px] text-texto-2">{detalle.join(" · ")}</span>
              </span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}
