import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { enviarRecordatorio } from "@/lib/email"
import { llamadaDeCronAutorizada } from "@/lib/cron"
import { registrarError } from "@/lib/registro-de-errores"
import { ESTADOS_GESTIONABLES } from "@/lib/gestion-de-cita"
import { ORIGEN_RESERVA_PUBLICA } from "@/lib/reserva-publica"
import { generarToken } from "@/lib/tokens"
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
 *
 * Defensa en profundidad: `Appointment.customer` es una FK simple, la base no
 * garantiza que el cliente sea del mismo negocio que la cita. Si no coinciden,
 * no se envía (el correo saldría con el nombre de un negocio a un cliente de
 * otro): se omite, se cuenta en `omitidas` y se registra sólo el id de la cita.
 *
 * Reservas públicas de antes de la etapa 1 (#106): no tienen enlace para
 * cancelar o reagendar (`manageTokenHash` null). Al recordarlas se les genera
 * uno (a la base va sólo el hash, y sólo si seguía vacío: nunca se pisa uno
 * existente) y el correo lo trae. Si el envío falla, el hash se borra junto
 * con la marca: el token en claro no llegó a nadie, y el reintento genera otro.
 */

export const maxDuration = 60

/** Margen antes de `maxDuration` para no cortar un envío a la mitad. */
const PRESUPUESTO_MS = 50_000

/** Tope de candidatas por corrida: con él, una corrida nunca trae la tabla entera. */
const TOPE = 2000

function nombreCompleto(cliente: { name: string; lastName: string | null }): string {
  return cliente.lastName ? `${cliente.name} ${cliente.lastName}` : cliente.name
}

interface CitaParaEnlace {
  id: string
  businessId: string
  status: string
  source: string
  manageTokenHash: string | null
}

/**
 * Si la cita es una reserva pública gestionable sin enlace, le genera uno y
 * guarda su hash sólo si seguía vacío (idempotente: dos corridas no se pisan,
 * y un enlace existente nunca se reemplaza). Devuelve el token en claro para
 * el correo, o null si no corresponde o si otro proceso ya le puso uno.
 */
async function enlaceParaCitaSinToken(cita: CitaParaEnlace): Promise<{ token: string; tokenHash: string } | null> {
  if (cita.manageTokenHash || cita.source !== ORIGEN_RESERVA_PUBLICA) return null
  if (!(ESTADOS_GESTIONABLES as readonly string[]).includes(cita.status)) return null
  const enlace = generarToken()
  const { count } = await prisma.appointment.updateMany({
    where: { id: cita.id, businessId: cita.businessId, manageTokenHash: null },
    data: { manageTokenHash: enlace.tokenHash },
  })
  return count === 1 ? enlace : null
}

export async function GET(request: NextRequest) {
  if (!llamadaDeCronAutorizada(request)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const inicio = Date.now()
  const ahora = new Date(inicio)
  const ventana = ventanaDeBusqueda(ahora)
  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000"
  let enviados = 0
  let fallidos = 0
  let omitidas = 0
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
        businessId: true,
        startTime: true,
        title: true,
        status: true,
        source: true,
        manageTokenHash: true,
        customer: { select: { name: true, lastName: true, email: true, businessId: true } },
        business: { select: { name: true, slug: true, timezone: true, cancelacionHorasAntes: true } },
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
      if (cita.customer.businessId !== cita.businessId) {
        omitidas++
        console.error("Recordatorio omitido: la cita y su cliente son de negocios distintos", { citaId: cita.id })
        continue
      }
      total++

      // El candado: sólo quien la marca la envía.
      const marcada = await prisma.appointment.updateMany({
        where: { id: cita.id, reminderSentAt: null },
        data: { reminderSentAt: ahora },
      })
      if (marcada.count === 0) continue

      let enviado = false
      let enlaceNuevo: { token: string; tokenHash: string } | null = null
      try {
        enlaceNuevo = await enlaceParaCitaSinToken(cita)
        const { fecha, hora } = fechaYHoraEnElNegocio(cita.startTime, cita.business.timezone)
        const resultado = await enviarRecordatorio({
          emailCliente: cita.customer.email,
          nombreCliente: nombreCompleto(cita.customer),
          nombreNegocio: cita.business.name,
          servicio: cita.title,
          fecha,
          hora,
          ...(enlaceNuevo
            ? {
                enlaceDeGestion: `${baseUrl}/reservar/${encodeURIComponent(cita.business.slug)}/cita/${enlaceNuevo.token}`,
                plazoHoras: cita.business.cancelacionHorasAntes,
              }
            : {}),
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
        if (enlaceNuevo) {
          // Sólo el hash que puso esta corrida: si entretanto cambió, no se toca.
          await prisma.appointment.updateMany({
            where: { id: cita.id, businessId: cita.businessId, manageTokenHash: enlaceNuevo.tokenHash },
            data: { manageTokenHash: null },
          })
        }
      } catch (error) {
        registrarError("liberando un recordatorio", error)
      }
    }
  } catch (error) {
    registrarError("en el cron de recordatorios", error)
    return NextResponse.json({ error: "Error interno", total, enviados, fallidos, omitidas }, { status: 500 })
  }

  return NextResponse.json({
    mensaje: `Recordatorios procesados: ${enviados} enviados, ${fallidos} fallidos`,
    total,
    enviados,
    fallidos,
    omitidas,
    incompleto,
  })
}
