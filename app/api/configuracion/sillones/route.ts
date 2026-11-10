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
  ORDEN_DE_SILLONES,
  SELECCION_DE_SILLON,
  ordenAlFinal,
  sillonNuevoSchema,
} from "@/lib/sillones"

/** Ninguna clínica tiene tantos sillones; corta una lista sin fin. */
const TOPE_DE_SILLONES = 100

const noEncontrado = () => NextResponse.json({ error: "No encontrado" }, { status: 404 })

/**
 * Los sillones de la clínica, activos e inactivos, en el orden de la agenda.
 * Todo rol de la clínica (para la agenda por sillón y el inicio). Fuera de
 * una clínica dental, 404: como lo ajeno, no se confirma que exista.
 */
export async function GET() {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  if (!veSillones(actor)) return noEncontrado()

  const sillones = await prisma.sillon.findMany({
    where: whereDeSillones(actor),
    select: SELECCION_DE_SILLON,
    orderBy: ORDEN_DE_SILLONES,
    take: TOPE_DE_SILLONES,
  })
  return NextResponse.json(sillones)
}

/**
 * Agrega un sillón. Dueño y encargado, como los servicios. Sin orden, va al
 * final. Un nombre que ya existe en la clínica (sin distinguir mayúsculas)
 * es 409; el único de la base cubre la carrera de dos altas a la vez.
 */
export async function POST(request: NextRequest) {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  if (!veSillones(actor)) return noEncontrado()
  if (!puedeGestionarSillones(actor)) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  let datos: z.infer<typeof sillonNuevoSchema>
  try {
    const recibido = await cuerpoConTope(request)
    if (recibido.excedido) return respuestaDeCuerpoDemasiadoGrande()
    datos = sillonNuevoSchema.parse(recibido.cuerpo)
  } catch (error) {
    if (error instanceof z.ZodError) return respuestaDeDatosInvalidos(error)
    throw error
  }

  const repetido = await prisma.sillon.findFirst({
    where: whereDeSillones(actor, { nombre: { equals: datos.nombre, mode: "insensitive" } }),
    select: { id: true },
  })
  if (repetido) return NextResponse.json({ error: MENSAJE_NOMBRE_REPETIDO }, { status: 409 })

  let orden = datos.orden
  if (orden === undefined) {
    const ultimo = await prisma.sillon.findFirst({
      where: whereDeSillones(actor),
      select: { orden: true },
      orderBy: { orden: "desc" },
    })
    orden = ordenAlFinal(ultimo?.orden)
  }

  try {
    const sillon = await prisma.sillon.create({
      data: { businessId: actor.businessId, nombre: datos.nombre, orden, activo: datos.activo ?? true },
      select: SELECCION_DE_SILLON,
    })
    return NextResponse.json(sillon, { status: 201 })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: MENSAJE_NOMBRE_REPETIDO }, { status: 409 })
    }
    registrarError("creando sillón", error)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}
