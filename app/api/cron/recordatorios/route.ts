import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { enviarRecordatorio } from "@/lib/email"
import { llamadaDeCronAutorizada } from "@/lib/cron"
import { registrarError } from "@/lib/registro-de-errores"
import {
  ESTADOS_SIN_RECORDATORIO,
  esDeMañana,
  fechaYHoraEnElNegocio,
  ventanaDeBusqueda,
} from "@/lib/recordatorios"

/**
 * Cron diario (`vercel.json`, 13:00 UTC: las 10:00 en Chile con horario de
 * verano, las 9:00 sin él) que avisa por correo a cada cliente con cita
 * "mañana" en la zona del negocio. Qué cita toca y con qué hora lo decide
 * `lib/recordatorios.ts`.
 *
 * Una vez por cita: antes de enviar se marca `reminderSentAt` sólo si seguía
 * vacío (si otro proceso la marcó, no se repite); si el envío falla se
 * libera, y una corrida manual del mismo día la reintenta.
 *
 * Envía de a uno (Resend limita los envíos por segundo) y corta antes de que
 * la plataforma lo mate: lo que quedó lo dice `incompleto`.
 */

export const maxDuration = 60

/** Margen antes de `maxDuration` para no cortar un envío a la mitad. */
const PRESUPUESTO_MS = 50_000

/** Tope de candidatas por corrida: con él, una corrida nunca trae la tabla entera. */
const TOPE = 2000

function nombreCompleto(cliente: { name: string; lastName: string | null }): string {
  return cliente.lastName ? `${cliente.name} ${cliente.lastName}` : cliente.name
}

export async function GET(request: NextRequest) {
  if (!llamadaDeCronAutorizada(request)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const inicio = Date.now()
  const ahora = new Date(inicio)
  const ventana = ventanaDeBusqueda(ahora)
  let enviados = 0
  let fallidos = 0
  let total = 0
  let incompleto = false

  try {
    const candidatas = await prisma.appointment.findMany({
      where: {
        startTime: { gte: ventana.desde, lt: ventana.hasta },
        status: { notIn: [...ESTADOS_SIN_RECORDATORIO] },
        reminderSentAt: null,
        customer: { email: { not: null } },
      },
      select: {
        id: true,
        startTime: true,
        title: true,
        customer: { select: { name: true, lastName: true, email: true } },
        business: { select: { name: true, timezone: true } },
      },
      orderBy: { startTime: "asc" },
      take: TOPE,
    })

    for (const cita of candidatas) {
      if (!cita.customer?.email || !esDeMañana(cita.startTime, ahora, cita.business.timezone)) continue
      if (Date.now() - inicio > PRESUPUESTO_MS) {
        incompleto = true
        break
      }
      total++

      // El candado: sólo quien la marca la envía.
      const marcada = await prisma.appointment.updateMany({
        where: { id: cita.id, reminderSentAt: null },
        data: { reminderSentAt: ahora },
      })
      if (marcada.count === 0) continue

      let enviado = false
      try {
        const { fecha, hora } = fechaYHoraEnElNegocio(cita.startTime, cita.business.timezone)
        const resultado = await enviarRecordatorio({
          emailCliente: cita.customer.email,
          nombreCliente: nombreCompleto(cita.customer),
          nombreNegocio: cita.business.name,
          servicio: cita.title,
          fecha,
          hora,
        })
        if (resultado?.error) {
          // Sólo el código de Resend: su mensaje puede repetir el destinatario.
          console.error("Error enviando un recordatorio:", { name: resultado.error.name })
        }
        enviado = resultado !== null && !resultado.error
      } catch (error) {
        registrarError("enviando un recordatorio", error)
      }

      if (enviado) {
        enviados++
        continue
      }
      fallidos++
      try {
        await prisma.appointment.updateMany({
          where: { id: cita.id, reminderSentAt: ahora },
          data: { reminderSentAt: null },
        })
      } catch (error) {
        registrarError("liberando un recordatorio", error)
      }
    }
  } catch (error) {
    registrarError("en el cron de recordatorios", error)
    return NextResponse.json({ error: "Error interno", total, enviados, fallidos }, { status: 500 })
  }

  return NextResponse.json({
    mensaje: `Recordatorios procesados: ${enviados} enviados, ${fallidos} fallidos`,
    total,
    enviados,
    fallidos,
    incompleto,
  })
}
