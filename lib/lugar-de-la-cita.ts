import type { Prisma } from "@prisma/client"
import type { LugarEnElCorreo } from "@/lib/email"
import { MAX_SEDES, direccionDeLaCita, modoDeSedes, type SedeDelNegocio } from "@/lib/sedes"

/**
 * Dónde queda una hora, para decírselo al cliente en el correo (etapa 9, plan
 * Independiente). Hoy ningún correo dice la dirección; con varias sedes hace
 * falta, porque el cliente tiene que saber a cuál ir. Con una sola sede o
 * ninguna (todo negocio de hoy y todo plan Equipo) los correos no cambian ni
 * una letra: por eso se pregunta por el modo del negocio, no sólo por si la
 * cita tiene sede (con una sola sede activa toda cita nueva lleva la suya, y
 * ese negocio se comporta como siempre).
 *
 * Quien manda el correo lee de la cita la sede (`SELECCION_DE_LA_SEDE_DEL_CORREO`)
 * y del negocio su plan y sus sedes activas (`SELECCION_DE_LAS_SEDES_ACTIVAS`),
 * y deja que esta función decida si el correo lleva el lugar.
 */

/** Lo único que se lee de la sede de una cita para el correo: ni el id, ni el teléfono. */
export const SELECCION_DE_LA_SEDE_DEL_CORREO = {
  nombre: true,
  direccion: true,
  comuna: true,
} satisfies Prisma.SedeSelect

/**
 * Del negocio, para saber el modo: las sedes activas (sólo si lo están; con
 * tope: la base no deja más de `MAX_SEDES`). Va junto a `plan: true`.
 */
export const SELECCION_DE_LAS_SEDES_ACTIVAS = {
  where: { activo: true },
  select: { activo: true },
  take: MAX_SEDES + 1,
} satisfies Prisma.Business$sedesArgs

/**
 * El lugar que lleva el correo de una hora, o `undefined` si el correo sale
 * como siempre: el negocio no está en modo "varias" (`modoDeSedes`; un plan
 * desconocido o ausente es "una"), o la cita no lleva sede (una de antes de
 * que el negocio tuviera sedes). La sede cuenta aunque se haya desactivado
 * después: la hora ya se dio ahí. Los textos salen recortados y sin partes
 * vacías (`direccionDeLaCita`).
 */
export function lugarParaElCorreo(datos: {
  /** `Business.plan` del negocio de la cita. */
  plan: string | null | undefined
  /** Las sedes activas del negocio (alcanza con su `activo`). */
  sedesActivas: readonly Pick<SedeDelNegocio, "activo">[] | null | undefined
  /** La sede de la cita; `null` si no tiene. */
  sede: Pick<SedeDelNegocio, "nombre" | "direccion" | "comuna"> | null | undefined
}): LugarEnElCorreo | undefined {
  const { plan, sedesActivas, sede } = datos
  if (!sede) return undefined
  if (modoDeSedes(plan, sedesActivas ?? []) !== "varias") return undefined

  const lugar = direccionDeLaCita({ sede, negocio: {} })
  const nombre = lugar.nombre?.trim() || undefined
  if (!nombre && !lugar.direccion && !lugar.comuna) return undefined
  return { nombre, direccion: lugar.direccion, comuna: lugar.comuna }
}
