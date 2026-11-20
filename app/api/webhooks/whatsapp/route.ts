import { after, NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { obtenerIp, verificarLimite } from "@/lib/rate-limit"
import { registrarError } from "@/lib/registro-de-errores"
import { leerBytesConTope, respuestaDeCuerpoDemasiadoGrande } from "@/lib/cuerpo-del-pedido"
import { firmaValida, mensajesDelPayload, respuestaDeVerificacion } from "@/lib/secretaria/whatsapp"
import { guardarMensajeEntrante, responder } from "@/lib/secretaria/agente"

/**
 * Webhook de WhatsApp Cloud API (Meta). Sin sesión: lo que lo protege es la
 * firma `X-Hub-Signature-256` con `WHATSAPP_APP_SECRET`, más un límite por IP.
 *
 * - GET: la verificación que hace Meta al registrar el webhook.
 * - POST: los mensajes entrantes. Se guardan (idempotente por el id del
 *   mensaje de WhatsApp) y se responde 200 enseguida; la Secretaria contesta
 *   después (`after`), para que Meta no reintente por demora.
 *
 * El negocio de cada mensaje sale del `phone_number_id` del canal registrado,
 * nunca del contenido del mensaje.
 */

/** Los payloads de Meta son chicos: con 256 KB sobra. */
const TOPE_DEL_PAYLOAD = 256 * 1024

export async function GET(request: NextRequest) {
  const { permitido } = await verificarLimite("webhookWhatsapp", obtenerIp(request))
  if (!permitido) return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 })
  const desafio = respuestaDeVerificacion(new URL(request.url).searchParams)
  if (desafio === null) return NextResponse.json({ error: "No autorizado" }, { status: 403 })
  return new NextResponse(desafio, { status: 200, headers: { "Content-Type": "text/plain" } })
}

export async function POST(request: NextRequest) {
  const { permitido } = await verificarLimite("webhookWhatsapp", obtenerIp(request))
  if (!permitido) return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 })

  let leido
  try {
    leido = await leerBytesConTope(request, TOPE_DEL_PAYLOAD)
  } catch {
    return NextResponse.json({ error: "No se pudo leer el pedido" }, { status: 400 })
  }
  if (leido.excedido) return respuestaDeCuerpoDemasiadoGrande()
  if (!firmaValida(leido.bytes, request.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ error: "Firma inválida" }, { status: 401 })
  }

  let cuerpo: unknown
  try {
    cuerpo = JSON.parse(new TextDecoder().decode(leido.bytes))
  } catch {
    return NextResponse.json({ error: "El pedido no es un JSON válido" }, { status: 400 })
  }

  const ahora = new Date()
  const porResponder: { negocioId: string; conversacionId: string }[] = []
  try {
    for (const mensaje of mensajesDelPayload(cuerpo)) {
      const canal = await prisma.canalDeWhatsapp.findUnique({
        where: { phoneNumberId: mensaje.phoneNumberId },
        select: { id: true, businessId: true, activo: true },
      })
      // Un número que no es de ningún negocio (o está desactivado) se ignora sin decir nada.
      if (!canal?.activo) continue
      const guardado = await guardarMensajeEntrante({
        negocioId: canal.businessId,
        canalId: canal.id,
        telefono: mensaje.telefono,
        simulacion: false,
        texto: mensaje.texto,
        waMessageId: mensaje.waMessageId,
        ahora,
      })
      if (guardado.duplicado) continue
      const pendiente = { negocioId: canal.businessId, conversacionId: guardado.conversacionId }
      if (!porResponder.some((otro) => otro.conversacionId === pendiente.conversacionId)) porResponder.push(pendiente)
    }
  } catch (error) {
    // Sin guardar, se responde 500 y Meta reintenta: el id del mensaje evita el doble guardado.
    registrarError("guardando un mensaje de WhatsApp", error)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }

  if (porResponder.length > 0) {
    after(async () => {
      for (const { negocioId, conversacionId } of porResponder) {
        await responder(negocioId, conversacionId, new Date()).catch((error) =>
          registrarError("respondiendo un mensaje de WhatsApp", error)
        )
      }
    })
  }

  return NextResponse.json({ ok: true })
}
