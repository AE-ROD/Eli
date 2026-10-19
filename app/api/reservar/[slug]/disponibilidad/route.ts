import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { horaAMinutos, minutosAHora } from "@/lib/horario-dia"
import { franjasDeAtencion } from "@/lib/horario-de-atencion"
import { obtenerIp, verificarLimite } from "@/lib/rate-limit"

const FALTA_LA_FECHA = "Falta la fecha (AAAA-MM-DD)"
const FALTA_EL_SERVICIO = "Falta el servicio (servicioId)"

/**
 * Lo que llega por la URL, validado antes de tocar la base. `date()` exige un
 * día que exista, con formato AAAA-MM-DD: con `fecha=xyz` (o `2026-02-30`),
 * `new Date` daba una fecha inválida, el día de la semana salía `NaN` y la
 * consulta del horario terminaba en un 500. `servicioId` es un id (`cuid()`
 * en el esquema, de 25 caracteres): el tope corta un texto arbitrario antes de
 * mandarlo a la base.
 */
const parametrosSchema = z.object({
  fecha: z
    .string({ required_error: FALTA_LA_FECHA, invalid_type_error: FALTA_LA_FECHA })
    .date("La fecha no es válida: tiene que ser un día real, con el formato AAAA-MM-DD"),
  servicioId: z
    .string({ required_error: FALTA_EL_SERVICIO, invalid_type_error: FALTA_EL_SERVICIO })
    .min(1, FALTA_EL_SERVICIO)
    .max(64, "El servicio (servicioId) no es válido"),
})

function horariosLibres(
  horaInicio: string,
  horaFin: string,
  duracion: number,
  citasOcupadas: { startTime: Date; endTime: Date }[]
): string[] {
  const inicioMin = horaAMinutos(horaInicio)
  const finMin = horaAMinutos(horaFin)

  const horarios: string[] = []

  for (let min = inicioMin; min + duracion <= finMin; min += duracion) {
    const slotInicio = min
    const slotFin = min + duracion

    const ocupado = citasOcupadas.some((cita) => {
      const citaIni = cita.startTime.getHours() * 60 + cita.startTime.getMinutes()
      const citaFin = cita.endTime.getHours() * 60 + cita.endTime.getMinutes()
      return slotInicio < citaFin && slotFin > citaIni
    })

    if (!ocupado) {
      horarios.push(minutosAHora(min))
    }
  }

  return horarios
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  // Público y sin sesión, fuera del límite del panel (`proxy.ts`): el tope es
  // éste, por IP. No es el de `reserva` porque cada día que se mira en el
  // calendario es una consulta (`lecturaPublica` en `lib/rate-limit.ts`).
  const { permitido } = await verificarLimite("lecturaPublica", obtenerIp(request))
  if (!permitido) {
    return NextResponse.json({ error: "Demasiadas solicitudes, intenta más tarde" }, { status: 429 })
  }

  const { slug } = await params
  const { searchParams } = new URL(request.url)
  const parametros = parametrosSchema.safeParse({
    fecha: searchParams.get("fecha") ?? undefined,
    servicioId: searchParams.get("servicioId") ?? undefined,
  })
  if (!parametros.success) {
    return NextResponse.json({ error: parametros.error.issues[0].message }, { status: 400 })
  }
  const { fecha, servicioId } = parametros.data

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

  // Todas las filas activas del día, generales y de miembros: cuál manda lo
  // decide `franjasDeAtencion` (lib/horario-de-atencion.ts), la misma regla
  // que usan la página pública y `confirmar`.
  const filasDelDia = await prisma.workSchedule.findMany({
    where: { businessId: negocio.id, dayOfWeek: diaSemana, active: true },
    select: { memberId: true, startTime: true, endTime: true },
    orderBy: { startTime: "asc" },
  })
  const franjas = franjasDeAtencion(filasDelDia)

  if (franjas.length === 0) {
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

  const horarios = franjas
    .flatMap((franja) => horariosLibres(franja.startTime, franja.endTime, servicio.duration, citasDelDia))
    .filter((slot) => {
      if (!esHoy) return true
      const slotMin = horaAMinutos(slot)
      const ahoraMin = ahora.getHours() * 60 + ahora.getMinutes()
      return slotMin > ahoraMin
    })

  return NextResponse.json({ slots: horarios })
}
