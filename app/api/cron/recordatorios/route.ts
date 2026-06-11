import { NextRequest, NextResponse } from "next/server"
import { toZonedTime, fromZonedTime } from "date-fns-tz"
import { prisma } from "@/lib/prisma"
import { enviarRecordatorio } from "@/lib/email"
import { enviarRecordatorioWhatsApp } from "@/lib/whatsapp"

const DEFAULT_TZ = "America/Cancun"

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const negocios = await prisma.business.findMany({
    select: { id: true, name: true, timezone: true },
  })

  let totalEnviados = 0
  let totalFallidos = 0

  for (const negocio of negocios) {
    const tz = negocio.timezone ?? DEFAULT_TZ

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
        reminderSentAt: null,
        // Fetch appointments where at least one notification channel is available
        patient: { OR: [{ email: { not: null } }, { phone: { not: null } }] },
      },
      select: {
        id: true,
        startTime: true,
        title: true,
        patient: { select: { name: true, lastName: true, email: true, phone: true } },
      },
    })

    const resultados = await Promise.allSettled(
      citas.map(async (cita) => {
        const pat = cita.patient
        if (!pat) return null

        const startLocal = toZonedTime(cita.startTime, tz)
        const nombreCliente = `${pat.name}${pat.lastName ? " " + pat.lastName : ""}`
        const hora = startLocal.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })
        const fecha = startLocal.toISOString().slice(0, 10)

        const canal: Promise<unknown>[] = []

        if (pat.email) {
          canal.push(
            enviarRecordatorio({
              emailCliente: pat.email,
              nombreCliente,
              nombreNegocio: negocio.name,
              servicio: cita.title,
              fecha,
              hora,
            })
          )
        }

        if (pat.phone) {
          canal.push(
            enviarRecordatorioWhatsApp({
              telefono: pat.phone,
              nombreNegocio: negocio.name,
              servicio: cita.title,
              hora,
            })
          )
        }

        await Promise.all(canal)

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
    mensaje: `Recordatorios procesados: ${totalEnviados} enviados, ${totalFallidos} fallidos`,
    enviados: totalEnviados,
    fallidos: totalFallidos,
  })
}
