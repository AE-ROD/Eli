import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { odontogramaSchema } from "@/lib/ficha-clinica"
import {
  cuerpoDelPedido,
  firmaClinica,
  guardarOdontograma,
  leerOdontograma,
  noAutorizado,
  pacienteConAcceso,
  pacienteNoEncontrado,
  respuestaClinica,
} from "@/lib/ficha-clinica-servidor"
import { actorDeSesion, puedeEditarFichaClinica, veFichaClinica } from "@/lib/permisos"

/**
 * El odontograma de un paciente (notación FDI, `lib/odontograma.ts`): sus
 * marcas y quién y cuándo lo actualizó. Mismos permisos que la ficha: dueño
 * y odontólogos; el encargado, fuera de una clínica dental o con un paciente
 * ajeno, 404. El límite de pedidos lo pone `proxy.ts`.
 */

type Contexto = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, { params }: Contexto) {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor) return noAutorizado()

  const { id } = await params
  const paciente = await pacienteConAcceso(actor, id, veFichaClinica)
  if (!paciente) return pacienteNoEncontrado()

  try {
    return NextResponse.json(await leerOdontograma(prisma, actor, paciente.id))
  } catch (error) {
    return respuestaClinica(error, "leyendo el odontograma")
  }
}

/**
 * Reemplaza el conjunto completo de marcas (`{ marcas: [...] }`): las que no
 * vienen se borran. Cada marca se valida con las reglas de la base y sin
 * repetidas. Responde el odontograma como queda.
 */
export async function PUT(request: NextRequest, { params }: Contexto) {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)
  if (!actor) return noAutorizado()

  const { id } = await params
  const paciente = await pacienteConAcceso(actor, id, puedeEditarFichaClinica)
  if (!paciente) return pacienteNoEncontrado()

  try {
    const { marcas } = odontogramaSchema.parse(await cuerpoDelPedido(request))
    const firma = await firmaClinica(actor, session?.user?.id)
    if (!firma) return noAutorizado()
    return NextResponse.json(await guardarOdontograma(actor, paciente.id, marcas, firma.nombre))
  } catch (error) {
    return respuestaClinica(error, "guardando el odontograma")
  }
}
