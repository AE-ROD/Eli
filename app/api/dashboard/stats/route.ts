import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.businessId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const businessId = session.user.businessId
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const manana = new Date(hoy)
  manana.setDate(manana.getDate() + 1)

  const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
  const inicioMesAnterior = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)
  const finMesAnterior = new Date(hoy.getFullYear(), hoy.getMonth(), 0)

  const finMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0, 23, 59, 59)

  const [
    citasHoy,
    citasMesAnteriorCount,
    totalPacientes,
    pacientesMesAnterior,
    ingresosMes,
    ingresosMesAnterior,
    citasTotalesMes,
    ingresosProyectados,
    walkInsEsteMes,
    cantidadServicios,
  ] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        businessId,
        startTime: { gte: hoy, lt: manana },
        status: { not: "cancelada" },
      },
      select: {
        id: true,
        title: true,
        startTime: true,
        endTime: true,
        status: true,
        patient: { select: { id: true, name: true } },
      },
      orderBy: { startTime: "asc" },
    }),
    prisma.appointment.count({
      where: {
        businessId,
        startTime: { gte: inicioMesAnterior, lte: finMesAnterior },
        status: { not: "cancelada" },
      },
    }),
    prisma.patient.count({ where: { businessId } }),
    prisma.patient.count({
      where: {
        businessId,
        createdAt: { lt: inicioMes },
      },
    }),
    prisma.appointment.aggregate({
      where: {
        businessId,
        startTime: { gte: inicioMes },
        status: "completada",
        price: { not: null },
      },
      _sum: { price: true },
    }),
    prisma.appointment.aggregate({
      where: {
        businessId,
        startTime: { gte: inicioMesAnterior, lte: finMesAnterior },
        status: "completada",
        price: { not: null },
      },
      _sum: { price: true },
    }),
    prisma.appointment.count({
      where: {
        businessId,
        startTime: { gte: inicioMes },
        status: { not: "cancelada" },
      },
    }),
    // Ingresos proyectados: completadas + pendientes/confirmadas con precio hasta fin de mes
    prisma.appointment.aggregate({
      where: {
        businessId,
        startTime: { gte: manana, lte: finMes },
        status: { in: ["pendiente", "confirmada"] },
        price: { not: null },
      },
      _sum: { price: true },
    }),
    prisma.appointment.count({
      where: {
        businessId,
        startTime: { gte: inicioMes },
        isWalkIn: true,
        status: { not: "cancelada" },
      },
    }),
    prisma.service.count({
      where: { businessId, active: true },
    }),
  ])

  const citasHoyCount = citasHoy.length
  const ingresosActuales = ingresosMes._sum.price ?? 0
  const ingresosAnteriores = ingresosMesAnterior._sum.price ?? 0

  const tendenciaCitas =
    citasMesAnteriorCount > 0
      ? Math.round(((citasHoyCount - citasMesAnteriorCount) / citasMesAnteriorCount) * 100)
      : 0

  const tendenciaPacientes =
    pacientesMesAnterior > 0
      ? Math.round(((totalPacientes - pacientesMesAnterior) / pacientesMesAnterior) * 100)
      : 0

  const tendenciaIngresos =
    ingresosAnteriores > 0
      ? Math.round(((ingresosActuales - ingresosAnteriores) / ingresosAnteriores) * 100)
      : 0

  // Ocupacion: citas del mes vs capacidad estimada (citasTotalesMes / (dias * 8 citas/dia))
  const diasMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate()
  const capacidadMes = diasMes * 8
  const tasaOcupacion = Math.min(Math.round((citasTotalesMes / capacidadMes) * 100), 100)

  const ingresosProyectadosValor = Number(ingresosProyectados._sum.price ?? 0)

  return NextResponse.json({
    citasHoy: citasHoyCount,
    citasHoyLista: citasHoy,
    totalPacientes,
    ingresoseMes: ingresosActuales,
    ingresosProyectados: Number(ingresosActuales) + ingresosProyectadosValor,
    walkInsEsteMes,
    tasaOcupacion,
    tieneServicios: cantidadServicios > 0,
    tendencias: {
      citas: tendenciaCitas,
      pacientes: tendenciaPacientes,
      ingresos: tendenciaIngresos,
      ocupacion: 0,
    },
  })
}
