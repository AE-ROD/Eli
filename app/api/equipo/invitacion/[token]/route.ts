import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { obtenerIp, verificarLimite } from "@/lib/rate-limit"

// GET /api/equipo/invitacion/[token] — consultar datos de la invitación (público).
// Lo pide cualquiera que tenga el enlace, así que responde sólo lo que la
// pantalla de aceptar muestra: nada más del negocio.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  // Público y sin sesión: sin tope, cualquiera podía probar tokens a ritmo de
  // script y leer el nombre y el correo de cada invitación que acertara. Va
  // antes de buscar el token, así que también cuentan los que no existen.
  // Mismo límite que `aceptar` (`auth`, por IP): el `proxy` deja estas rutas
  // fuera del límite del panel porque cada una trae el suyo.
  const { permitido } = await verificarLimite("auth", obtenerIp(request))
  if (!permitido) {
    return NextResponse.json({ error: "Demasiados intentos, intenta más tarde" }, { status: 429 })
  }

  const { token } = await params

  const invitacion = await prisma.workerInvitation.findUnique({
    where: { token },
    include: { business: { select: { name: true } } },
  })

  if (!invitacion) {
    return NextResponse.json({ error: "Invitación no encontrada" }, { status: 404 })
  }

  if (invitacion.acceptedAt) {
    return NextResponse.json({ error: "Esta invitación ya fue aceptada" }, { status: 410 })
  }

  if (invitacion.expiresAt < new Date()) {
    return NextResponse.json({ error: "Esta invitación ha expirado" }, { status: 410 })
  }

  return NextResponse.json({
    nombre: invitacion.name,
    email: invitacion.email,
    rol: invitacion.role,
    negocio: invitacion.business.name,
  })
}
