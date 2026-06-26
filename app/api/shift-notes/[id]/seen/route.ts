import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { checkPermission } from "@/lib/permissions"

// POST /api/shift-notes/[id]/seen — marca la nota como vista por el miembro actual
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const acceso = await checkPermission("shiftNotes", "view")
  if (!acceso) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }
  const { member } = acceso
  const { id } = await params

  const nota = await prisma.shiftNote.findFirst({
    where: { id, businessId: member.businessId },
    select: { id: true, seenBy: true },
  })

  if (!nota) {
    return NextResponse.json({ error: "Nota no encontrada" }, { status: 404 })
  }

  if (nota.seenBy.includes(member.id)) {
    return NextResponse.json({ ok: true, seenBy: nota.seenBy })
  }

  const actualizada = await prisma.shiftNote.update({
    where: { id },
    data: { seenBy: { set: [...nota.seenBy, member.id] } },
    select: { seenBy: true },
  })

  return NextResponse.json({ ok: true, seenBy: actualizada.seenBy })
}
