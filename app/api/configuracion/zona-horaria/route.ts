import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { cuerpoConTope, respuestaDeCuerpoDemasiadoGrande } from "@/lib/cuerpo-del-pedido"
import { actorDeSesion, puedeConfigurarZonaHoraria } from "@/lib/permisos"
import { respuestaDeDatosInvalidos } from "@/lib/respuesta-de-validacion"
import { esZonaDeChile, esZonaGuardable } from "@/lib/zonas-de-chile"

const MENSAJE = "Elige una de las zonas de la lista: Chile continental, Magallanes o Isla de Pascua"
const MENSAJE_SIN_SOPORTE = "Este servidor no reconoce esa zona horaria. Prueba con otra o avísanos"

const zonaSchema = z.object(
  {
    zona: z
      .string({ required_error: MENSAJE, invalid_type_error: MENSAJE })
      .refine(esZonaDeChile, MENSAJE)
      // La lista es fija, pero la zona se guarda sólo si este motor sabe calcularla
      // (`esZonaValida`): si no, el negocio seguiría en Santiago sin decirlo.
      .refine(esZonaGuardable, MENSAJE_SIN_SOPORTE),
  },
  { required_error: MENSAJE, invalid_type_error: MENSAJE }
)

/**
 * PUT /api/configuracion/zona-horaria — la zona horaria del negocio
 * (`Business.timezone`, IANA): con ella se leen las citas y se ofrecen las
 * horas de la reserva pública. Sólo la dueña (`puedeConfigurarZonaHoraria`),
 * sobre su propio negocio (el de la sesión): no recibe ningún id de negocio.
 *
 * Sólo se aceptan las tres zonas de Chile (`lib/zonas-de-chile.ts`) y que el
 * motor conozca (`lib/zona-horaria.ts`). Las citas ya guardadas son instantes:
 * no se mueven en el tiempo, cambia a qué hora se leen. El inicio, los reportes
 * y el tablero siguen calculando el día con la zona del dispositivo.
 *
 * El límite de peticiones es el de escritura del panel (`proxy.ts`).
 */
export async function PUT(request: NextRequest) {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor || !puedeConfigurarZonaHoraria(actor)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const recibido = await cuerpoConTope(request)
  if (recibido.excedido) return respuestaDeCuerpoDemasiadoGrande()
  const datos = zonaSchema.safeParse(recibido.cuerpo)
  if (!datos.success) return respuestaDeDatosInvalidos(datos.error)

  const negocio = await prisma.business.update({
    where: { id: actor.businessId },
    data: { timezone: datos.data.zona },
    select: { timezone: true },
  })
  return NextResponse.json({ zona: negocio.timezone })
}
