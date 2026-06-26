import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { checkPermissionWithBusiness } from "../_lib/auth"
import { parseRangoFechas } from "../_lib/dateRange"

export async function GET(request: NextRequest) {
  const auth = await checkPermissionWithBusiness("reports", "view")
  if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const rango = parseRangoFechas(searchParams, auth.timezone)
  if (!rango) {
    return NextResponse.json({ error: "Parámetros from/to inválidos (YYYY-MM-DD)" }, { status: 400 })
  }

  const businessId = auth.member.businessId

  const cierres = await prisma.shiftClose.findMany({
    where: { businessId, shiftDate: { gte: rango.from, lte: rango.to } },
    orderBy: { shiftDate: "desc" },
    select: {
      id: true,
      shiftDate: true,
      shiftPeriod: true,
      status: true,
      closedBy: { select: { user: { select: { name: true } } } },
      reviewedBy: { select: { user: { select: { name: true } } } },
      appointmentsTotal: true,
      appointmentsCompleted: true,
      appointmentsCancelled: true,
      appointmentsNoShow: true,
      appointmentsPending: true,
      expectedRevenue: true,
      declaredRevenue: true,
      discrepancy: true,
      tipsTotal: true,
      paymentBreakdown: true,
    },
  })

  const history = cierres.map((c) => ({
    id: c.id,
    shiftDate: c.shiftDate,
    shiftPeriod: c.shiftPeriod,
    status: c.status,
    closedByName: c.closedBy?.user.name ?? null,
    reviewedByName: c.reviewedBy?.user.name ?? null,
    appointmentsTotal: c.appointmentsTotal,
    appointmentsCompleted: c.appointmentsCompleted,
    appointmentsCancelled: c.appointmentsCancelled,
    appointmentsNoShow: c.appointmentsNoShow,
    appointmentsPending: c.appointmentsPending,
    expectedRevenue: c.expectedRevenue !== null ? Number(c.expectedRevenue) : null,
    declaredRevenue: c.declaredRevenue !== null ? Number(c.declaredRevenue) : null,
    discrepancy: c.discrepancy !== null ? Number(c.discrepancy) : null,
    tipsTotal: c.tipsTotal !== null ? Number(c.tipsTotal) : null,
  }))

  const totalCierres = history.length
  const cierresConDiscrepanciaNegativa = history.filter((h) => (h.discrepancy ?? 0) < 0).length
  const sumaDiscrepancias = history.reduce((acc, h) => acc + (h.discrepancy ?? 0), 0)
  const totalExpectedRevenue = history.reduce((acc, h) => acc + (h.expectedRevenue ?? 0), 0)
  const totalDeclaredRevenue = history.reduce((acc, h) => acc + (h.declaredRevenue ?? 0), 0)
  const totalTips = history.reduce((acc, h) => acc + (h.tipsTotal ?? 0), 0)

  return NextResponse.json({
    history,
    totals: {
      totalCierres,
      cierresConDiscrepanciaNegativa,
      sumaDiscrepancias,
      totalExpectedRevenue,
      totalDeclaredRevenue,
      totalTips,
    },
  })
}
