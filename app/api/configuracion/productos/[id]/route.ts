import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { cuerpoDelPedido } from "@/lib/cuerpo-del-pedido"
import { respuestaDeDatosInvalidos } from "@/lib/respuesta-de-validacion"
import {
  actorDeSesion,
  puedeFijarComisionDeProducto,
  puedeGestionarProductos,
  whereDeProductos,
} from "@/lib/permisos"
import {
  auditarPorcentajeDeProducto,
  edicionDeProductoSchema,
  formatearProducto,
  precioEnCentavos,
  traePorcentaje,
} from "@/lib/productos"
import { ErrorDeAtencion, respuestaDeError } from "@/lib/tablero"

const SELECCION = { id: true, name: true, priceCents: true, active: true, commissionPercent: true } as const

/**
 * Edita un producto: nombre, precio, activo y, sólo la dueña, su %. No hay
 * DELETE a propósito: un producto que ya no se vende se desactiva, y deja de
 * ofrecerse como línea nueva en el tablero (las vendidas lo conservan).
 *
 * Un producto de otro negocio da 404 como si no existiera. El % que manda el
 * encargado se rechaza con 401 sin escribir nada. Cambiar el % no toca lo ya
 * cobrado: las líneas cobradas tienen su comisión congelada.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)
  if (!actor || !puedeGestionarProductos(actor)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const { id } = await params
  const existente = await prisma.producto.findFirst({ where: whereDeProductos(actor, { id }), select: { id: true } })
  if (!existente) {
    return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 })
  }

  let datos: z.infer<typeof edicionDeProductoSchema>
  try {
    datos = edicionDeProductoSchema.parse(await cuerpoDelPedido(request))
  } catch (error) {
    if (error instanceof z.ZodError) return respuestaDeDatosInvalidos(error)
    throw error
  }

  const conPorcentaje = puedeFijarComisionDeProducto(actor)
  if (traePorcentaje(datos) && !conPorcentaje) {
    return NextResponse.json({ error: "Solo la dueña fija el porcentaje de comisión de un producto." }, { status: 401 })
  }

  try {
    const producto = await prisma.$transaction(async (tx) => {
      const antes = await tx.producto.findFirst({ where: whereDeProductos(actor, { id }), select: SELECCION })
      if (!antes) throw new ErrorDeAtencion(404, "Producto no encontrado")

      // Acotado por negocio, no sólo por id: una escritura no depende de que
      // el id venga verificado.
      const { count } = await tx.producto.updateMany({
        where: { id, businessId: actor.businessId },
        data: {
          ...(datos.nombre !== undefined && { name: datos.nombre }),
          ...(datos.precio !== undefined && { priceCents: precioEnCentavos(datos.precio) }),
          ...(datos.activo !== undefined && { active: datos.activo }),
          ...(datos.porcentaje !== undefined && { commissionPercent: datos.porcentaje }),
        },
      })
      if (count === 0) throw new ErrorDeAtencion(404, "Producto no encontrado")

      const despues = await tx.producto.findFirst({ where: whereDeProductos(actor, { id }), select: SELECCION })
      if (!despues) throw new ErrorDeAtencion(404, "Producto no encontrado")

      if (datos.porcentaje !== undefined) {
        await auditarPorcentajeDeProducto(
          tx,
          actor,
          session?.user?.id ?? null,
          despues,
          antes.commissionPercent,
          datos.porcentaje
        )
      }
      return despues
    })

    return NextResponse.json(formatearProducto(producto, conPorcentaje))
  } catch (error) {
    return respuestaDeError(error, "editando producto")
  }
}
