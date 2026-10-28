import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { leerProfesionalesQueAtienden } from "@/lib/agenda-publica"
import { obtenerIp, verificarLimite } from "@/lib/rate-limit"

/**
 * GET /api/reservar/[slug]/profesionales — quiénes atienden en la página
 * pública y qué servicios hace cada uno. Público y sin sesión: sólo lo que se
 * muestra (id, nombre, especialidad, foto). Nada del correo, el teléfono, el
 * rol ni la comisión. `servicioIds` en null es "hace todos".
 *
 * Un negocio sin profesionales responde la lista vacía: la reserva sigue
 * funcionando sin elegir con quién (`lib/agenda-publica.ts`).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { permitido } = await verificarLimite("lecturaPublica", obtenerIp(request))
  if (!permitido) {
    return NextResponse.json({ error: "Demasiadas solicitudes, intenta más tarde" }, { status: 429 })
  }

  const { slug } = await params
  const negocio = await prisma.business.findUnique({ where: { slug }, select: { id: true } })
  if (!negocio) return NextResponse.json({ error: "Negocio no encontrado" }, { status: 404 })

  const profesionales = await leerProfesionalesQueAtienden(prisma, negocio.id)
  return NextResponse.json({
    profesionales: profesionales.map((profesional) => ({
      id: profesional.id,
      nombre: profesional.nombre,
      especialidad: profesional.especialidad,
      fotoUrl: profesional.fotoUrl,
      servicioIds: profesional.serviceIds.length === 0 ? null : profesional.serviceIds,
    })),
  })
}
