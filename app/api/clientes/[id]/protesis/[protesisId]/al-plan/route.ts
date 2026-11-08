import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { cuerpoDelPedido, noAutorizado, pacienteConAcceso, pacienteNoEncontrado, respuestaClinica } from "@/lib/ficha-clinica-servidor"
import { alPlanSchema } from "@/lib/edicion-de-protesis"
import { actorDeSesion, puedeEditarPlanDeTratamiento, puedeEditarProtesis, veProtesis } from "@/lib/permisos"
import { agregarAlPlan } from "@/lib/protesis-servidor"

/**
 * "Agregar al plan y presupuesto": crea en el plan vigente una prestación de
 * "Boca" con el nombre armado de la prótesis y su valor, ligada a ella. Cuerpo
 * opcional `{ etapaId }` (una etapa por aprobar); sin él, la última por
 * aprobar o una etapa nueva "Prótesis". Sin plan vigente, ya ligada o
 * anulada, 409. Responde 201 con la prestación y la prótesis como queda.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; protesisId: string }> }) {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor) return noAutorizado()

  const { id, protesisId } = await params
  const paciente = await pacienteConAcceso(actor, id, veProtesis)
  if (!paciente) return pacienteNoEncontrado()
  if (!puedeEditarProtesis(actor) || !puedeEditarPlanDeTratamiento(actor)) return noAutorizado()

  try {
    const pedido = alPlanSchema.parse(await cuerpoDelPedido(request))
    return NextResponse.json(await agregarAlPlan(actor, paciente.id, protesisId, pedido), { status: 201 })
  } catch (error) {
    return respuestaClinica(error, "agregando una prótesis al plan")
  }
}
