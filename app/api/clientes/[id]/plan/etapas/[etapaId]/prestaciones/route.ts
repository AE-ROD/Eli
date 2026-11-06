import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { nuevaPrestacionSchema } from "@/lib/edicion-del-plan"
import {
  cuerpoDelPedido,
  noAutorizado,
  pacienteConAcceso,
  pacienteNoEncontrado,
  respuestaClinica,
} from "@/lib/ficha-clinica-servidor"
import { agregarPrestacion } from "@/lib/plan-de-tratamiento-servidor"
import { actorDeSesion, puedeEditarPlanDeTratamiento, vePlanDeTratamiento } from "@/lib/permisos"

type Contexto = { params: Promise<{ id: string; etapaId: string }> }

/**
 * Agrega una prestación al final de una etapa por aprobar del plan vigente:
 * `{ pieza, caras?, serviceId?, nombre?, valorCents?, memberId?, delDueño? }`.
 * Dueño y odontólogos; el encargado, 401. Paciente o etapa ajenos, 404; una
 * etapa aprobada o de una versión vieja, 409. Responde 201 con el plan.
 */
export async function POST(request: NextRequest, { params }: Contexto) {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor) return noAutorizado()

  const { id, etapaId } = await params
  const paciente = await pacienteConAcceso(actor, id, vePlanDeTratamiento)
  if (!paciente) return pacienteNoEncontrado()
  if (!puedeEditarPlanDeTratamiento(actor)) return noAutorizado()

  try {
    const pedido = nuevaPrestacionSchema.parse(await cuerpoDelPedido(request))
    return NextResponse.json(await agregarPrestacion(actor, paciente.id, etapaId, pedido), { status: 201 })
  } catch (error) {
    return respuestaClinica(error, "agregando una prestación al plan")
  }
}
