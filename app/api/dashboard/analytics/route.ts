import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.businessId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const businessId = session.user.businessId
  const hoy = new Date()
  hoy.setHours(23, 59, 59, 999)

  // 8 weeks of weekly appointment counts
  const semanas: { label: string; citas: number }[] = []
  for (let i = 7; i >= 0; i--) {
    const inicioSemana = new Date(hoy)
    inicioSemana.setDate(inicioSemana.getDate() - i * 7 - 6)
    inicioSemana.setHours(0, 0, 0, 0)
    const finSemana = new Date(hoy)
    finSemana.setDate(finSemana.getDate() - i * 7)
    finSemana.setHours(23, 59, 59, 999)

    const count = await prisma.appointment.count({
      where: {
        businessId,
        startTime: { gte: inicioSemana, lte: finSemana },
        status: { not: "cancelada" },
      },
    })

    const label = inicioSemana.toLocaleDateString("es-MX", { month: "short", day: "numeric" })
    semanas.push({ label, citas: count })
  }

  // Top services (last 30 days)
  const hace30Dias = new Date(hoy)
  hace30Dias.setDate(hace30Dias.getDate() - 30)

  const citasPorServicio = await prisma.appointment.groupBy({
    by: ["title"],
    where: {
      businessId,
      startTime: { gte: hace30Dias },
      status: { not: "cancelada" },
    },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
    take: 5,
  })

  const serviciosPopulares = citasPorServicio.map((s) => ({
    nombre: s.title,
    citas: s._count.id,
  }))

  // Totals
  const [totalCitas, totalPacientes, ingresosMes] = await Promise.all([
    prisma.appointment.count({
      where: { businessId, status: { not: "cancelada" } },
    }),
    prisma.patient.count({ where: { businessId } }),
    prisma.appointment.aggregate({
      where: {
        businessId,
        startTime: { gte: new Date(hoy.getFullYear(), hoy.getMonth(), 1) },
        status: "completada",
        price: { not: null },
      },
      _sum: { price: true },
    }),
  ])

  return NextResponse.json({
    semanas,
    serviciosPopulares,
    totalCitas,
    totalPacientes,
    ingresosMes: ingresosMes._sum.price ?? 0,
  })
}
