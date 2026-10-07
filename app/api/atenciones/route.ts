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
 * Topes de cada parte del tablero. Cada consulta pide uno más que su tope:
 * si llega, la respuesta lo dice con `truncado` en vez de callarlo.
 *
 * - Activas de hoy: lo que se está atendiendo. Un tope alto, muy por encima
 *   de un día de mucho trabajo, para que ninguna quede afuera.
 * - Activas viejas: las que quedaron abiertas otro día y nadie cobró ni
 *   anuló. Van aparte y con su propio tope, de la más reciente a la más
 *   vieja: antes compartían consulta con las de hoy, en orden de llegada, y
 *   un montón de viejas olvidadas podía dejar afuera a las de hoy.
 * - Finalizadas: lo cobrado en el día.
 */
const TOPE_DE_ACTIVAS_DE_HOY = 300
const TOPE_DE_ACTIVAS_VIEJAS = 50
const TOPE_DE_FINALIZADAS = 300

/**
 * Las atenciones del tablero: las activas, de hoy y de antes (para que una
 * que quedó abierta ayer no desaparezca sin cobrarse), y las finalizadas del
 * día, que son lo cobrado hoy. Las activas "de hoy" son las que llegaron
 * desde el inicio del día, sin cota de fin: una con la hora corrida hacia
 * adelante tampoco se pierde.
 */
async function buscarAtenciones(actor: Actor, desde: Date, hasta: Date) {
  const seleccion = seleccionDeAtencion(actor)
  const activas = { in: [...ESTADOS_ACTIVOS] }

  const [deHoy, viejas, finalizadas] = await Promise.all([
    prisma.visit.findMany({
      where: whereDeAtenciones(actor, { status: activas, arrivedAt: { gte: desde } }),
      select: seleccion,
      orderBy: { arrivedAt: "asc" },
      take: TOPE_DE_ACTIVAS_DE_HOY + 1,
    }),
    prisma.visit.findMany({
      where: whereDeAtenciones(actor, { status: activas, arrivedAt: { lt: desde } }),
      select: seleccion,
      orderBy: { arrivedAt: "desc" },
      take: TOPE_DE_ACTIVAS_VIEJAS + 1,
    }),
    prisma.visit.findMany({
      where: whereDeAtenciones(actor, { status: "finalizada", paidAt: { gte: desde, lt: hasta } }),
      select: seleccion,
      orderBy: { paidAt: "desc" },
      take: TOPE_DE_FINALIZADAS + 1,
    }),
  ])

  return {
    // En orden de llegada, como antes; cada columna se ordena en la pantalla.
    atenciones: [
      ...viejas.slice(0, TOPE_DE_ACTIVAS_VIEJAS).reverse(),
      ...deHoy.slice(0, TOPE_DE_ACTIVAS_DE_HOY),
      ...finalizadas.slice(0, TOPE_DE_FINALIZADAS),
    ],
    truncado:
      deHoy.length > TOPE_DE_ACTIVAS_DE_HOY ||
      viejas.length > TOPE_DE_ACTIVAS_VIEJAS ||
      finalizadas.length > TOPE_DE_FINALIZADAS,
  }
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

  const [reservas, { atenciones, truncado }, servicios, profesionales] = await Promise.all([
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
    truncado,
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
