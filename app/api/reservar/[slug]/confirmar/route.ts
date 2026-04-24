import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const reservaSchema = z.object({
  servicioId: z.string(),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hora: z.string().regex(/^\d{2}:\d{2}$/),
  nombre: z.string().min(2),
  apellido: z.string().min(2),
  cedula: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  telefono: z.string().optional(),
  comentarios: z.string().optional(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params

  const negocio = await prisma.business.findUnique({
    where: { slug },
    select: { id: true },
  })
  if (!negocio) return NextResponse.json({ error: "Negocio no encontrado" }, { status: 404 })

  try {
    const body = await request.json()
    const datos = reservaSchema.parse(body)

    const servicio = await prisma.service.findFirst({
      where: { id: datos.servicioId, businessId: negocio.id, active: true },
    })
    if (!servicio) return NextResponse.json({ error: "Servicio no disponible" }, { status: 404 })

    // Calcular startTime y endTime
    const startTime = new Date(`${datos.fecha}T${datos.hora}:00`)
    const endTime = new Date(startTime.getTime() + servicio.duration * 60000)

    // Verificar que el slot sigue libre
    const conflicto = await prisma.appointment.findFirst({
      where: {
        businessId: negocio.id,
        status: { notIn: ["cancelada"] },
        OR: [
          { startTime: { gte: startTime, lt: endTime } },
          { endTime: { gt: startTime, lte: endTime } },
          { startTime: { lte: startTime }, endTime: { gte: endTime } },
        ],
      },
    })
    if (conflicto) {
      return NextResponse.json({ error: "El horario ya no está disponible" }, { status: 409 })
    }

    // Buscar o crear cliente
    let cliente = await prisma.patient.findFirst({
      where: {
        businessId: negocio.id,
        OR: [
          ...(datos.email ? [{ email: datos.email }] : []),
          ...(datos.cedula ? [{ cedula: datos.cedula }] : []),
        ],
      },
    })

    if (!cliente) {
      cliente = await prisma.patient.create({
        data: {
          name: datos.nombre,
          lastName: datos.apellido,
          cedula: datos.cedula || null,
          email: datos.email || null,
          phone: datos.telefono || null,
          businessId: negocio.id,
        },
      })
    }

    // Crear la cita
    const cita = await prisma.appointment.create({
      data: {
        title: servicio.name,
        serviceId: servicio.id,
        startTime,
        endTime,
        status: "pendiente",
        clientComments: datos.comentarios || null,
        price: servicio.price,
        patientId: cliente.id,
        businessId: negocio.id,
      },
    })

    return NextResponse.json({ citaId: cita.id, mensaje: "Reserva confirmada" }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", detalles: error.errors }, { status: 400 })
    }
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}
