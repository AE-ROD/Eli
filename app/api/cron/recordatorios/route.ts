import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { enviarRecordatorio } from "@/lib/email"

export async function GET(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret")
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const manana = new Date()
  manana.setDate(manana.getDate() + 1)
  manana.setHours(0, 0, 0, 0)

  const finManana = new Date(manana)
  finManana.setHours(23, 59, 59, 999)

  const citas = await prisma.appointment.findMany({
    where: {
      startTime: { gte: manana, lte: finManana },
      status: { notIn: ["cancelada", "completada"] },
      patient: { email: { not: null } },
    },
    select: {
      startTime: true,
      title: true,
      patient: { select: { name: true, lastName: true, email: true } },
      business: { select: { name: true } },
    },
  })

  const resultados = await Promise.allSettled(
    citas.map((cita: (typeof citas)[number]) => {
      if (!cita.patient?.email) return Promise.resolve(null)
      return enviarRecordatorio({
        emailCliente: cita.patient.email,
        nombreCliente: `${cita.patient.name}${cita.patient.lastName ? " " + cita.patient.lastName : ""}`,
        nombreNegocio: cita.business.name,
        servicio: cita.title,
        fecha: cita.startTime.toISOString().split("T")[0],
        hora: cita.startTime.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }),
      })
    })
  )

  const enviados = resultados.filter((r: PromiseSettledResult<unknown>) => r.status === "fulfilled").length
  const fallidos = resultados.filter((r: PromiseSettledResult<unknown>) => r.status === "rejected").length

  return NextResponse.json({
    mensaje: `Recordatorios procesados: ${enviados} enviados, ${fallidos} fallidos`,
    total: citas.length,
  })
}
