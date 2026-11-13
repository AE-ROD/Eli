import { NextRequest, NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { registrarError } from "@/lib/registro-de-errores"
import { cuerpoConTope, respuestaDeCuerpoDemasiadoGrande } from "@/lib/cuerpo-del-pedido"
import { respuestaDeDatosInvalidos } from "@/lib/respuesta-de-validacion"
import { actorDeSesion, puedeGestionarSillones, veSillones, whereDeSillones } from "@/lib/permisos"
import {
  MENSAJE_NOMBRE_REPETIDO,
  MENSAJE_SILLON_NO_ENCONTRADO,
  SELECCION_DE_SILLON,
  edicionDeSillonSchema,
} from "@/lib/sillones"

const noEncontrado = () => NextResponse.json({ error: MENSAJE_SILLON_NO_ENCONTRADO }, { status: 404 })

/**
 * Renombra, ordena, desactiva o reactiva un sillón. No hay DELETE a
 * propósito: un sillón que ya no se usa se desactiva, y las citas que lo
 * tienen lo siguen nombrando. Desactivarlo no le quita el sillón a ninguna
 * cita; sólo deja de ofrecerse para asignar.
 *
 * Primero la pertenencia (un sillón de otro negocio, o cualquiera fuera de
 * una clínica dental, es 404), después el permiso: dueño y encargado.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  if (!veSillones(actor)) return noEncontrado()

  const { id } = await params
  const existente = await prisma.sillon.findFirst({ where: whereDeSillones(actor, { id }), select: { id: true } })
  if (!existente) return noEncontrado()
  if (!puedeGestionarSillones(actor)) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  let datos: z.infer<typeof edicionDeSillonSchema>
  try {
    const recibido = await cuerpoConTope(request)
    if (recibido.excedido) return respuestaDeCuerpoDemasiadoGrande()
    datos = edicionDeSillonSchema.parse(recibido.cuerpo)
  } catch (error) {
    if (error instanceof z.ZodError) return respuestaDeDatosInvalidos(error)
    throw error
  }

  if (datos.nombre !== undefined) {
    const repetido = await prisma.sillon.findFirst({
      where: whereDeSillones(actor, {
        id: { not: existente.id },
        nombre: { equals: datos.nombre, mode: "insensitive" },
      }),
      select: { id: true },
    })
    if (repetido) return NextResponse.json({ error: MENSAJE_NOMBRE_REPETIDO }, { status: 409 })
  }

  try {
    // Acotado por negocio, no sólo por id: la escritura no depende de que el
    // id venga verificado.
    const { count } = await prisma.sillon.updateMany({
      where: { id: existente.id, businessId: actor.businessId },
      data: {
        ...(datos.nombre !== undefined && { nombre: datos.nombre }),
        ...(datos.orden !== undefined && { orden: datos.orden }),
        ...(datos.activo !== undefined && { activo: datos.activo }),
      },
    })
    if (count === 0) return noEncontrado()
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: MENSAJE_NOMBRE_REPETIDO }, { status: 409 })
    }
    registrarError("editando sillón", error)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }

  const sillon = await prisma.sillon.findFirst({ where: whereDeSillones(actor, { id: existente.id }), select: SELECCION_DE_SILLON })
  if (!sillon) return noEncontrado()
  return NextResponse.json(sillon)
}
