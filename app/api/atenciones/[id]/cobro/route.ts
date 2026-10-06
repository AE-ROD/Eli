import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import {
  aCentavos,
  deCentavos,
  errorDeCobro,
  requisitoFaltante,
  totalEnCentavos,
  transicionPermitida,
} from "@/lib/atenciones"
import { actorDeSesion, puedeCobrar } from "@/lib/permisos"
import {
  ErrorDeAtencion,
  TOPE_POR_ATENCION,
  buscarAtencion,
  cuerpoDelPedido,
  leerAtencion,
  respuestaDeError,
  tomarAtencion,
} from "@/lib/tablero"

/** Más medios que esto en un solo cobro no es un pago dividido, es un error de carga. */
const MAXIMO_DE_PAGOS = 20

/**
 * Sólo la forma: que el medio exista, que el monto sea válido y que todo sume
 * el total lo decide `errorDeCobro`, que devuelve un mensaje que se puede
 * mostrar en la caja en vez del detalle de zod.
 */
const cobroSchema = z.object({
  pagos: z
    .array(z.object({ medio: z.string(), monto: z.number() }))
    .max(MAXIMO_DE_PAGOS),
})

/**
 * Cobra una atención que está por cobrar. Todo en una transacción: los pagos,
 * la atención finalizada con su total congelado y quién cobró, y la cita de
 * origen completada con ese mismo total. O pasa todo, o nada.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)
  if (!actor) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const { id } = await params
  const existente = await buscarAtencion(actor, id)
  if (!existente) {
    return NextResponse.json({ error: "Atención no encontrada" }, { status: 404 })
  }

  // La ve (es suya), pero cobrar es de dueño y encargado.
  if (!puedeCobrar(actor)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  try {
    const { pagos } = cobroSchema.parse(await cuerpoDelPedido(request))

    if (!transicionPermitida(existente.status, "finalizada")) {
      throw new ErrorDeAtencion(409, "Sólo se cobra una atención que está por cobrar.")
    }

    const atencion = await prisma.$transaction(async (tx) => {
      // Primero se toma la fila: un segundo cobro de la misma atención (un
      // doble clic) encuentra que ya no está por cobrar y no registra nada.
      await tomarAtencion(tx, existente.id, "por-cobrar", {
        status: "finalizada",
        paidAt: new Date(),
        paidById: session?.user?.id ?? null,
      })

      const lineas = await tx.visitService.findMany({
        where: { visitId: existente.id, visit: { is: { businessId: actor.businessId } } },
        select: { memberId: true, byOwner: true, price: true },
        take: TOPE_POR_ATENCION,
      })
      const falta = requisitoFaltante("finalizada", lineas)
      if (falta) throw new ErrorDeAtencion(400, falta)

      const totalCentavos = totalEnCentavos(lineas)
      const errorDePagos = errorDeCobro(totalCentavos, pagos)
      if (errorDePagos) throw new ErrorDeAtencion(400, errorDePagos)

      const total = deCentavos(totalCentavos)

      if (pagos.length > 0) {
        await tx.visitPayment.createMany({
          data: pagos.map((pago) => ({
            visitId: existente.id,
            method: pago.medio,
            // Ya validado con centavos exactos: esto sólo lo normaliza.
            amount: deCentavos(aCentavos(pago.monto)),
          })),
        })
      }

      await tx.visit.update({ where: { id: existente.id }, data: { total } })

      if (existente.appointmentId) {
        await tx.appointment.updateMany({
          where: { id: existente.appointmentId, businessId: actor.businessId },
          data: { status: "completada", price: total },
        })
      }

      return leerAtencion(tx, actor, existente.id)
    })

    return NextResponse.json(atencion)
  } catch (error) {
    return respuestaDeError(error, "cobrando atención")
  }
}
