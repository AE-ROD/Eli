/**
 * Reglas puras de la pantalla del enlace al reagendar con otro profesional:
 * quién queda marcado al abrir, qué le pide la pantalla al servidor, qué días
 * ofrece el calendario con cada elección y cuándo no hay nada que cambiar. El
 * servidor revalida todo (`lib/gestion-de-cita.ts`): esto es para que la
 * pantalla no lleve a un callejón sin salida.
 *
 * Lo que se marca en el selector es un `string | null`, igual que en la reserva
 * (`SelectorProfesional`): un id, o `null` para "cualquiera". Un tercer valor,
 * `NADIE_MARCADO`, es el de quien atiende la cita hoy y ya no se puede elegir.
 */

import type { EleccionDeProfesional } from "@/lib/gestion-de-cita"
import type { ProfesionalParaCambiar } from "../_datos"

/**
 * Lo marcado cuando quien atiende la cita hoy ya no es una opción de la lista
 * (dejó de hacer el servicio, o de atender en la sede): no es el id de nadie, así
 * que ningún botón sale marcado y hay que elegir con quién antes de ver horas.
 */
export const NADIE_MARCADO = "nadie-marcado"

/**
 * Lo marcado al abrir el panel de cambiar. Quien atiende la cita hoy, si es de
 * la lista (el servidor lo marca `actual`); "cualquiera" si la cita no tiene a
 * nadie asignado; y `NADIE_MARCADO` si tiene a alguien que ya no se puede elegir.
 */
export function profesionalMarcadoAlAbrir(
  cita: { profesional: string | null },
  profesionales: readonly ProfesionalParaCambiar[]
): string | null {
  const actual = profesionales.find((profesional) => profesional.actual === true)
  if (actual) return actual.id
  return cita.profesional ? NADIE_MARCADO : null
}

/**
 * Lo que se le pide al servidor según lo marcado. Volver a marcar lo que había
 * al abrir es "el mismo": no se manda nada y el pedido es el de siempre.
 */
export function eleccionDelPedido(marcadoAlAbrir: string | null, marcado: string | null): EleccionDeProfesional {
  if (marcado === marcadoAlAbrir) return { tipo: "mismo" }
  if (marcado === null) return { tipo: "cualquiera" }
  return { tipo: "uno", id: marcado }
}

/**
 * Los días de la semana que ofrece el calendario con esa elección. Con "el
 * mismo", los de la cita (`diasDeLaCita`; si el servidor no los dijo, todos: la
 * disponibilidad lo explica). Con una persona, los suyos en la sede de la cita;
 * con "cualquiera", los de todas las que se pueden elegir. Si no se sabe ninguno,
 * todos: el servidor es el que dice "No hay atención ese día".
 */
export function diasDeLaEleccion(
  diasDeLaCita: readonly number[] | null,
  profesionales: readonly Pick<ProfesionalParaCambiar, "id" | "diasConAtencion">[],
  eleccion: EleccionDeProfesional
): number[] {
  const TODOS = [0, 1, 2, 3, 4, 5, 6]
  let dias: readonly number[] | null
  if (eleccion.tipo === "mismo") dias = diasDeLaCita
  else if (eleccion.tipo === "uno") dias = profesionales.find((profesional) => profesional.id === eleccion.id)?.diasConAtencion ?? null
  else dias = [...new Set(profesionales.flatMap((profesional) => profesional.diasConAtencion))].sort((a, b) => a - b)
  return dias && dias.length > 0 ? [...dias] : TODOS
}

/**
 * El nombre de con quién quedaría la cita con lo marcado, para decirlo en la
 * pantalla ("Mismo servicio, con Carla."): `null` si es "cualquiera" o nadie.
 */
export function nombreDeLoMarcado(
  nombreDeLaCita: string | null,
  profesionales: readonly Pick<ProfesionalParaCambiar, "id" | "nombre">[],
  marcadoAlAbrir: string | null,
  marcado: string | null
): string | null {
  if (marcado === marcadoAlAbrir) return nombreDeLaCita
  if (marcado === null) return null
  return profesionales.find((profesional) => profesional.id === marcado)?.nombre ?? null
}

/**
 * Lo que pasa al marcar a alguien en "¿Con quién?": si es lo que ya estaba no
 * pasa nada (`cambia` en false); si es otra persona, el día y la hora elegidos se
 * sueltan (otro profesional es otra agenda) y se avisa (`avisa`) sólo si había
 * algo que soltar. Es lo mismo que hace la reserva al cambiar de sede.
 */
export function alElegirProfesional(
  marcado: string | null,
  nuevo: string | null,
  elegido: { fecha: string; hora: string }
): { cambia: boolean; avisa: boolean } {
  if (nuevo === marcado) return { cambia: false, avisa: false }
  return { cambia: true, avisa: elegido.fecha !== "" || elegido.hora !== "" }
}

/**
 * Si lo elegido es lo que la cita ya tiene: el mismo día y la misma hora con la
 * misma persona. No hay nada que cambiar y el botón no se ofrece. Con otra
 * persona (o con "cualquiera", que puede asignar a otra) sí hay algo que cambiar,
 * aunque el día y la hora sean los mismos.
 */
export function noHayNadaQueCambiar(
  cita: { fecha: string; hora: string },
  elegido: { fecha: string; hora: string },
  eleccion: EleccionDeProfesional
): boolean {
  return eleccion.tipo === "mismo" && elegido.fecha === cita.fecha && elegido.hora === cita.hora
}

/**
 * Con quién quedó, para decirlo al confirmar: el nombre que devolvió el servidor,
 * sólo si la persona cambió o se pidió "cualquiera" (que puede asignar a otra).
 * Si no se cambió nada de eso, el resumen ya lo dice y la frase es la de siempre.
 */
export function conQuienQuedo(eleccion: EleccionDeProfesional, nombreQueDevolvio: string | null): string | null {
  return eleccion.tipo === "mismo" ? null : nombreQueDevolvio
}
