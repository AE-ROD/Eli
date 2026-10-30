import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { cuerpoDelPedido } from "@/lib/cuerpo-del-pedido"
import { configuracionDeHoraValleSchema } from "@/lib/hora-valle"
import { actorDeSesion, puedeConfigurarHoraValle } from "@/lib/permisos"
import { respuestaDeDatosInvalidos } from "@/lib/respuesta-de-validacion"

/**
 * PUT /api/configuracion/hora-valle — precios de hora valle (#89c): si está
 * encendida (`Business.horaValleActiva`) y TODAS las franjas del negocio
 * (`FranjaDeHoraValle`), que se reemplazan enteras en una transacción. Sólo
 * la dueña (`puedeConfigurarHoraValle`), sobre su propio negocio (el de la
 * sesión): no recibe ningún id de negocio. La validación es la de los CHECKs
 * de la migración, más un tope de franjas y sin solapes en el mismo día
 * (`configuracionDeHoraValleSchema`). El límite de peticiones es el del
 * panel (`proxy.ts`), por sesión.
 */
export async function PUT(request: NextRequest) {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor || !puedeConfigurarHoraValle(actor)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const datos = configuracionDeHoraValleSchema.safeParse(await cuerpoDelPedido(request))
  if (!datos.success) return respuestaDeDatosInvalidos(datos.error)
  const { activa, franjas } = datos.data
  const businessId = actor.businessId

  const resultado = await prisma.$transaction(async (tx) => {
    const negocio = await tx.business.update({
      where: { id: businessId },
      data: { horaValleActiva: activa },
      select: { horaValleActiva: true },
    })
    await tx.franjaDeHoraValle.deleteMany({ where: { businessId } })
    if (franjas.length > 0) {
      await tx.franjaDeHoraValle.createMany({ data: franjas.map((franja) => ({ ...franja, businessId })) })
    }
    const guardadas = await tx.franjaDeHoraValle.findMany({
      where: { businessId },
      select: { dayOfWeek: true, desde: true, hasta: true, porcentaje: true },
      orderBy: [{ dayOfWeek: "asc" }, { desde: "asc" }],
    })
    return { activa: negocio.horaValleActiva, franjas: guardadas }
  })

  return NextResponse.json(resultado)
}
