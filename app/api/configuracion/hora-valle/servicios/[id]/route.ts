import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { cuerpoDelPedido } from "@/lib/cuerpo-del-pedido"
import { actorDeSesion, puedeConfigurarHoraValle } from "@/lib/permisos"
import { respuestaDeDatosInvalidos } from "@/lib/respuesta-de-validacion"

const MENSAJE = "Falta si el servicio queda fuera de la hora valle (excluido: true o false)"

const exclusionSchema = z.object(
  { excluido: z.boolean({ required_error: MENSAJE, invalid_type_error: MENSAJE }) },
  { required_error: MENSAJE, invalid_type_error: MENSAJE }
)

/**
 * PUT /api/configuracion/hora-valle/servicios/[id] — deja un servicio fuera
 * de la rebaja de hora valle (#89c, `Service.excluidoDeHoraValle`), o lo
 * vuelve a incluir. Sólo la dueña (`puedeConfigurarHoraValle`); el servicio
 * tiene que ser de su negocio: uno ajeno o inventado es 404, antes de leer el
 * cuerpo. El límite de peticiones es el del panel (`proxy.ts`), por sesión.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor || !puedeConfigurarHoraValle(actor)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const { id } = await params
  const existente = await prisma.service.findFirst({ where: { id, businessId: actor.businessId }, select: { id: true } })
  if (!existente) return NextResponse.json({ error: "Servicio no encontrado" }, { status: 404 })

  const datos = exclusionSchema.safeParse(await cuerpoDelPedido(request))
  if (!datos.success) return respuestaDeDatosInvalidos(datos.error)

  // El businessId va también en la escritura: no hay forma de tocar uno ajeno.
  await prisma.service.updateMany({
    where: { id, businessId: actor.businessId },
    data: { excluidoDeHoraValle: datos.data.excluido },
  })
  return NextResponse.json({ id, excluido: datos.data.excluido })
}
