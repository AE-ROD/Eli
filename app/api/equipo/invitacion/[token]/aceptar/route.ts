import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { z } from "zod"
import bcrypt from "bcryptjs"
import { obtenerIp, verificarLimite } from "@/lib/rate-limit"
import { hashDeToken } from "@/lib/tokens"
import { contrasenaNuevaSchema, normalizarEmail } from "@/lib/validaciones"
import { registrarError } from "@/lib/registro-de-errores"
import { idDeContextoDeMiembro } from "@/lib/contextos"
import { CuerpoDemasiadoGrande, leerJsonConTope, respuestaDeCuerpoDemasiadoGrande } from "@/lib/cuerpo-del-pedido"

// `contrasena`, igual que el registro y el restablecimiento de contraseña.
const schema = z.object({
  contrasena: contrasenaNuevaSchema.optional(),
})

const INVITACION_INVALIDA = () =>
  NextResponse.json({ error: "Invitación inválida o expirada" }, { status: 410 })

/** La invitación ya no estaba pendiente al momento de marcarla: otro pedido la usó primero. */
class InvitacionYaUsada extends Error {}

/** La cuenta ya es miembro de ese negocio: no se duplica la membresía. */
class YaEsMiembro extends Error {}

const YA_ES_MIEMBRO = () =>
  NextResponse.json({ error: "Ya eres parte del equipo de este negocio." }, { status: 409 })

/**
 * Marca la invitación como aceptada, y es lo primero que hace la transacción.
 * Leerla y después marcarla dejaba que dos pedidos simultáneos pasaran los dos
 * la verificación y crearan dos cuentas o dos membresías. En Postgres, el
 * segundo `UPDATE` espera el bloqueo de la fila, vuelve a evaluar
 * `acceptedAt: null` y no marca nada: ese pedido lanza y su transacción se
 * deshace entera.
 */
async function marcarAceptada(tx: Prisma.TransactionClient, id: string) {
  const ahora = new Date()
  const marcada = await tx.workerInvitation.updateMany({
    where: { id, acceptedAt: null, expiresAt: { gt: ahora } },
    data: { acceptedAt: ahora },
  })
  if (marcada.count !== 1) throw new InvitacionYaUsada()
}

/**
 * POST /api/equipo/invitacion/[token]/aceptar — crear cuenta y unirse al negocio,
 * o sumar el negocio a una cuenta que ya existe.
 *
 * Una cuenta puede estar en varios negocios (PRODUCTO.md, sección 5): la
 * dueña de otro negocio, alguien que ya trabaja en otro, e incluso la dueña
 * de ESTE negocio (invitada como profesional o encargada de su propio
 * negocio). Aceptar suma un contexto a la cuenta y responde su id: la
 * pantalla pide entrar a él con `update({ contexto })`, que el servidor
 * verifica contra la base. Lo único que se rechaza es duplicar una membresía.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { permitido } = await verificarLimite("auth", obtenerIp(request))
  if (!permitido) {
    return NextResponse.json({ error: "Demasiados intentos, intenta más tarde" }, { status: 429 })
  }

  const { token } = await params

  // La base guarda el hash del token (lib/tokens.ts), no el token del enlace.
  const invitacion = await prisma.workerInvitation.findUnique({
    where: { tokenHash: hashDeToken(token) },
    include: { business: true },
  })

  if (!invitacion || invitacion.acceptedAt || invitacion.expiresAt < new Date()) {
    return INVITACION_INVALIDA()
  }

  try {
    const cuerpo = await leerJsonConTope(request)
    const { contrasena } = schema.parse(cuerpo)

    // Una invitación no crea ni pisa credenciales de una cuenta que ya existe:
    // ese caso solo puede sumar la membresía, y solo si quien acepta ya
    // demostró ser dueño del correo iniciando sesión con él.
    // Sin distinguir mayúsculas, igual que la comparación con la sesión de abajo:
    // buscar exacto acá y comparar en minúsculas allá dejaba que una invitación
    // a `ana@x.com` no viera la cuenta `Ana@x.com` y creara una segunda.
    const usuarioExistente = await prisma.user.findFirst({
      where: { email: { equals: normalizarEmail(invitacion.email), mode: "insensitive" } },
    })

    if (usuarioExistente) {
      const session = await getServerSession(authOptions)
      const idSesion = session?.user?.id
      const emailSesion = session?.user?.email

      // La sesión tiene que ser la de esa cuenta: por id, que una sesión
      // revocada ya no tiene, y además por correo contra el de la cuenta
      // encontrada (no el de la invitación). El correo solo no alcanza.
      if (
        !idSesion ||
        idSesion !== usuarioExistente.id ||
        !emailSesion ||
        normalizarEmail(emailSesion) !== normalizarEmail(usuarioExistente.email)
      ) {
        return NextResponse.json(
          {
            error: "Inicia sesión con ese correo para aceptar la invitación",
            requiereSesion: true,
          },
          { status: 401 }
        )
      }

      const miembro = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await marcarAceptada(tx, invitacion.id)

        // Ya es miembro: se deshace todo (la invitación queda pendiente y el
        // negocio la puede anular). Antes se marcaba aceptada sin hacer nada.
        const yaEsMiembro = await tx.businessMember.findUnique({
          where: { businessId_userId: { businessId: invitacion.businessId, userId: usuarioExistente.id } },
          select: { id: true },
        })
        if (yaEsMiembro) throw new YaEsMiembro()

        return tx.businessMember.create({
          data: {
            businessId: invitacion.businessId,
            userId: usuarioExistente.id,
            role: invitacion.role,
          },
          select: { id: true },
        })
      })

      return NextResponse.json({
        ok: true,
        email: usuarioExistente.email,
        cuentaNueva: false,
        contexto: idDeContextoDeMiembro(miembro.id),
      })
    }

    if (!contrasena) {
      return NextResponse.json({ error: "La contraseña es requerida" }, { status: 400 })
    }

    const hashDeContrasena = await bcrypt.hash(contrasena, 12)

    // Una transacción: marcar la invitación + crear el usuario + crear la membresía.
    const resultado = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await marcarAceptada(tx, invitacion.id)

      const usuario = await tx.user.create({
        data: {
          name: invitacion.name,
          // Normalizado (B4), también si la invitación es de antes de normalizar.
          email: normalizarEmail(invitacion.email),
          password: hashDeContrasena,
        },
      })

      const miembro = await tx.businessMember.create({
        data: {
          businessId: invitacion.businessId,
          userId: usuario.id,
          role: invitacion.role,
        },
        select: { id: true },
      })

      return { email: usuario.email, memberId: miembro.id }
    })

    return NextResponse.json({
      ok: true,
      email: resultado.email,
      cuentaNueva: true,
      contexto: idDeContextoDeMiembro(resultado.memberId),
    })
  } catch (error) {
    if (error instanceof CuerpoDemasiadoGrande) return respuestaDeCuerpoDemasiadoGrande()
    if (error instanceof InvitacionYaUsada) {
      return INVITACION_INVALIDA()
    }
    // Dos aceptaciones a la vez de dos invitaciones al mismo negocio: el
    // `@@unique([businessId, userId])` frena la segunda.
    if (
      error instanceof YaEsMiembro ||
      (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
    ) {
      return YA_ES_MIEMBRO()
    }
    // Un cuerpo que no es JSON es un pedido mal hecho: 400, no 500.
    if (error instanceof SyntaxError || error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 })
    }
    registrarError("aceptando la invitación", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
