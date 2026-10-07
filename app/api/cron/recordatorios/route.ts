import { createHash, timingSafeEqual } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { enviarRecordatorio } from "@/lib/email"

/**
 * Compara en tiempo constante. `timingSafeEqual` exige dos buffers del mismo
 * largo: se comparan los hashes, que siempre miden lo mismo, en vez de cortar
 * antes cuando los largos difieren, que también diría algo del secreto.
 */
function mismoSecreto(recibido: string, esperado: string): boolean {
  const hashRecibido = createHash("sha256").update(recibido).digest()
  const hashEsperado = createHash("sha256").update(esperado).digest()
  return timingSafeEqual(hashRecibido, hashEsperado)
}

/**
 * Vercel Cron llama con `Authorization: Bearer <CRON_SECRET>` cuando la
 * variable está configurada en el proyecto, y no puede mandar un header
 * propio: esperando sólo `x-cron-secret`, la llamada de Vercel recibía siempre
 * 401. `x-cron-secret` se sigue aceptando por si alguien lo llama a mano con
 * él.
 *
 * Sin `CRON_SECRET`, o vacío, falla cerrado antes de comparar: si no, lo
 * esperado sería `Bearer undefined`, y un `x-cron-secret` vacío coincidiría
 * con una variable vacía.
 */
function llamadaAutorizada(request: NextRequest): boolean {
  const secreto = process.env.CRON_SECRET
  if (!secreto) return false

  const authorization = request.headers.get("authorization")
  const propio = request.headers.get("x-cron-secret")
  return (
    (authorization !== null && mismoSecreto(authorization, `Bearer ${secreto}`)) ||
    (propio !== null && mismoSecreto(propio, secreto))
  )
}

export async function GET(request: NextRequest) {
  if (!llamadaAutorizada(request)) {
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
      customer: { email: { not: null } },
    },
    select: {
      startTime: true,
      title: true,
      customer: { select: { name: true, lastName: true, email: true } },
      business: { select: { name: true } },
    },
  })

  const resultados = await Promise.allSettled(
    citas.map((cita: (typeof citas)[number]) => {
      if (!cita.customer?.email) return Promise.resolve(null)
      return enviarRecordatorio({
        emailCliente: cita.customer.email,
        nombreCliente: `${cita.customer.name}${cita.customer.lastName ? " " + cita.customer.lastName : ""}`,
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
