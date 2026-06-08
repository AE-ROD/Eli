import { NextRequest, NextResponse } from "next/server"
import { toZonedTime, fromZonedTime } from "date-fns-tz"
import { prisma } from "@/lib/prisma"

export function generarSlots(
  horaInicio: string,
  horaFin: string,
  duracion: number,
  citasOcupadas: { startTime: Date; endTime: Date }[]
): string[] {
  const [hIni, mIni] = horaInicio.split(":").map(Number)
  const [hFin, mFin] = horaFin.split(":").map(Number)
  const inicioMin = hIni * 60 + mIni
  const finMin = hFin * 60 + mFin

  const slots: string[] = []

  for (let min = inicioMin; min + duracion <= finMin; min += duracion) {
    const slotInicio = min
    const slotFin = min + duracion

    const ocupado = citasOcupadas.some((cita) => {
      const citaIni = cita.startTime.getHours() * 60 + cita.startTime.getMinutes()
      const citaFin = cita.endTime.getHours() * 60 + cita.endTime.getMinutes()
      return slotInicio < citaFin && slotFin > citaIni
    })

    if (!ocupado) {
      const h = Math.floor(min / 60).toString().padStart(2, "0")
      const m = (min % 60).toString().padStart(2, "0")
      slots.push(`${h}:${m}`)
    }
  }

  return slots
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const { searchParams } = new URL(request.url)
  const fecha = searchParams.get("fecha")
  const servicioId = searchParams.get("servicioId")

  if (!fecha || !servicioId) {
    return NextResponse.json({ error: "Faltan parámetros: fecha y servicioId" }, { status: 400 })
  }

  const negocio = await prisma.business.findUnique({
    where: { slug },
    select: { id: true, timezone: true },
  })
  if (!negocio) return NextResponse.json({ error: "Negocio no encontrado" }, { status: 404 })

  const servicio = await prisma.service.findFirst({
    where: { id: servicioId, businessId: negocio.id, active: true },
    select: { duration: true },
  })
  if (!servicio) return NextResponse.json({ error: "Servicio no encontrado" }, { status: 404 })

  const tz = negocio.timezone ?? "America/Cancun"
  const fechaObj = new Date(`${fecha}T12:00:00`)
  const diaSemana = fechaObj.getDay()

  // Build UTC day boundaries for DB query
  const inicioDiaLocal = fromZonedTime(`${fecha}T00:00:00`, tz)
  const finDiaLocal = fromZonedTime(`${fecha}T23:59:59`, tz)

  // "now" in the business timezone for past-slot filtering
  const ahoraLocal = toZonedTime(new Date(), tz)
  const esHoy = fecha === ahoraLocal.toISOString().slice(0, 10)
  const ahoraMin = ahoraLocal.getHours() * 60 + ahoraLocal.getMinutes()

  // T14: Check if business has active workers with per-worker schedules
  const miembros = await prisma.businessMember.findMany({
    where: { businessId: negocio.id },
    select: {
      id: true,
      workSchedules: {
        where: { dayOfWeek: diaSemana, active: true },
        select: { startTime: true, endTime: true },
      },
    },
  })

  const miembrosConHorario = miembros.filter((m) => m.workSchedules.length > 0)

  if (miembrosConHorario.length > 0) {
    // T14: Union of available slots across all workers
    // A slot is available if at least one worker is free during it

    // Fetch all appointments for the business that day, grouped by worker
    const citasDelDia = await prisma.appointment.findMany({
      where: {
        businessId: negocio.id,
        startTime: { gte: inicioDiaLocal, lte: finDiaLocal },
        status: { notIn: ["cancelada"] },
      },
      select: { memberId: true, startTime: true, endTime: true },
    })

    const slotsDisponibles = new Set<string>()

    for (const miembro of miembrosConHorario) {
      const horario = miembro.workSchedules[0]

      // Appointments for this specific worker
      const citasMiembro = citasDelDia
        .filter((c) => c.memberId === miembro.id)
        .map((c) => ({
          startTime: toZonedTime(c.startTime, tz),
          endTime: toZonedTime(c.endTime, tz),
        }))

      const slotsWorker = generarSlots(horario.startTime, horario.endTime, servicio.duration, citasMiembro)

      for (const slot of slotsWorker) {
        if (esHoy) {
          const [h, m] = slot.split(":").map(Number)
          if (h * 60 + m <= ahoraMin) continue
        }
        slotsDisponibles.add(slot)
      }
    }

    // Return sorted union
    const slots = Array.from(slotsDisponibles).sort()
    return NextResponse.json({ slots })
  }

  // No per-worker schedules — fall back to business-level schedule
  const horario = await prisma.workSchedule.findFirst({
    where: { businessId: negocio.id, memberId: null, dayOfWeek: diaSemana, active: true },
    select: { startTime: true, endTime: true },
  })

  if (!horario) {
    return NextResponse.json({ slots: [], mensaje: "No hay atención ese día" })
  }

  const citasDelDia = await prisma.appointment.findMany({
    where: {
      businessId: negocio.id,
      startTime: { gte: inicioDiaLocal, lte: finDiaLocal },
      status: { notIn: ["cancelada"] },
    },
    select: { startTime: true, endTime: true },
  })

  const citasLocales = citasDelDia.map((c) => ({
    startTime: toZonedTime(c.startTime, tz),
    endTime: toZonedTime(c.endTime, tz),
  }))

  const slots = generarSlots(horario.startTime, horario.endTime, servicio.duration, citasLocales)
    .filter((slot) => {
      if (!esHoy) return true
      const [h, m] = slot.split(":").map(Number)
      return h * 60 + m > ahoraMin
    })

  return NextResponse.json({ slots })
}
