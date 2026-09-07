import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { actorDeSesion, mismoNegocio, puedeEditarHorarioDe, type Actor, type Miembro } from "@/lib/permisos"

type Objetivo = { ok: true; miembro: Miembro | null } | { ok: false; status: 404 | 401 }

/**
 * Resuelve sobre el horario de quién se está operando.
 *
 * Sin `memberId` en la URL: el horario propio. El dueño no es miembro (su
 * horario es el general del negocio, clave `null`); encargado y profesional
 * tienen memberId propio.
 *
 * Con `memberId`: se busca el miembro real en la base (nunca se confía en el
 * id suelto) y se pregunta a `puedeEditarHorarioDe`. Inexistente o de otro
 * negocio da la misma respuesta (404): no se confirma ni se niega nada de un
 * negocio ajeno. Mismo negocio pero sin permiso (un worker pidiendo el de
 * otro) da 401, igual que el resto de los endpoints de permisos.
 */
async function resolverObjetivo(actor: Actor, paramMemberId: string | null): Promise<Objetivo> {
  if (!paramMemberId) {
    const propio: Miembro | null = actor.memberId
      ? { id: actor.memberId, businessId: actor.businessId }
      : null

    // `null` acá no es "nadie": es el horario general del negocio, el que
    // alimenta la reserva pública. Un profesional sin `memberId` caía en ese
    // caso y lo reescribía sin que nadie preguntara si podía.
    if (!puedeEditarHorarioDe(actor, propio)) return { ok: false, status: 401 }

    return { ok: true, miembro: propio }
  }

  const miembro = await prisma.businessMember.findUnique({
    where: { id: paramMemberId },
    select: { id: true, businessId: true },
  })

  if (!miembro || !mismoNegocio(actor, miembro.businessId)) {
    return { ok: false, status: 404 }
  }

  if (!puedeEditarHorarioDe(actor, miembro)) {
    return { ok: false, status: 401 }
  }

  return { ok: true, miembro }
}

function errorDeObjetivo(status: 404 | 401) {
  const mensaje = status === 404 ? "Miembro no encontrado" : "No autorizado"
  return NextResponse.json({ error: mensaje }, { status })
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)
  if (!actor) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const paramMemberId = request.nextUrl.searchParams.get("memberId")
  const objetivo = await resolverObjetivo(actor, paramMemberId)
  if (!objetivo.ok) return errorDeObjetivo(objetivo.status)

  const memberId = objetivo.miembro?.id ?? null

  const horarios = await prisma.workSchedule.findMany({
    where: { businessId: actor.businessId, memberId },
    orderBy: { dayOfWeek: "asc" },
  })

  return NextResponse.json(horarios)
}

function horaEnMinutos(hhmm: string): number {
  const [horas, minutos] = hhmm.split(":").map(Number)
  return horas * 60 + minutos
}

const horarioSchema = z.array(
  z.object({
    dayOfWeek: z.number().min(0).max(6),
    startTime: z.string().regex(/^\d{2}:\d{2}$/),
    endTime: z.string().regex(/^\d{2}:\d{2}$/),
    active: z.boolean(),
  })
  // Sin esto, un horario invertido (ej. "22:00"–"02:00") entraba sin fricción
  // y después no había forma honesta de calcular tiempo libre sobre él
  // (lib/horario-dia.ts lo trata como "no se puede calcular", nunca como 0).
  .refine((h) => horaEnMinutos(h.startTime) < horaEnMinutos(h.endTime), {
    message: "La hora de inicio debe ser anterior a la hora de fin",
    path: ["endTime"],
  })
)

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)
  if (!actor) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const paramMemberId = request.nextUrl.searchParams.get("memberId")
  const objetivo = await resolverObjetivo(actor, paramMemberId)
  if (!objetivo.ok) return errorDeObjetivo(objetivo.status)

  const memberId = objetivo.miembro?.id ?? null

  try {
    const body = await request.json()
    const horarios = horarioSchema.parse(body)
    const businessId = actor.businessId

    await prisma.$transaction([
      prisma.workSchedule.deleteMany({ where: { businessId, memberId } }),
      prisma.workSchedule.createMany({
        data: horarios.map((h) => ({ ...h, businessId, memberId })),
      }),
    ])

    const resultado = await prisma.workSchedule.findMany({
      where: { businessId, memberId },
      orderBy: { dayOfWeek: "asc" },
    })

    return NextResponse.json(resultado)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", detalles: error.errors }, { status: 400 })
    }
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}
