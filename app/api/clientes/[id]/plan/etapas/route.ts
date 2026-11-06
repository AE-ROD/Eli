import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { nuevaEtapaSchema } from "@/lib/edicion-del-plan"
import {
  cuerpoDelPedido,
  noAutorizado,
  pacienteConAcceso,
  pacienteNoEncontrado,
  respuestaClinica,
} from "@/lib/ficha-clinica-servidor"
import { agregarEtapa } from "@/lib/plan-de-tratamiento-servidor"
import { actorDeSesion, puedeEditarPlanDeTratamiento, vePlanDeTratamiento } from "@/lib/permisos"

type Contexto = { params: Promise<{ id: string }> }

/**
 * Agrega una etapa (`{ nombre }`) al final del plan vigente, por aprobar.
 * Dueño y odontólogos; el encargado, 401; paciente ajeno o fuera de una
 * clínica dental, 404; sin plan vigente, 409. Responde 201 con el plan.
 */
export async function POST(request: NextRequest, { params }: Contexto) {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor) return noAutorizado()

  const { id } = await params
  const paciente = await pacienteConAcceso(actor, id, vePlanDeTratamiento)
  if (!paciente) return pacienteNoEncontrado()
  if (!puedeEditarPlanDeTratamiento(actor)) return noAutorizado()

  try {
    const { nombre } = nuevaEtapaSchema.parse(await cuerpoDelPedido(request))
    return NextResponse.json(await agregarEtapa(actor, paciente.id, nombre), { status: 201 })
  } catch (error) {
    return respuestaClinica(error, "agregando una etapa al plan")
  }
}
