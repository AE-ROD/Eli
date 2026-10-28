import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { respuestaDeDatosInvalidos } from "@/lib/respuesta-de-validacion"
import { cuerpoConTope, respuestaDeCuerpoDemasiadoGrande } from "@/lib/cuerpo-del-pedido"
import { actorDeSesion, puedeGestionarBloqueoDe, whereDeBloqueos, type Miembro } from "@/lib/permisos"
import { esFechaCalendario, rangoDelDiaEn, zonaDelNegocio } from "@/lib/zona-horaria"

/**
 * Bloqueos de horario (`TimeBlock`): un tramo en que un profesional, o todo
 * el negocio, no atiende (almuerzo, trámite, feriado). En la agenda se ven
 * como franjas grises; al crear o mover una cita encima, el panel lo advierte
 * (`lib/advertencias-de-agenda.ts`).
 *
 * El límite de peticiones lo pone `proxy.ts` (el genérico del panel, por
 * sesión). Quién ve qué: `whereDeBloqueos`; quién crea o borra:
 * `puedeGestionarBloqueoDe` (`lib/permisos.ts`).
 */

/** Un bloqueo no dura más de un año: más es un error de fecha, no un cierre. */
const DURACION_MAXIMA_MS = 366 * 24 * 60 * 60 * 1000

const bloqueoSchema = z
  .object({
    /** De quién es: un profesional del negocio, o `null` para todo el negocio. */
    memberId: z.string().min(1).nullable(),
    startTime: z.string().datetime("La fecha de inicio no es válida"),
    endTime: z.string().datetime("La fecha de fin no es válida"),
    motivo: z.string().trim().max(120, "El motivo no puede tener más de 120 caracteres").optional(),
  })
  .refine((datos) => new Date(datos.endTime).getTime() > new Date(datos.startTime).getTime(), {
    message: "El bloqueo tiene que terminar después de empezar",
    path: ["endTime"],
  })
  .refine((datos) => new Date(datos.endTime).getTime() - new Date(datos.startTime).getTime() <= DURACION_MAXIMA_MS, {
    message: "Un bloqueo no puede durar más de un año",
    path: ["endTime"],
  })

const SELECCION_DE_BLOQUEO = {
  id: true,
  memberId: true,
  startTime: true,
  endTime: true,
  motivo: true,
  member: { select: { user: { select: { name: true } } } },
} as const

/**
 * Los bloqueos que se pisan con los días `desde`..`hasta` ("AAAA-MM-DD", en
 * la zona del negocio), como la agenda pide sus citas.
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)
  if (!actor) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const desde = searchParams.get("desde")
  const hasta = searchParams.get("hasta")
  if (!desde || !hasta || !esFechaCalendario(desde) || !esFechaCalendario(hasta)) {
    return NextResponse.json(
      { error: "Faltan las fechas: desde y hasta tienen que ser días reales, con el formato AAAA-MM-DD" },
      { status: 400 }
    )
  }

  const negocio = await prisma.business.findUnique({ where: { id: actor.businessId }, select: { timezone: true } })
  const zona = zonaDelNegocio(negocio?.timezone)
  const inicio = rangoDelDiaEn(desde, zona).desde
  const fin = rangoDelDiaEn(hasta, zona).hasta

  const bloqueos = await prisma.timeBlock.findMany({
    where: whereDeBloqueos(actor, { startTime: { lt: fin }, endTime: { gt: inicio } }),
    select: SELECCION_DE_BLOQUEO,
    orderBy: { startTime: "asc" },
    take: 500,
  })

  return NextResponse.json(bloqueos)
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)
  if (!actor) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  // Un JSON roto llega como `undefined` y zod lo rechaza con un 400.
  const recibido = await cuerpoConTope(request)
  if (recibido.excedido) return respuestaDeCuerpoDemasiadoGrande()
  const validado = bloqueoSchema.safeParse(recibido.cuerpo)
  if (!validado.success) return respuestaDeDatosInvalidos(validado.error)
  const datos = validado.data

  // El miembro se lee de la base, nunca se confía en el id suelto: de otro
  // negocio o inexistente es lo mismo, 404.
  let miembro: Miembro | null = null
  if (datos.memberId) {
    miembro = await prisma.businessMember.findFirst({
      where: { id: datos.memberId, businessId: actor.businessId },
      select: { id: true, businessId: true },
    })
    if (!miembro) {
      return NextResponse.json({ error: "Miembro no encontrado" }, { status: 404 })
    }
  }

  // Mismo negocio pero sin permiso (un profesional bloqueando a un colega o a
  // todo el negocio): 401, como los horarios.
  if (!puedeGestionarBloqueoDe(actor, miembro)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const bloqueo = await prisma.timeBlock.create({
    data: {
      businessId: actor.businessId,
      memberId: miembro?.id ?? null,
      startTime: new Date(datos.startTime),
      endTime: new Date(datos.endTime),
      motivo: datos.motivo || null,
      createdById: session?.user?.id || null,
    },
    select: SELECCION_DE_BLOQUEO,
  })

  return NextResponse.json(bloqueo, { status: 201 })
}
