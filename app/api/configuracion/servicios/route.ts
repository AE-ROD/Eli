import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import {
  MENSAJE_URGENCIA_SOLO_EN_CLINICA,
  categoriaDeServicio,
  descripcion,
  duracion,
  nombre,
  precioDeServicio,
  urgenciaDeServicio,
} from "@/lib/campos-del-panel"
import { frecuenciaDeServicio } from "@/lib/frecuencia-de-visitas"
import { respuestaDeDatosInvalidos } from "@/lib/respuesta-de-validacion"
import { actorDeSesion, puedeGestionarServicios, puedeMarcarServicioComoUrgencia } from "@/lib/permisos"
import { CuerpoDemasiadoGrande, leerJsonConTope, respuestaDeCuerpoDemasiadoGrande } from "@/lib/cuerpo-del-pedido"
import { MAX_SERVICIOS_POR_NEGOCIO, TopeDeServicios, mensajeDeTopeDeServicios } from "@/lib/servicios-en-lote"
import { vocabularioDe } from "@/lib/vocabulario"

export async function GET() {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)

  if (!actor || !puedeGestionarServicios(actor)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const servicios = await prisma.service.findMany({
    where: { businessId: actor.businessId },
    orderBy: { createdAt: "asc" },
    // El tope de servicios de un negocio: la lista siempre los trae todos.
    take: MAX_SERVICIOS_POR_NEGOCIO,
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
  // Cada cuántos días vuelve un cliente por este servicio ("te toca", #75). Opcional.
  frecuenciaDias: frecuenciaDeServicio().optional(),
  // Clínica dental: el motivo es una urgencia y la reserva pública sólo ofrece horas de hoy.
  // En otro rubro no corresponde: el servidor la rechaza (ver `puedeMarcarServicioComoUrgencia`).
  esUrgencia: urgenciaDeServicio().optional(),
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

    // La bandera de urgencia es de la clínica dental: la decide el servidor con el rubro de la
    // sesión, no el navegador. En otro rubro ni `false` se acepta (no hay nada que marcar).
    if (datos.esUrgencia !== undefined && !puedeMarcarServicioComoUrgencia(actor)) {
      return NextResponse.json({ error: MENSAJE_URGENCIA_SOLO_EN_CLINICA }, { status: 401 })
    }

    // Con el candado del negocio (el mismo de la carga en lote): sin él, un servicio suelto y
    // una carga a la vez contaban los mismos servicios y pasaban los dos del tope.
    const servicio = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`servicios:${actor.businessId}`}))`
      const existentes = await tx.service.count({ where: { businessId: actor.businessId } })
      if (existentes >= MAX_SERVICIOS_POR_NEGOCIO) throw new TopeDeServicios(existentes, 1)

      return tx.service.create({
        data: {
          ...datos,
          price: datos.price ?? null,
          frecuenciaDias: datos.frecuenciaDias ?? null,
          businessId: actor.businessId,
        },
      })
    })

    return NextResponse.json(servicio, { status: 201 })
  } catch (error) {
    if (error instanceof CuerpoDemasiadoGrande) return respuestaDeCuerpoDemasiadoGrande()
    if (error instanceof z.ZodError) {
      return respuestaDeDatosInvalidos(error)
    }
    if (error instanceof TopeDeServicios) {
      return NextResponse.json(
        { error: mensajeDeTopeDeServicios(error.existentes, error.nuevos, vocabularioDe(actor.rubro).palabras.servicio) },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}
