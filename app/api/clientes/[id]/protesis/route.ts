import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import {
  cuerpoDelPedido,
  firmaClinica,
  noAutorizado,
  pacienteConAcceso,
  pacienteNoEncontrado,
  respuestaClinica,
} from "@/lib/ficha-clinica-servidor"
import { protesisNuevaSchema } from "@/lib/edicion-de-protesis"
import { actorDeSesion, puedeEditarProtesis, veProtesis } from "@/lib/permisos"
import { crearProtesis, leerProtesisDelPaciente } from "@/lib/protesis-servidor"

/**
 * Las prótesis de un paciente (la pestaña Prótesis de la ficha). Las ven,
 * crean y avanzan la dueña y los odontólogos (`veProtesis`); el encargado, no:
 * para él el paciente "no existe" acá (404), como fuera de una clínica dental
 * o con un paciente ajeno. Del reparto, cada uno ve lo suyo
 * (`veMontosDelReparto`). El límite de pedidos lo pone `proxy.ts`.
 */

type Contexto = { params: Promise<{ id: string }> }

/** El historial de prótesis del paciente, de la más nueva a la más vieja, con su seguimiento, valor, pagado y saldo. */
export async function GET(_request: NextRequest, { params }: Contexto) {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor) return noAutorizado()

  const { id } = await params
  const paciente = await pacienteConAcceso(actor, id, veProtesis)
  if (!paciente) return pacienteNoEncontrado()

  try {
    return NextResponse.json(await leerProtesisDelPaciente(prisma, actor, paciente.id))
  } catch (error) {
    return respuestaClinica(error, "leyendo las prótesis")
  }
}

/**
 * Crea una prótesis. El servidor calcula las unidades y el valor con el
 * precio del catálogo y congela la regla de reparto: lo que mande el
 * navegador de precios o porcentajes se ignora. Responde 201 con la prótesis.
 */
export async function POST(request: NextRequest, { params }: Contexto) {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)
  if (!actor) return noAutorizado()

  const { id } = await params
  const paciente = await pacienteConAcceso(actor, id, veProtesis)
  if (!paciente) return pacienteNoEncontrado()
  if (!puedeEditarProtesis(actor)) return noAutorizado()

  try {
    const pedido = protesisNuevaSchema.parse(await cuerpoDelPedido(request))
    const firma = await firmaClinica(actor, session?.user?.id)
    if (!firma) return noAutorizado()
    return NextResponse.json(await crearProtesis(actor, paciente.id, pedido, firma), { status: 201 })
  } catch (error) {
    return respuestaClinica(error, "creando una prótesis")
  }
}
