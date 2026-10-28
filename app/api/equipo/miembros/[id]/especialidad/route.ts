import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { textoOpcional } from "@/lib/campos-del-panel"
import { cuerpoDelPedido } from "@/lib/cuerpo-del-pedido"
import { actorDeSesion, puedeEditarPaginaDelNegocio } from "@/lib/permisos"
import { respuestaDeDatosInvalidos } from "@/lib/respuesta-de-validacion"

/**
 * PUT /api/equipo/miembros/[id]/especialidad — `{ especialidad }`: la que se
 * muestra junto al profesional en la página pública ("Colorista"). Vacía la
 * borra. Es un dato de la página pública, así que lo edita quien edita la
 * página (`puedeEditarPaginaDelNegocio`: dueño y encargado), con la misma
 * validación que Configuración › Tu página pública.
 *
 * Un miembro de otro negocio o que no existe es 404, como si no existiera, y
 * la escritura lleva el negocio en el where. El límite de peticiones es el
 * genérico del panel (`proxy.ts`).
 */

const especialidadSchema = z.object({ especialidad: textoOpcional("La especialidad", 60) })

type Contexto = { params: Promise<{ id: string }> }

export async function PUT(request: NextRequest, { params }: Contexto) {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor || !puedeEditarPaginaDelNegocio(actor)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const { id } = await params
  const miembro = await prisma.businessMember.findFirst({ where: { id, businessId: actor.businessId }, select: { id: true } })
  if (!miembro) return NextResponse.json({ error: "Miembro no encontrado" }, { status: 404 })

  const datos = especialidadSchema.safeParse(await cuerpoDelPedido(request))
  if (!datos.success) return respuestaDeDatosInvalidos(datos.error)

  const { count } = await prisma.businessMember.updateMany({
    where: { id: miembro.id, businessId: actor.businessId },
    data: { especialidad: datos.data.especialidad },
  })
  if (count === 0) return NextResponse.json({ error: "Miembro no encontrado" }, { status: 404 })

  return NextResponse.json({ especialidad: datos.data.especialidad })
}
