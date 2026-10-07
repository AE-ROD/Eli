import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { MAXIMO_DE_LINEAS_POR_ATENCION, esEstadoActivo, sePuedeDeshacerLaLlegada } from "@/lib/atenciones"
import { lineasPedidasSchema, resolverLineas } from "@/lib/lineas-de-atencion"
import { actorDeSesion, puedeDeshacerLlegada, whereDeLineas } from "@/lib/permisos"
import {
  ErrorDeAtencion,
  buscarAtencion,
  cuerpoDelPedido,
  leerAtencion,
  lineasDeLaAtencion,
  respuestaDeError,
  tomarAtencion,
} from "@/lib/tablero"

const edicionSchema = z
  .object({
    /** Reemplaza las líneas que el actor puede tocar: todas, o sólo las suyas si es profesional. */
    lineas: lineasPedidasSchema.optional(),
    notas: z.string().max(1000).nullable().optional(),
  })
  .refine((datos) => datos.lineas !== undefined || datos.notas !== undefined, {
    message: "No hay nada que cambiar: faltan las líneas, las notas o ambas",
  })

/**
 * Edita las líneas y las notas de una atención abierta.
 *
 * Dueño y encargado reemplazan todas las líneas. El profesional reemplaza sólo
 * las suyas: las de sus colegas quedan como estaban, y las nuevas quedan a su
 * nombre aunque pida otro (`profesionalParaLinea`). Lo cobrado no se reescribe:
 * una atención finalizada o anulada da 409.
 *
 * Después de escribir, la atención entera (con las líneas que el pedido no
 * tocó) tiene que seguir dentro de los topes de servicios y de total; si no,
 * 400 y la transacción se deshace.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
    const datos = edicionSchema.parse(await cuerpoDelPedido(request))

    if (!esEstadoActivo(existente.status)) {
      throw new ErrorDeAtencion(409, "Una atención finalizada o anulada ya no se edita.")
    }

    const atencion = await prisma.$transaction(async (tx) => {
      // Se reescribe el mismo estado a propósito: el UPDATE toma la fila y, si
      // entretanto la cobraron o la movieron, no matchea y no se edita nada.
      await tomarAtencion(tx, actor, existente.id, existente.status, {
        status: existente.status,
        ...(datos.notas !== undefined && { notes: datos.notas || null }),
      })

      if (datos.lineas !== undefined) {
        // Por `whereDeLineas`: al profesional sólo se le reemplazan las suyas.
        const reemplazables = whereDeLineas(actor, { visitId: existente.id })
        const reemplazadas = await tx.visitService.findMany({
          where: reemplazables,
          select: { serviceId: true },
          take: MAXIMO_DE_LINEAS_POR_ATENCION,
        })
        const nuevas = await resolverLineas(
          tx,
          actor,
          datos.lineas,
          reemplazadas.map((linea) => linea.serviceId)
        )
        await tx.visitService.deleteMany({ where: reemplazables })
        if (nuevas.length > 0) {
          await tx.visitService.createMany({ data: nuevas.map((linea) => ({ ...linea, visitId: existente.id })) })
        }
        await lineasDeLaAtencion(tx, actor, existente.id)
      }

      return leerAtencion(tx, actor, existente.id)
    })

    return NextResponse.json(atencion)
  } catch (error) {
    return respuestaDeError(error, "editando atención")
  }
}

/**
 * Deshace una llegada marcada por error: borra la atención y sus líneas, y la
 * reserva vuelve sola a "Reservas de hoy" (el tablero muestra las citas del
 * día sin atención).
 *
 * - Quien la ve, la borra (`whereDeAtenciones` y `puedeDeshacerLlegada`):
 *   dueño y encargado, o el profesional de esa cita o de una línea. Si no la
 *   ve, 404 como si no existiera.
 * - Sólo una atención que nació de una reserva y sigue en espera
 *   (`sePuedeDeshacerLaLlegada`); si no, 409. Lo que ya empezó o se cobró no
 *   se borra: se anula, y queda en el historial.
 */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  if (!puedeDeshacerLlegada(actor)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  try {
    if (!sePuedeDeshacerLaLlegada(existente)) {
      throw new ErrorDeAtencion(
        409,
        "Sólo se deshace la llegada de una reserva que todavía está en espera; lo demás se anula."
      )
    }
    const citaId = existente.appointmentId

    await prisma.$transaction(async (tx) => {
      // Primero se toma la fila en espera: si entretanto alguien la empezó,
      // no matchea, 409, y no se borra nada.
      await tomarAtencion(tx, actor, existente.id, "en-espera", { status: "en-espera" })

      // La base borra las líneas en cascada; se borran a la vista igual, para
      // no depender de eso al leer este endpoint.
      await tx.visitService.deleteMany({
        where: { visitId: existente.id, visit: { is: { businessId: actor.businessId } } },
      })
      await tx.visit.deleteMany({ where: { id: existente.id, businessId: actor.businessId, status: "en-espera" } })

      // La cita vuelve a ser una reserva que no llegó. Si la atención llegó a
      // empezar y volvió a espera, la cita quedó "en progreso", que en
      // "Reservas de hoy" se leería como alguien atendiéndose: vuelve a
      // "confirmada" (la reserva era real y el cliente vino). Pendiente y
      // confirmada quedan como están; cancelada o completada son decisiones
      // tomadas a mano en la agenda y no se pisan.
      await tx.appointment.updateMany({
        where: { id: citaId, businessId: actor.businessId, status: "en-progreso" },
        data: { status: "confirmada" },
      })
    })

    return NextResponse.json({ eliminada: true })
  } catch (error) {
    return respuestaDeError(error, "deshaciendo la llegada")
  }
}
