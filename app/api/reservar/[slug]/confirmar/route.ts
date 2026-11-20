import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { reservaSchema } from "@/lib/validaciones"
import { obtenerIp, verificarLimite } from "@/lib/rate-limit"
import { registrarError } from "@/lib/registro-de-errores"
import { CuerpoDemasiadoGrande, leerJsonConTope, respuestaDeCuerpoDemasiadoGrande } from "@/lib/cuerpo-del-pedido"
import { ORIGEN_RESERVA_PUBLICA } from "@/lib/reserva-publica"
import { leerSedeDelCuerpo } from "@/lib/sede-de-la-reserva"
import { SELECCION_DEL_NEGOCIO_QUE_RESERVA, confirmarReserva } from "@/lib/reserva-del-negocio"

/**
 * Confirmar una reserva desde la página pública. Las reglas (sedes, topes,
 * choque de horarios, hora valle, correos) están en `lib/reserva-del-negocio.ts`,
 * que comparte con la Secretaria Eli por WhatsApp; acá se valida el pedido y
 * se traduce el resultado a HTTP.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { permitido } = await verificarLimite("reserva", obtenerIp(request))
  if (!permitido) {
    return NextResponse.json({ error: "Demasiadas solicitudes, intenta más tarde" }, { status: 429 })
  }

  const { slug } = await params

  const negocio = await prisma.business.findUnique({
    where: { slug },
    select: SELECCION_DEL_NEGOCIO_QUE_RESERVA,
  })
  if (!negocio) return NextResponse.json({ error: "Negocio no encontrado" }, { status: 404 })

  try {
    const cuerpo = await leerJsonConTope(request)
    const datos = reservaSchema.parse(cuerpo)

    const resultado = await confirmarReserva(negocio, datos, {
      origen: ORIGEN_RESERVA_PUBLICA,
      sedePedida: leerSedeDelCuerpo(cuerpo),
    })
    if (resultado.tipo === "rechazada") {
      return NextResponse.json({ error: resultado.error }, { status: resultado.status })
    }

    // La respuesta es la misma con o sin la marca de por confirmar (#84): no
    // le dice a quien escribió el correo o el teléfono si ese contacto faltó.
    return NextResponse.json(
      {
        citaId: resultado.citaId,
        enlaceDeGestion: resultado.rutaDeGestion,
        sePuedeCambiar: resultado.sePuedeCambiar,
        recibiraRecordatorio: resultado.recibiraRecordatorio,
        profesional: resultado.profesional,
        // La sede que quedó guardada (nombre y dirección), para decirla en la confirmación.
        ...(resultado.sede && { sede: resultado.sede }),
        mensaje: "Reserva confirmada",
      },
      { status: 201 }
    )
  } catch (error) {
    if (error instanceof CuerpoDemasiadoGrande) return respuestaDeCuerpoDemasiadoGrande()
    if (error instanceof z.ZodError) {
      // Público: el primer mensaje, legible, y no los issues crudos de zod.
      return NextResponse.json({ error: error.errors[0]?.message ?? "Datos inválidos" }, { status: 400 })
    }
    // Un cuerpo que no es JSON: es un pedido mal hecho, no un error del servidor.
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "El pedido no es un JSON válido" }, { status: 400 })
    }
    // Sin volcar el error: uno de Prisma trae en `meta` los datos de quien reserva.
    registrarError("confirmando una reserva", error)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}
