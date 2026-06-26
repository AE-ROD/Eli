import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params

  const negocio = await prisma.business.findUnique({
    where: { slug },
    select: { id: true },
  })
  if (!negocio) return NextResponse.json({ miembros: [] })

  const miembros = await prisma.businessMember.findMany({
    where: {
      businessId: negocio.id,
      workSchedules: { some: { active: true } },
    },
    select: {
      id: true,
      user: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
  })

  return NextResponse.json({
    miembros: miembros.map((m) => ({ id: m.id, nombre: m.user.name })),
  })
}
