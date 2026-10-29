import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { cuerpoDelPedido } from "@/lib/cuerpo-del-pedido"
import { actorDeSesion, puedeConfigurarLiquidacion } from "@/lib/permisos"
import {
  ErrorDeLiquidacion,
  leerNegocioParaLiquidar,
  respuestaDeErrorDePlata,
  tomarCandadoDeLiquidacionesDelNegocio,
} from "@/lib/liquidacion"
import { fechaParaColumna } from "@/lib/periodos-de-liquidacion"
import { esFechaCalendario } from "@/lib/zona-horaria"

const liquidarDesdeSchema = z.object({
  fecha: z
    .string({ required_error: "Elige la fecha." })
    .refine(esFechaCalendario, "Elige una fecha válida."),
})

/**
 * "Liquidar desde": el día (del negocio) desde el que se liquida. Lo cobrado
 * antes y los movimientos con fecha anterior nunca entran a una liquidación:
 * así lo que ya se pagó por fuera de Eli no se paga dos veces. Sólo la dueña.
 * Se puede cambiar mientras no haya ninguna liquidación no anulada; después,
 * 409 (cambiarla movería lo que ya se cerró). Toma exclusivo el candado de
 * liquidaciones del negocio, que cada cierre toma compartido: un cierre en
 * curso termina antes y el conteo de abajo ya lo ve.
 */
export async function PUT(request: NextRequest) {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor || !puedeConfigurarLiquidacion(actor)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  try {
    const { fecha } = liquidarDesdeSchema.parse(await cuerpoDelPedido(request))
    await prisma.$transaction(async (tx) => {
      // Antes de leer nada: lo que se mira abajo ya incluye cualquier cierre
      // que estuviera en curso.
      await tomarCandadoDeLiquidacionesDelNegocio(tx, actor.businessId, "exclusivo")
      const { liquidarDesde } = await leerNegocioParaLiquidar(tx, actor.businessId)
      if (liquidarDesde === fecha) return
      const vivas = await tx.liquidacion.count({ where: { businessId: actor.businessId, estado: { not: "anulada" } } })
      if (vivas > 0) {
        throw new ErrorDeLiquidacion(
          409,
          "Ya hay liquidaciones cerradas: la fecha desde la que se liquida no se puede cambiar. Anúlalas primero si de verdad hace falta."
        )
      }
      await tx.business.update({ where: { id: actor.businessId }, data: { liquidacionDesde: fechaParaColumna(fecha) } })
    })
    return NextResponse.json({ liquidarDesde: fecha })
  } catch (error) {
    return respuestaDeErrorDePlata(error, "guardando desde cuándo se liquida")
  }
}
