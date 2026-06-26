import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { toZonedTime } from "date-fns-tz"

export interface Sugerencia {
  id: string
  tipo: "ventas" | "retencion" | "horario" | "noshows"
  prioridad: "alta" | "media" | "baja"
  titulo: string
  descripcion: string
  accion: string
  meta?: Record<string, unknown>
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.businessId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }
  const businessId = session.user.businessId as string

  const ahora = new Date()
  const hace30Dias = new Date(ahora.getTime() - 30 * 24 * 60 * 60 * 1000)
  const hace60Dias = new Date(ahora.getTime() - 60 * 24 * 60 * 60 * 1000)
  const hace90Dias = new Date(ahora.getTime() - 90 * 24 * 60 * 60 * 1000)

  const negocio = await prisma.business.findUnique({
    where: { id: businessId },
    select: { timezone: true },
  })
  const tz = negocio?.timezone ?? "America/Cancun"

  const sugerencias: Sugerencia[] = []

  // --- AGENTE DE VENTAS: servicios sin reservas o con baja demanda ---
  const [servicios, reservas30d] = await Promise.all([
    prisma.service.findMany({
      where: { businessId, active: true },
      select: { id: true, name: true, price: true },
    }),
    prisma.appointment.groupBy({
      by: ["serviceId"],
      where: {
        businessId,
        startTime: { gte: hace30Dias },
        status: { not: "cancelada" },
        serviceId: { not: null },
      },
      _count: { id: true },
    }),
  ])

  const conteoServicio = new Map(reservas30d.map((r) => [r.serviceId, r._count.id]))

  for (const servicio of servicios) {
    const reservas = conteoServicio.get(servicio.id) ?? 0
    if (reservas === 0) {
      sugerencias.push({
        id: `ventas-${servicio.id}`,
        tipo: "ventas",
        prioridad: "alta",
        titulo: `"${servicio.name}" lleva 30 días sin reservas`,
        descripcion:
          "Este servicio no ha recibido ninguna cita en el último mes. Considera ofrecer un descuento puntual o destacarlo en tu página de reservas.",
        accion: "Crear promoción",
        meta: { servicioId: servicio.id, nombre: servicio.name, precio: servicio.price },
      })
    } else if (reservas <= 2) {
      sugerencias.push({
        id: `ventas-baja-${servicio.id}`,
        tipo: "ventas",
        prioridad: "media",
        titulo: `"${servicio.name}" tiene muy baja demanda`,
        descripcion: `Solo ${reservas} ${reservas === 1 ? "reserva" : "reservas"} en los últimos 30 días. Una promoción o paquete combinado podría ayudar a aumentar su visibilidad.`,
        accion: "Ver en analítica",
        meta: { servicioId: servicio.id, nombre: servicio.name, reservas30d: reservas },
      })
    }
  }

  // --- AGENTE DE RETENCIÓN: clientes que no han regresado ---
  const pacientesActivos = await prisma.patient.findMany({
    where: { businessId },
    select: {
      id: true,
      name: true,
      phone: true,
      appointments: {
        where: { status: { not: "cancelada" } },
        orderBy: { startTime: "desc" },
        take: 2,
        select: { startTime: true },
      },
    },
  })

  for (const paciente of pacientesActivos) {
    const citas = paciente.appointments
    if (citas.length < 2) continue

    const ultimaCita = citas[0].startTime
    const penultimaCita = citas[1].startTime
    const intervaloMs = ultimaCita.getTime() - penultimaCita.getTime()
    const intervaloPromedioDias = intervaloMs / (1000 * 60 * 60 * 24)

    const diasSinVolver = (ahora.getTime() - ultimaCita.getTime()) / (1000 * 60 * 60 * 24)

    // Si superó 1.5× su intervalo habitual y no ha vuelto en al menos 20 días
    if (diasSinVolver > Math.max(intervaloPromedioDias * 1.5, 20) && ultimaCita > hace60Dias) {
      sugerencias.push({
        id: `retencion-${paciente.id}`,
        tipo: "retencion",
        prioridad: diasSinVolver > intervaloPromedioDias * 2 ? "alta" : "media",
        titulo: `${paciente.name} no ha regresado`,
        descripcion: `Su última visita fue hace ${Math.round(diasSinVolver)} días. Basado en su historial, suele regresar cada ${Math.round(intervaloPromedioDias)} días.`,
        accion: paciente.phone ? "Enviar WhatsApp" : "Ver perfil",
        meta: {
          pacienteId: paciente.id,
          nombre: paciente.name,
          telefono: paciente.phone,
          ultimaCita: ultimaCita.toISOString(),
          diasSinVolver: Math.round(diasSinVolver),
          intervaloHabitual: Math.round(intervaloPromedioDias),
        },
      })
    }
  }

  // --- AGENTE DE HORARIOS MUERTOS: franjas con muy pocas citas ---
  const citasUltimos30 = await prisma.appointment.findMany({
    where: {
      businessId,
      startTime: { gte: hace30Dias, lt: ahora },
      status: { not: "cancelada" },
    },
    select: { startTime: true },
  })

  // Cuenta citas por hora local del negocio
  const conteoHora = new Array(24).fill(0)
  for (const cita of citasUltimos30) {
    const horaLocal = toZonedTime(cita.startTime, tz).getHours()
    conteoHora[horaLocal]++
  }

  // Solo horas laborales típicas: 8-20
  const horasLaborales = Array.from({ length: 13 }, (_, i) => i + 8)
  const totalCitasLaborales = horasLaborales.reduce((s, h) => s + conteoHora[h], 0)
  const promedioHora = totalCitasLaborales / horasLaborales.length

  if (promedioHora > 0) {
    const umbral = Math.max(promedioHora * 0.25, 1)
    const horasMuertas = horasLaborales
      .filter((h) => conteoHora[h] <= umbral)
      .slice(0, 3)

    for (const hora of horasMuertas) {
      sugerencias.push({
        id: `horario-${hora}`,
        tipo: "horario",
        prioridad: conteoHora[hora] === 0 ? "media" : "baja",
        titulo: `Horario muerto: ${hora}:00 – ${hora + 1}:00`,
        descripcion: `Solo ${conteoHora[hora]} ${conteoHora[hora] === 1 ? "cita" : "citas"} en esta franja en 30 días (promedio del negocio: ${Math.round(promedioHora)} por hora). Considera una promoción de "hora feliz" o descuento para este horario.`,
        accion: "Crear promoción",
        meta: { hora, citasEnPeriodo: conteoHora[hora], promedioNegocio: Math.round(promedioHora) },
      })
    }
  }

  // --- AGENTE DE NO-SHOWS: clientes que no se presentaron recientemente ---
  const citasPasadasPendientes = await prisma.appointment.findMany({
    where: {
      businessId,
      startTime: { gte: hace90Dias, lt: new Date(ahora.getTime() - 2 * 60 * 60 * 1000) },
      status: { in: ["pendiente", "confirmada"] },
      patientId: { not: null },
    },
    select: {
      patientId: true,
      startTime: true,
      patient: { select: { id: true, name: true, phone: true } },
    },
  })

  // Agrupar por paciente y contar no-shows
  const noShowsPorPaciente = new Map<string, { nombre: string; telefono: string | null; count: number }>()
  for (const cita of citasPasadasPendientes) {
    if (!cita.patientId || !cita.patient) continue
    const prev = noShowsPorPaciente.get(cita.patientId)
    if (prev) {
      prev.count++
    } else {
      noShowsPorPaciente.set(cita.patientId, {
        nombre: cita.patient.name,
        telefono: cita.patient.phone,
        count: 1,
      })
    }
  }

  for (const [pacienteId, datos] of noShowsPorPaciente) {
    if (datos.count >= 2) {
      sugerencias.push({
        id: `noshows-${pacienteId}`,
        tipo: "noshows",
        prioridad: datos.count >= 3 ? "alta" : "media",
        titulo: `${datos.nombre} tiene ${datos.count} citas sin confirmar`,
        descripcion: `En los últimos 90 días ha dejado ${datos.count} citas en estado pendiente pasada la hora. Considera enviarle un recordatorio más temprano o pedir depósito al reservar.`,
        accion: datos.telefono ? "Enviar WhatsApp" : "Ver perfil",
        meta: { pacienteId, nombre: datos.nombre, telefono: datos.telefono, noShows: datos.count },
      })
    }
  }

  // Ordenar: alta prioridad primero, luego por tipo
  const orden = { alta: 0, media: 1, baja: 2 }
  sugerencias.sort((a, b) => orden[a.prioridad] - orden[b.prioridad])

  return NextResponse.json({
    sugerencias,
    resumen: {
      total: sugerencias.length,
      alta: sugerencias.filter((s) => s.prioridad === "alta").length,
      media: sugerencias.filter((s) => s.prioridad === "media").length,
      ventas: sugerencias.filter((s) => s.tipo === "ventas").length,
      retencion: sugerencias.filter((s) => s.tipo === "retencion").length,
      horario: sugerencias.filter((s) => s.tipo === "horario").length,
      noshows: sugerencias.filter((s) => s.tipo === "noshows").length,
    },
  })
}
