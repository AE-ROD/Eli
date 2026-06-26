import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { checkPermission } from "@/lib/permissions"

const REPORT_TYPES = [
  "INGRESOS",
  "CITAS",
  "SERVICIOS",
  "TRABAJADORES",
  "CLIENTES",
  "OCUPACION",
  "CIERRES",
] as const

const savedReportSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional().or(z.literal("")),
  reportType: z.enum(REPORT_TYPES),
  filters: z.record(z.any()),
  isPinned: z.boolean().optional(),
})

export async function GET() {
  const auth = await checkPermission("reports", "view")
  if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const reports = await prisma.savedReport.findMany({
    where: { businessId: auth.member.businessId },
    orderBy: [{ isPinned: "desc" }, { updatedAt: "desc" }],
    include: { createdBy: { select: { user: { select: { name: true } } } } },
  })

  return NextResponse.json({ reports })
}

export async function POST(request: NextRequest) {
  const auth = await checkPermission("reports", "view")
  if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  try {
    const body = await request.json()
    const datos = savedReportSchema.parse(body)

    const report = await prisma.savedReport.create({
      data: {
        businessId: auth.member.businessId,
        createdById: auth.member.id,
        name: datos.name,
        description: datos.description || null,
        reportType: datos.reportType,
        filters: datos.filters,
        isPinned: datos.isPinned ?? false,
      },
    })

    return NextResponse.json(report, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", detalles: error.errors }, { status: 400 })
    }
    console.error("Error creando reporte guardado:", error)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}

const patchSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(500).optional().or(z.literal("")),
  filters: z.record(z.any()).optional(),
  isPinned: z.boolean().optional(),
})

export async function PATCH(request: NextRequest) {
  const auth = await checkPermission("reports", "view")
  if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  try {
    const body = await request.json()
    const datos = patchSchema.parse(body)

    const existing = await prisma.savedReport.findFirst({
      where: { id: datos.id, businessId: auth.member.businessId },
    })
    if (!existing) return NextResponse.json({ error: "No encontrado" }, { status: 404 })

    const updated = await prisma.savedReport.update({
      where: { id: datos.id },
      data: {
        ...(datos.name !== undefined ? { name: datos.name } : {}),
        ...(datos.description !== undefined ? { description: datos.description || null } : {}),
        ...(datos.filters !== undefined ? { filters: datos.filters } : {}),
        ...(datos.isPinned !== undefined ? { isPinned: datos.isPinned } : {}),
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", detalles: error.errors }, { status: 400 })
    }
    console.error("Error actualizando reporte guardado:", error)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await checkPermission("reports", "view")
  if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get("id")
  if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 })

  const existing = await prisma.savedReport.findFirst({
    where: { id, businessId: auth.member.businessId },
  })
  if (!existing) return NextResponse.json({ error: "No encontrado" }, { status: 404 })

  await prisma.savedReport.delete({ where: { id } })

  return NextResponse.json({ ok: true })
}
