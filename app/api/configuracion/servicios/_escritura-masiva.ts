import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { actorDeSesion, puedeGestionarServicios, type Actor } from "@/lib/permisos"
import { verificarLimite } from "@/lib/rate-limit"

/**
 * El tope del cuerpo de una carga de servicios: 512 KB. El de por defecto
 * (100 KB) no alcanza para 100 servicios con descripciones largas; esto sí
 * (unos 5 KB por servicio) y sigue muy por debajo del techo de `/api`.
 */
export const TOPE_DEL_CUERPO_EN_LOTE = 512 * 1024

export const MENSAJE_DE_LIMITE_EN_LOTE =
  "Ya se hicieron varios cambios en bloque a los servicios en la última hora. Intenta de nuevo más tarde."

/**
 * La puerta de las escrituras masivas de servicios (cargar un lote, cambiar
 * varios a la vez, renombrar una categoría): sesión, permiso para gestionar
 * servicios y el límite propio, en ese orden y antes de leer el cuerpo. El
 * negocio es el de la sesión, nunca el que diga el navegador.
 *
 * El límite cuenta por usuario (el dueño y el encargado no se gastan el cupo
 * entre sí) y, si la sesión no trae su id, por negocio. Falla cerrado
 * (`lib/rate-limit.ts`).
 */
export async function autorizarEscrituraMasiva(): Promise<{ actor: Actor } | { respuesta: NextResponse }> {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)
  if (!actor || !puedeGestionarServicios(actor)) {
    return { respuesta: NextResponse.json({ error: "No autorizado" }, { status: 401 }) }
  }

  const usuario = (session?.user as { id?: unknown } | undefined)?.id
  const clave = typeof usuario === "string" && usuario ? `usuario:${usuario}` : `negocio:${actor.businessId}`
  const { permitido } = await verificarLimite("serviciosEnLote", clave)
  if (!permitido) {
    return { respuesta: NextResponse.json({ error: MENSAJE_DE_LIMITE_EN_LOTE }, { status: 429 }) }
  }

  return { actor }
}
