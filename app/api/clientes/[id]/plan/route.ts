import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { nuevaVersionSchema } from "@/lib/edicion-del-plan"
import {
  cuerpoDelPedido,
  firmaClinica,
  noAutorizado,
  pacienteConAcceso,
  pacienteNoEncontrado,
  respuestaClinica,
} from "@/lib/ficha-clinica-servidor"
import { crearVersion, leerPlan } from "@/lib/plan-de-tratamiento-servidor"
import { actorDeSesion, puedeEditarPlanDeTratamiento, vePlanDeTratamiento } from "@/lib/permisos"

/**
 * El plan de tratamiento y presupuesto de un paciente. Lo ve todo rol de la
 * clínica (el encargado, sólo lectura); lo arman dueño y odontólogos. Fuera
 * de una clínica dental o con un paciente ajeno, 404; el encargado que
 * escribe, 401. El límite de pedidos lo pone `proxy.ts`.
 */

type Contexto = { params: Promise<{ id: string }> }

/** El plan vigente con etapas, prestaciones y totales, y las versiones anteriores. Sin plan, `plan: null`. */
export async function GET(_request: NextRequest, { params }: Contexto) {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor) return noAutorizado()

  const { id } = await params
  const paciente = await pacienteConAcceso(actor, id, vePlanDeTratamiento)
  if (!paciente) return pacienteNoEncontrado()

  try {
    return NextResponse.json(await leerPlan(prisma, actor, paciente.id))
  } catch (error) {
    return respuestaClinica(error, "leyendo el plan de tratamiento")
  }
}

/**
 * Crea una versión nueva del plan (`{ desde: "odontograma" | "copia" | "vacio" }`):
 * la vigente deja de estarlo. Responde 201 con el plan como queda.
 */
export async function POST(request: NextRequest, { params }: Contexto) {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)
  if (!actor) return noAutorizado()

  const { id } = await params
  const paciente = await pacienteConAcceso(actor, id, vePlanDeTratamiento)
  if (!paciente) return pacienteNoEncontrado()
  if (!puedeEditarPlanDeTratamiento(actor)) return noAutorizado()

  try {
    const { desde } = nuevaVersionSchema.parse(await cuerpoDelPedido(request))
    const firma = await firmaClinica(actor, session?.user?.id)
    if (!firma) return noAutorizado()
    return NextResponse.json(await crearVersion(actor, paciente.id, desde, firma.nombre), { status: 201 })
  } catch (error) {
    return respuestaClinica(error, "creando una versión del plan")
  }
}
