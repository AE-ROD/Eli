import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { cuerpoConTope, respuestaDeCuerpoDemasiadoGrande } from "@/lib/cuerpo-del-pedido"
import { MENSAJES_DEL_NOMBRE_DEL_NEGOCIO } from "@/lib/nombre-del-negocio"
import { actorDeSesion, puedeEditarNombreDelNegocio } from "@/lib/permisos"
import { respuestaDeDatosInvalidos } from "@/lib/respuesta-de-validacion"
import { nombreDelNegocioSchema } from "@/lib/validaciones"

const nombreSchema = z.object(
  { nombre: nombreDelNegocioSchema },
  { required_error: MENSAJES_DEL_NOMBRE_DEL_NEGOCIO.falta, invalid_type_error: MENSAJES_DEL_NOMBRE_DEL_NEGOCIO.falta }
)

/**
 * PUT /api/configuracion/nombre — el nombre del negocio (`Business.name`).
 * Quien edita la página pública (`puedeEditarNombreDelNegocio`: dueño y
 * encargado); el profesional recibe 401, como en el resto de la configuración.
 *
 * Siempre sobre el negocio de la sesión: no recibe ningún id de negocio. Las
 * reglas del nombre son las del registro (`nombreDelNegocioSchema`: sin espacios
 * en las puntas, de 2 a 80 caracteres).
 *
 * El `slug` NO cambia: la dirección de la página pública (`/reservar/[slug]`)
 * y los enlaces ya compartidos siguen funcionando. La sesión guarda el nombre
 * (`session.user.businessName`); la pantalla la renueva con `update()` después
 * de guardar, y las demás sesiones del negocio lo leen en su próxima
 * revalidación (`lib/auth.ts`).
 *
 * El límite de peticiones es el de escritura del panel (`proxy.ts`).
 */
export async function PUT(request: NextRequest) {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor || !puedeEditarNombreDelNegocio(actor)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const recibido = await cuerpoConTope(request)
  if (recibido.excedido) return respuestaDeCuerpoDemasiadoGrande()
  const datos = nombreSchema.safeParse(recibido.cuerpo)
  if (!datos.success) return respuestaDeDatosInvalidos(datos.error)

  const negocio = await prisma.business.update({
    where: { id: actor.businessId },
    data: { name: datos.data.nombre },
    select: { name: true },
  })
  return NextResponse.json({ nombre: negocio.name })
}
