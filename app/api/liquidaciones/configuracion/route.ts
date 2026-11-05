import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { cuerpoDelPedido } from "@/lib/cuerpo-del-pedido"
import { actorDeSesion, puedeConfigurarLiquidacion, puedeVerLiquidacionesDelEquipo } from "@/lib/permisos"
import { leerNegocioParaLiquidar, respuestaDeErrorDePlata } from "@/lib/liquidacion"
import { TIPOS_DE_PERIODO } from "@/lib/periodos-de-liquidacion"

/** Cada cuánto se liquida al equipo. La ve quien ve las liquidaciones del equipo. */
export async function GET() {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor || !puedeVerLiquidacionesDelEquipo(actor)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }
  try {
    const { config } = await leerNegocioParaLiquidar(prisma, actor.businessId)
    return NextResponse.json(config)
  } catch (error) {
    return respuestaDeErrorDePlata(error, "leyendo la configuración de liquidaciones")
  }
}

const configuracionSchema = z.object({
  periodo: z.enum(TIPOS_DE_PERIODO, { errorMap: () => ({ message: "Elige semanal, quincenal o mensual." }) }),
  inicioSemana: z
    .number({ invalid_type_error: "Elige el día en que empieza la semana." })
    .int()
    .min(0, "Elige el día en que empieza la semana.")
    .max(6, "Elige el día en que empieza la semana."),
})

/**
 * Cambia el período del negocio. Sólo la dueña. Afecta lo que viene: las
 * liquidaciones ya cerradas no se tocan, y la próxima de cada uno arranca al
 * día siguiente de su última.
 */
export async function PUT(request: NextRequest) {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor || !puedeConfigurarLiquidacion(actor)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }
  try {
    const { periodo, inicioSemana } = configuracionSchema.parse(await cuerpoDelPedido(request))
    await prisma.business.update({
      where: { id: actor.businessId },
      data: { liquidacionPeriodo: periodo, liquidacionInicioSemana: inicioSemana },
    })
    return NextResponse.json({ periodo, inicioSemana })
  } catch (error) {
    return respuestaDeErrorDePlata(error, "guardando la configuración de liquidaciones")
  }
}
