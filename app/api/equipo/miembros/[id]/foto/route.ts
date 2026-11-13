import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { quitarFoto, subirFoto, type DestinoDeFoto } from "@/lib/cambiar-foto"
import { actorDeSesion, puedeEditarFotoDelMiembro } from "@/lib/permisos"

/**
 * PUT / DELETE /api/equipo/miembros/[id]/foto — la foto de un integrante del
 * equipo (la que se ve en "Quiénes atienden" de la página pública). `[id]` es
 * el id de la membresía.
 *
 * Dueño y encargado cambian la de cualquiera del negocio; el profesional,
 * SÓLO la suya (`puedeEditarFotoDelMiembro`): sobre la de un colega recibe 401.
 * El integrante se busca con el `businessId` de la sesión: uno de otro negocio,
 * o que no existe, es 404 y no se toca nada.
 *
 * PUT: bytes crudos de la imagen (no multipart) con su `Content-Type`, hasta
 * 5 MB; responde `{ url }`. DELETE responde `{ url: null }`. El resto (almacén,
 * límite de 20 por hora por sesión, validación de la imagen) está en
 * `lib/cambiar-foto.ts`.
 */

type Contexto = { params: Promise<{ id: string }> }

function destinoDelMiembro(businessId: string, miembroId: string): DestinoDeFoto {
  return {
    tipo: "miembro",
    businessId,
    miembroId,
    async leerUrl() {
      const miembro = await prisma.businessMember.findFirst({
        where: { id: miembroId, businessId },
        select: { fotoUrl: true },
      })
      return miembro ? { url: miembro.fotoUrl } : null
    },
    async guardarUrl(url) {
      // El negocio en el `where`: aunque algo cambiara entre la verificación y
      // la escritura, nunca toca un integrante ajeno.
      const { count } = await prisma.businessMember.updateMany({
        where: { id: miembroId, businessId },
        data: { fotoUrl: url },
      })
      return count > 0
    },
  }
}

/** La sesión, que el integrante sea del negocio y el permiso; o la respuesta que corta. */
async function resolver(contexto: Contexto) {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)
  if (!actor) return { respuesta: NextResponse.json({ error: "No autorizado" }, { status: 401 }) }

  const { id } = await contexto.params
  // Pertenencia antes de decidir nada: lo ajeno es 404, nunca 403.
  const miembro = await prisma.businessMember.findFirst({
    where: { id, businessId: actor.businessId },
    select: { id: true, businessId: true },
  })
  if (!miembro) return { respuesta: NextResponse.json({ error: "Integrante no encontrado" }, { status: 404 }) }

  if (!puedeEditarFotoDelMiembro(actor, miembro)) {
    return { respuesta: NextResponse.json({ error: "No autorizado" }, { status: 401 }) }
  }

  return {
    quien: { usuarioId: session?.user.id ?? `negocio:${actor.businessId}` },
    destino: destinoDelMiembro(actor.businessId, miembro.id),
  }
}

export async function PUT(request: NextRequest, contexto: Contexto) {
  const resuelto = await resolver(contexto)
  if (resuelto.respuesta) return resuelto.respuesta
  return subirFoto(request, resuelto.quien, resuelto.destino)
}

export async function DELETE(_request: NextRequest, contexto: Contexto) {
  const resuelto = await resolver(contexto)
  if (resuelto.respuesta) return resuelto.respuesta
  return quitarFoto(resuelto.quien, resuelto.destino)
}
