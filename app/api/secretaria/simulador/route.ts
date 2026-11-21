import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { actorDeSesion, puedeUsarSecretaria } from "@/lib/permisos"
import { verificarLimite } from "@/lib/rate-limit"
import { registrarError } from "@/lib/registro-de-errores"
import { aE164Chile } from "@/lib/telefono"
import { CuerpoDemasiadoGrande, leerJsonConTope, respuestaDeCuerpoDemasiadoGrande } from "@/lib/cuerpo-del-pedido"
import { LARGO_MAXIMO_DEL_MENSAJE } from "@/lib/secretaria/config"
import { guardarMensajeEntrante, responder } from "@/lib/secretaria/agente"

/**
 * El simulador de la Secretaria en el panel: chatear con el agente del negocio
 * de la sesión sin pasar por WhatsApp. Usa el mismo servicio que los mensajes de WhatsApp
 * (`lib/secretaria/agente.ts`), así que las reservas que cree quedan en la
 * agenda de verdad. El número es el de una clienta de prueba que se elige en
 * la pantalla; la conversación queda marcada como simulación.
 */

const telefonoSchema = z
  .string()
  .max(32)
  .transform((texto, ctx) => {
    const e164 = aE164Chile(texto)
    if (!e164) ctx.addIssue({ code: "custom", message: "El teléfono no es válido" })
    return e164 ?? ""
  })

const mensajeSchema = z.object({
  telefono: telefonoSchema,
  mensaje: z.string().trim().min(1, "Escribe un mensaje").max(LARGO_MAXIMO_DEL_MENSAJE),
})

const NO_ENCONTRADO = NextResponse.json({ error: "No encontrado" }, { status: 404 })

export async function POST(request: NextRequest) {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor || !puedeUsarSecretaria(actor)) return NO_ENCONTRADO.clone()

  // Cada mensaje es una llamada pagada al modelo: tope propio, además del del panel.
  const { permitido } = await verificarLimite("simuladorSecretaria", `negocio:${actor.businessId}`)
  if (!permitido) return NextResponse.json({ error: "Demasiados mensajes de prueba. Espera un rato." }, { status: 429 })

  try {
    const datos = mensajeSchema.parse(await leerJsonConTope(request))
    const ahora = new Date()
    const guardado = await guardarMensajeEntrante({
      negocioId: actor.businessId,
      canalId: null,
      telefono: datos.telefono,
      simulacion: true,
      texto: datos.mensaje,
      ahora,
    })
    if (guardado.duplicado) return NextResponse.json({ respuestas: [], estado: "bot", derivada: false })
    const respuesta = await responder(actor.businessId, guardado.conversacionId, ahora)
    return NextResponse.json(respuesta)
  } catch (error) {
    if (error instanceof CuerpoDemasiadoGrande) return respuestaDeCuerpoDemasiadoGrande()
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0]?.message ?? "Datos inválidos" }, { status: 400 })
    }
    if (error instanceof SyntaxError) return NextResponse.json({ error: "El pedido no es un JSON válido" }, { status: 400 })
    registrarError("simulando la Secretaria", error)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}

/** Empieza de nuevo la conversación de prueba de ese número (las reservas y la clienta quedan). */
export async function DELETE(request: NextRequest) {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor || !puedeUsarSecretaria(actor)) return NO_ENCONTRADO.clone()
  const leido = telefonoSchema.safeParse(new URL(request.url).searchParams.get("telefono") ?? "")
  if (!leido.success) return NextResponse.json({ error: "El teléfono no es válido" }, { status: 400 })
  await prisma.conversacionDeSecretaria.deleteMany({
    where: { businessId: actor.businessId, telefono: leido.data, simulacion: true },
  })
  return NextResponse.json({ ok: true })
}
