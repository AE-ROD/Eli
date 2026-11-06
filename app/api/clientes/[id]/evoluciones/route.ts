import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { evolucionSchema } from "@/lib/ficha-clinica"
import {
  anotarEvolucion,
  cuerpoDelPedido,
  firmaClinica,
  leerEvoluciones,
  noAutorizado,
  pacienteConAcceso,
  pacienteNoEncontrado,
  respuestaClinica,
} from "@/lib/ficha-clinica-servidor"
import { actorDeSesion, puedeEditarFichaClinica, veFichaClinica } from "@/lib/permisos"

/**
 * Las evoluciones de un paciente: lo que se hizo y se observó, con fecha y
 * autor. Sólo se agregan: no hay PUT ni DELETE (y la base los rechaza). Mismos
 * permisos que la ficha: dueño y odontólogos; el encargado, fuera de una
 * clínica dental o con un paciente ajeno, 404. El límite de pedidos lo pone
 * `proxy.ts`.
 */

type Contexto = { params: Promise<{ id: string }> }

/** `?antes=<id>`: el id de la última evolución que ya se tiene. */
const antesSchema = z.string().trim().min(1).max(100).nullable()

/** De la más nueva a la más vieja, por páginas (`siguiente` es el `?antes=` de la próxima). */
export async function GET(request: NextRequest, { params }: Contexto) {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor) return noAutorizado()

  const { id } = await params
  const paciente = await pacienteConAcceso(actor, id, veFichaClinica)
  if (!paciente) return pacienteNoEncontrado()

  try {
    const antes = antesSchema.parse(new URL(request.url).searchParams.get("antes"))
    return NextResponse.json(await leerEvoluciones(actor, paciente.id, antes))
  } catch (error) {
    return respuestaClinica(error, "leyendo las evoluciones")
  }
}

/** Anota una evolución (`{ texto, appointmentId? }`). Responde 201 con la evolución creada. */
export async function POST(request: NextRequest, { params }: Contexto) {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)
  if (!actor) return noAutorizado()

  const { id } = await params
  const paciente = await pacienteConAcceso(actor, id, puedeEditarFichaClinica)
  if (!paciente) return pacienteNoEncontrado()

  try {
    const datos = evolucionSchema.parse(await cuerpoDelPedido(request))
    const firma = await firmaClinica(actor, session?.user?.id)
    if (!firma) return noAutorizado()
    return NextResponse.json(await anotarEvolucion(actor, paciente.id, datos, firma), { status: 201 })
  } catch (error) {
    return respuestaClinica(error, "anotando una evolución")
  }
}
