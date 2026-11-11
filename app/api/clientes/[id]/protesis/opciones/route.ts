import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { noAutorizado, pacienteConAcceso, pacienteNoEncontrado, respuestaClinica } from "@/lib/ficha-clinica-servidor"
import { actorDeSesion, veProtesis } from "@/lib/permisos"
import { leerOpciones } from "@/lib/protesis-servidor"

/**
 * El catálogo para armar una prótesis en la ficha: materiales activos (precio
 * y unidad), laboratorios activos y a quién se puede poner de tratante. La
 * regla de reparto de cada material, sólo para la dueña; el odontólogo ve su
 * parte. Bajo el paciente para responder lo mismo que la pestaña: quien no ve
 * las prótesis de este paciente recibe 404.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor) return noAutorizado()

  const { id } = await params
  const paciente = await pacienteConAcceso(actor, id, veProtesis)
  if (!paciente) return pacienteNoEncontrado()

  try {
    return NextResponse.json(await leerOpciones(actor))
  } catch (error) {
    return respuestaClinica(error, "leyendo el catálogo de prótesis")
  }
}
