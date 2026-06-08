import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { enviarConfirmacionCliente, enviarAvisoProfesional } from "@/lib/email"

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
  memberId: z.string().optional(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params

  const negocio = await prisma.business.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      user: { select: { email: true } },
    },
  })
  if (!negocio) return NextResponse.json({ error: "Negocio no encontrado" }, { status: 404 })

  try {
    const body = await request.json()
    const datos = reservaSchema.parse(body)

    const servicio = await prisma.service.findFirst({
      where: { id: datos.servicioId, businessId: negocio.id, active: true },
    })
    if (!servicio) return NextResponse.json({ error: "Servicio no disponible" }, { status: 404 })

    const startTime = new Date(`${datos.fecha}T${datos.hora}:00`)
    const endTime = new Date(startTime.getTime() + servicio.duration * 60000)
    const emailCliente = datos.email || null

    let cita: Awaited<ReturnType<typeof prisma.appointment.create>>

    try {
      cita = await prisma.$transaction(async (tx) => {
        // Worker-level conflict check: scope to memberId when provided, otherwise business-level
        const conflicto = await tx.appointment.findFirst({
          where: {
            businessId: negocio.id,
            ...(datos.memberId ? { memberId: datos.memberId } : {}),
            status: { notIn: ["cancelada"] },
            OR: [
              { startTime: { gte: startTime, lt: endTime } },
              { endTime: { gt: startTime, lte: endTime } },
              { startTime: { lte: startTime }, endTime: { gte: endTime } },
            ],
          },
        })
        if (conflicto) throw new Error("SLOT_TAKEN")

        // Patient upsert by (businessId, email) when email present; cedula lookup otherwise
        let cliente: Awaited<ReturnType<typeof tx.patient.create>>

        if (emailCliente) {
          cliente = await tx.patient.upsert({
            where: { businessId_email: { businessId: negocio.id, email: emailCliente } },
            update: {
              ...(datos.cedula ? { cedula: datos.cedula } : {}),
              ...(datos.telefono ? { phone: datos.telefono } : {}),
            },
            create: {
              name: datos.nombre,
              lastName: datos.apellido,
              cedula: datos.cedula || null,
              email: emailCliente,
              phone: datos.telefono || null,
              businessId: negocio.id,
            },
          })
        } else {
          const existing = datos.cedula
            ? await tx.patient.findFirst({ where: { businessId: negocio.id, cedula: datos.cedula } })
            : null
          if (existing) {
            cliente = existing
          } else {
            cliente = await tx.patient.create({
              data: {
                name: datos.nombre,
                lastName: datos.apellido,
                cedula: datos.cedula || null,
                email: null,
                phone: datos.telefono || null,
                businessId: negocio.id,
              },
            })
          }
        }

        return await tx.appointment.create({
          data: {
            title: servicio.name,
            serviceId: servicio.id,
            startTime,
            endTime,
            status: "pendiente",
            clientComments: datos.comentarios || null,
            price: servicio.price,
            patientId: cliente.id,
            memberId: datos.memberId || null,
            businessId: negocio.id,
          },
        })
      })
    } catch (err) {
      if (err instanceof Error && err.message === "SLOT_TAKEN") {
        return NextResponse.json({ error: "SLOT_TAKEN" }, { status: 409 })
      }
      throw err
    }

    // Fire-and-forget — do not await, email failure must not block confirmation
    const emailsPromises: Promise<unknown>[] = []

    if (emailCliente) {
      emailsPromises.push(
        enviarConfirmacionCliente({
          emailCliente,
          nombreCliente: `${datos.nombre} ${datos.apellido}`,
          nombreNegocio: negocio.name,
          servicio: servicio.name,
          fecha: datos.fecha,
          hora: datos.hora,
          duracion: servicio.duration,
        })
      )
    }

    emailsPromises.push(
      enviarAvisoProfesional({
        emailProfesional: negocio.user.email,
        nombreNegocio: negocio.name,
        nombreCliente: `${datos.nombre} ${datos.apellido}`,
        servicio: servicio.name,
        fecha: datos.fecha,
        hora: datos.hora,
        comentarios: datos.comentarios,
      })
    )

    void Promise.all(emailsPromises).catch((err) => {
      console.error("[email] send failed — appointment already created:", err)
    })

    return NextResponse.json({ citaId: cita.id, mensaje: "Reserva confirmada" }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", detalles: error.errors }, { status: 400 })
    }
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}
