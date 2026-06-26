import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

function lunesDeLaSemana(fecha: Date): string {
  const d = new Date(fecha)
  const dia = d.getDay()
  const diff = dia === 0 ? -6 : 1 - dia
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d.toISOString().split("T")[0]
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.businessId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }
  const businessId = session.user.businessId as string

  const ahora = new Date()
  const inicioRango = new Date(ahora)
  inicioRango.setDate(inicioRango.getDate() - 7 * 8)
  inicioRango.setHours(0, 0, 0, 0)

  const citas = await prisma.appointment.findMany({
    where: {
      businessId,
      startTime: { gte: inicioRango },
      status: "completada",
      price: { not: null },
    },
    select: { startTime: true, price: true },
  })

  const agrupado: Record<string, { ingresos: number; citas: number }> = {}

  for (const cita of citas) {
    const semana = lunesDeLaSemana(cita.startTime)
    agrupado[semana] ??= { ingresos: 0, citas: 0 }
    agrupado[semana].ingresos += Number(cita.price ?? 0)
    agrupado[semana].citas += 1
  }

  const semanas: string[] = []
  for (let i = 7; i >= 0; i--) {
    const d = new Date(ahora)
    d.setDate(d.getDate() - i * 7)
    semanas.push(lunesDeLaSemana(d))
  }

  return NextResponse.json({
    datos: semanas.map((semana) => ({
      semana,
      etiqueta: new Date(`${semana}T00:00:00`).toLocaleDateString("es-ES", {
        day: "numeric",
        month: "short",
      }),
      ingresos: agrupado[semana]?.ingresos ?? 0,
      citas: agrupado[semana]?.citas ?? 0,
    })),
  })
}
