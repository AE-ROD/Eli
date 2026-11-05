import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { actorDeSesion, puedeAsignarCitasAOtros } from "@/lib/permisos"

/**
 * El catálogo para "Nueva cita" en la agenda (#159): los servicios activos
 * del negocio, como los ofrece la reserva pública, y qué hace cada
 * profesional que lo tiene acotado (`MemberService`; sin filas, hace todos).
 *
 * Cualquiera que agenda lo lee. Dueño y encargado, lo de todo el equipo (eligen
 * a quién va la cita); el profesional, sólo lo suyo (su cita siempre es suya).
 * Todo acotado al negocio de la sesión. El límite de peticiones es el
 * genérico del panel (`proxy.ts`).
 */

/** El mismo tope que la lista de servicios del panel. */
const TOPE_DE_SERVICIOS = 200
/** Profesionales por servicios: un negocio no pasa de unas decenas de cada uno. */
const TOPE_DE_FILAS = 5000

export async function GET() {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const deQuien = puedeAsignarCitasAOtros(actor) ? {} : { memberId: actor.memberId ?? "" }
  const [servicios, filas] = await Promise.all([
    prisma.service.findMany({
      where: { businessId: actor.businessId, active: true },
      select: { id: true, name: true, description: true, duration: true, price: true },
      // El orden de la página pública.
      orderBy: { createdAt: "asc" },
      take: TOPE_DE_SERVICIOS,
    }),
    prisma.memberService.findMany({
      where: { businessId: actor.businessId, ...deQuien },
      select: { memberId: true, serviceId: true },
      take: TOPE_DE_FILAS,
    }),
  ])

  // memberId → los servicios que hace. Quien no aparece, hace todos.
  const serviciosPorProfesional: Record<string, string[]> = {}
  for (const fila of filas) {
    serviciosPorProfesional[fila.memberId] = [...(serviciosPorProfesional[fila.memberId] ?? []), fila.serviceId]
  }

  return NextResponse.json({ servicios, serviciosPorProfesional })
}
