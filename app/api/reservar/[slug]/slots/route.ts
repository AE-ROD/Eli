import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

function generarSlots(
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
  const fecha = searchParams.get("fecha")       // YYYY-MM-DD
  const servicioId = searchParams.get("servicioId")

  if (!fecha || !servicioId) {
    return NextResponse.json({ error: "Faltan parámetros: fecha y servicioId" }, { status: 400 })
  }

  const negocio = await prisma.business.findUnique({
    where: { slug },
    select: { id: true },
  })
  if (!negocio) return NextResponse.json({ error: "Negocio no encontrado" }, { status: 404 })

  const servicio = await prisma.service.findFirst({
    where: { id: servicioId, businessId: negocio.id, active: true },
    select: { duration: true },
  })
  if (!servicio) return NextResponse.json({ error: "Servicio no encontrado" }, { status: 404 })

  const fechaObj = new Date(fecha)
  const diaSemana = fechaObj.getDay()

  const horario = await prisma.workSchedule.findFirst({
    where: { businessId: negocio.id, dayOfWeek: diaSemana, active: true },
    select: { startTime: true, endTime: true },
  })

  if (!horario) {
    return NextResponse.json({ slots: [], mensaje: "No hay atención ese día" })
  }

  const inicioDia = new Date(fecha)
  inicioDia.setHours(0, 0, 0, 0)
  const finDia = new Date(fecha)
  finDia.setHours(23, 59, 59, 999)

  const citasDelDia = await prisma.appointment.findMany({
    where: {
      businessId: negocio.id,
      startTime: { gte: inicioDia, lte: finDia },
      status: { notIn: ["cancelada"] },
    },
    select: { startTime: true, endTime: true },
  })

  // No mostrar slots en el pasado si la fecha es hoy
  const ahora = new Date()
  const esHoy = fechaObj.toDateString() === ahora.toDateString()

  const slots = generarSlots(horario.startTime, horario.endTime, servicio.duration, citasDelDia)
    .filter((slot) => {
      if (!esHoy) return true
      const [h, m] = slot.split(":").map(Number)
      const slotMin = h * 60 + m
      const ahoraMin = ahora.getHours() * 60 + ahora.getMinutes()
      return slotMin > ahoraMin
    })

  return NextResponse.json({ slots })
}
