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

  const members = await prisma.businessMember.findMany({
    where: { businessId },
    select: { id: true, user: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  })

  return NextResponse.json({
    miembros: members.map((m) => ({ id: m.id, nombre: m.user.name })),
  })
}
