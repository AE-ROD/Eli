import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { horarioSemanalDeAtencion } from "@/lib/horario-de-atencion"
import { actorDeSesion } from "@/lib/permisos"

/**
 * El horario de atención del negocio de la sesión, día por día, para que la
 * agenda dibuje las horas en que se atiende aunque caigan fuera de 8–20. Es la
 * misma regla que ve el cliente en la reserva pública
 * (`horarioSemanalDeAtencion`): no expone de quién es cada franja, así que
 * cualquier rol lo puede leer. El rate limit lo pone `proxy.ts`.
 */
export async function GET() {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)
  if (!actor) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const filas = await prisma.workSchedule.findMany({
    where: { businessId: actor.businessId, active: true },
    select: { memberId: true, dayOfWeek: true, startTime: true, endTime: true },
  })

  return NextResponse.json(horarioSemanalDeAtencion(filas))
}
