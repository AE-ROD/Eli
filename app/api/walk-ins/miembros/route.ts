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

  const miembros = await prisma.businessMember.findMany({
    where: { businessId },
    select: {
      id: true,
      role: true,
      user: { select: { name: true, email: true } },
    },
    orderBy: { createdAt: "asc" },
  })

  return NextResponse.json({
    miembros: miembros.map((m) => ({
      id: m.id,
      nombre: m.user.name,
      email: m.user.email,
      role: m.role,
    })),
  })
}
