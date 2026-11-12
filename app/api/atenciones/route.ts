import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { ESTADOS_ACTIVOS, PROFESIONAL_DUEÑO, deCentavos } from "@/lib/atenciones"
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
  puedeVerPantallaDeFila,
  whereDeAgenda,
  whereDeAtenciones,
  whereDeProductos,
  type Actor,
} from "@/lib/permisos"
import { cuerpoConTope, respuestaDeCuerpoDemasiadoGrande } from "@/lib/cuerpo-del-pedido"
import {
  formatearAtencion,
  leerRango,
  leerSoloAtenciones,
  respuestaDeError,
  seleccionDeAtencion,
} from "@/lib/tablero"
import { nombreCompletoDeCliente } from "@/lib/nombre-de-cliente"

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
 *
 * La dueña que además se invitó como profesional de su propio negocio está
 * dos veces (como dueña y como miembro), con el mismo nombre: la opción de
 * miembro dice "Nombre (como profesional)", porque sus líneas llevan comisión
 * y las de la dueña no. Es sólo la etiqueta del selector: el nombre que queda
 * en la línea lo pone el servidor al guardarla.
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
      select: { id: true, userId: true, user: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
      take: 100,
    }),
    prisma.business.findUnique({
      where: { id: actor.businessId },
      select: { userId: true, user: { select: { name: true } } },
    }),
  ])

  return [
    ...miembros.map((miembro) => ({
      id: miembro.id,
      nombre: negocio && miembro.userId === negocio.userId ? `${miembro.user.name} (como profesional)` : miembro.user.name,
    })),
    ...(negocio ? [{ id: PROFESIONAL_DUEÑO, nombre: negocio.user.name }] : []),
  ]
}

/**
 * Lo que se elige en el tablero (servicios, productos, a quién se le puede
 * anotar, medios de pago) y si la fila virtual está encendida. Casi no cambia
 * durante el día: por eso el sondeo del tablero lo deja fuera
 * (`?soloAtenciones=1`) y lo pide una vez al abrir y al volver a la pestaña.
 */
async function buscarCatalogo(actor: Actor) {
  const [servicios, productos, profesionales, negocio] = await Promise.all([
    prisma.service.findMany({
      where: { businessId: actor.businessId, active: true },
      select: { id: true, name: true, price: true },
      orderBy: { name: "asc" },
      take: 200,
    }),
    // Los productos que se venden hoy (#67): todo rol los ve, porque el
    // profesional anota lo que vendió. Sin su %: eso es de la dueña.
    prisma.producto.findMany({
      where: whereDeProductos(actor, { active: true }),
      select: { id: true, name: true, priceCents: true },
      orderBy: { name: "asc" },
      take: 200,
    }),
    profesionalesAsignables(actor),
    // Si la fila virtual está encendida (#85): el Tablero ofrece abrir su
    // pantalla. Sólo a quien puede verla.
    puedeVerPantallaDeFila(actor)
      ? prisma.business.findUnique({ where: { id: actor.businessId }, select: { filaVirtualActiva: true } })
      : Promise.resolve(null),
  ])

  return {
    catalogo: {
      servicios: servicios.map((servicio) => ({ id: servicio.id, nombre: servicio.name, precio: servicio.price })),
      productos: productos.map((producto) => ({
        id: producto.id,
        nombre: producto.name,
        precio: producto.priceCents === null ? null : deCentavos(producto.priceCents),
      })),
      profesionales,
      mediosDePago: MEDIOS_DE_PAGO,
    },
    filaVirtual: negocio?.filaVirtualActiva === true,
  }
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)
  if (!actor) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const parametros = new URL(request.url).searchParams
  const rango = leerRango(parametros, RANGO_MAXIMO_MS, "48 horas")
  if (!rango.ok) {
    return NextResponse.json({ error: rango.error }, { status: 400 })
  }
  const solo = leerSoloAtenciones(parametros)
  if (!solo.ok) {
    return NextResponse.json({ error: solo.error }, { status: 400 })
  }

  // Todo se pide a la vez; con `soloAtenciones` el catálogo ni se consulta.
  const [reservas, { atenciones, truncado }, delCatalogo] = await Promise.all([
    buscarReservas(actor, rango.desde, rango.hasta),
    buscarAtenciones(actor, rango.desde, rango.hasta),
    solo.soloAtenciones ? null : buscarCatalogo(actor),
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
      cliente: cita.customer ? { id: cita.customer.id, nombre: nombreCompletoDeCliente(cita.customer) } : null,
      profesional: cita.member ? { id: cita.member.id, nombre: cita.member.user.name } : null,
    })),
    atenciones: atenciones.map((atencion) => formatearAtencion(actor, atencion)),
    ...(delCatalogo && { catalogo: delCatalogo.catalogo }),
    truncado,
    ...(delCatalogo && { filaVirtual: delCatalogo.filaVirtual }),
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
    const recibido = await cuerpoConTope(request)
    if (recibido.excedido) return respuestaDeCuerpoDemasiadoGrande()
    const cuerpo = recibido.cuerpo

    // Con `citaId` es una reserva que llegó (y la zona de quien la marca, para
    // saber si es de hoy); sin él, alguien sin reserva.
    if (typeof cuerpo === "object" && cuerpo !== null && "citaId" in cuerpo) {
      const llegada = llegadaConReservaSchema.parse(cuerpo)
      return NextResponse.json(await registrarLlegada(actor, usuarioId, llegada), { status: 201 })
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
