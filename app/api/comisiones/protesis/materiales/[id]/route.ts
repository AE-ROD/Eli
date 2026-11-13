import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { cuerpoDelPedido, noAutorizado, respuestaClinica } from "@/lib/ficha-clinica-servidor"
import { edicionDeMaterialSchema } from "@/lib/edicion-de-protesis"
import { actorDeSesion, esClinicaDental, puedeConfigurarRepartoDeProtesis, whereDeMaterialesDeProtesis } from "@/lib/permisos"
import { editarMaterial } from "@/lib/protesis-servidor"

const noEncontrado = () => NextResponse.json({ error: "Material no encontrado" }, { status: 404 })

/**
 * Cambia un material: nombre, unidad, tipos, precio, regla (las tres partes
 * juntas), laboratorio por defecto, orden o activo. Sin DELETE: se desactiva.
 * Primero la pertenencia (de otra clínica, o fuera de una clínica dental,
 * 404), después el permiso: sólo la dueña.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor) return noAutorizado()
  if (!esClinicaDental(actor)) return noEncontrado()

  const { id } = await params
  const existente = await prisma.materialDeProtesis.findFirst({ where: whereDeMaterialesDeProtesis(actor, { id }), select: { id: true } })
  if (!existente) return noEncontrado()
  if (!puedeConfigurarRepartoDeProtesis(actor)) return noAutorizado()

  try {
    const datos = edicionDeMaterialSchema.parse(await cuerpoDelPedido(request))
    return NextResponse.json(await editarMaterial(actor, existente.id, datos))
  } catch (error) {
    return respuestaClinica(error, "editando un material de prótesis")
  }
}
