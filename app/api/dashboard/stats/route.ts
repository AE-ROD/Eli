import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { actorDeSesion, puedeVerIngresosDelNegocio, whereDeAgenda } from "@/lib/permisos"

/**
 * Variación porcentual entre dos períodos comparables.
 * Devuelve `null` cuando no hay base con la que comparar: sin mes anterior, un
 * `0` se muestra como "+0% vs mes anterior" y se lee como un dato roto.
 */
function variacion(actual: number, anterior: number): number | null {
  if (anterior <= 0) return null
  return Math.round(((actual - anterior) / anterior) * 100)
}

export async function GET(_request: NextRequest) {
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

  const sinIngresos = { _sum: { price: null as number | null }, _count: 0 }

  const [citasHoy, totalPacientes, pacientesMesAnterior, clientesNuevosMes, ingresosMes, ingresosMesAnterior] =
    await Promise.all([
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
      prisma.patient.count({ where: { businessId } }),
      prisma.patient.count({ where: { businessId, createdAt: { lt: inicioMes } } }),
      // De qué está hecha la cifra de clientes: cuántos entraron este mes.
      prisma.patient.count({ where: { businessId, createdAt: { gte: inicioMes } } }),
      // La facturación es del negocio: no se calcula siquiera si el actor no
      // puede verla. `_count` dice sobre cuántas citas está hecha la suma.
      verIngresos
        ? prisma.appointment.aggregate({
            where: {
              businessId,
              startTime: { gte: inicioMes },
              status: "completada",
              price: { not: null },
            },
            _sum: { price: true },
            _count: true,
          })
        : Promise.resolve(sinIngresos),
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
        : Promise.resolve(sinIngresos),
    ])

  const ingresosActuales = ingresosMes._sum.price ?? 0
  const ingresosAnteriores = ingresosMesAnterior._sum.price ?? 0

  // Sin citas hoy, el dato honesto no es un cero mudo sino cuándo es la próxima.
  const proximaCita =
    citasHoy.length === 0
      ? await prisma.appointment.findFirst({
          where: whereDeAgenda(actor, {
            startTime: { gte: manana },
            status: { not: "cancelada" },
          }),
          select: { id: true, title: true, startTime: true },
          orderBy: { startTime: "asc" },
        })
      : null

  // Sólo viajan las tendencias que se pudieron calcular. No se comparan las
  // citas: el cálculo anterior medía las de hoy contra el total del mes pasado,
  // un día contra un mes. Para esa tarjeta, el contexto es `proximaCita`.
  const tendencias: { pacientes?: number; ingresos?: number } = {}

  const tendenciaPacientes = variacion(totalPacientes, pacientesMesAnterior)
  if (tendenciaPacientes !== null) tendencias.pacientes = tendenciaPacientes

  if (verIngresos) {
    const tendenciaIngresos = variacion(ingresosActuales, ingresosAnteriores)
    if (tendenciaIngresos !== null) tendencias.ingresos = tendenciaIngresos
  }

  return NextResponse.json({
    citasHoy: citasHoy.length,
    citasHoyLista: citasHoy,
    ...(proximaCita && { proximaCita }),
    totalPacientes,
    clientesNuevosMes,
    ...(verIngresos && {
      ingresoseMes: ingresosActuales,
      citasFacturadasMes: ingresosMes._count,
    }),
    tendencias,
  })
}
