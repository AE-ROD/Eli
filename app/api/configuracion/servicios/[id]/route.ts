import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
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
import {
  actorDeSesion,
  esClinicaDental,
  puedeGestionarServicios,
  puedeMarcarServicioComoUrgencia,
  whereDePrestacionesDelPlan,
} from "@/lib/permisos"
import { CuerpoDemasiadoGrande, leerJsonConTope, respuestaDeCuerpoDemasiadoGrande } from "@/lib/cuerpo-del-pedido"
import { registrarError } from "@/lib/registro-de-errores"

const edicionDeServicioSchema = z.object({
  name: nombre().optional(),
  description: descripcion().optional().nullable(),
  duration: duracion().optional(),
  price: precioDeServicio().optional().nullable(),
  active: z.boolean().optional(),
  category: categoriaDeServicio().optional().nullable(),
  // Cada cuántos días vuelve un cliente por este servicio ("te toca", #75). null la borra.
  frecuenciaDias: frecuenciaDeServicio().optional(),
  // Clínica dental: el motivo es una urgencia y la reserva pública sólo ofrece horas de hoy.
  // En otro rubro no corresponde: el servidor la rechaza (ver `puedeMarcarServicioComoUrgencia`).
  esUrgencia: urgenciaDeServicio().optional(),
})

const MENSAJE_CON_COMISIONES =
  "Este servicio tiene comisiones configuradas. Desactívalo en vez de borrarlo, o pídele al dueño que quite esas comisiones primero."
const MENSAJE_EN_UN_PLAN =
  "Este servicio está en el plan de tratamiento de algún paciente. Desactívalo en vez de borrarlo: deja de ofrecerse y los planes lo conservan."

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
    const cuerpo = await leerJsonConTope(request)
    const datos = edicionDeServicioSchema.parse(cuerpo)

    // La bandera de urgencia es de la clínica dental: la decide el servidor con el rubro de la
    // sesión, no el navegador. En otro rubro ni `false` se acepta (no hay nada que marcar).
    if (datos.esUrgencia !== undefined && !puedeMarcarServicioComoUrgencia(actor)) {
      return NextResponse.json({ error: MENSAJE_URGENCIA_SOLO_EN_CLINICA }, { status: 401 })
    }

    const servicio = await prisma.service.update({
      where: { id },
      data: datos,
    })

    return NextResponse.json(servicio)
  } catch (error) {
    if (error instanceof CuerpoDemasiadoGrande) return respuestaDeCuerpoDemasiadoGrande()
    if (error instanceof z.ZodError) {
      return respuestaDeDatosInvalidos(error)
    }
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "El pedido no es un JSON válido" }, { status: 400 })
    }
    // Se borró entre la lectura y la escritura: como uno que no existe.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "Servicio no encontrado" }, { status: 404 })
    }
    registrarError("editando un servicio", error)
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
    // En una clínica dental también lo impide una prestación de algún plan
    // de tratamiento que salió de este servicio (FK NO ACTION): se dice eso.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      const enUnPlan =
        esClinicaDental(actor) &&
        (await prisma.prestacionDelPlan.count({ where: whereDePrestacionesDelPlan(actor, { serviceId: existente.id }) })) > 0
      return NextResponse.json({ error: enUnPlan ? MENSAJE_EN_UN_PLAN : MENSAJE_CON_COMISIONES }, { status: 409 })
    }
    // Otro lo borró entretanto: ya no está, como uno que no existe.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "Servicio no encontrado" }, { status: 404 })
    }
    throw error
  }

  return NextResponse.json({ mensaje: "Servicio eliminado" })
}
