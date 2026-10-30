import { NextRequest, NextResponse } from "next/server"
import { cuerpoConTope } from "@/lib/cuerpo-del-pedido"
import { anotarseEnLaFila, negocioDeLaFila } from "@/lib/fila-virtual-servidor"
import { obtenerIp, quedaLimite, verificarLimite } from "@/lib/rate-limit"
import { registrarError } from "@/lib/registro-de-errores"
import { filaVirtualSchema } from "@/lib/validaciones"

/**
 * POST /api/reservar/[slug]/fila — anotarse en la fila virtual del negocio
 * (#85). Público y sin sesión, fuera del límite del panel (`proxy.ts`).
 *
 * - Límites que fallan cerrado, los dos con 429: `filaVirtual` por IP, que
 *   se descuenta en cada intento, y `filaVirtualPorNegocio` por negocio, que
 *   se descuenta SÓLO cuando la persona quedó anotada: antes sólo se
 *   pregunta si queda cupo (`quedaLimite`). Si cada rechazo (local cerrado,
 *   fila llena) lo gastara, unas pocas IPs lo agotarían y dejarían a la
 *   gente real sin poder anotarse una hora.
 * - Negocio inexistente o con la fila apagada: el mismo 404, sin decir cuál.
 * - Local cerrado en este momento, o fila llena (tope del negocio): 409 con
 *   el motivo, que la persona puede leer en el local.
 * - Al anotarse: 201 con el número de turno y el enlace a su turno
 *   (`/fila/[slug]/[token]`). El token viaja sólo acá; la base guarda su hash.
 */

const NO_ENCONTRADO = () => NextResponse.json({ error: "No encontrado" }, { status: 404 })
const DEMASIADAS = () => NextResponse.json({ error: "Demasiadas solicitudes, intenta más tarde" }, { status: 429 })

const MENSAJE_CERRADO = "El local no está atendiendo en este momento. La fila se abre en su horario de atención."
const MENSAJE_LLENA = "La fila está llena por ahora. Intenta de nuevo en un rato."

/** Un nombre y un correo no pasan de esto. */
const MAX_BYTES = 2048

export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const porIp = await verificarLimite("filaVirtual", obtenerIp(request))
  if (!porIp.permitido) return DEMASIADAS()

  const { slug } = await params
  const leido = await cuerpoConTope(request, MAX_BYTES)
  if (leido.excedido) return NextResponse.json({ error: "Datos inválidos" }, { status: 413 })
  const datos = filaVirtualSchema.safeParse(leido.cuerpo)
  if (!datos.success) {
    return NextResponse.json({ error: datos.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 })
  }

  const negocio = await negocioDeLaFila(slug)
  if (!negocio?.filaVirtualActiva) return NO_ENCONTRADO()

  const porNegocio = await quedaLimite("filaVirtualPorNegocio", negocio.id)
  if (!porNegocio.permitido) return DEMASIADAS()

  try {
    const resultado = await anotarseEnLaFila(negocio, datos.data)
    switch (resultado.tipo) {
      case "cerrada":
        return NextResponse.json({ error: MENSAJE_CERRADO }, { status: 409 })
      case "llena":
        return NextResponse.json({ error: MENSAJE_LLENA }, { status: 409 })
      case "anotada":
        // Ya quedó anotada: recién ahora cuenta para el balde del negocio.
        await verificarLimite("filaVirtualPorNegocio", negocio.id)
        return NextResponse.json(
          {
            numero: resultado.numero,
            enlace: `/fila/${encodeURIComponent(negocio.slug)}/${resultado.token}`,
          },
          { status: 201 }
        )
    }
  } catch (error) {
    registrarError("anotando en la fila virtual", error)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}
