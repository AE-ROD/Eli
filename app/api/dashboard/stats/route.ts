import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { actorDeSesion, puedeVerIngresosDelNegocio, whereDeAgenda } from "@/lib/permisos"

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)
  if (!actor) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const verIngresos = puedeVerIngresosDelNegocio(actor)
  const businessId = actor.businessId
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const manana = new Date(hoy)
  manana.setDate(manana.getDate() + 1)

  const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
  const inicioMesAnterior = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)
  const finMesAnterior = new Date(hoy.getFullYear(), hoy.getMonth(), 0)

  const [
    citasHoy,
    citasMesAnteriorCount,
    totalPacientes,
    pacientesMesAnterior,
    ingresosMes,
    ingresosMesAnterior,
    citasTotalesMes,
  ] = await Promise.all([
    prisma.appointment.findMany({
      // Filas, no un agregado: un worker no debe ver acá las citas de un
      // colega ni el nombre de su paciente. `whereDeAgenda` acota por
      // profesional además de por negocio.
      where: whereDeAgenda(actor, {
        startTime: { gte: hoy, lt: manana },
        status: { not: "cancelada" },
      }),
      select: {
        id: true,
        title: true,
        startTime: true,
        endTime: true,
        status: true,
        patient: { select: { id: true, name: true } },
      },
      orderBy: { startTime: "asc" },
      // Listado sin agregar: siempre con tope (reglas/01-arquitectura.md).
      take: 200,
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
    // La facturación es del negocio: sólo se calcula (y se devuelve) si el
    // actor puede verla. Un profesional no recibe este dato ni siquiera para
    // que el cliente lo descarte.
    verIngresos
      ? prisma.appointment.aggregate({
          where: {
            businessId,
            startTime: { gte: inicioMes },
            status: "completada",
            price: { not: null },
          },
          _sum: { price: true },
        })
      : Promise.resolve({ _sum: { price: null as number | null } }),
    verIngresos
      ? prisma.appointment.aggregate({
          where: {
            businessId,
            startTime: { gte: inicioMesAnterior, lte: finMesAnterior },
            status: "completada",
            price: { not: null },
          },
          _sum: { price: true },
        })
      : Promise.resolve({ _sum: { price: null as number | null } }),
    prisma.appointment.count({
      where: {
        businessId,
        startTime: { gte: inicioMes },
        status: { not: "cancelada" },
      },
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

  return NextResponse.json({
    citasHoy: citasHoyCount,
    citasHoyLista: citasHoy,
    totalPacientes,
    ...(verIngresos && { ingresoseMes: ingresosActuales }),
    tasaOcupacion,
    tendencias: {
      citas: tendenciaCitas,
      pacientes: tendenciaPacientes,
      ...(verIngresos && { ingresos: tendenciaIngresos }),
      ocupacion: 0,
    },
  })
}
