import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { checkPermission, can } from "@/lib/permissions"

const paymentBreakdownSchema = z.array(
  z.object({
    method: z.enum(["EFECTIVO", "TARJETA_DEBITO", "TARJETA_CREDITO", "TRANSFERENCIA", "OTRO"]),
    amount: z.number(),
    transactionCount: z.number(),
  })
)

const tipsBreakdownSchema = z.array(
  z.object({
    memberId: z.string(),
    amount: z.number(),
  })
)

const shiftCloseUpdateSchema = z.object({
  shiftStartTime: z.string().optional(),
  shiftEndTime: z.string().optional(),
  declaredRevenue: z.number().optional(),
  cashOpening: z.number().optional(),
  cashClosing: z.number().optional(),
  cashWithdrawals: z.number().optional(),
  cashDeposits: z.number().optional(),
  paymentBreakdown: paymentBreakdownSchema.optional(),
  tipsTotal: z.number().optional(),
  tipsBreakdown: tipsBreakdownSchema.optional(),
  pendingItems: z.array(z.string()).optional(),
  observations: z.string().max(1000).optional(),
  status: z.enum(["CERRADO", "BORRADOR", "REVISADO"]).optional(),
  reviewNotes: z.string().optional(),
})

async function buscarCierre(id: string, businessId: string) {
  return prisma.shiftClose.findFirst({
    where: { id, businessId },
    include: {
      closedBy: { select: { id: true, user: { select: { name: true } } } },
      reviewedBy: { select: { id: true, user: { select: { name: true } } } },
    },
  })
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const acceso = await checkPermission("shiftClose", "view")
  if (!acceso) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }
  const { member, permissions } = acceso

  const { id } = await params
  const cierre = await buscarCierre(id, member.businessId)
  if (!cierre) {
    return NextResponse.json({ error: "Cierre de turno no encontrado" }, { status: 404 })
  }

  if (!can(permissions, "shiftClose", "viewAll") && cierre.closedById !== member.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 })
  }

  return NextResponse.json(cierre)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const acceso = await checkPermission("shiftClose", "edit")
  if (!acceso) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }
  const { member, permissions } = acceso

  const { id } = await params
  const cierre = await buscarCierre(id, member.businessId)
  if (!cierre) {
    return NextResponse.json({ error: "Cierre de turno no encontrado" }, { status: 404 })
  }

  const puedeRevisar = can(permissions, "shiftClose", "review")
  const esPropio = cierre.closedById === member.id

  if (!esPropio && !puedeRevisar) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 })
  }

  try {
    const body = await request.json()
    const datos = shiftCloseUpdateSchema.parse(body)

    // Reabrir CERRADO -> BORRADOR: solo quien puede revisar
    if (datos.status === "BORRADOR") {
      if (cierre.status !== "CERRADO" && cierre.status !== "REVISADO") {
        return NextResponse.json(
          { error: "Solo se puede reabrir un cierre que esté CERRADO o REVISADO" },
          { status: 400 }
        )
      }
      if (!puedeRevisar) {
        return NextResponse.json(
          { error: "No tienes permiso para reabrir un cierre de turno" },
          { status: 403 }
        )
      }
    }

    // Transición a REVISADO: solo quien puede revisar, y solo desde CERRADO
    if (datos.status === "REVISADO") {
      if (!puedeRevisar) {
        return NextResponse.json(
          { error: "No tienes permiso para revisar este cierre de turno" },
          { status: 403 }
        )
      }
      if (cierre.status !== "CERRADO") {
        return NextResponse.json(
          { error: "Solo se puede marcar como REVISADO un cierre que esté CERRADO" },
          { status: 400 }
        )
      }
    }

    const data: Record<string, unknown> = {}

    if (datos.shiftStartTime !== undefined) data.shiftStartTime = new Date(datos.shiftStartTime)
    if (datos.shiftEndTime !== undefined) data.shiftEndTime = new Date(datos.shiftEndTime)
    if (datos.declaredRevenue !== undefined) data.declaredRevenue = datos.declaredRevenue
    if (datos.cashOpening !== undefined) data.cashOpening = datos.cashOpening
    if (datos.cashClosing !== undefined) data.cashClosing = datos.cashClosing
    if (datos.cashWithdrawals !== undefined) data.cashWithdrawals = datos.cashWithdrawals
    if (datos.cashDeposits !== undefined) data.cashDeposits = datos.cashDeposits
    if (datos.paymentBreakdown !== undefined) data.paymentBreakdown = datos.paymentBreakdown
    if (datos.tipsTotal !== undefined) data.tipsTotal = datos.tipsTotal
    if (datos.tipsBreakdown !== undefined) data.tipsBreakdown = datos.tipsBreakdown
    if (datos.pendingItems !== undefined) data.pendingItems = datos.pendingItems
    if (datos.observations !== undefined) data.observations = datos.observations

    if (datos.status === "CERRADO") {
      const declaredRevenueFinal =
        datos.declaredRevenue !== undefined
          ? datos.declaredRevenue
          : cierre.declaredRevenue !== null
            ? Number(cierre.declaredRevenue)
            : null

      if (declaredRevenueFinal === null || declaredRevenueFinal === undefined) {
        return NextResponse.json(
          { error: "declaredRevenue es obligatorio para cerrar el turno" },
          { status: 400 }
        )
      }

      const expectedRevenueFinal = Number(cierre.expectedRevenue ?? 0)
      data.status = "CERRADO"
      data.discrepancy = expectedRevenueFinal - declaredRevenueFinal
      data.closedAt = new Date()
    } else if (datos.status === "BORRADOR") {
      data.status = "BORRADOR"
      data.closedAt = null
      data.reviewedAt = null
      data.reviewedById = null
      data.discrepancy = null
    } else if (datos.status === "REVISADO") {
      data.status = "REVISADO"
      data.reviewedAt = new Date()
      data.reviewedById = member.id
    }

    if (datos.reviewNotes !== undefined) {
      if (!puedeRevisar) {
        return NextResponse.json(
          { error: "No tienes permiso para agregar notas de revisión" },
          { status: 403 }
        )
      }
      data.reviewNotes = datos.reviewNotes
    }

    const actualizado = await prisma.shiftClose.update({
      where: { id },
      data,
      include: {
        closedBy: { select: { id: true, user: { select: { name: true } } } },
        reviewedBy: { select: { id: true, user: { select: { name: true } } } },
      },
    })

    return NextResponse.json(actualizado)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", detalles: error.errors },
        { status: 400 }
      )
    }
    console.error("Error actualizando cierre de turno:", error)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const acceso = await checkPermission("shiftClose", "delete")
  if (!acceso) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }
  const { member } = acceso

  const { id } = await params
  const cierre = await prisma.shiftClose.findFirst({
    where: { id, businessId: member.businessId },
  })
  if (!cierre) {
    return NextResponse.json({ error: "Cierre de turno no encontrado" }, { status: 404 })
  }

  await prisma.shiftClose.delete({ where: { id } })

  return NextResponse.json({ mensaje: "Cierre de turno eliminado" })
}
