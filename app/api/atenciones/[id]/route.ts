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
 * Después de escribir, las líneas que ve quien edita tienen que seguir dentro
 * de los topes de servicios y de total; si no, 400 y la transacción se
 * deshace. Para dueño y encargado es la atención entera; para el profesional,
 * sus líneas: si contaran las de sus colegas, el 400 le diría cuánto suman
 * (`lineasDeLaAtencion`).
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
 * - La atención tiene que verse (`whereDeAtenciones`); si no, 404 como si no
 *   existiera.
 * - Sólo una que nació de una reserva, está en espera y nunca empezó
 *   (`sePuedeDeshacerLaLlegada`); si no, 409. Lo que empezó o se cobró no se
 *   borra: se anula, y queda en el historial.
 * - Y la reserva tiene que ser de quien deshace (`puedeDeshacerLlegada`):
 *   dueño y encargado, cualquiera del negocio; el profesional, sólo una suya.
 *   Ver la atención no alcanza: el profesional ve la de la cita de una colega
 *   si tiene una línea en ella, y borrarla se llevaría las líneas de la
 *   colega y le cambiaría la cita. Si no puede, 404 sin escribir nada.
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

  try {
    if (!sePuedeDeshacerLaLlegada(existente)) {
      throw new ErrorDeAtencion(
        409,
        "Sólo se deshace la llegada de una reserva que todavía no empezó a atenderse; lo demás se anula."
      )
    }
    const citaId = existente.appointmentId

    // La reserva de origen, del negocio: decide si quien pide puede deshacerla.
    const cita = await prisma.appointment.findFirst({
      where: { id: citaId, businessId: actor.businessId },
      select: { businessId: true, memberId: true },
    })
    if (!cita || !puedeDeshacerLlegada(actor, cita)) {
      return NextResponse.json({ error: "Atención no encontrada" }, { status: 404 })
    }

    await prisma.$transaction(async (tx) => {
      // Primero se toma la fila, sólo si sigue en espera y nunca empezó: si
      // entretanto alguien la empezó, aunque después la haya vuelto a espera,
      // no matchea, 409, y no se borra nada.
      await tomarAtencion(tx, actor, existente.id, "en-espera", { status: "en-espera" }, { startedAt: null })

      // La base borra las líneas en cascada; se borran a la vista igual, para
      // no depender de eso al leer este endpoint.
      await tx.visitService.deleteMany({
        where: { visitId: existente.id, visit: { is: { businessId: actor.businessId } } },
      })
      await tx.visit.deleteMany({ where: { id: existente.id, businessId: actor.businessId, status: "en-espera" } })

      // La cita vuelve a ser una reserva que no llegó. Si figura "en
      // progreso" (alguien la marcó así en la agenda), en "Reservas de hoy" se
      // leería como alguien atendiéndose: vuelve a "confirmada" (la reserva
      // era real y el cliente vino). Por el tablero ya no llega a quedar así:
      // una atención que empezó no se deshace. Pendiente y confirmada quedan
      // como están; cancelada o completada son decisiones tomadas a mano en la
      // agenda y no se pisan.
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
