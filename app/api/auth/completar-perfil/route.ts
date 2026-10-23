import { NextRequest, NextResponse, after } from "next/server"
import { getServerSession } from "next-auth"
import { randomBytes } from "node:crypto"
import { Prisma } from "@prisma/client"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { tipoNegocioSchema } from "@/lib/validaciones"
import { verificarLimite } from "@/lib/rate-limit"
import { generarSlug } from "@/lib/slug"
import { finDeLaPrueba, generarCodigoInvitacion } from "@/lib/prueba"
import { enviarBienvenida } from "@/lib/enviar-correo-de-prueba"
import { COOKIE_DE_INVITACION, borrarCookieDeInvitacion, negocioQueInvita } from "@/lib/referidos"

const schema = z.object({
  nombreNegocio: z.string().min(2).max(80),
  tipoNegocio: tipoNegocioSchema,
  teamSize: z.number().int().min(1).max(500).default(1),
})

/**
 * El slug del negocio a partir de su nombre. Un nombre sin ningún carácter
 * que sirva en una URL ("!!!", emojis, otro alfabeto) daba un slug vacío o
 * de puros guiones: la página pública quedaba en `/reservar/`. En ese caso
 * va uno de respaldo con un sufijo al azar.
 */
function slugDelNombre(nombre: string): string {
  const slug = generarSlug(nombre)
  if (/[a-z0-9]/.test(slug)) return slug
  return `negocio-${randomBytes(3).toString("hex")}`
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!(session?.user as any)?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const userId = (session!.user as any).id

  // Por usuario y no por IP: hay sesión, y varias personas de un mismo local
  // pueden estar detrás de la misma IP. Va antes de leer el cuerpo y la base.
  const { permitido } = await verificarLimite("auth", `completar-perfil:${userId}`)
  if (!permitido) {
    return NextResponse.json({ error: "Demasiados intentos, intenta más tarde" }, { status: 429 })
  }

  try {
    const cuerpo = await request.json()
    const { nombreNegocio, tipoNegocio, teamSize } = schema.parse(cuerpo)

    const existente = await prisma.business.findFirst({ where: { userId } })
    if (existente) {
      return NextResponse.json({ error: "Ya tienes un negocio configurado" }, { status: 400 })
    }

    const slugBase = slugDelNombre(nombreNegocio)

    let slug = slugBase
    let contador = 1
    while (await prisma.business.findUnique({ where: { slug } })) {
      slug = `${slugBase}-${contador++}`
    }

    // El código de invitación que crear-cuenta guardó antes de ir a Google
    // (`/api/referidos/invitacion`). Inexistente, mal formado o el del propio
    // usuario se ignora y el negocio se crea igual.
    const invitadoPorId = await negocioQueInvita(request.cookies?.get(COOKIE_DE_INVITACION)?.value, userId)

    // La prueba se cuenta desde este mismo instante, que es también el `createdAt`.
    const ahora = new Date()
    const negocio = await prisma.business.create({
      data: {
        name: nombreNegocio,
        type: tipoNegocio,
        slug,
        teamSize,
        userId,
        createdAt: ahora,
        pruebaTerminaEl: finDeLaPrueba(ahora),
        codigoInvitacion: generarCodigoInvitacion(),
        invitadoPorId,
      },
    })

    // Después de responder: si el correo falla, el negocio igual queda creado
    // (el cron reintenta la bienvenida).
    after(() => enviarBienvenida(negocio.id))

    const respuesta = NextResponse.json(negocio)
    // Ya se usó: no queda dando vueltas en el navegador.
    borrarCookieDeInvitacion(respuesta)
    return respuesta
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 })
    }
    // Un `@unique` que chocó entre la verificación de arriba y el `create`:
    // otro pedido simultáneo (un doble clic) ya creó el negocio de este
    // usuario, o se quedó con el mismo slug. No es un error del servidor.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const campos = ([] as unknown[]).concat(error.meta?.target ?? [])
      const mensaje = campos.includes("userId")
        ? "Ya tienes un negocio configurado"
        : "No se pudo crear el negocio, intenta de nuevo"
      return NextResponse.json({ error: mensaje }, { status: 409 })
    }
    console.error("Error completando perfil:", error)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}
