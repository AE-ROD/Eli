import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { categoriaDeServicio, descripcion, duracion, nombre, precioDeServicio } from "@/lib/campos-del-panel"
import { respuestaDeDatosInvalidos } from "@/lib/respuesta-de-validacion"
import { actorDeSesion, puedeGestionarServicios } from "@/lib/permisos"
import { CuerpoDemasiadoGrande, leerJsonConTope, respuestaDeCuerpoDemasiadoGrande } from "@/lib/cuerpo-del-pedido"

export async function GET() {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)

  if (!actor || !puedeGestionarServicios(actor)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const servicios = await prisma.service.findMany({
    where: { businessId: actor.businessId },
    orderBy: { createdAt: "asc" },
    take: 200,
  })

  return NextResponse.json(servicios)
}

const servicioSchema = z.object({
  name: nombre(),
  description: descripcion().optional(),
  duration: duracion(),
  price: precioDeServicio().optional(),
  // Agrupa los servicios en la página pública; vacío es "sin categoría".
  category: categoriaDeServicio().optional(),
})

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)

  if (!actor || !puedeGestionarServicios(actor)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  try {
    const cuerpo = await leerJsonConTope(request)
    const datos = servicioSchema.parse(cuerpo)

    const servicio = await prisma.service.create({
      data: {
        ...datos,
        price: datos.price ?? null,
        businessId: actor.businessId,
      },
    })

    return NextResponse.json(servicio, { status: 201 })
  } catch (error) {
    if (error instanceof CuerpoDemasiadoGrande) return respuestaDeCuerpoDemasiadoGrande()
    if (error instanceof z.ZodError) {
      return respuestaDeDatosInvalidos(error)
    }
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}
