import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { aCentavos } from "@/lib/atenciones"
import { cuerpoConTope, respuestaDeCuerpoDemasiadoGrande } from "@/lib/cuerpo-del-pedido"
import { actorDeSesion, puedeGestionarPaquetes } from "@/lib/permisos"
import { respuestaDeDatosInvalidos } from "@/lib/respuesta-de-validacion"
import { ErrorDeAtencion, respuestaDeError } from "@/lib/tablero"
import {
  MENSAJE_DE_SESION_SIN_VALOR,
  SELECCION_DE_PAQUETE,
  cadaSesionValeAlgo,
  edicionDePaqueteSchema,
  formatearPaquete,
} from "../_paquetes"

const NO_ENCONTRADO = "Paquete no encontrado"

/**
 * Edita un paquete del negocio: sesiones, precio, vigencia y si se ofrece
 * (`activo`). Uno de otro negocio da 404, como si no existiera. Los paquetes
 * ya vendidos no cambian: llevan copiados sus datos del día de la venta, y
 * acá no se tocan.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)
  if (!actor || !puedeGestionarPaquetes(actor)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const { id } = await params
  const existente = await prisma.paqueteDeSesiones.findFirst({
    where: { id, businessId: actor.businessId },
    select: { id: true },
  })
  if (!existente) {
    return NextResponse.json({ error: NO_ENCONTRADO }, { status: 404 })
  }

  let datos: z.infer<typeof edicionDePaqueteSchema>
  try {
    const recibido = await cuerpoConTope(request)
    if (recibido.excedido) return respuestaDeCuerpoDemasiadoGrande()
    datos = edicionDePaqueteSchema.parse(recibido.cuerpo)
  } catch (error) {
    if (error instanceof z.ZodError) return respuestaDeDatosInvalidos(error)
    throw error
  }

  try {
    const paquete = await prisma.$transaction(async (tx) => {
      // La fila trabada: el precio y las sesiones se validan juntos, aunque llegue uno solo y otro pedido cambie el otro.
      await tx.$queryRaw`SELECT id FROM paquetes WHERE id = ${id} AND "businessId" = ${actor.businessId} FOR UPDATE`
      const antes = await tx.paqueteDeSesiones.findFirst({
        where: { id, businessId: actor.businessId },
        select: { sesiones: true, priceCents: true },
      })
      if (!antes) throw new ErrorDeAtencion(404, NO_ENCONTRADO)

      const priceCents = datos.precio === undefined ? antes.priceCents : aCentavos(datos.precio)
      const sesiones = datos.sesiones ?? antes.sesiones
      if (!cadaSesionValeAlgo(priceCents, sesiones)) throw new ErrorDeAtencion(400, MENSAJE_DE_SESION_SIN_VALOR)

      // Acotado por negocio, no sólo por id: una escritura no depende de que el id venga verificado.
      const { count } = await tx.paqueteDeSesiones.updateMany({
        where: { id, businessId: actor.businessId },
        data: {
          ...(datos.sesiones !== undefined && { sesiones: datos.sesiones }),
          ...(datos.precio !== undefined && { priceCents }),
          ...(datos.vigenciaMeses !== undefined && { vigenciaMeses: datos.vigenciaMeses }),
          ...(datos.activo !== undefined && { active: datos.activo }),
        },
      })
      if (count === 0) throw new ErrorDeAtencion(404, NO_ENCONTRADO)

      const despues = await tx.paqueteDeSesiones.findFirst({
        where: { id, businessId: actor.businessId },
        select: SELECCION_DE_PAQUETE,
      })
      if (!despues) throw new ErrorDeAtencion(404, NO_ENCONTRADO)
      return despues
    })

    return NextResponse.json(formatearPaquete(paquete))
  } catch (error) {
    return respuestaDeError(error, "editando paquete de sesiones")
  }
}

/**
 * Elimina la definición del paquete: deja de ofrecerse. Los que ya se
 * vendieron siguen valiendo, con sus datos copiados (la base les deja el
 * `paqueteId` en null).
 */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)
  if (!actor || !puedeGestionarPaquetes(actor)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const { id } = await params

  try {
    // Acotado por negocio: el de otro negocio no se borra y da 404, como el que no existe.
    const { count } = await prisma.paqueteDeSesiones.deleteMany({ where: { id, businessId: actor.businessId } })
    if (count === 0) return NextResponse.json({ error: NO_ENCONTRADO }, { status: 404 })
    return NextResponse.json({ mensaje: "Paquete eliminado" })
  } catch (error) {
    return respuestaDeError(error, "eliminando paquete de sesiones")
  }
}
