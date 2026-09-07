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
  // El horario del día es para que el profesional dibuje su línea de tiempo
  // (F-014). Dueño y encargado administran el negocio, no su propio día: no
  // les agregamos una clave que su vista no usa.
  const esWorker = actor.rol === "worker"
  const businessId = actor.businessId

  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const manana = new Date(hoy)
  manana.setDate(manana.getDate() + 1)

  const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
  const inicioMesAnterior = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)
  const finMesAnterior = new Date(hoy.getFullYear(), hoy.getMonth(), 0)

  const sinIngresos = { _sum: { price: null as number | null }, _count: 0 }

  const [citasHoy, totalPacientes, pacientesMesAnterior, clientesNuevosMes, ingresosMes, ingresosMesAnterior, franjasHoy] =
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
      // Horario propio de hoy, sólo para el profesional. Nunca acepta un
      // `memberId` de querystring (a diferencia de /api/configuracion/horarios):
      // este endpoint sólo conoce el horario del actor, jamás el de un colega.
      // Es exactamente la rama "propio" de `resolverObjetivo()` en ese archivo,
      // sin re-implementar otra forma de resolverlo.
      esWorker && actor.memberId
        ? prisma.workSchedule.findMany({
            where: {
              businessId,
              memberId: actor.memberId,
              dayOfWeek: hoy.getDay(),
              // `active: false` es un día marcado como libre a propósito
              // (configuracion/horarios): para esta vista es lo mismo que no
              // tener horario cargado, así que no cuenta como franja de hoy.
              active: true,
            },
            select: { startTime: true, endTime: true },
            orderBy: { startTime: "asc" },
            take: 10,
          })
        : Promise.resolve([]),
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
    // No viaja si el profesional no tiene horario activo cargado para hoy: ni
    // un rango por defecto ni un array vacío como placeholder. El front debe
    // poder leer "sin horario cargado hoy" a partir de la ausencia de la clave,
    // igual que hace con `ingresoseMes` y `tendencias.ingresos`.
    ...(esWorker && franjasHoy.length > 0 && { horarioHoy: franjasHoy }),
    tendencias,
  })
}
