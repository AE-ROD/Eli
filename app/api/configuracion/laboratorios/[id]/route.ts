import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { cuerpoDelPedido, noAutorizado, respuestaClinica } from "@/lib/ficha-clinica-servidor"
import { edicionDeLaboratorioSchema } from "@/lib/edicion-de-protesis"
import { actorDeSesion, esClinicaDental, puedeGestionarLaboratorios, whereDeLaboratorios } from "@/lib/permisos"
import { editarLaboratorio } from "@/lib/protesis-servidor"

const noEncontrado = () => NextResponse.json({ error: "Laboratorio no encontrado" }, { status: 404 })

/**
 * Renombra, cambia el contacto, desactiva o reactiva un laboratorio. Sin
 * DELETE a propósito: se desactiva, y las prótesis que lo tienen lo siguen
 * nombrando. Primero la pertenencia (de otra clínica, o fuera de una clínica
 * dental, 404), después el permiso: sólo la dueña.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor) return noAutorizado()
  if (!esClinicaDental(actor)) return noEncontrado()

  const { id } = await params
  const existente = await prisma.laboratorio.findFirst({ where: whereDeLaboratorios(actor, { id }), select: { id: true } })
  if (!existente) return noEncontrado()
  if (!puedeGestionarLaboratorios(actor)) return noAutorizado()

  try {
    const datos = edicionDeLaboratorioSchema.parse(await cuerpoDelPedido(request))
    return NextResponse.json(await editarLaboratorio(actor, existente.id, datos))
  } catch (error) {
    return respuestaClinica(error, "editando un laboratorio")
  }
}
