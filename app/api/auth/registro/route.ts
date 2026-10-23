import { NextRequest, NextResponse, after } from "next/server"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { z } from "zod"
import { generarSlug } from "@/lib/slug"
import { registroSchema } from "@/lib/validaciones"
import { obtenerIp, verificarLimite } from "@/lib/rate-limit"
import { finDeLaPrueba, generarCodigoInvitacion } from "@/lib/prueba"
import { enviarBienvenida } from "@/lib/enviar-correo-de-prueba"
import { negocioQueInvita } from "@/lib/referidos"

async function slugUnico(base: string): Promise<string> {
  let slug = generarSlug(base)
  let intento = slug
  let contador = 1
  while (await prisma.business.findUnique({ where: { slug: intento } })) {
    intento = `${slug}-${contador++}`
  }
  return intento
}

export async function POST(request: NextRequest) {
  const { permitido } = await verificarLimite("auth", obtenerIp(request))
  if (!permitido) {
    return NextResponse.json({ error: "Demasiados intentos, intenta más tarde" }, { status: 429 })
  }

  try {
    const cuerpo = await request.json()
    const datos = registroSchema.parse(cuerpo)

    const usuarioExistente = await prisma.user.findUnique({
      where: { email: datos.email },
    })

    if (usuarioExistente) {
      return NextResponse.json(
        { error: "Ya existe una cuenta con ese correo" },
        { status: 400 }
      )
    }

    // El código del enlace de invitación, si vino (`?invita=` de crear-cuenta).
    // Inexistente o mal formado se ignora y la cuenta se crea igual: el
    // registro no dice si un código existe. Es un usuario nuevo, así que el
    // negocio que invita nunca es el suyo.
    const invitadoPorId = await negocioQueInvita((cuerpo as { invita?: unknown } | null)?.invita)

    const passwordHash = await bcrypt.hash(datos.contrasena, 12)
    const slug = await slugUnico(datos.nombreNegocio)
    // La prueba se cuenta desde este mismo instante, que es también el `createdAt`.
    const ahora = new Date()

    const usuario = await prisma.user.create({
      data: {
        name: datos.nombre,
        email: datos.email,
        password: passwordHash,
        business: {
          create: {
            name: datos.nombreNegocio,
            type: datos.tipoNegocio,
            slug,
            createdAt: ahora,
            pruebaTerminaEl: finDeLaPrueba(ahora),
            codigoInvitacion: generarCodigoInvitacion(),
            invitadoPorId,
          },
        },
      },
      include: { business: true },
    })

    // Después de responder: el registro no espera al correo, y si el correo
    // falla la cuenta igual queda creada (el cron reintenta la bienvenida).
    const businessId = usuario.business?.id
    if (businessId) after(() => enviarBienvenida(businessId))

    return NextResponse.json({
      id: usuario.id,
      name: usuario.name,
      email: usuario.email,
      businessId: usuario.business?.id,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      // Público: el primer mensaje, legible, y no los issues crudos de zod.
      return NextResponse.json({ error: error.errors[0]?.message ?? "Datos inválidos" }, { status: 400 })
    }
    console.error("Error en registro:", error)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}
