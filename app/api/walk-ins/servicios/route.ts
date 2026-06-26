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

  const servicios = await prisma.service.findMany({
    where: { businessId, active: true },
    select: { id: true, name: true, duration: true, price: true },
    orderBy: { name: "asc" },
  })

  return NextResponse.json({ servicios })
}
