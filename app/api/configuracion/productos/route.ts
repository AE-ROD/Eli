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
  formatearProducto,
  precioEnCentavos,
  productoNuevoSchema,
  traePorcentaje,
} from "@/lib/productos"
import { respuestaDeError } from "@/lib/tablero"

/** Ningún local vende tantos productos distintos; corta una lista sin fin. */
const TOPE_DE_PRODUCTOS = 200

/**
 * El catálogo de productos del negocio, para Configuración. Dueña y
 * encargado; el profesional ve los activos en el tablero, no acá. El % de
 * comisión de cada producto sólo le llega a la dueña: no se pide a la base
 * para nadie más.
 */
export async function GET() {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)
  if (!actor || !puedeGestionarProductos(actor)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const conPorcentaje = puedeFijarComisionDeProducto(actor)
  const productos = await prisma.producto.findMany({
    where: whereDeProductos(actor),
    select: { id: true, name: true, priceCents: true, active: true, commissionPercent: conPorcentaje },
    orderBy: { createdAt: "asc" },
    take: TOPE_DE_PRODUCTOS,
  })

  return NextResponse.json(productos.map((producto) => formatearProducto(producto, conPorcentaje)))
}

/**
 * Agrega un producto. El % es opcional y sólo lo manda la dueña: si lo manda
 * el encargado se rechaza (401) en vez de ignorarlo en silencio, para que no
 * crea que quedó fijado. Con %, el cambio queda en el historial de
 * comisiones en la misma transacción.
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)
  if (!actor || !puedeGestionarProductos(actor)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  let datos: z.infer<typeof productoNuevoSchema>
  try {
    datos = productoNuevoSchema.parse(await cuerpoDelPedido(request))
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
      const creado = await tx.producto.create({
        data: {
          businessId: actor.businessId,
          name: datos.nombre,
          priceCents: precioEnCentavos(datos.precio),
          commissionPercent: datos.porcentaje ?? null,
        },
        select: { id: true, name: true, priceCents: true, active: true, commissionPercent: true },
      })
      await auditarPorcentajeDeProducto(tx, actor, session?.user?.id ?? null, creado, null, datos.porcentaje ?? null)
      return creado
    })

    return NextResponse.json(formatearProducto(producto, conPorcentaje), { status: 201 })
  } catch (error) {
    return respuestaDeError(error, "creando producto")
  }
}
