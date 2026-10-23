import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { actorDeSesion, veLaListaDeInicio } from "@/lib/permisos"
import { pruebaTerminada, type DatosDeListaDeInicio } from "@/lib/lista-de-inicio"

/**
 * Los cuatro pasos de "Deja tu negocio listo", hechos o no, y si la prueba ya
 * terminó. Sólo el dueño (401 para el resto: no es un recurso ajeno, es algo
 * que su rol no ve). Todo se lee del negocio de la sesión, y sólo viaja un
 * sí o un no por paso: ni un id, ni una fecha, ni una cuenta.
 */
export async function GET() {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)
  if (!actor || !veLaListaDeInicio(actor)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const businessId = actor.businessId

  const [negocio, horario, servicio, reservaPublica] = await Promise.all([
    prisma.business.findUnique({
      where: { id: businessId },
      select: { pruebaTerminaEl: true, enlaceCompartidoAt: true },
    }),
    prisma.workSchedule.findFirst({ where: { businessId, active: true }, select: { id: true } }),
    prisma.service.findFirst({ where: { businessId, active: true }, select: { id: true } }),
    prisma.appointment.findFirst({ where: { businessId, source: "reserva-publica" }, select: { id: true } }),
  ])

  if (!negocio) {
    return NextResponse.json({ error: "Negocio no encontrado" }, { status: 404 })
  }

  const datos: DatosDeListaDeInicio = {
    pasos: {
      horario: horario !== null,
      servicios: servicio !== null,
      enlace: negocio.enlaceCompartidoAt !== null,
      primeraReserva: reservaPublica !== null,
    },
    pruebaTerminada: pruebaTerminada(negocio.pruebaTerminaEl, new Date()),
  }
  return NextResponse.json(datos)
}
