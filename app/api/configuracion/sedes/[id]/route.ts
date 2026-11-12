import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { cuerpoConTope, respuestaDeCuerpoDemasiadoGrande } from "@/lib/cuerpo-del-pedido"
import { actorDeSesion, puedeGestionarSedes, whereDeSedes } from "@/lib/permisos"
import { MENSAJE_SEDE_NO_ENCONTRADA } from "@/lib/reglas-de-sedes"
import { respuestaDeDatosInvalidos } from "@/lib/respuesta-de-validacion"
import {
  borrarSede,
  edicionDeSedeSchema,
  editarSede,
  respuestaDeErrorDeSedes,
  tomarCandadoDePlanYSedes,
} from "@/lib/sedes-servidor"

const noEncontrada = () => NextResponse.json({ error: MENSAJE_SEDE_NO_ENCONTRADA }, { status: 404 })

/**
 * PUT /api/configuracion/sedes/[id] — edita una sede: nombre, dirección,
 * comuna, teléfono (`null` lo quita), orden y activa. Lo que no viene no
 * cambia.
 *
 * Primero la pertenencia (una sede de otro negocio, o que no existe, es 404:
 * nunca 403), después el permiso (`puedeGestionarSedes`: la dueña, en el plan
 * Independiente). 409, con el motivo, al desactivar una sede con horas por
 * delante, al reactivarla si su horario se pisaría con el de otra sede o si ya
 * hay `MAX_SEDES` activas, y con un nombre repetido.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const { id } = await params
  const existente = await prisma.sede.findFirst({ where: whereDeSedes(actor, { id }), select: { id: true } })
  if (!existente) return noEncontrada()
  if (!puedeGestionarSedes(actor)) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const recibido = await cuerpoConTope(request)
  if (recibido.excedido) return respuestaDeCuerpoDemasiadoGrande()
  const datos = edicionDeSedeSchema.safeParse(recibido.cuerpo)
  if (!datos.success) return respuestaDeDatosInvalidos(datos.error)

  try {
    const sede = await prisma.$transaction(async (tx) => {
      await tomarCandadoDePlanYSedes(tx, actor.businessId)
      return editarSede(tx, actor, existente.id, datos.data)
    })
    return NextResponse.json({ sede })
  } catch (error) {
    return respuestaDeErrorDeSedes(error, "editando una sede")
  }
}

/**
 * DELETE /api/configuracion/sedes/[id] — borra una sede que nunca tuvo horas y
 * se lleva su horario. Con una sola cita (pasada, cancelada o por delante) es
 * 409: se desactiva. Misma pertenencia y mismo permiso que PUT.
 */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const { id } = await params
  const existente = await prisma.sede.findFirst({ where: whereDeSedes(actor, { id }), select: { id: true } })
  if (!existente) return noEncontrada()
  if (!puedeGestionarSedes(actor)) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  try {
    await prisma.$transaction(async (tx) => {
      await tomarCandadoDePlanYSedes(tx, actor.businessId)
      await borrarSede(tx, actor, existente.id)
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    return respuestaDeErrorDeSedes(error, "borrando una sede")
  }
}
