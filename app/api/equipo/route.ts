import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { email as campoEmail, nombre as campoNombre } from "@/lib/campos-del-panel"
import { respuestaDeDatosInvalidos } from "@/lib/respuesta-de-validacion"
import { enviarInvitacionTrabajador } from "@/lib/email"
import { actorDeSesion, puedeGestionarEquipo } from "@/lib/permisos"
import { generarToken } from "@/lib/tokens"
import { normalizarEmail } from "@/lib/validaciones"
import { registrarError } from "@/lib/registro-de-errores"

// GET /api/equipo — lista de miembros del negocio
export async function GET() {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)

  if (!actor || !puedeGestionarEquipo(actor)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const [miembros, invitaciones] = await Promise.all([
    prisma.businessMember.findMany({
      where: { businessId: actor.businessId },
      select: {
        id: true,
        role: true,
        createdAt: true,
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "asc" },
      take: 200,
    }),
    prisma.workerInvitation.findMany({
      where: { businessId: actor.businessId, acceptedAt: null },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        expiresAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  ])

  return NextResponse.json({ miembros, invitaciones })
}

const invitarSchema = z.object({
  nombre: campoNombre(),
  // Normalizado (B4): es el email con el que se va a crear la cuenta.
  email: campoEmail().transform(normalizarEmail),
  rol: z.enum(["worker", "admin"]).default("worker"),
})

// POST /api/equipo — invitar trabajador
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)

  if (!actor || !puedeGestionarEquipo(actor)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  try {
    const cuerpo = await request.json()
    const { nombre, email, rol } = invitarSchema.parse(cuerpo)

    // Los correos se comparan sin distinguir mayúsculas: para el servidor de
    // correo `Ana@x.com` y `ana@x.com` son la misma casilla, y si acá se
    // trataran como distintas se podría invitar N veces a la misma persona.
    const mismoEmail = { equals: email, mode: "insensitive" as const }

    const yaExiste = await prisma.user.findFirst({
      where: { email: mismoEmail },
      include: { memberships: { where: { businessId: actor.businessId } } },
    })
    if (yaExiste?.memberships.length) {
      return NextResponse.json({ error: "Este usuario ya es miembro del negocio" }, { status: 409 })
    }

    const invitacionPendiente = await prisma.workerInvitation.findFirst({
      where: { businessId: actor.businessId, email: mismoEmail, acceptedAt: null },
    })
    if (invitacionPendiente) {
      return NextResponse.json({ error: "Ya existe una invitación pendiente para este correo" }, { status: 409 })
    }

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 días

    // A la base va sólo el hash (lib/tokens.ts); el token en claro existe
    // únicamente en el enlace del correo y no se responde al cliente.
    const { token, tokenHash } = generarToken()

    const invitacion = await prisma.workerInvitation.create({
      data: {
        businessId: actor.businessId,
        email,
        name: nombre,
        role: rol,
        tokenHash,
        expiresAt,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        expiresAt: true,
        createdAt: true,
      },
    })

    const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000"
    const enlaceAceptar = `${baseUrl}/unirse/${token}`

    const negocio = await prisma.business.findUnique({
      where: { id: actor.businessId },
      select: { name: true },
    })

    await enviarInvitacionTrabajador({
      emailTrabajador: email,
      nombreTrabajador: nombre,
      nombreNegocio: negocio?.name ?? session?.user.businessName ?? "",
      rol,
      enlaceAceptar,
    }).catch(() => null)

    // Campo por campo: ni el hash del token puede colarse en la respuesta.
    const { id, name, email: emailInvitado, role, expiresAt: vence, createdAt } = invitacion
    return NextResponse.json(
      { invitacion: { id, name, email: emailInvitado, role, expiresAt: vence, createdAt } },
      { status: 201 }
    )
  } catch (error) {
    if (error instanceof z.ZodError) {
      return respuestaDeDatosInvalidos(error)
    }
    registrarError("invitando al equipo", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
