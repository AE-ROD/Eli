import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { transicionPermitida } from "@/lib/atenciones"
import { ESTADOS_DE_RESERVA } from "@/lib/llegadas"
import { actorDeSesion, puedeAnular } from "@/lib/permisos"
import {
  ErrorDeAtencion,
  buscarAtencion,
  cuerpoDelPedido,
  leerAtencion,
  respuestaDeError,
  tomarAtencion,
} from "@/lib/tablero"

const anulacionSchema = z.object({
  motivo: z.string().trim().max(500).optional(),
})

/**
 * Anula una atención. Queda en el historial como anulada y deja de sumar: lo
 * cobrado no se borra ni se reescribe (PRODUCTO.md, sección 7).
 *
 * Antes de cobrar anulan dueño y encargado; ya cobrada, sólo el dueño
 * (`puedeAnular`). Si no estaba cobrada y venía de una reserva, la cita pasa a
 * cancelada: el cliente no se atendió. Pero sólo si la cita seguía abierta
 * (pendiente, confirmada o en progreso): una que alguien completó o canceló a
 * mano en la agenda es una decisión que no se pisa. Si estaba cobrada, la
 * cita queda completada, porque esa visita sí ocurrió.
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

  if (!puedeAnular(actor, existente)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  try {
    const { motivo } = anulacionSchema.parse((await cuerpoDelPedido(request)) ?? {})

    if (!transicionPermitida(existente.status, "anulada")) {
      throw new ErrorDeAtencion(409, "Esta atención ya está anulada.")
    }

    const atencion = await prisma.$transaction(async (tx) => {
      // Sobre el mismo estado con que se decidió el permiso: si entretanto la
      // cobraron, el encargado ya no puede anularla y esto no matchea.
      await tomarAtencion(tx, actor, existente.id, existente.status, {
        status: "anulada",
        voidedAt: new Date(),
        voidedById: session?.user?.id ?? null,
        voidReason: motivo || null,
      })

      if (existente.appointmentId && existente.status !== "finalizada") {
        await tx.appointment.updateMany({
          where: { id: existente.appointmentId, businessId: actor.businessId, status: { in: ESTADOS_DE_RESERVA } },
          data: { status: "cancelada" },
        })
      }

      return leerAtencion(tx, actor, existente.id)
    })

    return NextResponse.json(atencion)
  } catch (error) {
    return respuestaDeError(error, "anulando atención")
  }
}
