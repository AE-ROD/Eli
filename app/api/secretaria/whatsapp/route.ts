import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import QRCode from "qrcode"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { actorDeSesion, puedeConfigurarSecretaria, puedeUsarSecretaria } from "@/lib/permisos"
import { verificarLimite } from "@/lib/rate-limit"
import { registrarError } from "@/lib/registro-de-errores"
import { CuerpoDemasiadoGrande, leerJsonConTope, respuestaDeCuerpoDemasiadoGrande } from "@/lib/cuerpo-del-pedido"
import { conectarWhatsapp, desconectarWhatsapp, qrPendiente } from "@/lib/secretaria/whatsapp/gestor"

/**
 * El WhatsApp de la Secretaria del negocio de la sesión, conectado como
 * dispositivo vinculado (QR). Ver el estado: dueña y encargado. El QR, conectar
 * y desconectar: sólo la dueña. Sin permiso, 404.
 *
 * - GET: el estado (y el QR para escanear, a la dueña, mientras se espera).
 * - POST { aceptoLasCondiciones: true }: pide un QR nuevo. Exige aceptar que
 *   es una conexión no oficial (docs/secretaria-eli-para-clientes.md).
 * - DELETE: cierra la sesión y la borra.
 */

const NO_ENCONTRADO = () => NextResponse.json({ error: "No encontrado" }, { status: 404 })

const conectarSchema = z.object({ aceptoLasCondiciones: z.literal(true) }).strict()

async function estadoDelCanal(negocioId: string, conQr: boolean) {
  const canal = await prisma.canalDeWhatsapp.findUnique({
    where: { businessId: negocioId },
    select: { estado: true, numero: true, motivoDesconexion: true, condicionesAceptadasAt: true },
  })
  const codigo = conQr && canal?.estado === "esperando_qr" ? qrPendiente(negocioId) : null
  return {
    estado: canal?.estado ?? "desconectado",
    numero: canal?.numero ?? null,
    motivoDesconexion: canal?.motivoDesconexion ?? null,
    condicionesAceptadas: Boolean(canal?.condicionesAceptadasAt),
    qr: codigo ? await QRCode.toDataURL(codigo, { margin: 1, width: 280 }) : null,
  }
}

export async function GET() {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor || !puedeUsarSecretaria(actor)) return NO_ENCONTRADO()
  try {
    return NextResponse.json(await estadoDelCanal(actor.businessId, puedeConfigurarSecretaria(actor)))
  } catch (error) {
    registrarError("leyendo el WhatsApp de la Secretaria", error)
    return NextResponse.json({ error: "No se pudo leer el estado de WhatsApp" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)
  if (!actor || !puedeConfigurarSecretaria(actor)) return NO_ENCONTRADO()

  const { permitido } = await verificarLimite("conexionWhatsapp", `negocio:${actor.businessId}`)
  if (!permitido) return NextResponse.json({ error: "Demasiados intentos de conexión. Espera un rato." }, { status: 429 })

  try {
    const datos = conectarSchema.safeParse(await leerJsonConTope(request))
    if (!datos.success) {
      return NextResponse.json({ error: "Para conectar tienes que aceptar las condiciones" }, { status: 400 })
    }
    const ahora = new Date()
    const quien = session?.user?.id ?? null
    await prisma.canalDeWhatsapp.upsert({
      where: { businessId: actor.businessId },
      create: {
        businessId: actor.businessId,
        estado: "esperando_qr",
        condicionesAceptadasAt: ahora,
        condicionesAceptadasPor: quien,
      },
      update: { condicionesAceptadasAt: ahora, condicionesAceptadasPor: quien, motivoDesconexion: null },
    })
    // Ya conectado no se pide otro QR; si no, queda esperando que lo escanee.
    await prisma.canalDeWhatsapp.updateMany({
      where: { businessId: actor.businessId, estado: "desconectado" },
      data: { estado: "esperando_qr" },
    })
    await conectarWhatsapp(actor.businessId)
    return NextResponse.json(await estadoDelCanal(actor.businessId, true))
  } catch (error) {
    if (error instanceof CuerpoDemasiadoGrande) return respuestaDeCuerpoDemasiadoGrande()
    registrarError("conectando el WhatsApp de la Secretaria", error)
    return NextResponse.json({ error: "No se pudo empezar la conexión. Intenta de nuevo." }, { status: 500 })
  }
}

export async function DELETE() {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor || !puedeConfigurarSecretaria(actor)) return NO_ENCONTRADO()
  try {
    await desconectarWhatsapp(actor.businessId)
    return NextResponse.json(await estadoDelCanal(actor.businessId, true))
  } catch (error) {
    registrarError("desconectando el WhatsApp de la Secretaria", error)
    return NextResponse.json({ error: "No se pudo desconectar. Intenta de nuevo." }, { status: 500 })
  }
}
