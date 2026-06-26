import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

const DIA_MS = 24 * 60 * 60 * 1000

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.businessId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }
  const businessId = session.user.businessId as string

  try {
    const hace30Dias = new Date(Date.now() - 30 * DIA_MS)

    const [serviciosSinReservas, pacientesSinRegresar] = await Promise.all([
      prisma.service.findMany({
        where: { businessId, active: true },
        select: { id: true },
      }).then(async (servicios) => {
        const conReservas = await prisma.appointment.groupBy({
          by: ["serviceId"],
          where: {
            businessId,
            startTime: { gte: hace30Dias },
            status: { not: "cancelada" },
            serviceId: { not: null },
          },
          _count: true,
        })

        const conReservasIds = new Set(
          conReservas
            .map((reserva) => reserva.serviceId)
            .filter((serviceId): serviceId is string => Boolean(serviceId))
        )

        return servicios.filter((servicio) => !conReservasIds.has(servicio.id)).length
      }),

      prisma.patient.findMany({
        where: { businessId },
        select: {
          appointments: {
            where: { status: { not: "cancelada" } },
            orderBy: { startTime: "desc" },
            take: 2,
            select: { startTime: true },
          },
        },
      }).then((pacientes) => {
        const ahora = Date.now()

        return pacientes.filter((paciente) => {
          const citas = paciente.appointments
          if (citas.length < 2) return false

          const intervalo = citas[0].startTime.getTime() - citas[1].startTime.getTime()
          if (intervalo <= 0) return false

          const diasSinVolver = (ahora - citas[0].startTime.getTime()) / DIA_MS
          const intervaloPromedio = intervalo / DIA_MS

          return diasSinVolver > intervaloPromedio * 2
        }).length
      }),
    ])

    const alta = serviciosSinReservas + pacientesSinRegresar

    return NextResponse.json({ alta, total: alta })
  } catch {
    return NextResponse.json({ alta: 0, total: 0 })
  }
}
