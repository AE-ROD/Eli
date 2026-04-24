import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params

  const negocio = await prisma.business.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      type: true,
      slug: true,
      services: {
        where: { active: true },
        select: { id: true, name: true, description: true, duration: true, price: true },
        orderBy: { createdAt: "asc" },
      },
      workSchedules: {
        where: { active: true },
        select: { dayOfWeek: true, startTime: true, endTime: true },
        orderBy: { dayOfWeek: "asc" },
      },
    },
  })

  if (!negocio) {
    return NextResponse.json({ error: "Negocio no encontrado" }, { status: 404 })
  }

  return NextResponse.json(negocio)
}
