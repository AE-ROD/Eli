import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { cuerpoDelPedido } from "@/lib/cuerpo-del-pedido"
import { actorDeSesion, puedeEditarComisiones } from "@/lib/permisos"
import { respuestaDeDatosInvalidos } from "@/lib/respuesta-de-validacion"
import { autorDelCambio, bloquearMiembro, mismoPorcentaje, pedidoDePorcentajeSchema } from "../../../../_comun"

/**
 * PUT /api/comisiones/miembros/[id]/servicios/[servicioId] — la excepción de
 * un profesional en un servicio (`CommissionRate`): gana sobre su % por
 * defecto. `null` borra la excepción (vuelve a regir su % por defecto).
 *
 * Sólo la dueña; el resto, 401. Profesional o servicio de otro negocio (o
 * que no existe): 404. Cada cambio deja exactamente una fila en
 * `CommissionChange` con `scope = "service"` y el nombre del servicio
 * copiado, en la misma transacción; sin cambio, nada.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; servicioId: string }> }
) {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor || !puedeEditarComisiones(actor)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const { id, servicioId } = await params
  const datos = pedidoDePorcentajeSchema.safeParse(await cuerpoDelPedido(request))
  if (!datos.success) return respuestaDeDatosInvalidos(datos.error)
  const nuevo = datos.data.porcentaje

  const resultado = await prisma.$transaction(async (tx) => {
    await bloquearMiembro(tx, actor.businessId, id)
    const [miembro, servicio] = await Promise.all([
      tx.businessMember.findFirst({
        where: { id, businessId: actor.businessId },
        select: { id: true, user: { select: { name: true } } },
      }),
      tx.service.findFirst({ where: { id: servicioId, businessId: actor.businessId }, select: { id: true, name: true } }),
    ])
    if (!miembro) return { error: "Profesional no encontrado" }
    if (!servicio) return { error: "Servicio no encontrado" }

    const actual = await tx.commissionRate.findFirst({
      where: { businessId: actor.businessId, memberId: miembro.id, serviceId: servicio.id },
      select: { percent: true },
    })
    const anterior = actual?.percent ?? null
    if (mismoPorcentaje(anterior, nuevo)) return { porcentaje: anterior, cambio: false }

    if (nuevo === null) {
      await tx.commissionRate.deleteMany({
        where: { businessId: actor.businessId, memberId: miembro.id, serviceId: servicio.id },
      })
    } else {
      await tx.commissionRate.upsert({
        where: { memberId_serviceId: { memberId: miembro.id, serviceId: servicio.id } },
        create: { businessId: actor.businessId, memberId: miembro.id, serviceId: servicio.id, percent: nuevo },
        update: { percent: nuevo },
      })
    }
    await tx.commissionChange.create({
      data: {
        businessId: actor.businessId,
        memberId: miembro.id,
        memberName: miembro.user.name,
        scope: "service",
        serviceId: servicio.id,
        serviceName: servicio.name,
        previousPercent: anterior,
        newPercent: nuevo,
        ...(await autorDelCambio(tx, actor.businessId)),
      },
    })
    return { porcentaje: nuevo, cambio: true }
  })

  if ("error" in resultado) return NextResponse.json({ error: resultado.error }, { status: 404 })
  return NextResponse.json(resultado)
}
