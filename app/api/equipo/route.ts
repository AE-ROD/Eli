import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { email as campoEmail, nombre as campoNombre } from "@/lib/campos-del-panel"
import { respuestaDeDatosInvalidos } from "@/lib/respuesta-de-validacion"
import { actorDeSesion, puedeGestionarEquipo } from "@/lib/permisos"
import { verificarLimite } from "@/lib/rate-limit"
import {
  CAMPOS_DE_INVITACION,
  claveDeReenvio,
  enlaceNuevo,
  estaVencida,
  mandarCorreoDeInvitacion,
} from "@/lib/invitaciones-de-equipo"
import { normalizarEmail } from "@/lib/validaciones"
import { registrarError } from "@/lib/registro-de-errores"
import { CuerpoDemasiadoGrande, leerJsonConTope, respuestaDeCuerpoDemasiadoGrande } from "@/lib/cuerpo-del-pedido"

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
      select: CAMPOS_DE_INVITACION,
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
    const cuerpo = await leerJsonConTope(request)
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

    // La más nueva de las que nadie aceptó. Si está vigente, no se manda otra:
    // se ofrece reenviarla. Si venció, se reemplaza (enlace y vencimiento
    // nuevos) en vez de bloquear ese correo para siempre, que es lo que
    // pasaba cuando acá no se miraba `expiresAt`.
    const invitacionPendiente = await prisma.workerInvitation.findFirst({
      where: { businessId: actor.businessId, email: mismoEmail, acceptedAt: null },
      orderBy: { expiresAt: "desc" },
      select: { id: true, expiresAt: true, createdAt: true },
    })
    if (invitacionPendiente && !estaVencida(invitacionPendiente)) {
      return NextResponse.json(
        {
          error: "Ya hay una invitación vigente para este correo. Puedes reenviarla.",
          invitacionId: invitacionPendiente.id,
          expiresAt: invitacionPendiente.expiresAt,
        },
        { status: 409 }
      )
    }

    // Reemplazar una vencida manda un correo a una casilla que ya recibió
    // otro: cuenta en el mismo límite que reenviar.
    if (invitacionPendiente) {
      const { permitido } = await verificarLimite("reenvioDeInvitacion", claveDeReenvio(actor.businessId, email))
      if (!permitido) {
        return NextResponse.json(
          { error: "Ya se mandaron varias invitaciones a este correo. Espera un rato e intenta de nuevo." },
          { status: 429 }
        )
      }
    }

    // A la base va sólo el hash (lib/tokens.ts); el token en claro existe
    // únicamente en el enlace del correo y no se responde al cliente.
    const { token, tokenHash, expiresAt } = enlaceNuevo()

    let invitacion: { id: string; name: string; email: string; role: string; expiresAt: Date; createdAt: Date }
    if (invitacionPendiente) {
      // Acotada por negocio y por "sin aceptar" también al escribir: si
      // alguien la aceptó entretanto, no se le cambia el enlace.
      const { count } = await prisma.workerInvitation.updateMany({
        where: { id: invitacionPendiente.id, businessId: actor.businessId, acceptedAt: null },
        data: { name: nombre, email, role: rol, tokenHash, expiresAt },
      })
      if (count === 0) {
        return NextResponse.json({ error: "La invitación cambió mientras tanto. Recarga la página." }, { status: 409 })
      }
      invitacion = { id: invitacionPendiente.id, name: nombre, email, role: rol, expiresAt, createdAt: invitacionPendiente.createdAt }
    } else {
      invitacion = await prisma.workerInvitation.create({
        data: {
          businessId: actor.businessId,
          email,
          name: nombre,
          role: rol,
          tokenHash,
          expiresAt,
        },
        select: CAMPOS_DE_INVITACION,
      })
    }

    await mandarCorreoDeInvitacion({
      token,
      businessId: actor.businessId,
      nombreDeRespaldo: session?.user.businessName ?? "",
      email,
      nombre,
      rol,
    })

    // Campo por campo: ni el hash del token puede colarse en la respuesta.
    const { id, name, email: emailInvitado, role, expiresAt: vence, createdAt } = invitacion
    return NextResponse.json(
      {
        invitacion: { id, name, email: emailInvitado, role, expiresAt: vence, createdAt },
        reemplazoUnaVencida: Boolean(invitacionPendiente),
      },
      { status: 201 }
    )
  } catch (error) {
    if (error instanceof CuerpoDemasiadoGrande) return respuestaDeCuerpoDemasiadoGrande()
    if (error instanceof z.ZodError) {
      return respuestaDeDatosInvalidos(error)
    }
    registrarError("invitando al equipo", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
