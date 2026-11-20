import { NextRequest, NextResponse } from "next/server"
import { MENSAJE_DATOS_INVALIDOS, MENSAJE_DEMASIADAS_SOLICITUDES, MENSAJE_DEMASIADO_LARGO, MENSAJE_ERROR_INTERNO } from "@/app/api/reservar/_mensajes"
import { cuerpoConTope } from "@/lib/cuerpo-del-pedido"
import { enviarTurnoEnLaFila } from "@/lib/email"
import { enlaceDelTurno, primerNombre } from "@/lib/fila-virtual"
import { anotarseEnLaFila, negocioDeLaFila } from "@/lib/fila-virtual-servidor"
import { prisma } from "@/lib/prisma"
import { devolverLimite, obtenerIp, verificarLimite } from "@/lib/rate-limit"
import { registrarError } from "@/lib/registro-de-errores"
import { urlBase } from "@/lib/url-base"
import { hayVariasSedes, leerSedesDeLaReserva } from "@/lib/sede-de-la-reserva"
import { filaVirtualSchema } from "@/lib/validaciones"

/**
 * POST /api/reservar/[slug]/fila — anotarse en la fila virtual del negocio
 * (#85). Público y sin sesión, fuera del límite del panel (`proxy.ts`).
 *
 * - Límites que fallan cerrado, los dos con 429: `filaVirtual` por IP, que
 *   se descuenta en cada intento, y `filaVirtualPorNegocio` por negocio, que
 *   cuenta SÓLO a quien quedó anotado: se descuenta antes de anotar, en un
 *   paso atómico (dos pedidos a la vez no pasan los dos con el último cupo),
 *   y se devuelve (`devolverLimite`) si no quedó anotada. Si cada rechazo
 *   (local cerrado, fila llena) lo gastara, unas pocas IPs lo agotarían y
 *   dejarían a la gente real sin poder anotarse una hora.
 * - Negocio inexistente o con la fila apagada: el mismo 404, sin decir cuál.
 *   Lo mismo con dos o más sedes activas (plan Independiente): la fila mira el
 *   "abierto ahora" del negocio sin sede, que con varias sedes no dice dónde
 *   está la persona, así que se comporta como apagada.
 * - Local cerrado en este momento, o fila llena (tope del negocio): 409 con
 *   el motivo, que la persona puede leer en el local.
 * - Al anotarse: 201 con el número de turno y el enlace a su turno
 *   (`/fila/[slug]/[token]`). El token viaja sólo acá y, si dejó su correo, en
 *   el correo "Tu lugar en la fila" (`enviarTurnoEnLaFila`); la base guarda su
 *   hash. Ese correo sale una vez por anotarse, así que lo acotan los mismos
 *   dos límites de arriba.
 */

const NO_ENCONTRADO = () => NextResponse.json({ error: "No encontrado" }, { status: 404 })
const DEMASIADAS = () => NextResponse.json({ error: MENSAJE_DEMASIADAS_SOLICITUDES }, { status: 429 })

const MENSAJE_CERRADO = "El local no está atendiendo en este momento. La fila se abre en su horario de atención."
const MENSAJE_LLENA = "La fila está llena por ahora. Intenta de nuevo en un rato."

/** Un nombre y un correo no pasan de esto. */
const MAX_BYTES = 2048

export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const porIp = await verificarLimite("filaVirtual", obtenerIp(request))
  if (!porIp.permitido) return DEMASIADAS()

  const { slug } = await params
  const leido = await cuerpoConTope(request, MAX_BYTES)
  if (leido.excedido) return NextResponse.json({ error: MENSAJE_DEMASIADO_LARGO }, { status: 413 })
  const datos = filaVirtualSchema.safeParse(leido.cuerpo)
  if (!datos.success) {
    return NextResponse.json({ error: datos.error.issues[0]?.message ?? MENSAJE_DATOS_INVALIDOS }, { status: 400 })
  }

  const ahora = new Date()
  const negocio = await negocioDeLaFila(slug, ahora)
  if (!negocio?.filaVirtualActiva) return NO_ENCONTRADO()
  // Con varias sedes la fila se comporta como apagada: el mismo 404, sin gastar cupo.
  if (hayVariasSedes(await leerSedesDeLaReserva(prisma, negocio.id))) return NO_ENCONTRADO()

  const porNegocio = await verificarLimite("filaVirtualPorNegocio", negocio.id)
  if (!porNegocio.permitido) return DEMASIADAS()

  let anotada = false
  try {
    const resultado = await anotarseEnLaFila(negocio, datos.data, ahora)
    anotada = resultado.tipo === "anotada"
    switch (resultado.tipo) {
      case "cerrada":
        return NextResponse.json({ error: MENSAJE_CERRADO }, { status: 409 })
      case "llena":
        return NextResponse.json({ error: MENSAJE_LLENA }, { status: 409 })
      case "anotada":
        if (datos.data.email) {
          await mandarCorreoDelTurno({
            negocio,
            email: datos.data.email,
            nombre: datos.data.nombre,
            numero: resultado.numero,
            ruta: enlaceDelTurno(negocio.slug, resultado.token),
          })
        }
        return NextResponse.json(
          {
            numero: resultado.numero,
            enlace: enlaceDelTurno(negocio.slug, resultado.token),
          },
          { status: 201 }
        )
    }
  } catch (error) {
    registrarError("anotando en la fila virtual", error)
    return NextResponse.json({ error: MENSAJE_ERROR_INTERNO }, { status: 500 })
  } finally {
    // Cerrada, llena o un error: no quedó anotada, el cupo vuelve al balde.
    if (!anotada) await devolverLimite("filaVirtualPorNegocio", negocio.id)
  }
}

/**
 * El correo "Tu lugar en la fila", con el enlace completo a su turno. Nunca
 * lanza: la persona ya quedó anotada y la respuesta le muestra el enlace
 * igual. Sin `NEXTAUTH_URL` en producción (`urlBase` lanza) no hay enlace que
 * mandar: se registra y no se manda. Del negocio se lee sólo su WhatsApp
 * público, por su id.
 */
async function mandarCorreoDelTurno({
  negocio,
  email,
  nombre,
  numero,
  ruta,
}: {
  negocio: { id: string; name: string; type: string }
  email: string
  nombre: string
  numero: number
  ruta: string
}): Promise<void> {
  try {
    const enlaceTurno = `${urlBase()}${ruta}`
    const contacto = await prisma.business.findUnique({ where: { id: negocio.id }, select: { whatsapp: true } })
    const resultado = await enviarTurnoEnLaFila({
      rubro: negocio.type,
      emailCliente: email,
      // Sólo el primer nombre, como el aviso "Ya casi es tu turno": lo escribió un anónimo.
      nombreCliente: primerNombre(nombre),
      nombreNegocio: negocio.name,
      numero,
      enlaceTurno,
      whatsapp: contacto?.whatsapp ?? null,
    })
    // Sólo el código de Resend: su mensaje puede repetir el destinatario.
    if (resultado?.error) console.error("Error enviando el correo del turno en la fila:", { name: resultado.error.name })
  } catch (error) {
    registrarError("enviando el correo del turno en la fila", error)
  }
}
