import type { Prisma } from "@prisma/client"
import { z } from "zod"
import { esPorcentajeDeComision } from "@/lib/comisiones"

/**
 * Lo que comparten los endpoints que cambian un % de comisión: cómo se lee el
 * pedido, quién queda registrado como autor y el candado que hace que dos
 * cambios simultáneos sobre el mismo profesional no auditen el mismo "antes".
 */

const MENSAJE_DE_PORCENTAJE = "El porcentaje tiene que ser un número de 0 a 100, con hasta dos decimales"

/**
 * `{ porcentaje }`: un número de 0 a 100 con hasta dos decimales, o `null`
 * ("sin configurar", que no es 0). Que falte es un 400: no se adivina.
 */
export const pedidoDePorcentajeSchema = z.object(
  {
    porcentaje: z
      .number({ required_error: MENSAJE_DE_PORCENTAJE, invalid_type_error: MENSAJE_DE_PORCENTAJE })
      .refine(esPorcentajeDeComision, MENSAJE_DE_PORCENTAJE)
      .nullable(),
  },
  { required_error: MENSAJE_DE_PORCENTAJE, invalid_type_error: MENSAJE_DE_PORCENTAJE }
)

/** Si dos % son el mismo valor. `null` sólo es igual a `null`: sin configurar no es 0. */
export function mismoPorcentaje(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return a === b
  return Math.round(a * 100) === Math.round(b * 100)
}

/**
 * Bloquea la fila del profesional hasta el final de la transacción. Todo
 * cambio de % de ese profesional (el suyo o una excepción) pasa por acá, así
 * que el segundo de dos pedidos simultáneos lee lo que dejó el primero y su
 * fila de auditoría dice el "antes" verdadero.
 */
export async function bloquearMiembro(tx: Prisma.TransactionClient, businessId: string, memberId: string) {
  await tx.$queryRaw`SELECT id FROM miembros_negocio WHERE id = ${memberId} AND "businessId" = ${businessId} FOR UPDATE`
}

/**
 * Quién cambia: la dueña del negocio, con su nombre y su correo copiados en
 * la fila de auditoría (sobreviven aunque el usuario se borre). Se lee del
 * negocio y no de lo que diga el pedido.
 */
export async function autorDelCambio(tx: Prisma.TransactionClient, businessId: string) {
  const negocio = await tx.business.findFirst({
    where: { id: businessId },
    select: { user: { select: { id: true, name: true, email: true } } },
  })
  if (!negocio) throw new Error("El negocio de la sesión no existe")
  return { changedById: negocio.user.id, changedByName: negocio.user.name, changedByEmail: negocio.user.email }
}
