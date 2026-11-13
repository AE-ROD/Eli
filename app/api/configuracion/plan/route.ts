import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { cambiarDePlan, cambioDePlanSchema } from "@/lib/cambio-de-plan-servidor"
import { prisma } from "@/lib/prisma"
import { cuerpoConTope, respuestaDeCuerpoDemasiadoGrande } from "@/lib/cuerpo-del-pedido"
import { actorDeSesion, puedeCambiarDePlan } from "@/lib/permisos"
import { respuestaDeDatosInvalidos } from "@/lib/respuesta-de-validacion"
import { respuestaDeErrorDeSedes, tomarCandadoDePlanYSedes } from "@/lib/sedes-servidor"

/**
 * PATCH /api/configuracion/plan — cambia el plan del negocio de la sesión:
 * `{ plan: "independiente" | "equipo", sedeQueSeQueda? }`. Sólo la dueña
 * (`puedeCambiarDePlan`); no recibe ningún id de negocio.
 *
 * Lee el plan y los datos de la BASE dentro de la transacción y bajo el
 * candado del negocio (nunca el del token). Las reglas están en
 * `lib/cambio-de-plan.ts`:
 * - El mismo plan que ya tiene: 200 sin cambios.
 * - Independiente → Equipo: con sedes activas hace falta `sedeQueSeQueda` (400
 *   si falta o no es una sede activa suya); su dirección y su horario pasan al
 *   negocio, las sedes se desactivan y las horas por delante de la que se queda
 *   pierden la sede. 409 si otra sede tiene horas por delante.
 * - Equipo → Independiente: 409 si hay integrantes o invitaciones pendientes.
 *
 * Los triggers de la base repiten estas reglas como segunda barrera: si
 * rechazan, es 409, nunca 500. El token no se actualiza solo: la pantalla
 * llama a `update()` de la sesión para que el plan nuevo se vea.
 */
export async function PATCH(request: NextRequest) {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor || !puedeCambiarDePlan(actor)) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const recibido = await cuerpoConTope(request)
  if (recibido.excedido) return respuestaDeCuerpoDemasiadoGrande()
  const datos = cambioDePlanSchema.safeParse(recibido.cuerpo)
  if (!datos.success) return respuestaDeDatosInvalidos(datos.error)

  try {
    const resultado = await prisma.$transaction(async (tx) => {
      await tomarCandadoDePlanYSedes(tx, actor.businessId)
      return cambiarDePlan(tx, actor, datos.data)
    })
    return NextResponse.json(resultado)
  } catch (error) {
    return respuestaDeErrorDeSedes(error, "cambiando el plan")
  }
}
