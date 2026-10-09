import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import {
  MAXIMO_DE_PAGOS,
  aCentavos,
  errorDeCobro,
  errorDeTotal,
  requisitoFaltante,
  transicionPermitida,
} from "@/lib/atenciones"
import { actorDeSesion, puedeCobrar } from "@/lib/permisos"
import {
  ErrorDeAtencion,
  buscarAtencion,
  cuerpoDelPedido,
  leerAtencion,
  lineasDeLaAtencion,
  nombreEnElNegocio,
  respuestaDeError,
  tomarAtencion,
} from "@/lib/tablero"

/**
 * Sólo la forma: que el medio exista, que el monto sea válido y que todo sume
 * el total lo decide `errorDeCobro`, que devuelve un mensaje que se puede
 * mostrar en la caja en vez del detalle de zod. Los montos llegan en
 * unidades; se guardan en centavos.
 */
const cobroSchema = z.object({
  pagos: z
    .array(z.object({ medio: z.string(), monto: z.number() }))
    .max(MAXIMO_DE_PAGOS),
})

/**
 * Cobra una atención que está por cobrar. Todo en una transacción: los pagos,
 * la atención finalizada con su total congelado y quién cobró (el id y una
 * copia del nombre, para que el historial lo diga aunque después deje el
 * negocio), y la cita de origen completada. O pasa todo, o nada.
 *
 * A la cita no se le escribe el precio. Ese total incluye las líneas de la
 * dueña y de los colegas, y el profesional dueño de la cita la ve en la
 * agenda y en `/api/citas`: copiarlo ahí le mostraba lo que facturó el
 * negocio en esa visita. Lo cobrado vive en la atención.
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

    const usuarioId = session?.user?.id ?? null
    const nombre = await nombreEnElNegocio(prisma, actor, usuarioId)

    const atencion = await prisma.$transaction(async (tx) => {
      // Primero se toma la fila: un segundo cobro de la misma atención (un
      // doble clic) encuentra que ya no está por cobrar y no registra nada.
      await tomarAtencion(tx, actor, existente.id, "por-cobrar", {
        status: "finalizada",
        paidAt: new Date(),
        paidById: usuarioId,
        paidByName: nombre,
      })

      // Todas las líneas, de todos, contadas antes de leerlas: si pasan del
      // tope de servicios, o si su total no cabe, 400. Nunca se congela el
      // total de una parte. El total es el de la atención entera, y sólo lo
      // recibe quien ve todo el tablero.
      const { lineas, totalCentavos } = await lineasDeLaAtencion(tx, actor, existente.id)

      // Inalcanzable mientras `puedeCobrar` implique `puedeVerTodoElTablero`
      // (`lib/permisos.test.ts` lo exige). Si alguna vez no, falla cerrado
      // antes de validar o congelar nada, con el mismo 404 que el resto.
      if (totalCentavos === null) throw new ErrorDeAtencion(404, "Atención no encontrada")

      const excedido = errorDeTotal(totalCentavos)
      if (excedido) throw new ErrorDeAtencion(400, excedido)

      const falta = requisitoFaltante("finalizada", lineas)
      if (falta) throw new ErrorDeAtencion(400, falta)

      const errorDePagos = errorDeCobro(totalCentavos, pagos)
      if (errorDePagos) throw new ErrorDeAtencion(400, errorDePagos)

      if (pagos.length > 0) {
        await tx.visitPayment.createMany({
          data: pagos.map((pago) => ({
            visitId: existente.id,
            method: pago.medio,
            // Ya validado con centavos exactos y bajo el tope.
            amountCents: aCentavos(pago.monto),
          })),
        })
      }

      // Acotado por negocio igual que la toma: una escritura no depende de
      // que el id venga verificado.
      const { count } = await tx.visit.updateMany({
        where: { id: existente.id, businessId: actor.businessId },
        data: { totalCents: totalCentavos },
      })
      if (count === 0) throw new ErrorDeAtencion(409, "La atención cambió mientras tanto: vuelve a cargar el tablero.")

      if (existente.appointmentId) {
        await tx.appointment.updateMany({
          where: { id: existente.appointmentId, businessId: actor.businessId },
          data: { status: "completada" },
        })
      }

      return leerAtencion(tx, actor, existente.id)
    })

    return NextResponse.json(atencion)
  } catch (error) {
    return respuestaDeError(error, "cobrando atención")
  }
}
