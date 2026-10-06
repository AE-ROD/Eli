import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { ESTADOS_ACTIVOS, PROFESIONAL_DUEÑO } from "@/lib/atenciones"
import {
  ESTADOS_DE_RESERVA,
  anotarSinReserva,
  llegadaConReservaSchema,
  llegadaSinReservaSchema,
  registrarLlegada,
} from "@/lib/llegadas"
import { MEDIOS_DE_PAGO } from "@/lib/medios-de-pago"
import {
  actorDeSesion,
  puedeAnotarSinReserva,
  puedeAsignarLineasAOtros,
  whereDeAgenda,
  whereDeAtenciones,
  type Actor,
} from "@/lib/permisos"
import {
  cuerpoDelPedido,
  formatearAtencion,
  leerRango,
  nombreDeCliente,
  respuestaDeError,
  seleccionDeAtencion,
} from "@/lib/tablero"

/** El tablero muestra un día; con husos y cambios de hora, un día local cabe holgado en 48 h. */
const RANGO_MAXIMO_MS = 48 * 60 * 60 * 1000

// ─── GET: el tablero del día ─────────────────────────────────────────────────

/** Las reservas del día que todavía no llegaron. Que estén atrasadas lo decide la pantalla con su reloj. */
function buscarReservas(actor: Actor, desde: Date, hasta: Date) {
  return prisma.appointment.findMany({
    where: whereDeAgenda(actor, {
      startTime: { gte: desde, lt: hasta },
      status: { in: ESTADOS_DE_RESERVA },
      visit: { is: null },
    }),
    select: {
      id: true,
      title: true,
      startTime: true,
      endTime: true,
      status: true,
      serviceId: true,
      price: true,
      customer: { select: { id: true, name: true, lastName: true } },
      member: { select: { id: true, user: { select: { name: true } } } },
    },
    orderBy: { startTime: "asc" },
    take: 200,
  })
}

/**
 * Las atenciones del tablero: todas las activas, de cualquier fecha, para que
 * una que quedó abierta ayer no desaparezca sin cobrarse; y las finalizadas
 * del día, que son lo cobrado hoy.
 */
function buscarAtenciones(actor: Actor, desde: Date, hasta: Date) {
  return prisma.visit.findMany({
    where: whereDeAtenciones(actor, {
      OR: [
        { status: { in: [...ESTADOS_ACTIVOS] } },
        { status: "finalizada", paidAt: { gte: desde, lt: hasta } },
      ],
    }),
    select: seleccionDeAtencion(actor),
    orderBy: { arrivedAt: "asc" },
    take: 300,
  })
}

/**
 * A quién se le puede anotar una línea. Dueño y encargado: cualquier miembro
 * o el dueño, que no es miembro y viaja con el id `duenio`. El profesional:
 * sólo él, porque sus líneas quedan a su nombre igual.
 */
async function profesionalesAsignables(actor: Actor) {
  if (!puedeAsignarLineasAOtros(actor)) {
    if (!actor.memberId) return []
    const propio = await prisma.businessMember.findFirst({
      where: { id: actor.memberId, businessId: actor.businessId },
      select: { id: true, user: { select: { name: true } } },
    })
    return propio ? [{ id: propio.id, nombre: propio.user.name }] : []
  }

  const [miembros, negocio] = await Promise.all([
    prisma.businessMember.findMany({
      where: { businessId: actor.businessId },
      select: { id: true, user: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
      take: 100,
    }),
    prisma.business.findUnique({
      where: { id: actor.businessId },
      select: { user: { select: { name: true } } },
    }),
  ])

  return [
    ...miembros.map((miembro) => ({ id: miembro.id, nombre: miembro.user.name })),
    ...(negocio ? [{ id: PROFESIONAL_DUEÑO, nombre: negocio.user.name }] : []),
  ]
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)
  if (!actor) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const rango = leerRango(new URL(request.url).searchParams, RANGO_MAXIMO_MS, "48 horas")
  if (!rango.ok) {
    return NextResponse.json({ error: rango.error }, { status: 400 })
  }

  const [reservas, atenciones, servicios, profesionales] = await Promise.all([
    buscarReservas(actor, rango.desde, rango.hasta),
    buscarAtenciones(actor, rango.desde, rango.hasta),
    prisma.service.findMany({
      where: { businessId: actor.businessId, active: true },
      select: { id: true, name: true, price: true },
      orderBy: { name: "asc" },
      take: 200,
    }),
    profesionalesAsignables(actor),
  ])

  return NextResponse.json({
    reservas: reservas.map((cita) => ({
      id: cita.id,
      inicio: cita.startTime,
      fin: cita.endTime,
      estado: cita.status,
      titulo: cita.title,
      servicioId: cita.serviceId,
      precio: cita.price,
      cliente: cita.customer ? { id: cita.customer.id, nombre: nombreDeCliente(cita.customer) } : null,
      profesional: cita.member ? { id: cita.member.id, nombre: cita.member.user.name } : null,
    })),
    atenciones: atenciones.map((atencion) => formatearAtencion(actor, atencion)),
    catalogo: {
      servicios: servicios.map((servicio) => ({ id: servicio.id, nombre: servicio.name, precio: servicio.price })),
      profesionales,
      mediosDePago: MEDIOS_DE_PAGO,
    },
  })
}

// ─── POST: llega alguien ─────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)
  if (!actor) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const usuarioId = session?.user?.id ?? null

  try {
    const cuerpo = await cuerpoDelPedido(request)

    // Con `citaId` es una reserva que llegó; sin él, alguien sin reserva.
    if (typeof cuerpo === "object" && cuerpo !== null && "citaId" in cuerpo) {
      const { citaId } = llegadaConReservaSchema.parse(cuerpo)
      return NextResponse.json(await registrarLlegada(actor, usuarioId, citaId), { status: 201 })
    }

    if (!puedeAnotarSinReserva(actor)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }
    const datos = llegadaSinReservaSchema.parse(cuerpo)
    return NextResponse.json(await anotarSinReserva(actor, usuarioId, datos), { status: 201 })
  } catch (error) {
    return respuestaDeError(error, "registrando atención")
  }
}
