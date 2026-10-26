import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { z } from "zod"
import { descripcion, duracion, nombre, precioDeServicio } from "@/lib/campos-del-panel"
import { respuestaDeDatosInvalidos } from "@/lib/respuesta-de-validacion"
import { actorDeSesion, puedeGestionarServicios } from "@/lib/permisos"

const edicionDeServicioSchema = z.object({
  name: nombre().optional(),
  description: descripcion().optional().nullable(),
  duration: duracion().optional(),
  price: precioDeServicio().optional().nullable(),
  active: z.boolean().optional(),
})

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)

  if (!actor || !puedeGestionarServicios(actor)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const { id } = await params

  const existente = await prisma.service.findFirst({
    where: { id, businessId: actor.businessId },
  })
  if (!existente) {
    return NextResponse.json({ error: "Servicio no encontrado" }, { status: 404 })
  }

  try {
    const cuerpo = await request.json()
    const datos = edicionDeServicioSchema.parse(cuerpo)

    const servicio = await prisma.service.update({
      where: { id },
      data: datos,
    })

    return NextResponse.json(servicio)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return respuestaDeDatosInvalidos(error)
    }
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)

  if (!actor || !puedeGestionarServicios(actor)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const { id } = await params

  const existente = await prisma.service.findFirst({
    where: { id, businessId: actor.businessId },
  })
  if (!existente) {
    return NextResponse.json({ error: "Servicio no encontrado" }, { status: 404 })
  }

  try {
    await prisma.service.delete({ where: { id } })
  } catch (error) {
    // El servicio tiene comisiones configuradas y la base lo impide (la FK de
    // porcentajes_comision es Restrict): borrarlo se llevaría por delante
    // porcentajes que sólo el dueño puede tocar. Se retira con `active`, sin perder el historial.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      return NextResponse.json(
        {
          error:
            "Este servicio tiene comisiones configuradas. Desactívalo en vez de borrarlo, o pídele al dueño que quite esas comisiones primero.",
        },
        { status: 409 }
      )
    }
    throw error
  }

  return NextResponse.json({ mensaje: "Servicio eliminado" })
}
