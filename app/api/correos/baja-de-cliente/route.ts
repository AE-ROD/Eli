import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { obtenerIp, verificarLimite } from "@/lib/rate-limit"
import { cuerpoConTope } from "@/lib/cuerpo-del-pedido"
import { clienteDelTokenDeBaja } from "@/lib/baja-de-clientes"
import { clienteNoEliminado } from "@/lib/clientes-eliminados"
import { datosDeBajaPromocional } from "@/lib/envios-a-clientes"
import { registrarError } from "@/lib/registro-de-errores"

/**
 * POST /api/correos/baja-de-cliente — da de baja a un cliente de los correos
 * promocionales de su negocio ("te toca" y pedir reseña): borra su
 * consentimiento y anota cuándo se dio de baja. Los correos de sus citas
 * (confirmación, recordatorio) siguen llegando.
 *
 * El token (`lib/baja-de-clientes.ts`) llega de dos formas:
 * - En la consulta (`?token=`): la baja en un clic de Gmail y Apple (RFC
 *   8058), que manda un POST con el cuerpo fijo `List-Unsubscribe=One-Click`
 *   a la URL del encabezado `List-Unsubscribe`.
 * - En un cuerpo JSON `{ token }`: el botón de la página
 *   `/baja-de-correos/cliente/[token]`.
 *
 * Sólo POST, a propósito: los antivirus y las vistas previas abren los
 * enlaces con GET, y eso no puede dar de baja a nadie.
 *
 * Responde exactamente lo mismo con un token válido, uno inválido, uno de un
 * cliente que ya no existe o sin token: no sirve para averiguar nada.
 *
 * Público y sin sesión: su propio límite por IP (`bajaPorToken`, falla
 * cerrado), y fuera del límite genérico del panel en `proxy.ts`.
 */

const RESPUESTA = { mensaje: "Listo. No te vamos a mandar más estos correos." }

/** Un `{ token }` o el cuerpo de un clic no pasan de esto. */
const MAX_BYTES = 2048

async function tokenDelPedido(request: NextRequest): Promise<unknown> {
  const enLaConsulta = new URL(request.url).searchParams.get("token")
  if (enLaConsulta) return enLaConsulta
  const leido = await cuerpoConTope(request, MAX_BYTES)
  if (leido.excedido) return undefined
  const { cuerpo } = leido
  return typeof cuerpo === "object" && cuerpo !== null ? (cuerpo as { token?: unknown }).token : undefined
}

export async function POST(request: NextRequest) {
  const { permitido } = await verificarLimite("bajaPorToken", `baja-de-cliente:${obtenerIp(request)}`)
  if (!permitido) {
    return NextResponse.json({ error: "Demasiados intentos, intenta más tarde" }, { status: 429 })
  }

  const customerId = clienteDelTokenDeBaja(await tokenDelPedido(request))

  if (customerId) {
    try {
      // `updateMany` y no `update`: un cliente que ya no existe no lanza, y la
      // respuesta es la misma. Uno eliminado (anonimizado) no se toca.
      await prisma.customer.updateMany({
        where: { AND: [{ id: customerId }, clienteNoEliminado] },
        data: datosDeBajaPromocional(),
      })
    } catch (error) {
      registrarError("dando de baja a un cliente de los correos", error)
      return NextResponse.json({ error: "No se pudo completar, intenta de nuevo" }, { status: 500 })
    }
  }

  return NextResponse.json(RESPUESTA)
}
