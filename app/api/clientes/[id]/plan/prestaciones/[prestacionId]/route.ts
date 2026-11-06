import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { edicionDePrestacionSchema } from "@/lib/edicion-del-plan"
import {
  cuerpoDelPedido,
  noAutorizado,
  pacienteConAcceso,
  pacienteNoEncontrado,
  respuestaClinica,
} from "@/lib/ficha-clinica-servidor"
import { borrarPrestacion, editarPrestacion } from "@/lib/plan-de-tratamiento-servidor"
import { actorDeSesion, puedeEditarPlanDeTratamiento, vePlanDeTratamiento } from "@/lib/permisos"

/**
 * Una prestación del plan vigente de un paciente. Dueño y odontólogos; el
 * encargado, 401. Paciente ajeno, fuera de una clínica dental, o una
 * prestación que no es de un plan de ESTE paciente: 404. De una versión que
 * ya no está vigente: 409. El límite de pedidos lo pone `proxy.ts`.
 */

type Contexto = { params: Promise<{ id: string; prestacionId: string }> }

/**
 * Cambia la prestación. En una etapa aprobada sólo `estado`,
 * `appointmentId` y el profesional (`memberId` / `delDueño`); en una por
 * aprobar, también pieza, caras, servicio, nombre, valor y posición.
 * Responde el plan como queda.
 */
export async function PATCH(request: NextRequest, { params }: Contexto) {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor) return noAutorizado()

  const { id, prestacionId } = await params
  const paciente = await pacienteConAcceso(actor, id, vePlanDeTratamiento)
  if (!paciente) return pacienteNoEncontrado()
  if (!puedeEditarPlanDeTratamiento(actor)) return noAutorizado()

  try {
    const pedido = edicionDePrestacionSchema.parse(await cuerpoDelPedido(request))
    return NextResponse.json(await editarPrestacion(actor, paciente.id, prestacionId, pedido))
  } catch (error) {
    return respuestaClinica(error, "editando una prestación del plan")
  }
}

/** Borra la prestación, sólo si está por agendar en una etapa por aprobar (si no, 409). */
export async function DELETE(_request: NextRequest, { params }: Contexto) {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor) return noAutorizado()

  const { id, prestacionId } = await params
  const paciente = await pacienteConAcceso(actor, id, vePlanDeTratamiento)
  if (!paciente) return pacienteNoEncontrado()
  if (!puedeEditarPlanDeTratamiento(actor)) return noAutorizado()

  try {
    return NextResponse.json(await borrarPrestacion(actor, paciente.id, prestacionId))
  } catch (error) {
    return respuestaClinica(error, "borrando una prestación del plan")
  }
}
