import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { leerHorarioDeQuienesAtienden } from "@/lib/agenda-publica"
import { horarioSemanalDeAtencion } from "@/lib/horario-de-atencion"
import { actorDeSesion } from "@/lib/permisos"
import { MENSAJE_SEDE_NO_ENCONTRADA, decidirSedeDeLaCita, leerSedesParaAgendar } from "@/lib/sede-de-la-cita"

/**
 * El horario de atención del negocio de la sesión, día por día, para que la
 * agenda dibuje las horas en que se atiende aunque caigan fuera de 8–20. Es la
 * misma regla que ve el cliente en la reserva pública
 * (`horarioSemanalDeAtencion`): no expone de quién es cada franja, así que
 * cualquier rol lo puede leer. Sólo cuentan el horario general y el de
 * quienes atienden (#168). El rate limit lo pone `proxy.ts`.
 *
 * Etapa 9 (plan Independiente): con `?sedeId=` es el horario de ESA sede, el
 * que usa "Nueva cita" al elegir dónde se atiende. La sede se revalida contra
 * las sedes del negocio de la sesión: una que no es suya, no existe o está
 * desactivada es 404, sin distinguir cuál. Sin `sedeId` (o en un negocio sin
 * sedes o con una sola), el de siempre: el vigente del negocio.
 */
export async function GET(request?: Request) {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)
  if (!actor) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  let sedeDelHorario: string | null = null
  const sedeId = request ? new URL(request.url).searchParams.get("sedeId") : null
  if (sedeId) {
    const decision = decidirSedeDeLaCita(await leerSedesParaAgendar(prisma, actor), sedeId)
    if (decision.tipo === "no-encontrada" || decision.tipo === "desactivada") {
      return NextResponse.json({ error: MENSAJE_SEDE_NO_ENCONTRADA }, { status: 404 })
    }
    if (decision.tipo === "ok") sedeDelHorario = decision.sedeDelHorario
  }

  const filas = await leerHorarioDeQuienesAtienden(prisma, actor.businessId, sedeDelHorario)

  return NextResponse.json(horarioSemanalDeAtencion(filas))
}
