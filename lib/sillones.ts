import type { Prisma } from "@prisma/client"
import { z } from "zod"
import { minutosAHora } from "@/lib/horario-dia"
import { ESTADOS_QUE_LIBERAN, type Tramo } from "@/lib/ocupacion"
import { fechaYMinutosEn } from "@/lib/zona-horaria"

/**
 * Los sillones de la clínica dental (`Sillon`): cómo se escriben desde
 * Configuración y cuándo dos citas chocan en el mismo sillón. Quién los ve y
 * quién los gestiona vive en `lib/permisos.ts` (`veSillones`,
 * `puedeGestionarSillones`, `puedeAsignarSillon`, `whereDeSillones`).
 *
 * Reglas
 * ──────
 * - El nombre se guarda recortado y es único por negocio. La base sólo
 *   compara exacto ("Sillón 1" y "sillón 1" no chocan ahí); el endpoint
 *   además lo revisa sin mayúsculas, para que no queden dos que se leen igual.
 * - Un sillón no se borra: se desactiva. Las citas que ya lo tienen lo
 *   conservan; a una cita nueva, o que cambia de sillón, sólo se le asigna uno
 *   activo.
 * - Un sillón atiende a una persona a la vez: dos citas que ocupan su horario
 *   (`lib/ocupacion.ts`: cancelada y "no vino" no ocupan) y se pisan en el
 *   mismo sillón no pueden convivir. A diferencia del choque de profesional,
 *   que es una advertencia que se puede confirmar, esto es un 409 que no se
 *   salta: el sillón es uno solo. El mensaje dice las horas de las citas que
 *   chocan sólo a quien ve toda la agenda (`mostrarHorarios`).
 * - El choque se revisa con un candado por sillón (`tomarCandadoDelSillon`)
 *   dentro de la transacción que escribe, así dos pedidos a la vez no dejan
 *   dos citas en el mismo sillón y la misma hora, tampoco cuando uno es la
 *   transacción `Serializable` de reagendar por el enlace (ver el candado).
 */

// ─── Campos ──────────────────────────────────────────────────────────────────

export const LARGO_MAXIMO_DEL_NOMBRE = 40
export const ORDEN_MAXIMO = 999

/** El nombre de un sillón: recortado (la base lo exige con un CHECK), de 1 a 40. */
export const nombreDeSillon = () =>
  z
    .string({ required_error: "Escribe el nombre del sillón", invalid_type_error: "Escribe el nombre del sillón" })
    .trim()
    .min(1, "Escribe el nombre del sillón")
    .max(LARGO_MAXIMO_DEL_NOMBRE, `El nombre del sillón no puede tener más de ${LARGO_MAXIMO_DEL_NOMBRE} caracteres`)

/** En qué lugar sale en la agenda y en el inicio, de 0 a 999 (CHECK en la base). */
export const ordenDeSillon = () =>
  z
    .number({ invalid_type_error: "El orden tiene que ser un número" })
    .int("El orden tiene que ser un número entero")
    .min(0, "El orden no puede ser negativo")
    .max(ORDEN_MAXIMO, `El orden no puede ser mayor que ${ORDEN_MAXIMO}`)

const activo = () => z.boolean({ invalid_type_error: "Activo tiene que ser sí o no" })

export const sillonNuevoSchema = z.object({
  nombre: nombreDeSillon(),
  /** Sin orden, va al final. */
  orden: ordenDeSillon().optional(),
  activo: activo().optional(),
})

export const edicionDeSillonSchema = z
  .object({
    nombre: nombreDeSillon().optional(),
    orden: ordenDeSillon().optional(),
    activo: activo().optional(),
  })
  .refine((datos) => datos.nombre !== undefined || datos.orden !== undefined || datos.activo !== undefined, {
    message: "No hay nada que cambiar",
  })

/**
 * El sillón de una cita: un id, o `null` para dejarla sin sillón. El string
 * vacío también es "sin sillón", como `memberId` en las citas.
 */
export const sillonDeLaCita = () =>
  z
    .string({ invalid_type_error: "El sillón no es válido" })
    .max(100, "El sillón no es válido")
    .nullable()
    .transform((valor) => valor || null)

/** Lo que se devuelve de un sillón, en todos los endpoints. */
export const SELECCION_DE_SILLON = { id: true, nombre: true, orden: true, activo: true } satisfies Prisma.SillonSelect

/** Orden de la agenda y de Configuración: por `orden` y, a igual orden, por nombre. */
export const ORDEN_DE_SILLONES = [{ orden: "asc" }, { nombre: "asc" }] satisfies Prisma.SillonOrderByWithRelationInput[]

/** El orden que toma un sillón nuevo sin orden: uno más que el último, sin pasar del máximo. */
export function ordenAlFinal(ultimo: number | null | undefined): number {
  if (ultimo === null || ultimo === undefined) return 0
  return Math.min(ultimo + 1, ORDEN_MAXIMO)
}

// ─── Mensajes ────────────────────────────────────────────────────────────────

export const MENSAJE_SILLON_NO_ENCONTRADO = "Sillón no encontrado"
export const MENSAJE_NOMBRE_REPETIDO = "Ya hay un sillón con ese nombre"
export const MENSAJE_SILLON_INACTIVO = "Ese sillón está desactivado: actívalo en Configuración o elige otro"
export const MENSAJE_SILLON_DE_CITA_CERRADA =
  "Una cita cancelada, completada o de alguien que no vino no cambia de sillón"

/** Para que la interfaz distinga este 409 de las advertencias que se pueden confirmar. */
export const CODIGO_SILLON_OCUPADO = "sillon-ocupado"

/**
 * El 409 de un sillón ocupado. Se lanza también desde dentro de una
 * transacción, para que se deshaga entera; el endpoint lo responde con
 * `{ error, codigo: "sillon-ocupado" }`. No depende de la base, a propósito:
 * así este módulo se importa sin traer el cliente de Prisma.
 */
export class SillonOcupado extends Error {
  readonly status = 409
  readonly codigo = CODIGO_SILLON_OCUPADO
}

/** `10:00 a 11:00`, en el reloj del negocio. */
function tramoParaLeer(tramo: Tramo, zona: string): string {
  const inicio = minutosAHora(fechaYMinutosEn(tramo.startTime, zona).minutos)
  const fin = minutosAHora(fechaYMinutosEn(tramo.endTime, zona).minutos)
  return `${inicio} a ${fin}`
}

/**
 * "Sillón 1 ya tiene una cita de 10:00 a 11:00. Elige otro sillón u otra
 * hora." Con varias, las nombra en orden.
 */
export function mensajeDeSillonOcupado(nombre: string, choques: readonly Tramo[], zona: string): string {
  const ordenados = [...choques].sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
  const tramos = ordenados.map((tramo) => `de ${tramoParaLeer(tramo, zona)}`)
  const cuales =
    tramos.length <= 1
      ? `una cita ${tramos[0] ?? ""}`.trim()
      : `citas ${tramos.slice(0, -1).join(", ")} y ${tramos[tramos.length - 1]}`
  return `${nombre} ya tiene ${cuales}. Elige otro sillón u otra hora.`
}

/**
 * "Sillón 1 está ocupado a esa hora. Elige otro sillón u otra hora." Sin las
 * horas de las citas que chocan: para quien no ve toda la agenda (el
 * odontólogo), que con ellas sabría cuándo atienden sus colegas.
 */
export function mensajeDeSillonOcupadoSinHorarios(nombre: string): string {
  return `${nombre} está ocupado a esa hora. Elige otro sillón u otra hora.`
}

// ─── Choque en el sillón ─────────────────────────────────────────────────────

export interface ConsultaDeSillon {
  businessId: string
  sillonId: string
  tramo: Tramo
  /** La cita que se está escribiendo: no choca consigo misma. Al crear, `null`. */
  ignorarCitaId: string | null
  /**
   * Si el 409 dice de qué hora a qué hora son las citas que chocan. Sólo para
   * quien ve toda la agenda (`puedeVerTodaLaAgenda`, dueño y encargado): al
   * odontólogo le contaría los horarios de citas de colegas que no ve. Sin
   * decirlo, no las dice (falla cerrado).
   */
  mostrarHorarios?: boolean
}

/** Las citas del sillón que ocupan su horario y se pisan con el tramo. Tocarse no es pisarse. */
export function whereDeChoqueEnSillon(consulta: ConsultaDeSillon): Prisma.AppointmentWhereInput {
  const { businessId, sillonId, tramo, ignorarCitaId } = consulta
  return {
    businessId,
    sillonId,
    status: { notIn: [...ESTADOS_QUE_LIBERAN] },
    startTime: { lt: tramo.endTime },
    endTime: { gt: tramo.startTime },
    ...(ignorarCitaId ? { id: { not: ignorarCitaId } } : {}),
  }
}

/**
 * Traba el sillón hasta que termine la transacción. Va antes de mirar si
 * choca: quien llega segundo espera, y cuando mira ya ve la cita del primero.
 *
 * Además deja una versión nueva de la fila del sillón (un `UPDATE` que no
 * cambia nada). Es por la transacción `Serializable` de reagendar por el
 * enlace: su foto de la base se toma en su primera consulta, antes del
 * candado, así que una cita que el panel (Read Committed) guardó en el sillón
 * mientras ella esperaba no aparecería en su foto, y el candado solo no la
 * salvaba. Con la fila tocada por el panel después de su foto, su propio
 * `UPDATE` falla con un conflicto de serialización (40001) y se reintenta con
 * una foto que ya la ve (`enTransaccionSerializable`). En Read Committed el
 * `UPDATE` sólo espera a quien tenga la fila, como el candado. No cambia
 * ninguna columna, ni `updatedAt` (no pasa por Prisma).
 */
export async function tomarCandadoDelSillon(
  tx: Pick<Prisma.TransactionClient, "$executeRaw">,
  businessId: string,
  sillonId: string
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`sillon:${businessId}:${sillonId}`}))`
  await tx.$executeRaw`UPDATE "sillones" SET "orden" = "orden" WHERE "id" = ${sillonId} AND "businessId" = ${businessId}`
}

/**
 * El 409 de un sillón ocupado en ese tramo, o `null` si está libre. Lee el
 * nombre del sillón para el mensaje, que dice las horas de lo que choca sólo
 * con `mostrarHorarios`. Recibe la base (el cliente o el `tx` de una
 * transacción) en vez de importarla, como `lib/ocupacion.ts`.
 */
export async function errorDeSillonOcupado(
  db: Pick<Prisma.TransactionClient, "appointment" | "sillon">,
  consulta: ConsultaDeSillon & { zona: string }
): Promise<SillonOcupado | null> {
  const choques = await db.appointment.findMany({
    where: whereDeChoqueEnSillon(consulta),
    select: { startTime: true, endTime: true },
    orderBy: { startTime: "asc" },
    take: 10,
  })
  if (choques.length === 0) return null
  const sillon = await db.sillon.findFirst({
    where: { id: consulta.sillonId, businessId: consulta.businessId },
    select: { nombre: true },
  })
  const nombre = sillon?.nombre ?? "El sillón"
  return new SillonOcupado(
    consulta.mostrarHorarios
      ? mensajeDeSillonOcupado(nombre, choques, consulta.zona)
      : mensajeDeSillonOcupadoSinHorarios(nombre)
  )
}

/**
 * Dentro de la transacción que escribe la cita: traba el sillón y, si choca,
 * lanza el 409 (la transacción se deshace y el endpoint lo responde).
 */
export async function asegurarSillonLibre(
  tx: Pick<Prisma.TransactionClient, "appointment" | "sillon" | "$executeRaw">,
  consulta: ConsultaDeSillon & { zona: string }
): Promise<void> {
  await tomarCandadoDelSillon(tx, consulta.businessId, consulta.sillonId)
  const error = await errorDeSillonOcupado(tx, consulta)
  if (error) throw error
}
