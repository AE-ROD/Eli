import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.businessId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }
  const businessId = session.user.businessId as string

  const hace30Dias = new Date()
  hace30Dias.setDate(hace30Dias.getDate() - 30)

  const [servicios, reservasPorServicio] = await Promise.all([
    prisma.service.findMany({
      where: { businessId, active: true },
      select: { id: true, name: true, price: true },
    }),
    prisma.appointment.groupBy({
      by: ["serviceId"],
      where: {
        businessId,
        startTime: { gte: hace30Dias },
        status: { not: "cancelada" },
        serviceId: { not: null },
      },
      _count: { id: true },
      _sum: { price: true },
      _max: { startTime: true },
    }),
  ])

  const totalReservas = reservasPorServicio.reduce((acc, r) => acc + r._count.id, 0)

  const result = servicios
    .map((s) => {
      const stats = reservasPorServicio.find((r) => r.serviceId === s.id)
      return {
        id: s.id,
        nombre: s.name,
        precio: s.price,
        reservas30d: stats?._count.id ?? 0,
        ingresos30d: Number(stats?._sum.price ?? 0),
        ultimaReserva: stats?._max.startTime?.toISOString() ?? null,
        porcentajeDelTotal:
          totalReservas > 0
            ? Math.round(((stats?._count.id ?? 0) / totalReservas) * 100)
            : 0,
      }
    })
    .sort((a, b) => b.reservas30d - a.reservas30d)

  return NextResponse.json({ servicios: result })
}
