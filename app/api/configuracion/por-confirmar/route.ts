import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { cuerpoDelPedido } from "@/lib/cuerpo-del-pedido"
import { FALTAS_PARA_CONFIRMAR_MAXIMO, FALTAS_PARA_CONFIRMAR_MINIMO } from "@/lib/por-confirmar"
import { actorDeSesion, puedeConfigurarPorConfirmar } from "@/lib/permisos"
import { respuestaDeDatosInvalidos } from "@/lib/respuesta-de-validacion"

const MENSAJE = `Las faltas tienen que ser un número entero, de ${FALTAS_PARA_CONFIRMAR_MINIMO} a ${FALTAS_PARA_CONFIRMAR_MAXIMO}, o nada para apagarlo`

const porConfirmarSchema = z.object(
  {
    faltas: z
      .number({ required_error: MENSAJE, invalid_type_error: MENSAJE })
      .int(MENSAJE)
      .min(FALTAS_PARA_CONFIRMAR_MINIMO, MENSAJE)
      .max(FALTAS_PARA_CONFIRMAR_MAXIMO, MENSAJE)
      .nullable(),
  },
  { required_error: MENSAJE, invalid_type_error: MENSAJE }
)

/**
 * PUT /api/configuracion/por-confirmar — con cuántas faltas ("no vino") en el
 * último año una reserva pública entra por confirmar (#84):
 * `Business.porConfirmarTrasFaltas`, de 1 a 20; `null` lo apaga. Sólo la
 * dueña (`puedeConfigurarPorConfirmar`), sobre su propio negocio (el de la
 * sesión). El límite de peticiones es el del panel (`proxy.ts`), por sesión.
 */
export async function PUT(request: NextRequest) {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor || !puedeConfigurarPorConfirmar(actor)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const datos = porConfirmarSchema.safeParse(await cuerpoDelPedido(request))
  if (!datos.success) return respuestaDeDatosInvalidos(datos.error)

  const negocio = await prisma.business.update({
    where: { id: actor.businessId },
    data: { porConfirmarTrasFaltas: datos.data.faltas },
    select: { porConfirmarTrasFaltas: true },
  })
  return NextResponse.json({ faltas: negocio.porConfirmarTrasFaltas })
}
