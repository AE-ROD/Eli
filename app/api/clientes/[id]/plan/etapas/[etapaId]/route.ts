import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { edicionDeEtapaSchema } from "@/lib/edicion-del-plan"
import {
  cuerpoDelPedido,
  firmaClinica,
  noAutorizado,
  pacienteConAcceso,
  pacienteNoEncontrado,
  respuestaClinica,
} from "@/lib/ficha-clinica-servidor"
import { borrarEtapa, editarEtapa } from "@/lib/plan-de-tratamiento-servidor"
import { actorDeSesion, puedeEditarPlanDeTratamiento, vePlanDeTratamiento } from "@/lib/permisos"

/**
 * Una etapa del plan vigente de un paciente. Dueño y odontólogos; el
 * encargado, 401. Paciente ajeno, fuera de una clínica dental, o una etapa
 * que no es de un plan de ESTE paciente: 404. Una etapa de una versión que ya
 * no está vigente: 409. El límite de pedidos lo pone `proxy.ts`.
 */

type Contexto = { params: Promise<{ id: string; etapaId: string }> }

/**
 * Cambia `nombre`, la posición (`orden`) o aplica una `accion`: "presentar"
 * (registra que se le presentó al paciente), "aprobar" o
 * "volver-a-por-aprobar". Responde el plan como queda.
 */
export async function PATCH(request: NextRequest, { params }: Contexto) {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)
  if (!actor) return noAutorizado()

  const { id, etapaId } = await params
  const paciente = await pacienteConAcceso(actor, id, vePlanDeTratamiento)
  if (!paciente) return pacienteNoEncontrado()
  if (!puedeEditarPlanDeTratamiento(actor)) return noAutorizado()

  try {
    const pedido = edicionDeEtapaSchema.parse(await cuerpoDelPedido(request))
    const firma = await firmaClinica(actor, session?.user?.id)
    if (!firma) return noAutorizado()
    return NextResponse.json(await editarEtapa(actor, paciente.id, etapaId, pedido, firma.nombre))
  } catch (error) {
    return respuestaClinica(error, "editando una etapa del plan")
  }
}

/** Borra la etapa, sólo si está por aprobar y nada en ella está agendado ni realizado (si no, 409). */
export async function DELETE(_request: NextRequest, { params }: Contexto) {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor) return noAutorizado()

  const { id, etapaId } = await params
  const paciente = await pacienteConAcceso(actor, id, vePlanDeTratamiento)
  if (!paciente) return pacienteNoEncontrado()
  if (!puedeEditarPlanDeTratamiento(actor)) return noAutorizado()

  try {
    return NextResponse.json(await borrarEtapa(actor, paciente.id, etapaId))
  } catch (error) {
    return respuestaClinica(error, "borrando una etapa del plan")
  }
}
