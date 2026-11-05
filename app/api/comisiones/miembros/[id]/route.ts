import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { cuerpoDelPedido } from "@/lib/cuerpo-del-pedido"
import { actorDeSesion, puedeEditarComisiones } from "@/lib/permisos"
import { respuestaDeDatosInvalidos } from "@/lib/respuesta-de-validacion"
import { autorDelCambio, bloquearMiembro, mismoPorcentaje, pedidoDePorcentajeSchema } from "../../_comun"

/**
 * PUT /api/comisiones/miembros/[id] — el % de comisión por defecto de un
 * profesional (`BusinessMember.commissionPercent`). `null` lo deja sin
 * configurar (sus servicios cobrados quedan pendientes), que no es 0.
 *
 * Sólo la dueña (`puedeEditarComisiones`); el encargado y el profesional,
 * 401. El miembro tiene que ser de su negocio: si no, 404. Cada cambio deja
 * exactamente una fila en `CommissionChange`, en la misma transacción; si el
 * valor no cambia, no se escribe ni se audita nada. El límite de peticiones
 * es el del panel (`proxy.ts`).
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor || !puedeEditarComisiones(actor)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const { id } = await params
  const datos = pedidoDePorcentajeSchema.safeParse(await cuerpoDelPedido(request))
  if (!datos.success) return respuestaDeDatosInvalidos(datos.error)
  const nuevo = datos.data.porcentaje

  const resultado = await prisma.$transaction(async (tx) => {
    await bloquearMiembro(tx, actor.businessId, id)
    const miembro = await tx.businessMember.findFirst({
      where: { id, businessId: actor.businessId },
      select: { id: true, commissionPercent: true, user: { select: { name: true } } },
    })
    if (!miembro) return null

    const anterior = miembro.commissionPercent
    if (mismoPorcentaje(anterior, nuevo)) return { porcentaje: anterior, cambio: false }

    await tx.businessMember.update({ where: { id: miembro.id }, data: { commissionPercent: nuevo } })
    await tx.commissionChange.create({
      data: {
        businessId: actor.businessId,
        memberId: miembro.id,
        memberName: miembro.user.name,
        scope: "default",
        previousPercent: anterior,
        newPercent: nuevo,
        ...(await autorDelCambio(tx, actor.businessId)),
      },
    })
    return { porcentaje: nuevo, cambio: true }
  })

  if (!resultado) return NextResponse.json({ error: "Profesional no encontrado" }, { status: 404 })
  return NextResponse.json(resultado)
}
