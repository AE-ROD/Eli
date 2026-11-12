import type { Prisma } from "@prisma/client"
import type { LugarEnElCorreo } from "@/lib/email"
import { direccionDeLaCita, type SedeDelNegocio } from "@/lib/sedes"

/**
 * Dónde queda una hora, para decírselo al cliente en el correo (etapa 9, plan
 * Independiente). Hoy ningún correo dice la dirección; una hora que tiene sede
 * la dice, porque el cliente tiene que saber a cuál ir. Es la misma regla que la
 * gestión de la cita por el enlace y los correos de la reserva pública: si la
 * hora lleva sede, se dice dónde. Un negocio sin sedes (todo negocio de hoy y
 * todo plan Equipo) no tiene horas con sede, así que sus correos no cambian ni
 * una letra.
 *
 * Quien manda el correo lee de la cita la sede (`SELECCION_DE_LA_SEDE_DEL_CORREO`)
 * y deja que esta función decida si el correo lleva el lugar.
 */

/** Lo único que se lee de la sede de una cita para el correo: ni el id, ni el teléfono. */
export const SELECCION_DE_LA_SEDE_DEL_CORREO = {
  nombre: true,
  direccion: true,
  comuna: true,
} satisfies Prisma.SedeSelect

/**
 * El lugar que lleva el correo de una hora, o `undefined` si el correo sale
 * como siempre: la cita no lleva sede (una de antes de que el negocio tuviera
 * sedes, o de un plan Equipo). La sede cuenta aunque se haya desactivado
 * después: la hora ya se dio ahí. Los textos salen recortados y sin partes
 * vacías (`direccionDeLaCita`).
 */
export function lugarParaElCorreo(
  sede: Pick<SedeDelNegocio, "nombre" | "direccion" | "comuna"> | null | undefined
): LugarEnElCorreo | undefined {
  if (!sede) return undefined

  const lugar = direccionDeLaCita({ sede, negocio: {} })
  const nombre = lugar.nombre?.trim() || undefined
  if (!nombre && !lugar.direccion && !lugar.comuna) return undefined
  return { nombre, direccion: lugar.direccion, comuna: lugar.comuna }
}
