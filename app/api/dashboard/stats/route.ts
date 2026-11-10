import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { clienteNoEliminado } from "@/lib/clientes-eliminados"
import { deCentavos } from "@/lib/atenciones"
import {
  actorDeSesion,
  puedeVerIngresosDelNegocio,
  veElPanelDeSuDia,
  whereDeAgenda,
  whereDeAtenciones,
  whereDePagos,
  type Actor,
} from "@/lib/permisos"
import { iniciosDeMesEn } from "@/lib/reportes"
import { diaDeLaSemana, fechaYMinutosEn, rangoDelDiaEn, zonaDelNegocio } from "@/lib/zona-horaria"
import { LLEGADA_DE_LA_CITA, conLlegada } from "@/lib/por-confirmar"
import { ESTADOS_QUE_LIBERAN } from "@/lib/ocupacion"

/**
 * Las citas que cuentan en el día: las que ocupan su horario. Una cancelada
 * o una de "No vino" no es una cita de hoy ni tapa un hueco (#97). Es la
 * misma definición que la agenda y la reserva pública (`lib/ocupacion.ts`).
 */
const OCUPAN_EL_HORARIO = { status: { notIn: [...ESTADOS_QUE_LIBERAN] } }

/**
 * Variación porcentual entre dos períodos comparables.
 * Devuelve `null` cuando no hay base con la que comparar: sin mes anterior, un
 * `0` se muestra como "+0% vs mes anterior" y se lee como un dato roto.
 */
function variacion(actual: number, anterior: number): number | null {
  if (anterior <= 0) return null
  return Math.round(((actual - anterior) / anterior) * 100)
}

/** Las atenciones cobradas en un período: finalizadas, con el cobro adentro. */
function cobradasEn(paidAt: { gte: Date; lt?: Date }) {
  return { status: "finalizada", paidAt }
}

/**
 * Lo cobrado en un período: la suma de los pagos de las atenciones
 * finalizadas (PRODUCTO.md, sección 7: los ingresos son lo cobrado en el
 * tablero). Una cita marcada como completada en la agenda sin pasar por el
 * cobro no suma: no hay registro de cuánto se cobró ni cómo; una atención
 * anulada tampoco, aunque conserve sus pagos.
 *
 * La base suma centavos enteros (Postgres devuelve la suma como `bigint`, así
 * que el mes no tiene el tope de la columna) y se devuelve en unidades.
 */
async function sumaDePagos(actor: Actor, paidAt: { gte: Date; lt?: Date }): Promise<number> {
  const { _sum } = await prisma.visitPayment.aggregate({
    where: whereDePagos(actor, { visit: { is: cobradasEn(paidAt) } }),
    _sum: { amountCents: true },
  })
  return deCentavos(_sum.amountCents ?? 0)
}

export async function GET() {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)
  if (!actor) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const verIngresos = puedeVerIngresosDelNegocio(actor)
  // El horario del día es para que el profesional dibuje su línea de tiempo
  // (F-014). Dueño y encargado administran el negocio, no su propio día: no
  // les agregamos una clave que su vista no usa.
  const conHorarioDeHoy = veElPanelDeSuDia(actor)
  const businessId = actor.businessId

  // "Hoy", el mes y el día de la semana son los del NEGOCIO (`Business.timezone`),
  // como en /api/dashboard/clinica: ni los del servidor (en Vercel, UTC: a las
  // 21:30 en Santiago ya era mañana y "Citas de hoy" salía vacía) ni los del
  // navegador de quien mira (una dueña de viaje vería otro día). El parámetro
  // `zona` que mandaba el panel ya no se lee. La zona viaja en la respuesta para
  // que el panel muestre las horas en ella.
  const negocio = await prisma.business.findUnique({ where: { id: businessId }, select: { timezone: true } })
  const zona = zonaDelNegocio(negocio?.timezone)
  const ahora = new Date()
  const fechaDeHoy = fechaYMinutosEn(ahora, zona).fecha
  const { desde: hoy, hasta: manana } = rangoDelDiaEn(fechaDeHoy, zona)
  // Los meses de los ingresos y de los clientes nuevos. Un cobro del 30 de
  // septiembre a las 22:30 en Santiago es de septiembre, como en Reportes.
  const { inicioMes, inicioMesAnterior } = iniciosDeMesEn(ahora, zona)

  const [citasHoy, totalClientes, clientesMesAnterior, clientesNuevosMes, ingresosMes, atencionesCobradasMes, ingresosMesAnterior, franjasHoy] =
    await Promise.all([
      prisma.appointment.findMany({
        // Filas, no un agregado: un worker no debe ver acá las citas de un
        // colega ni el nombre de su cliente. `whereDeAgenda` acota por
        // profesional además de por negocio.
        where: whereDeAgenda(actor, {
          startTime: { gte: hoy, lt: manana },
          ...OCUPAN_EL_HORARIO,
        }),
        select: {
          id: true,
          title: true,
          startTime: true,
          endTime: true,
          status: true,
          customer: { select: { id: true, name: true, lastName: true } },
          // "Por confirmar" en la lista del día (#84). Con la atención, sólo
          // para saber si el cliente ya llegó (`conAtencion`), como la agenda.
          confirmacionPorFaltas: true,
          ...LLEGADA_DE_LA_CITA,
        },
        orderBy: { startTime: "asc" },
        // Listado sin agregar: siempre con tope (reglas/01-arquitectura.md).
        take: 200,
      }),
      // Sin los eliminados (anonimizados), en las tres: no son clientes del
      // negocio aunque su fila siga por sus citas y cobros. En `AND` y no con
      // spread: `clienteNoEliminado` es un `OR` y un spread pisaría cualquier
      // otro `OR` que se sume a la consulta (ver `whereDeAgenda`).
      prisma.customer.count({ where: { AND: [{ businessId }, clienteNoEliminado] } }),
      prisma.customer.count({ where: { AND: [{ businessId, createdAt: { lt: inicioMes } }, clienteNoEliminado] } }),
      // De qué está hecha la cifra de clientes: cuántos entraron este mes.
      prisma.customer.count({ where: { AND: [{ businessId, createdAt: { gte: inicioMes } }, clienteNoEliminado] } }),
      // La facturación es del negocio: no se calcula siquiera si el actor no
      // puede verla. `atencionesCobradasMes` dice sobre cuántas atenciones
      // está hecha la suma.
      verIngresos ? sumaDePagos(actor, { gte: inicioMes }) : Promise.resolve(0),
      verIngresos
        ? prisma.visit.count({ where: whereDeAtenciones(actor, cobradasEn({ gte: inicioMes })) })
        : Promise.resolve(0),
      // El mes anterior termina donde empieza este (`lt`). Con `lte` contra
      // las 00:00 de su último día, como se comparaba antes, ese día quedaba
      // afuera de la comparación.
      verIngresos
        ? sumaDePagos(actor, { gte: inicioMesAnterior, lt: inicioMes })
        : Promise.resolve(0),
      // Horario propio de hoy, sólo para el profesional. Nunca acepta un
      // `memberId` de querystring (a diferencia de /api/configuracion/horarios):
      // este endpoint sólo conoce el horario del actor, jamás el de un colega.
      // Es exactamente la rama "propio" de `resolverObjetivo()` en ese archivo,
      // sin re-implementar otra forma de resolverlo.
      conHorarioDeHoy && actor.memberId
        ? prisma.workSchedule.findMany({
            where: {
              businessId,
              memberId: actor.memberId,
              dayOfWeek: diaDeLaSemana(fechaDeHoy),
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

  // Sin citas hoy, el dato honesto no es un cero mudo sino cuándo es la próxima.
  const proximaCita =
    citasHoy.length === 0
      ? await prisma.appointment.findFirst({
          where: whereDeAgenda(actor, {
            startTime: { gte: manana },
            ...OCUPAN_EL_HORARIO,
          }),
          select: { id: true, title: true, startTime: true },
          orderBy: { startTime: "asc" },
        })
      : null

  // Sólo viajan las tendencias que se pudieron calcular. No se comparan las
  // citas: el cálculo anterior medía las de hoy contra el total del mes pasado,
  // un día contra un mes. Para esa tarjeta, el contexto es `proximaCita`.
  const tendencias: { clientes?: number; ingresos?: number } = {}

  const tendenciaClientes = variacion(totalClientes, clientesMesAnterior)
  if (tendenciaClientes !== null) tendencias.clientes = tendenciaClientes

  if (verIngresos) {
    const tendenciaIngresos = variacion(ingresosMes, ingresosMesAnterior)
    if (tendenciaIngresos !== null) tendencias.ingresos = tendenciaIngresos
  }

  return NextResponse.json({
    zona,
    citasHoy: citasHoy.length,
    citasHoyLista: citasHoy.map(conLlegada),
    ...(proximaCita && { proximaCita }),
    totalClientes,
    clientesNuevosMes,
    ...(verIngresos && { ingresosMes, atencionesCobradasMes }),
    // No viaja si el profesional no tiene horario activo cargado para hoy: ni
    // un rango por defecto ni un array vacío como placeholder. El front debe
    // poder leer "sin horario cargado hoy" a partir de la ausencia de la clave,
    // igual que hace con `ingresosMes` y `tendencias.ingresos`.
    ...(conHorarioDeHoy && franjasHoy.length > 0 && { horarioHoy: franjasHoy }),
    tendencias,
  })
}
