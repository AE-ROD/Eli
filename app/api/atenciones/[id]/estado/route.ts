import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import {
  ESTADOS_ACTIVOS,
  esEstadoActivo,
  nombreDeEstado,
  requisitoFaltante,
  tiemposDeTransicion,
  transicionPermitida,
} from "@/lib/atenciones"
import { actorDeSesion } from "@/lib/permisos"
import {
  ErrorDeAtencion,
  buscarAtencion,
  cuerpoDelPedido,
  leerAtencion,
  lineasDeLaAtencion,
  respuestaDeError,
  tomarAtencion,
} from "@/lib/tablero"

/** `finalizada` y `anulada` tienen su propio endpoint: se llega cobrando o anulando. */
const movimientoSchema = z.object({
  estado: z.enum(ESTADOS_ACTIVOS),
})

/** La cita que todavía no empezó: la que pasa a "en progreso" cuando empieza su atención. */
const CITA_SIN_EMPEZAR = ["pendiente", "confirmada"]

/**
 * Mueve una atención entre las columnas activas del tablero, de a un paso.
 *
 * Quien la ve, la mueve: el profesional, las suyas (`whereDeAtenciones`). Una
 * transición que no existe da 409; una que existe pero a la que le falta algo
 * (un servicio, su profesional) da 400 con lo que falta.
 *
 * El tope del total se valida sólo al pasar a "Por cobrar", el paso previo a
 * cobrarla (y el cobro lo vuelve a validar). Ni al empezar ni al volver
 * atrás: una atención que se pasó del tope tiene que poder volver a "En
 * atención" para corregirla.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)
  if (!actor) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const { id } = await params
  const existente = await buscarAtencion(actor, id)
  if (!existente) {
    return NextResponse.json({ error: "Atención no encontrada" }, { status: 404 })
  }

  try {
    const { estado: destino } = movimientoSchema.parse(await cuerpoDelPedido(request))
    const desde = existente.status

    if (!esEstadoActivo(desde) || !transicionPermitida(desde, destino)) {
      throw new ErrorDeAtencion(
        409,
        `No se puede pasar de «${nombreDeEstado(desde)}» a «${nombreDeEstado(destino)}».`
      )
    }

    const atencion = await prisma.$transaction(async (tx) => {
      await tomarAtencion(tx, actor, existente.id, desde, {
        status: destino,
        ...tiemposDeTransicion(desde, destino, new Date()),
      })

      // Todo después de tomar la fila: así nadie cambia las líneas en el
      // medio. El tope de servicios, sobre la atención entera; el del total,
      // sobre las líneas que ve el actor, porque al profesional la atención
      // entera le diría cuánto suman las de los demás (`lineasDeLaAtencion`).
      // Los requisitos, sobre todas las líneas.
      const { lineas, errorDelTotalQueVe } = await lineasDeLaAtencion(tx, actor, existente.id)
      if (destino === "por-cobrar" && errorDelTotalQueVe) throw new ErrorDeAtencion(400, errorDelTotalQueVe)
      const falta = requisitoFaltante(destino, lineas)
      if (falta) throw new ErrorDeAtencion(400, falta)

      // La agenda se entera sola (PRODUCTO.md, sección 7). Sólo si la cita no
      // empezó: una cita cancelada o completada a mano en la agenda no se pisa.
      if (destino === "en-atencion" && existente.appointmentId) {
        await tx.appointment.updateMany({
          where: { id: existente.appointmentId, businessId: actor.businessId, status: { in: CITA_SIN_EMPEZAR } },
          data: { status: "en-progreso" },
        })
      }

      return leerAtencion(tx, actor, existente.id)
    })

    return NextResponse.json(atencion)
  } catch (error) {
    return respuestaDeError(error, "moviendo atención")
  }
}
