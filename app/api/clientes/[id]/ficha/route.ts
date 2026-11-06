import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { antecedentesSchema } from "@/lib/ficha-clinica"
import {
  cuerpoDelPedido,
  firmaClinica,
  guardarAntecedentes,
  hoyDelNegocio,
  leerFicha,
  noAutorizado,
  pacienteConAcceso,
  pacienteNoEncontrado,
  respuestaClinica,
} from "@/lib/ficha-clinica-servidor"
import { actorDeSesion, puedeEditarFichaClinica, veFichaClinica } from "@/lib/permisos"

/**
 * Los antecedentes de la ficha clínica de un paciente: fecha de nacimiento
 * (y la edad), previsión, alergias y antecedentes. Dueño y odontólogos, de
 * cualquier paciente de la clínica. El encargado, fuera de una clínica dental
 * o con un paciente ajeno: 404. El límite de pedidos lo pone `proxy.ts`.
 */

type Contexto = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, { params }: Contexto) {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor) return noAutorizado()

  const { id } = await params
  const paciente = await pacienteConAcceso(actor, id, veFichaClinica)
  if (!paciente) return pacienteNoEncontrado()

  try {
    return NextResponse.json(await leerFicha(prisma, actor, paciente.id, await hoyDelNegocio(actor)))
  } catch (error) {
    return respuestaClinica(error, "leyendo la ficha clínica")
  }
}

/**
 * Guarda los antecedentes. Cambia sólo lo que viene; `null` o vacío lo borra.
 * La primera escritura crea la ficha. Responde la ficha como queda.
 */
export async function PUT(request: NextRequest, { params }: Contexto) {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)
  if (!actor) return noAutorizado()

  const { id } = await params
  const paciente = await pacienteConAcceso(actor, id, puedeEditarFichaClinica)
  if (!paciente) return pacienteNoEncontrado()

  try {
    const hoy = await hoyDelNegocio(actor)
    const datos = antecedentesSchema(hoy).parse(await cuerpoDelPedido(request))
    const firma = await firmaClinica(actor, session?.user?.id)
    if (!firma) return noAutorizado()
    return NextResponse.json(await guardarAntecedentes(actor, paciente.id, datos, firma.nombre, hoy))
  } catch (error) {
    return respuestaClinica(error, "guardando la ficha clínica")
  }
}
