import { NextRequest, NextResponse } from "next/server"
import { toZonedTime, fromZonedTime } from "date-fns-tz"
import { prisma } from "@/lib/prisma"
import { enviarRecordatorio } from "@/lib/email"

const DEFAULT_TZ = "America/Cancun"

export async function GET(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret")
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  // Find all businesses to handle per-business timezone
  const negocios = await prisma.business.findMany({
    select: { id: true, name: true, timezone: true },
  })

  let totalEnviados = 0
  let totalFallidos = 0
  let totalOmitidos = 0

  for (const negocio of negocios) {
    const tz = negocio.timezone ?? DEFAULT_TZ

    // "tomorrow" in the business's local timezone
    const ahoraLocal = toZonedTime(new Date(), tz)
    const mananaLocal = new Date(ahoraLocal)
    mananaLocal.setDate(mananaLocal.getDate() + 1)

    const fechaManana = mananaLocal.toISOString().slice(0, 10)
    const inicioUTC = fromZonedTime(`${fechaManana}T00:00:00`, tz)
    const finUTC = fromZonedTime(`${fechaManana}T23:59:59`, tz)

    const citas = await prisma.appointment.findMany({
      where: {
        businessId: negocio.id,
        startTime: { gte: inicioUTC, lte: finUTC },
        status: { notIn: ["cancelada", "completada"] },
        reminderSentAt: null,           // idempotency guard — skip already-sent
        patient: { email: { not: null } },
      },
      select: {
        id: true,
        startTime: true,
        title: true,
        patient: { select: { name: true, lastName: true, email: true } },
      },
    })

    const resultados = await Promise.allSettled(
      citas.map(async (cita) => {
        if (!cita.patient?.email) return null

        const startLocal = toZonedTime(cita.startTime, tz)

        await enviarRecordatorio({
          emailCliente: cita.patient.email,
          nombreCliente: `${cita.patient.name}${cita.patient.lastName ? " " + cita.patient.lastName : ""}`,
          nombreNegocio: negocio.name,
          servicio: cita.title,
          fecha: startLocal.toISOString().slice(0, 10),
          hora: startLocal.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }),
        })

        // Mark as sent so re-runs are safe
        await prisma.appointment.update({
          where: { id: cita.id },
          data: { reminderSentAt: new Date() },
        })
      })
    )

    totalEnviados += resultados.filter((r) => r.status === "fulfilled").length
    totalFallidos += resultados.filter((r) => r.status === "rejected").length
  }

  return NextResponse.json({
    mensaje: `Recordatorios procesados: ${totalEnviados} enviados, ${totalFallidos} fallidos, ${totalOmitidos} omitidos (ya enviados)`,
    enviados: totalEnviados,
    fallidos: totalFallidos,
    omitidos: totalOmitidos,
  })
}
