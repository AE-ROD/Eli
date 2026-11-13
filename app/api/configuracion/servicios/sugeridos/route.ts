import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { actorDeSesion, puedeGestionarServicios } from "@/lib/permisos"
import { normalizarNombre } from "@/lib/servicios-en-lote"
import { serviciosSugeridosDe } from "@/lib/servicios-sugeridos"

/**
 * Los servicios que Eli sugiere cargar, según el rubro del negocio. El rubro
 * sale de la sesión, nunca del navegador, y `yaExiste` compara contra los
 * servicios del negocio de la sesión (activos o no) sin mayúsculas, tildes ni
 * espacios de más: la pantalla los muestra como ya cargados y no deja marcarlos.
 */
export async function GET() {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)

  if (!actor || !puedeGestionarServicios(actor)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const delNegocio = await prisma.service.findMany({
    where: { businessId: actor.businessId },
    select: { name: true },
  })
  const existentes = new Set(delNegocio.map(({ name }) => normalizarNombre(name)))

  return NextResponse.json({
    sugeridos: serviciosSugeridosDe(actor.rubro).map((sugerido) => ({
      ...sugerido,
      yaExiste: existentes.has(normalizarNombre(sugerido.name)),
    })),
  })
}
