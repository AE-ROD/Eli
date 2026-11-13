import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { quitarFoto, subirFoto, type DestinoDeFoto } from "@/lib/cambiar-foto"
import { actorDeSesion, puedeEditarFotosDelNegocio } from "@/lib/permisos"
import { respuestaDeDatosInvalidos } from "@/lib/respuesta-de-validacion"

/**
 * PUT / DELETE /api/configuracion/fotos/[tipo] — el logo (`logo`) o la portada
 * (`portada`) de la página pública del negocio. Dueño y encargado
 * (`puedeEditarFotosDelNegocio`); el profesional recibe 401.
 *
 * PUT: el cuerpo son los bytes crudos de la imagen (no multipart), con su
 * `Content-Type` (image/jpeg, image/png o image/webp), hasta 5 MB. Responde
 * `{ url }` con la ruta del mismo sitio (`/fotos/negocios/<negocio>/...webp`).
 * DELETE: quita la foto y responde `{ url: null }`.
 *
 * Siempre sobre el negocio de la sesión, nunca un id del pedido. Todo lo demás
 * (almacén, límite de 20 por hora por sesión, validación de la imagen, orden
 * de escritura) está en `lib/cambiar-foto.ts`.
 */

const tipoSchema = z.enum(["logo", "portada"], {
  errorMap: () => ({ message: "Las fotos del negocio son el logo y la portada" }),
})

type Contexto = { params: Promise<{ tipo: string }> }

function destinoDelNegocio(businessId: string, tipo: "logo" | "portada"): DestinoDeFoto {
  return {
    tipo,
    businessId,
    async leerUrl() {
      const negocio = await prisma.business.findUnique({
        where: { id: businessId },
        select: { logoUrl: true, coverUrl: true },
      })
      return negocio ? { url: tipo === "logo" ? negocio.logoUrl : negocio.coverUrl } : null
    },
    async guardarUrl(url) {
      const { count } = await prisma.business.updateMany({
        where: { id: businessId },
        data: tipo === "logo" ? { logoUrl: url } : { coverUrl: url },
      })
      return count > 0
    },
  }
}

/** La sesión, el permiso y el `tipo` de la ruta; o la respuesta que corta. */
async function resolver(contexto: Contexto) {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)
  if (!actor || !puedeEditarFotosDelNegocio(actor)) {
    return { respuesta: NextResponse.json({ error: "No autorizado" }, { status: 401 }) }
  }

  const tipo = tipoSchema.safeParse((await contexto.params).tipo)
  if (!tipo.success) return { respuesta: respuestaDeDatosInvalidos(tipo.error) }

  return {
    quien: { usuarioId: session?.user.id ?? `negocio:${actor.businessId}` },
    destino: destinoDelNegocio(actor.businessId, tipo.data),
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
