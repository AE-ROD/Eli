import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { Prisma } from "@prisma/client"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { actorDeSesion, puedeConfigurarSecretaria } from "@/lib/permisos"
import { registrarError } from "@/lib/registro-de-errores"
import { CuerpoDemasiadoGrande, leerJsonConTope, respuestaDeCuerpoDemasiadoGrande } from "@/lib/cuerpo-del-pedido"
import { LlaveDeCifradoInvalida, cifrarToken, descifrarToken } from "@/lib/secretaria/cifrado"
import { numeroEsDeLaCuenta } from "@/lib/secretaria/whatsapp"

/**
 * El número de WhatsApp Cloud API del negocio de la sesión (sin Embedded
 * Signup: los datos se copian del panel de Meta). Sólo el dueño. El token de
 * acceso se guarda cifrado y nunca se devuelve: sin token nuevo, se conserva
 * el que había.
 */

const idDeMeta = z.string().trim().regex(/^\d{5,32}$/, "Tiene que ser el id numérico que muestra Meta")

const canalSchema = z.object({
  phoneNumberId: idDeMeta,
  wabaId: idDeMeta,
  accessToken: z.string().trim().max(1000).optional(),
  activo: z.boolean(),
})

export async function PUT(request: NextRequest) {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor || !puedeConfigurarSecretaria(actor)) return NextResponse.json({ error: "No encontrado" }, { status: 404 })
  try {
    const datos = canalSchema.parse(await leerJsonConTope(request))
    const existente = await prisma.canalDeWhatsapp.findUnique({
      where: { businessId: actor.businessId },
      select: { id: true, accessTokenCifrado: true },
    })
    if (!existente && !datos.accessToken) {
      return NextResponse.json({ error: "Falta el token de acceso" }, { status: 400 })
    }
    // Que el número sea de verdad de esa cuenta, y el token, de quien la maneja.
    const accessToken = datos.accessToken || descifrarToken(existente!.accessTokenCifrado)
    let propio: boolean
    try {
      propio = await numeroEsDeLaCuenta({ wabaId: datos.wabaId, phoneNumberId: datos.phoneNumberId, accessToken })
    } catch (error) {
      registrarError("comprobando el WhatsApp de la Secretaria con Meta", error)
      return NextResponse.json({ error: "No pudimos comprobar el número con Meta. Intenta de nuevo en un rato." }, { status: 502 })
    }
    if (!propio) {
      return NextResponse.json(
        { error: "Meta no confirma que ese número sea de esa cuenta con ese token. Revisa los datos." },
        { status: 400 }
      )
    }
    const token = datos.accessToken ? { accessTokenCifrado: cifrarToken(datos.accessToken) } : {}
    const canal = existente
      ? await prisma.canalDeWhatsapp.update({
          where: { businessId: actor.businessId },
          data: { phoneNumberId: datos.phoneNumberId, wabaId: datos.wabaId, activo: datos.activo, ...token },
          select: { phoneNumberId: true, wabaId: true, activo: true },
        })
      : await prisma.canalDeWhatsapp.create({
          data: {
            businessId: actor.businessId,
            phoneNumberId: datos.phoneNumberId,
            wabaId: datos.wabaId,
            activo: datos.activo,
            accessTokenCifrado: cifrarToken(datos.accessToken!),
          },
          select: { phoneNumberId: true, wabaId: true, activo: true },
        })
    return NextResponse.json({ ...canal, conectado: true })
  } catch (error) {
    if (error instanceof CuerpoDemasiadoGrande) return respuestaDeCuerpoDemasiadoGrande()
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0]?.message ?? "Datos inválidos" }, { status: 400 })
    }
    if (error instanceof SyntaxError) return NextResponse.json({ error: "El pedido no es un JSON válido" }, { status: 400 })
    // El número ya está conectado a otro negocio: el mismo mensaje, sin decir a cuál.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Ese número de WhatsApp no se puede conectar" }, { status: 409 })
    }
    if (error instanceof LlaveDeCifradoInvalida) {
      registrarError("conectando el WhatsApp de la Secretaria", error)
      return NextResponse.json({ error: "El servidor no está listo para guardar el token" }, { status: 503 })
    }
    registrarError("conectando el WhatsApp de la Secretaria", error)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}
