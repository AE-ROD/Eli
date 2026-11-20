import type { Prisma } from "@prisma/client"
import type { LugarEnElCorreo } from "@/lib/email"
import { direccionDeLaCita, type SedeDelNegocio } from "@/lib/sedes"

/**
 * Dónde queda una hora, para decírselo al cliente en el correo. Si la hora
 * tiene sede (etapa 9, plan Independiente), la sede: el cliente tiene que saber
 * a cuál ir. Si no, la dirección y la comuna del negocio, sin nombre (el correo
 * ya dice el nombre del negocio). Un negocio sin dirección no tiene qué decir,
 * y su correo sale como siempre.
 *
 * Quien manda el correo lee de la cita la sede (`SELECCION_DE_LA_SEDE_DEL_CORREO`)
 * y del negocio su dirección (`SELECCION_DEL_LUGAR_DEL_NEGOCIO`), y deja que
 * esta función decida qué lleva el correo.
 */

/** Lo único que se lee de la sede de una cita para el correo: ni el id, ni el teléfono. */
export const SELECCION_DE_LA_SEDE_DEL_CORREO = {
  nombre: true,
  direccion: true,
  comuna: true,
} satisfies Prisma.SedeSelect

/** Lo único que se lee del negocio para el lugar del correo: lo que ya publica su página. */
export const SELECCION_DEL_LUGAR_DEL_NEGOCIO = {
  address: true,
  comuna: true,
} satisfies Prisma.BusinessSelect

/** La dirección pública del negocio (`Business.address` y `comuna`). */
export interface LugarDelNegocio {
  address?: string | null
  comuna?: string | null
}

/**
 * El lugar que lleva el correo de una hora, o `undefined` si el correo sale
 * como siempre. Con sede, la sede (cuenta aunque se haya desactivado después:
 * la hora ya se dio ahí). Sin sede (una hora de antes de las sedes, de un plan
 * Equipo o de un negocio sin sedes), la dirección del negocio, si tiene calle:
 * la comuna sola no lleva a ningún lado. Los textos salen recortados y sin
 * partes vacías (`direccionDeLaCita`).
 */
export function lugarParaElCorreo(
  sede: Pick<SedeDelNegocio, "nombre" | "direccion" | "comuna"> | null | undefined,
  negocio?: LugarDelNegocio | null
): LugarEnElCorreo | undefined {
  const lugar = direccionDeLaCita({ sede, negocio: negocio ?? {} })
  if (!sede) return lugar.direccion ? { direccion: lugar.direccion, comuna: lugar.comuna } : undefined

  const nombre = lugar.nombre?.trim() || undefined
  if (!nombre && !lugar.direccion && !lugar.comuna) return undefined
  return { nombre, direccion: lugar.direccion, comuna: lugar.comuna }
}
