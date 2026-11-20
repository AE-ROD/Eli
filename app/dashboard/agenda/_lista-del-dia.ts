/**
 * La vista Día del celular como lista (fase 2 del rediseño del celular): las
 * citas y los bloqueos del día en orden, y entre ellos los huecos libres dentro
 * del horario de atención, para agendar ahí mismo. Cálculo puro sobre minutos
 * desde la medianoche en la hora del negocio, como el resto de la agenda (#99).
 *
 * Un hueco es tiempo de atención sin nada agendado: ni una cita que ocupe el
 * horario (las canceladas y las de "No vino" lo dejan libre, `ocupaElHorario`)
 * ni un bloqueo de todo el negocio. El bloqueo de un solo profesional no tapa
 * el hueco: los demás siguen atendiendo. Los huecos de menos de
 * `MINUTOS_LIBRES_MINIMOS` no se ofrecen.
 */

import { fusionarFranjas, type FranjaDelDia } from "@/lib/horario-de-atencion"
import { ocupaElHorario } from "@/lib/ocupacion"
import { tramoDeCita, tramoEnElDia, tramosDeFranjas, type TramoEnMinutos } from "./_disposicion"
import { caeEnElDia } from "./_hora-del-negocio"

/** Lo mínimo para que un hueco se ofrezca: menos no alcanza para una atención. */
export const MINUTOS_LIBRES_MINIMOS = 15

export type ElementoDelDia<C, B> =
  | ({ tipo: "cita"; cita: C } & TramoEnMinutos)
  | ({ tipo: "bloqueo"; bloqueo: B } & TramoEnMinutos)
  | ({ tipo: "libre" } & TramoEnMinutos)

interface CitaDelDia {
  startTime: string
  endTime: string
  status: string
}

interface BloqueoDelDia {
  startTime: string
  endTime: string
  memberId: string | null
}

interface DatosDelDia<C extends CitaDelDia, B extends BloqueoDelDia> {
  fecha: Date
  zona: string
  citas: C[]
  bloqueos: B[]
  /** El horario de atención de toda la semana: se usa el del día de `fecha`. */
  horario: FranjaDelDia[]
  /**
   * El minuto del día desde el que se ofrecen huecos (el de ahora, si `fecha`
   * es hoy): un hueco que ya pasó no se ofrece y uno que está corriendo se
   * recorta. Sin él, todo el día.
   */
  desdeMin?: number
}

/** [inicio, fin) menos los tramos ocupados: los pedazos que quedan, en orden. */
function restar(tramo: TramoEnMinutos, ocupados: TramoEnMinutos[]): TramoEnMinutos[] {
  let pedazos = [tramo]
  for (const ocupado of ocupados) {
    pedazos = pedazos.flatMap((pedazo) => {
      if (ocupado.finMin <= pedazo.inicioMin || ocupado.inicioMin >= pedazo.finMin) return [pedazo]
      return [
        { inicioMin: pedazo.inicioMin, finMin: ocupado.inicioMin },
        { inicioMin: ocupado.finMin, finMin: pedazo.finMin },
      ].filter((resto) => resto.finMin > resto.inicioMin)
    })
  }
  return pedazos
}

/** El orden de lo que empieza a la misma hora: el bloqueo, la cita, el hueco. */
const ORDEN = { bloqueo: 0, cita: 1, libre: 2 } as const

export function elementosDelDia<C extends CitaDelDia, B extends BloqueoDelDia>({
  fecha,
  zona,
  citas,
  bloqueos,
  horario,
  desdeMin = 0,
}: DatosDelDia<C, B>): ElementoDelDia<C, B>[] {
  const deCitas = citas
    .filter((cita) => caeEnElDia(cita.startTime, fecha, zona))
    .map((cita) => ({ tipo: "cita" as const, cita, ...tramoDeCita(cita, zona) }))
  const deBloqueos = bloqueos.flatMap((bloqueo) => {
    const tramo = tramoEnElDia(bloqueo, fecha, zona)
    return tramo ? [{ tipo: "bloqueo" as const, bloqueo, ...tramo }] : []
  })

  const ocupados = [
    ...deCitas.filter(({ cita }) => ocupaElHorario(cita.status)),
    ...deBloqueos.filter(({ bloqueo }) => bloqueo.memberId === null),
  ]
  const franjas = tramosDeFranjas(fusionarFranjas(horario.filter((franja) => franja.dayOfWeek === fecha.getDay())))
  const libres = franjas
    .flatMap((franja) => restar({ inicioMin: Math.max(franja.inicioMin, desdeMin), finMin: franja.finMin }, ocupados))
    .filter((hueco) => hueco.finMin - hueco.inicioMin >= MINUTOS_LIBRES_MINIMOS)
    .map((hueco) => ({ tipo: "libre" as const, ...hueco }))

  return [...deBloqueos, ...deCitas, ...libres].sort(
    (a, b) => a.inicioMin - b.inicioMin || ORDEN[a.tipo] - ORDEN[b.tipo]
  )
}

/**
 * La hora con que "+ Agendar" abre la cita nueva en un hueco: empieza al
 * comienzo del hueco y dura una hora, o lo que quede del hueco si es menos.
 * Con servicios elegidos, el modal recalcula el fin.
 */
export function horasParaAgendarEn(hueco: TramoEnMinutos): { inicioMin: number; finMin: number } {
  return { inicioMin: hueco.inicioMin, finMin: Math.min(hueco.inicioMin + 60, hueco.finMin) }
}
