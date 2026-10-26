import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { actorDeSesion, puedeGestionarEquipo } from "@/lib/permisos"
import { verificarLimite } from "@/lib/rate-limit"
import { registrarError } from "@/lib/registro-de-errores"
import { CAMPOS_DE_INVITACION, claveDeReenvio, enlaceNuevo, mandarCorreoDeInvitacion } from "@/lib/invitaciones-de-equipo"

/**
 * POST /api/equipo/pendientes/[id]/reenviar — manda de nuevo una invitación
 * que nadie aceptó, vigente o vencida, con un enlace y un vencimiento nuevos.
 * El enlace anterior deja de servir: la base guarda sólo el hash del último.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)

  if (!actor || !puedeGestionarEquipo(actor)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const { id } = await params

  try {
    const invitacion = await prisma.workerInvitation.findFirst({
      where: { id, businessId: actor.businessId, acceptedAt: null },
      select: CAMPOS_DE_INVITACION,
    })
    if (!invitacion) {
      return NextResponse.json({ error: "Invitación no encontrada" }, { status: 404 })
    }

    // Después de saber que es del negocio: la clave es su correo de destino.
    const { permitido } = await verificarLimite("reenvioDeInvitacion", claveDeReenvio(actor.businessId, invitacion.email))
    if (!permitido) {
      return NextResponse.json(
        { error: "Ya se reenvió varias veces. Espera un rato e intenta de nuevo." },
        { status: 429 }
      )
    }

    const { token, tokenHash, expiresAt } = enlaceNuevo()

    // Con el negocio y "sin aceptar" otra vez: si la aceptaron o la anularon
    // entre la lectura y acá, no se escribe nada y es 404.
    const { count } = await prisma.workerInvitation.updateMany({
      where: { id: invitacion.id, businessId: actor.businessId, acceptedAt: null },
      data: { tokenHash, expiresAt },
    })
    if (count === 0) {
      return NextResponse.json({ error: "Invitación no encontrada" }, { status: 404 })
    }

    await mandarCorreoDeInvitacion({
      token,
      businessId: actor.businessId,
      nombreDeRespaldo: session?.user.businessName ?? "",
      email: invitacion.email,
      nombre: invitacion.name,
      rol: invitacion.role,
    })

    return NextResponse.json({ invitacion: { ...invitacion, expiresAt } })
  } catch (error) {
    registrarError("reenviando una invitación", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
