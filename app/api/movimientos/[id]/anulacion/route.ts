import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { actorDeSesion, whereDeMovimientos } from "@/lib/permisos"
import {
  ErrorDeLiquidacion,
  quienFirma,
  respuestaDeErrorDePlata,
  tomarCandadoDeLiquidacion,
} from "@/lib/liquidacion"
import { SELECCION_DE_MOVIMIENTO, formatearMovimiento, puedeManejarMovimiento } from "@/lib/movimientos"

/**
 * Anula un adelanto, vale o ajuste que todavía no entró en una liquidación.
 * Lo anula quien puede registrarlo (adelanto y vale: dueña y encargado;
 * ajuste: dueña). Ajeno: 404; el profesional ve los suyos pero no los anula
 * (401); ya anulado o ya liquidado: 409. Bajo el mismo candado que el cierre
 * de la liquidación de esa persona, así no se cruzan.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)
  if (!actor) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  try {
    const { id } = await params
    const movimiento = await prisma.movimientoDeLiquidacion.findFirst({
      where: whereDeMovimientos(actor, { id }),
      select: { id: true, tipo: true, memberId: true },
    })
    if (!movimiento) return NextResponse.json({ error: "Movimiento no encontrado" }, { status: 404 })
    if (!puedeManejarMovimiento(actor, movimiento.tipo)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    const firma = await quienFirma(prisma, actor, session?.user?.id)
    if (!firma) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const anulado = await prisma.$transaction(async (tx) => {
      await tomarCandadoDeLiquidacion(tx, actor.businessId, movimiento.memberId)
      const { count } = await tx.movimientoDeLiquidacion.updateMany({
        where: { id, businessId: actor.businessId, liquidacionId: null, anuladoAt: null },
        data: { anuladoAt: new Date(), anuladoPorId: firma.id, anuladoPorNombre: firma.nombre },
      })
      if (count !== 1) {
        const actual = await tx.movimientoDeLiquidacion.findFirst({
          where: { id, businessId: actor.businessId },
          select: { anuladoAt: true },
        })
        throw new ErrorDeLiquidacion(
          409,
          actual?.anuladoAt
            ? "Este movimiento ya está anulado."
            : "Este movimiento ya entró en una liquidación: anúlala primero o corrígelo con un ajuste."
        )
      }
      return tx.movimientoDeLiquidacion.findFirst({
        where: { id, businessId: actor.businessId },
        select: SELECCION_DE_MOVIMIENTO,
      })
    })

    return NextResponse.json(anulado ? formatearMovimiento(anulado) : null)
  } catch (error) {
    return respuestaDeErrorDePlata(error, "anulando un movimiento de liquidación")
  }
}
