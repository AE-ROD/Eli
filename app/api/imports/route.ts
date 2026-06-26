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

  const imports = await prisma.dataImport.findMany({
    where: { businessId },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      fileName: true,
      rowsTotal: true,
      rowsImported: true,
      rowsSkipped: true,
      createdAt: true,
      createdBy: {
        select: { user: { select: { name: true } } },
      },
    },
  })

  return NextResponse.json({ imports })
}
