import type { Prisma } from "@prisma/client"
import { z } from "zod"
import { nombre } from "@/lib/campos-del-panel"
import { aCentavos, deCentavos, esPrecioValido } from "@/lib/atenciones"
import { esPorcentajeDeComision } from "@/lib/comisiones"
import type { Actor } from "@/lib/permisos"
import { ErrorDeAtencion } from "@/lib/tablero"

/**
 * El catálogo de productos (#67): lo que el local vende además de sus
 * servicios (un shampoo, una cera). Sin inventario ni cantidad: dos unidades
 * vendidas son dos líneas en la atención. Cada producto puede llevar su % de
 * comisión para quien lo vende; sin % es pendiente (null), nunca 0.
 *
 * Quién gestiona el catálogo y quién fija el % lo dice `lib/permisos.ts`
 * (`puedeGestionarProductos`, `puedeFijarComisionDeProducto`). Los productos
 * no se borran: se desactivan, para que las líneas vendidas sigan apuntando a
 * algo y el historial de comisiones no pierda la referencia.
 */

/** En unidades, como el precio de un servicio; null es "sin precio en el catálogo". */
const precioDeProducto = () =>
  z
    .number({ invalid_type_error: "El precio tiene que ser un número" })
    .refine(esPrecioValido, "El precio tiene que ser cero o más, sin pasar del tope, con hasta dos decimales")

/** Entre 0 y 100, con hasta dos decimales. 0 es "no lleva comisión", decidido; null es "sin configurar". */
const porcentajeDeProducto = () =>
  z
    .number({ invalid_type_error: "El porcentaje tiene que ser un número" })
    .refine(esPorcentajeDeComision, "El porcentaje tiene que estar entre 0 y 100, con hasta dos decimales")

export const productoNuevoSchema = z.object({
  nombre: nombre(),
  precio: precioDeProducto().nullable().optional(),
  porcentaje: porcentajeDeProducto().nullable().optional(),
})

export const edicionDeProductoSchema = z
  .object({
    nombre: nombre().optional(),
    precio: precioDeProducto().nullable().optional(),
    activo: z.boolean().optional(),
    porcentaje: porcentajeDeProducto().nullable().optional(),
  })
  .refine((datos) => Object.values(datos).some((valor) => valor !== undefined), {
    message: "No hay nada que cambiar",
  })

/** Si el pedido trae el % (aunque sea null para borrarlo): sólo la dueña lo manda. */
export function traePorcentaje(datos: { porcentaje?: number | null }): boolean {
  return datos.porcentaje !== undefined
}

/** El precio en centavos como se guarda, o null. */
export function precioEnCentavos(precio: number | null | undefined): number | null {
  return precio === null || precio === undefined ? null : aCentavos(precio)
}

export interface ProductoGuardado {
  id: string
  name: string
  priceCents: number | null
  active: boolean
  commissionPercent?: number | null
}

/**
 * El producto como viaja al navegador. El % sólo para quien puede fijarlo:
 * para el resto la clave no existe (ni siquiera en null, que se leería como
 * "sin configurar").
 */
export function formatearProducto(producto: ProductoGuardado, conPorcentaje: boolean) {
  return {
    id: producto.id,
    nombre: producto.name,
    precio: producto.priceCents === null ? null : deCentavos(producto.priceCents),
    activo: producto.active,
    ...(conPorcentaje && { porcentaje: producto.commissionPercent ?? null }),
  }
}

export type ProductoFormateado = ReturnType<typeof formatearProducto>

/**
 * Cómo se nombra al profesional en el historial de comisiones cuando el
 * cambio es el % de un producto: vale para quien lo venda, no para alguien en
 * particular. `cambios_comision.memberName` no admite null.
 */
export const TODO_EL_EQUIPO = "Todo el equipo"

/**
 * Deja en el historial de comisiones (`CommissionChange`, scope `product`) el
 * cambio del % de un producto, en la misma transacción que lo escribe. Sin
 * cambio no hay fila: pasar de null a null, o de 10 a 10, no es un cambio. De
 * null a 0 sí: "sin configurar" no es lo mismo que "sin comisión".
 *
 * Quién cambió se copia (nombre y correo) además del id, para que el
 * historial lo diga aunque la cuenta cambie. Sólo la dueña llega acá
 * (`puedeFijarComisionDeProducto`); si la sesión no es la de la dueña de este
 * negocio, no se escribe nada (falla cerrado).
 */
export async function auditarPorcentajeDeProducto(
  tx: Prisma.TransactionClient,
  actor: Actor,
  usuarioId: string | null,
  producto: { id: string; name: string },
  anterior: number | null,
  nuevo: number | null
): Promise<void> {
  if (anterior === nuevo) return

  const negocio = usuarioId
    ? await tx.business.findFirst({
        where: { id: actor.businessId, userId: usuarioId },
        select: { user: { select: { id: true, name: true, email: true } } },
      })
    : null
  if (!negocio) throw new ErrorDeAtencion(409, "No se pudo saber quién hace el cambio: vuelve a iniciar sesión.")

  await tx.commissionChange.create({
    data: {
      businessId: actor.businessId,
      memberId: null,
      memberName: TODO_EL_EQUIPO,
      scope: "product",
      productId: producto.id,
      productName: producto.name,
      changedById: negocio.user.id,
      changedByName: negocio.user.name,
      changedByEmail: negocio.user.email,
      previousPercent: anterior,
      newPercent: nuevo,
    },
    select: { id: true },
  })
}
