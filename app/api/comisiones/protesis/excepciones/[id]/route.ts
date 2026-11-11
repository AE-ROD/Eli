import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { cuerpoDelPedido, noAutorizado, respuestaClinica } from "@/lib/ficha-clinica-servidor"
import { edicionDeExcepcionSchema } from "@/lib/edicion-de-protesis"
import { actorDeSesion, esClinicaDental, puedeConfigurarRepartoDeProtesis, whereDeExcepcionesDeReparto, type Actor } from "@/lib/permisos"
import { borrarExcepcion, editarExcepcion } from "@/lib/protesis-servidor"

type Contexto = { params: Promise<{ id: string }> }

const noEncontrado = () => NextResponse.json({ error: "Regla no encontrada" }, { status: 404 })

/**
 * La excepción `id`, si el actor la alcanza (`whereDeExcepcionesDeReparto`):
 * de otra clínica, de otro odontólogo para quien no es la dueña, o fuera de
 * una clínica dental, `null` (404). Primero la pertenencia, después el
 * permiso (sólo la dueña).
 */
async function excepcionDelNegocio(actor: Actor, id: string) {
  if (!esClinicaDental(actor)) return null
  return prisma.excepcionDeRepartoDeProtesis.findFirst({ where: whereDeExcepcionesDeReparto(actor, { id }), select: { id: true } })
}

/** Cambia la regla (las tres partes, que suman 100 %). */
export async function PATCH(request: NextRequest, { params }: Contexto) {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor) return noAutorizado()
  const { id } = await params
  const existente = await excepcionDelNegocio(actor, id)
  if (!existente) return noEncontrado()
  if (!puedeConfigurarRepartoDeProtesis(actor)) return noAutorizado()

  try {
    const reparto = edicionDeExcepcionSchema.parse(await cuerpoDelPedido(request))
    return NextResponse.json(await editarExcepcion(actor, existente.id, reparto))
  } catch (error) {
    return respuestaClinica(error, "editando una excepción de reparto")
  }
}

/** Quita la excepción: el odontólogo vuelve a la regla del material en las prótesis nuevas. */
export async function DELETE(_request: NextRequest, { params }: Contexto) {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor) return noAutorizado()
  const { id } = await params
  const existente = await excepcionDelNegocio(actor, id)
  if (!existente) return noEncontrado()
  if (!puedeConfigurarRepartoDeProtesis(actor)) return noAutorizado()

  try {
    await borrarExcepcion(actor, existente.id)
    return NextResponse.json({ mensaje: "Regla quitada" })
  } catch (error) {
    return respuestaClinica(error, "quitando una excepción de reparto")
  }
}
