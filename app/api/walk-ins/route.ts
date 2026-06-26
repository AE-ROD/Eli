import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const walkInSchema = z.object({
  nombreCliente: z.string().min(2),
  telefono: z.string().optional().or(z.literal("")),
  email: z.string().email().optional().or(z.literal("")),
  serviceId: z.string().optional().or(z.literal("")),
  memberId: z.string().optional().or(z.literal("")),
  precio: z.coerce.number().min(0).optional(),
  metodoPago: z.string().optional().or(z.literal("")),
  notas: z.string().optional().or(z.literal("")),
  fechaHora: z.string().datetime().optional().or(z.literal("")),
})

function construirNotas(metodoPago?: string, notas?: string) {
  const partes = [
    metodoPago ? `Método de pago: ${metodoPago}` : null,
    notas ? `Notas: ${notas}` : null,
  ].filter(Boolean)

  return partes.length > 0 ? partes.join("\n") : null
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.businessId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }
  const businessId = session.user.businessId as string

  const member = await prisma.businessMember.findFirst({
    where: { userId: session.user.id, businessId },
    select: { id: true },
  })

  if (!member) {
    return NextResponse.json({ error: "No se encontró el miembro del equipo" }, { status: 403 })
  }

  try {
    const body = await request.json()
    const datos = walkInSchema.parse(body)

    const servicio = datos.serviceId
      ? await prisma.service.findFirst({
          where: { id: datos.serviceId, businessId, active: true },
          select: { id: true, name: true, duration: true, price: true },
        })
      : null

    if (datos.serviceId && !servicio) {
      return NextResponse.json({ error: "Servicio no encontrado" }, { status: 404 })
    }

    let miembroAtiendeId = member.id
    if (datos.memberId) {
      const miembroSeleccionado = await prisma.businessMember.findFirst({
        where: { id: datos.memberId, businessId },
        select: { id: true },
      })

      if (!miembroSeleccionado) {
        return NextResponse.json({ error: "Miembro del equipo no encontrado" }, { status: 404 })
      }

      miembroAtiendeId = miembroSeleccionado.id
    }

    const email = datos.email?.trim() || null
    const telefono = datos.telefono?.trim() || null
    const startTime = datos.fechaHora ? new Date(datos.fechaHora) : new Date()
    const duracionMinutos = servicio?.duration ?? 60
    const endTime = new Date(startTime.getTime() + duracionMinutos * 60 * 1000)
    const precio = datos.precio ?? servicio?.price ?? null

    const resultado = await prisma.$transaction(async (tx) => {
      const paciente = email
        ? await tx.patient.upsert({
            where: { businessId_email: { businessId, email } },
            update: {
              name: datos.nombreCliente,
              ...(telefono ? { phone: telefono } : {}),
            },
            create: {
              businessId,
              name: datos.nombreCliente,
              email,
              phone: telefono,
              tags: ["Walk-in"],
            },
            select: { id: true },
          })
        : await tx.patient.create({
            data: {
              businessId,
              name: datos.nombreCliente,
              phone: telefono,
              tags: ["Walk-in"],
            },
            select: { id: true },
          })

      const cita = await tx.appointment.create({
        data: {
          businessId,
          patientId: paciente.id,
          memberId: miembroAtiendeId,
          serviceId: servicio?.id ?? null,
          title: servicio?.name ?? "Walk-in",
          startTime,
          endTime,
          status: "completada",
          isWalkIn: true,
          price: precio,
          notes: construirNotas(datos.metodoPago, datos.notas),
        },
        select: { id: true },
      })

      return { citaId: cita.id, pacienteId: paciente.id }
    })

    return NextResponse.json(resultado, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", detalles: error.errors }, { status: 400 })
    }

    console.error("Error registrando walk-in:", error)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}
