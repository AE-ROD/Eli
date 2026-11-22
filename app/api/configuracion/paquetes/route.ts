import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { aCentavos } from "@/lib/atenciones"
import { cuerpoConTope, respuestaDeCuerpoDemasiadoGrande } from "@/lib/cuerpo-del-pedido"
import { MAXIMO_DE_PAQUETES } from "@/lib/paquetes"
import { actorDeSesion, puedeGestionarPaquetes } from "@/lib/permisos"
import { respuestaDeDatosInvalidos } from "@/lib/respuesta-de-validacion"
import { ErrorDeAtencion, respuestaDeError } from "@/lib/tablero"
import { vocabularioDe } from "@/lib/vocabulario"
import {
  MENSAJE_DE_SESION_SIN_VALOR,
  SELECCION_DE_PAQUETE,
  cadaSesionValeAlgo,
  formatearPaquete,
  paqueteNuevoSchema,
} from "./_paquetes"

/**
 * Los paquetes de sesiones que ofrece el negocio ("6 sesiones de Depilación
 * láser por $150.000"), para Configuración. Los lee y los escribe quien
 * gestiona los servicios (dueña y encargado), y no existen en la clínica
 * dental: lo decide `puedeGestionarPaquetes`. Venderlos es del tablero.
 */
export async function GET() {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)
  if (!actor || !puedeGestionarPaquetes(actor)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const paquetes = await prisma.paqueteDeSesiones.findMany({
    where: { businessId: actor.businessId },
    select: SELECCION_DE_PAQUETE,
    orderBy: { createdAt: "asc" },
    take: MAXIMO_DE_PAQUETES,
  })

  return NextResponse.json(paquetes.map(formatearPaquete))
}

/**
 * Crea un paquete sobre un servicio activo del negocio. Un servicio de otro
 * negocio da 404, como si no existiera. El precio llega en unidades y se
 * guarda en centavos.
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)
  if (!actor || !puedeGestionarPaquetes(actor)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  let datos: z.infer<typeof paqueteNuevoSchema>
  try {
    const recibido = await cuerpoConTope(request)
    if (recibido.excedido) return respuestaDeCuerpoDemasiadoGrande()
    datos = paqueteNuevoSchema.parse(recibido.cuerpo)
  } catch (error) {
    if (error instanceof z.ZodError) return respuestaDeDatosInvalidos(error)
    throw error
  }

  const priceCents = aCentavos(datos.precio)
  if (!cadaSesionValeAlgo(priceCents, datos.sesiones)) {
    return NextResponse.json({ error: MENSAJE_DE_SESION_SIN_VALOR }, { status: 400 })
  }

  const { servicio } = vocabularioDe(actor.rubro).palabras

  try {
    const paquete = await prisma.$transaction(async (tx) => {
      // Con el candado del negocio: dos altas a la vez no cuentan los mismos paquetes y pasan las dos del tope.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`paquetes:${actor.businessId}`}))`

      const delNegocio = await tx.service.findFirst({
        where: { id: datos.servicioId, businessId: actor.businessId },
        select: { id: true, active: true },
      })
      if (!delNegocio) throw new ErrorDeAtencion(404, "Servicio no encontrado")
      if (!delNegocio.active) {
        throw new ErrorDeAtencion(
          400,
          `Ese ${servicio.singular} está desactivado. Actívalo en Configuración para armar un paquete con él.`
        )
      }

      const existentes = await tx.paqueteDeSesiones.count({ where: { businessId: actor.businessId } })
      if (existentes >= MAXIMO_DE_PAQUETES) {
        throw new ErrorDeAtencion(
          409,
          `Ya tienes ${MAXIMO_DE_PAQUETES} paquetes, que es el máximo. Elimina alguno que ya no ofrezcas para crear otro.`
        )
      }

      return tx.paqueteDeSesiones.create({
        data: {
          businessId: actor.businessId,
          serviceId: delNegocio.id,
          sesiones: datos.sesiones,
          priceCents,
          vigenciaMeses: datos.vigenciaMeses ?? null,
        },
        select: SELECCION_DE_PAQUETE,
      })
    })

    return NextResponse.json(formatearPaquete(paquete), { status: 201 })
  } catch (error) {
    return respuestaDeError(error, "creando paquete de sesiones")
  }
}
