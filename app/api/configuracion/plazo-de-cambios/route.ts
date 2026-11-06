import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { cuerpoConTope, respuestaDeCuerpoDemasiadoGrande } from "@/lib/cuerpo-del-pedido"
import { PLAZO_MAXIMO_HORAS, PLAZO_MINIMO_HORAS } from "@/lib/gestion-de-cita"
import { actorDeSesion, puedeEditarPlazoDeCambios } from "@/lib/permisos"
import { respuestaDeDatosInvalidos } from "@/lib/respuesta-de-validacion"

const MENSAJE = `El plazo tiene que ser un número entero de horas, de ${PLAZO_MINIMO_HORAS} a ${PLAZO_MAXIMO_HORAS}`

const plazoSchema = z.object({
  horas: z
    .number({ required_error: MENSAJE, invalid_type_error: MENSAJE })
    .int(MENSAJE)
    .min(PLAZO_MINIMO_HORAS, MENSAJE)
    .max(PLAZO_MAXIMO_HORAS, MENSAJE),
}, { required_error: MENSAJE, invalid_type_error: MENSAJE })

/**
 * PUT /api/configuracion/plazo-de-cambios — hasta cuántas horas antes de la
 * cita el cliente puede cancelar o reagendar con su enlace
 * (`Business.cancelacionHorasAntes`). Dueño y encargado, sobre su propio
 * negocio (el de la sesión). El límite de peticiones es el del panel (`proxy.ts`).
 */
export async function PUT(request: NextRequest) {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor || !puedeEditarPlazoDeCambios(actor)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const recibido = await cuerpoConTope(request)
  if (recibido.excedido) return respuestaDeCuerpoDemasiadoGrande()
  const datos = plazoSchema.safeParse(recibido.cuerpo)
  if (!datos.success) return respuestaDeDatosInvalidos(datos.error)

  const negocio = await prisma.business.update({
    where: { id: actor.businessId },
    data: { cancelacionHorasAntes: datos.data.horas },
    select: { cancelacionHorasAntes: true },
  })
  return NextResponse.json({ horas: negocio.cancelacionHorasAntes })
}
