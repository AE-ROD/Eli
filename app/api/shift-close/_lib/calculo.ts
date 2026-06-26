import { fromZonedTime } from "date-fns-tz"
import { prisma } from "@/lib/prisma"

export const DEFAULT_TZ = "America/Cancun"

// Calcula la ventana de tiempo [inicio, fin] en UTC para un turno, dado su
// shiftDate (+ opcionalmente shiftStartTime/shiftEndTime) y el timezone del negocio.
export function resolverVentanaTurno(
  shiftDate: string,
  tz: string,
  shiftStartTime?: string,
  shiftEndTime?: string
) {
  if (shiftStartTime && shiftEndTime) {
    return { inicio: new Date(shiftStartTime), fin: new Date(shiftEndTime) }
  }

  const fecha = shiftDate.slice(0, 10)
  const inicio = fromZonedTime(`${fecha}T00:00:00`, tz)
  const fin = fromZonedTime(`${fecha}T23:59:59.999`, tz)
  return { inicio, fin }
}

export async function calcularResumenCitas(
  businessId: string,
  inicio: Date,
  fin: Date,
  filtrarPorMemberId: string | null
) {
  const citas = await prisma.appointment.findMany({
    where: {
      businessId,
      startTime: { gte: inicio, lte: fin },
      ...(filtrarPorMemberId ? { memberId: filtrarPorMemberId } : {}),
    },
    select: { status: true, price: true },
  })

  const appointmentsTotal = citas.length
  const appointmentsCompleted = citas.filter((c) => c.status === "completada").length
  const appointmentsCancelled = citas.filter((c) => c.status === "cancelada").length
  const appointmentsNoShow = citas.filter((c) => c.status === "no-show").length
  const appointmentsPending = appointmentsTotal - appointmentsCompleted - appointmentsCancelled - appointmentsNoShow

  const expectedRevenue = citas
    .filter((c) => c.status === "completada")
    .reduce((acc, c) => acc + Number(c.price ?? 0), 0)

  return {
    appointmentsTotal,
    appointmentsCompleted,
    appointmentsCancelled,
    appointmentsNoShow,
    appointmentsPending,
    expectedRevenue,
  }
}
