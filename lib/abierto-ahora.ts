/**
 * "Abierto ahora · cierra a las 20:00" o "Cerrado · abre mañana a las 10:00"
 * en la página pública del negocio. Puro: entra el horario semanal ya
 * resuelto (`horarioSemanalDeAtencion`, `lib/horario-de-atencion.ts`), el
 * instante y la zona del negocio; sale el estado.
 *
 * Todo se cuenta en el reloj del negocio (`Business.timezone`), no en el del
 * servidor ni en el de quien mira: un cliente que abre la página desde otro
 * huso ve si el local está abierto allá.
 *
 * Cruce de medianoche: el modelo no guarda franjas que crucen la medianoche
 * (`franjaValida` descarta 22:00–02:00). Quien atiende de noche lo carga como
 * dos franjas, una hasta las 23:59 y otra desde las 00:00 del día siguiente:
 * acá esas dos se leen como una sola, así a las 23:30 dice "cierra a las
 * 02:00" y no "cierra a las 23:59".
 */

import { franjaValida, horaAMinutos, minutosAHora } from "@/lib/horario-dia"
import type { FranjaDelDia } from "@/lib/horario-de-atencion"
import { diaDeLaSemana, fechaYMinutosEn } from "@/lib/zona-horaria"

/** Los días como se escriben en "abre el lunes". 0 es domingo, como `WorkSchedule.dayOfWeek`. */
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"] as const

const MINUTOS_DEL_DIA = 24 * 60
/** "23:59" es el final del día: la última hora que se puede cargar. */
const ULTIMO_MINUTO = MINUTOS_DEL_DIA - 1

export type EstadoDeAtencion =
  | { abierto: true; cierraA: string }
  /** `abre` en null: tiene horario cargado, pero ninguna franja válida en la semana. */
  | { abierto: false; abre: { enDias: number; dayOfWeek: number; hora: string } | null }

interface Tramo {
  inicio: number
  fin: number
}

function tramosDelDia(franjas: FranjaDelDia[], dayOfWeek: number): Tramo[] {
  return franjas
    .filter((franja) => franja.dayOfWeek === dayOfWeek && franjaValida(franja))
    .map((franja) => {
      const fin = horaAMinutos(franja.endTime)
      // Hasta las 23:59 es hasta el final del día: así sigue abierto en ese minuto.
      return { inicio: horaAMinutos(franja.startTime), fin: fin === ULTIMO_MINUTO ? MINUTOS_DEL_DIA : fin }
    })
    .sort((a, b) => a.inicio - b.inicio)
}

/**
 * Si el negocio está abierto en ese instante y, si no, cuándo abre. `null`
 * si no tiene ningún horario: la página no muestra estado antes que inventar
 * uno.
 */
export function estadoDeAtencion(franjas: FranjaDelDia[], ahora: Date, zona: string): EstadoDeAtencion | null {
  if (franjas.length === 0) return null

  const { fecha, minutos } = fechaYMinutosEn(ahora, zona)
  const hoy = diaDeLaSemana(fecha)
  const diaMas = (dias: number) => (hoy + dias) % 7

  const actual = tramosDelDia(franjas, hoy).find((tramo) => tramo.inicio <= minutos && minutos < tramo.fin)
  if (actual) {
    // Sigue de largo mientras termine al final del día y el siguiente abra a las 00:00.
    let cierre = actual.fin
    for (let dias = 1; cierre === MINUTOS_DEL_DIA && dias <= 7; dias++) {
      const continuacion = tramosDelDia(franjas, diaMas(dias)).find((tramo) => tramo.inicio === 0)
      if (!continuacion) break
      cierre = continuacion.fin
    }
    return { abierto: true, cierraA: minutosAHora(cierre === MINUTOS_DEL_DIA ? ULTIMO_MINUTO : cierre) }
  }

  // Hoy más tarde, o algún día de la semana que viene (hasta el mismo día, en 7).
  for (let dias = 0; dias <= 7; dias++) {
    const proximo = tramosDelDia(franjas, diaMas(dias)).find((tramo) => dias > 0 || tramo.inicio > minutos)
    if (proximo) return { abierto: false, abre: { enDias: dias, dayOfWeek: diaMas(dias), hora: minutosAHora(proximo.inicio) } }
  }
  return { abierto: false, abre: null }
}

/** El estado en palabras, como se lee en la cabecera. */
export function textoDeEstado(estado: EstadoDeAtencion): string {
  if (estado.abierto) return `Abierto ahora · cierra a las ${estado.cierraA}`
  if (!estado.abre) return "Cerrado"
  const { enDias, dayOfWeek, hora } = estado.abre
  const cuando = enDias === 0 ? "hoy" : enDias === 1 ? "mañana" : `el ${DIAS[dayOfWeek]}`
  return `Cerrado · abre ${cuando} a las ${hora}`
}
