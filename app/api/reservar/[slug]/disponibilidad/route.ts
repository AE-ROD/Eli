import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { horaAMinutos, minutosAHora } from "@/lib/horario-dia"
import { franjasDeAtencion } from "@/lib/horario-de-atencion"
import { obtenerIp, verificarLimite } from "@/lib/rate-limit"
import { diaDeLaSemana, esFechaCalendario, existeLaHora, fechaYMinutosEn, rangoDelDiaEn, zonaDelNegocio } from "@/lib/zona-horaria"

const FALTA_LA_FECHA = "Falta la fecha (AAAA-MM-DD)"
const FALTA_EL_SERVICIO = "Falta el servicio (servicioId)"

/**
 * Lo que llega por la URL, validado antes de tocar la base. `esFechaCalendario` exige un
 * día que exista, de 1900 a 9998, con formato AAAA-MM-DD: con `fecha=xyz` (o `2026-02-30`),
 * `new Date` daba una fecha inválida, el día de la semana salía `NaN` y la
 * consulta del horario terminaba en un 500. `servicioId` es un id (`cuid()`
 * en el esquema, de 25 caracteres): el tope corta un texto arbitrario antes de
 * mandarlo a la base.
 */
const parametrosSchema = z.object({
  fecha: z
    .string({ required_error: FALTA_LA_FECHA, invalid_type_error: FALTA_LA_FECHA })
    // La regla de fecha aceptable es una sola (`esFechaCalendario`): con
    // `.date()` pasaban años como 0050 o 9999 que el cálculo del día no
    // acepta, y terminaban en un 500.
    .refine(esFechaCalendario, "La fecha no es válida: tiene que ser un día real, con el formato AAAA-MM-DD"),
  servicioId: z
    .string({ required_error: FALTA_EL_SERVICIO, invalid_type_error: FALTA_EL_SERVICIO })
    .min(1, FALTA_EL_SERVICIO)
    .max(64, "El servicio (servicioId) no es válido"),
})

/** Una cita ocupada, en minutos del día pedido y en la hora del negocio: [inicio, fin). */
interface Ocupado {
  inicio: number
  fin: number
}

/**
 * Las citas del día como minutos de ese día en la zona del negocio. Una que
 * termina después de la medianoche ocupa hasta el final del día.
 */
function minutosOcupados(fecha: string, citas: { startTime: Date; endTime: Date }[], zona: string): Ocupado[] {
  return citas.map((cita) => {
    const inicio = fechaYMinutosEn(cita.startTime, zona)
    const fin = fechaYMinutosEn(cita.endTime, zona)
    return { inicio: inicio.fecha === fecha ? inicio.minutos : 0, fin: fin.fecha === fecha ? fin.minutos : 24 * 60 }
  })
}

function horariosLibres(horaInicio: string, horaFin: string, duracion: number, ocupados: Ocupado[]): string[] {
  const inicioMin = horaAMinutos(horaInicio)
  const finMin = horaAMinutos(horaFin)

  const horarios: string[] = []

  for (let min = inicioMin; min + duracion <= finMin; min += duracion) {
    const slotInicio = min
    const slotFin = min + duracion

    const ocupado = ocupados.some((cita) => slotInicio < cita.fin && slotFin > cita.inicio)

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
    select: { id: true, timezone: true },
  })
  if (!negocio) return NextResponse.json({ error: "Negocio no encontrado" }, { status: 404 })

  const servicio = await prisma.service.findFirst({
    where: { id: servicioId, businessId: negocio.id, active: true },
    select: { duration: true },
  })
  if (!servicio) return NextResponse.json({ error: "Servicio no encontrado" }, { status: 404 })

  // El día, las horas y "hoy" son los del negocio (`Business.timezone`), no
  // los del servidor: `new Date("AAAA-MM-DD").getDay()` daba el día anterior
  // al oeste de UTC, y en Vercel (UTC) las horas quedaban corridas.
  const zona = zonaDelNegocio(negocio.timezone)
  const diaSemana = diaDeLaSemana(fecha)

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

  const dia = rangoDelDiaEn(fecha, zona)

  const citasDelDia = await prisma.appointment.findMany({
    where: {
      businessId: negocio.id,
      startTime: { gte: dia.desde, lt: dia.hasta },
      status: { notIn: ["cancelada"] },
    },
    select: { startTime: true, endTime: true },
  })

  const ocupados = minutosOcupados(fecha, citasDelDia, zona)

  // Si la fecha es hoy para el negocio, no ofrecer horas que ya pasaron en su reloj.
  const ahora = fechaYMinutosEn(new Date(), zona)
  const esHoy = ahora.fecha === fecha

  const horarios = franjas
    .flatMap((franja) => horariosLibres(franja.startTime, franja.endTime, servicio.duration, ocupados))
    .filter((slot) => !esHoy || horaAMinutos(slot) > ahora.minutos)
    // El día del salto del horario de verano, las horas que el reloj se
    // salta no se ofrecen: `confirmar` las rechaza (si no, se guardaban en la
    // hora siguiente y la ofrecida seguía libre).
    .filter((slot) => existeLaHora(fecha, slot, zona))

  return NextResponse.json({ slots: horarios })
}
