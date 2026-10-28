import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { ESTADOS_DE_CITA, MENSAJE_DE_HORARIO_INVERTIDO, notas, precioDeCita, terminaDespuesDeEmpezar, titulo } from "@/lib/campos-del-panel"
import { respuestaDeDatosInvalidos } from "@/lib/respuesta-de-validacion"
import { actorDeSesion, memberIdParaCita, whereDeAgenda, type Actor } from "@/lib/permisos"
import { MENSAJE_CITA_CERRADA, MENSAJE_CITA_CON_ATENCION, sePuedeMover } from "@/lib/mover-cita"
import { advertenciasDeAgenda } from "@/lib/advertencias-de-agenda"

const edicionDeCitaSchema = z.object({
  title: titulo().optional(),
  startTime: z.string().datetime("La fecha de inicio no es válida").optional(),
  endTime: z.string().datetime("La fecha de fin no es válida").optional(),
  status: z.enum(ESTADOS_DE_CITA).optional(),
  notes: notas().optional(),
  price: precioDeCita().optional(),
  /**
   * A qué profesional va la cita. `null` o `""` es "sin asignar". Sólo dueño y
   * encargado eligen: al profesional `memberIdParaCita` lo deja en sí mismo.
   */
  memberId: z.string().nullable().optional(),
  /** Segundo envío: quien mueve ya vio las advertencias y guarda igual. */
  confirmarAdvertencias: z.boolean().optional(),
})

/**
 * Pide un `Actor`, no `Actor | null`: sin sesión no hay cita, y el handler ya
 * cortó con 401 antes de llegar acá (misma convención que `memberIdParaCita`
 * en `lib/permisos.ts`). Así el compilador es el que obliga a poner la guarda
 * primero, en vez de convertir "no hay sesión" en un 404 silencioso.
 */
async function verificarCita(actor: Actor, id: string) {
  return prisma.appointment.findFirst({ where: whereDeAgenda(actor, { id }) })
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)
  if (!actor) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const { id } = await params
  const cita = await prisma.appointment.findFirst({
    where: whereDeAgenda(actor, { id }),
    include: {
      customer: { select: { id: true, name: true, email: true, phone: true } },
    },
  })

  if (!cita) {
    return NextResponse.json({ error: "Cita no encontrada" }, { status: 404 })
  }

  return NextResponse.json(cita)
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)
  if (!actor) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const { id } = await params
  const existente = await verificarCita(actor, id)
  if (!existente) {
    return NextResponse.json({ error: "Cita no encontrada" }, { status: 404 })
  }

  try {
    const cuerpo = await request.json()
    const datos = edicionDeCitaSchema.parse(cuerpo)

    // Se compara lo que queda después del cambio: si se mueve sólo el inicio
    // o sólo el fin, contra lo guardado. Antes una cita podía quedar
    // terminando antes de empezar.
    const inicio = datos.startTime ? new Date(datos.startTime) : existente.startTime
    const fin = datos.endTime ? new Date(datos.endTime) : existente.endTime
    if (datos.startTime || datos.endTime) {
      if (!terminaDespuesDeEmpezar(inicio, fin)) {
        return NextResponse.json({ error: MENSAJE_DE_HORARIO_INVERTIDO }, { status: 400 })
      }
    }

    // El profesional no reasigna: `memberIdParaCita` lo deja en sí mismo, y
    // como sólo llega a sus propias citas, para él no cambia nada. `|| null`:
    // el string vacío es "sin asignar", como al crear.
    const memberId =
      datos.memberId !== undefined ? memberIdParaCita(actor, datos.memberId || null) : existente.memberId

    if (memberId && memberId !== existente.memberId) {
      const miembro = await prisma.businessMember.findFirst({
        where: { id: memberId, businessId: actor.businessId },
        select: { id: true },
      })
      if (!miembro) {
        return NextResponse.json({ error: "Miembro no encontrado" }, { status: 404 })
      }
    }

    // Sólo cuenta como mover si se pidió cambiar el horario o el profesional y
    // algo de eso es distinto de lo guardado: un cambio de estado no se mueve.
    const pideMover = datos.startTime !== undefined || datos.endTime !== undefined || datos.memberId !== undefined
    const seMueve =
      pideMover &&
      (inicio.getTime() !== existente.startTime.getTime() ||
      fin.getTime() !== existente.endTime.getTime() ||
      memberId !== existente.memberId)

    if (seMueve) {
      if (!sePuedeMover(existente.status)) {
        return NextResponse.json({ error: MENSAJE_CITA_CERRADA }, { status: 409 })
      }

      // Una cita cuyo cliente ya llegó vive en el Tablero: moverla dejaría la
      // atención colgada de un horario que no es el suyo. Una atención anulada
      // ya no cuenta.
      const atencion = await prisma.visit.findFirst({
        where: { appointmentId: existente.id, businessId: actor.businessId, status: { not: "anulada" } },
        select: { id: true },
      })
      if (atencion) {
        return NextResponse.json({ error: MENSAJE_CITA_CON_ATENCION }, { status: 409 })
      }

      if (!datos.confirmarAdvertencias) {
        const advertencias = await advertenciasDeAgenda(prisma, {
          businessId: actor.businessId,
          citaId: existente.id,
          tramo: { startTime: inicio, endTime: fin },
          memberId,
        })
        if (advertencias.length > 0) {
          return NextResponse.json(
            { error: advertencias.map((advertencia) => advertencia.mensaje).join(" "), advertencias },
            { status: 409 }
          )
        }
      }
    }

    // Por `existente.id`, no por `id`: si alguien borra la verificación de
    // arriba, `existente` queda sin declarar y el build falla. La garantía deja
    // de depender de que el próximo lea las dos líneas en orden.
    const cita = await prisma.appointment.update({
      where: { id: existente.id },
      data: {
        ...(datos.title && { title: datos.title }),
        ...(datos.startTime && { startTime: new Date(datos.startTime) }),
        ...(datos.endTime && { endTime: new Date(datos.endTime) }),
        ...(memberId !== existente.memberId && { memberId }),
        ...(datos.status && { status: datos.status }),
        ...(datos.notes !== undefined && { notes: datos.notes || null }),
        ...(datos.price !== undefined && { price: datos.price }),
      },
      include: {
        customer: { select: { id: true, name: true, email: true, phone: true } },
      },
    })

    return NextResponse.json(cita)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return respuestaDeDatosInvalidos(error)
    }
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)
  if (!actor) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const { id } = await params
  const existente = await verificarCita(actor, id)
  if (!existente) {
    return NextResponse.json({ error: "Cita no encontrada" }, { status: 404 })
  }

  await prisma.appointment.delete({ where: { id: existente.id } })

  return NextResponse.json({ mensaje: "Cita eliminada" })
}
