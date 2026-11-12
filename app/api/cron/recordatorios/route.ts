import { NextRequest, NextResponse } from "next/server"
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { enviarRecordatorio } from "@/lib/email"
import { llamadaDeCronAutorizada } from "@/lib/cron"
import { registrarError } from "@/lib/registro-de-errores"
import { urlBase } from "@/lib/url-base"
import { ESTADOS_GESTIONABLES, dentroDelPlazo, plazoValido } from "@/lib/gestion-de-cita"
import { ORIGEN_RESERVA_PUBLICA } from "@/lib/reserva-publica"
import { generarToken } from "@/lib/tokens"
import { nombreCompletoDeCliente } from "@/lib/nombre-de-cliente"
import {
  ESTADOS_SIN_RECORDATORIO,
  esDeMañana,
  fechaYHoraEnElNegocio,
  seguroQueNoSalio,
  ventanaDeBusqueda,
} from "@/lib/recordatorios"

/**
 * Cron diario (`vercel.json`, 13:00 UTC: las 10:00 en Chile con horario de
 * verano, las 9:00 sin él) que avisa por correo a cada cliente con cita
 * "mañana" en la zona del negocio. Qué cita toca y con qué hora lo decide
 * `lib/recordatorios.ts`.
 *
 * Una vez por cita: antes de enviar se marca `reminderSentAt` sólo si seguía
 * vacío (si otro proceso la marcó, no se repite). Si el envío seguro no salió
 * (`seguroQueNoSalio`, o falló antes de intentarlo) se libera, y una corrida
 * manual del mismo día la reintenta. Si el error es ambiguo (el correo pudo
 * llegar: un error de Resend que no es un rechazo, o el envío lanzó), la
 * marca se queda: más vale un recordatorio perdido que dos. Se cuentan en
 * `dudosos` (también dentro de `fallidos`).
 *
 * Lee las candidatas por páginas (sin un tope que deje citas afuera en
 * silencio), envía de a uno (Resend limita los envíos por segundo) y corta
 * antes de que la plataforma lo mate o al llegar al tope de páginas: lo que
 * quedó lo dice `incompleto`.
 *
 * Defensa en profundidad: `Appointment.customer` es una FK simple, la base no
 * garantiza que el cliente sea del mismo negocio que la cita. Si no coinciden,
 * no se envía (el correo saldría con el nombre de un negocio a un cliente de
 * otro): se omite, se cuenta en `omitidas` y se registra sólo el id de la cita.
 *
 * Reservas públicas de antes de la etapa 1 (#106): no tienen enlace para
 * cancelar o reagendar (`manageTokenHash` null). Al recordarlas se les genera
 * uno (a la base va sólo el hash, y sólo si seguía vacío: nunca se pisa uno
 * existente) y el correo lo trae. Si Resend rechazó el envío
 * (`seguroQueNoSalio`), el hash se borra junto con la marca: el token en
 * claro no llegó a nadie, y el reintento genera otro. Si el error es ambiguo
 * (el correo pudo llegar), el hash se queda: borrarlo dejaba en ese correo un
 * enlace que da 404 (#140); el reintento sale sin enlace.
 *
 * El botón para cancelar o cambiar sólo va si la cita sigue fuera del plazo
 * del negocio (`dentroDelPlazo`), como en la confirmación (#164): con el
 * plazo por defecto de 24 horas, el recordatorio casi siempre llega cuando
 * ya no se puede. Entonces tampoco se genera un enlace.
 *
 * Las reservas que ya tienen enlace lo traen en su correo de confirmación;
 * el recordatorio no lo repite: la base guarda sólo el hash.
 */

export const maxDuration = 60

/** Margen antes de `maxDuration` para no cortar un envío a la mitad. */
const PRESUPUESTO_MS = 50_000

/** Candidatas por página: una lectura nunca trae la tabla entera. */
const POR_PAGINA = 500

/**
 * Tope de páginas por corrida (10.000 candidatas). La ventana trae más que
 * "mañana" (`esDeMañana` filtra después), así que el tope es sobre lo leído.
 * Si se alcanza, la respuesta dice `incompleto`: nunca se corta en silencio.
 */
const TOPE_DE_PAGINAS = 20

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
async function enlaceParaCitaSinToken(
  cita: CitaParaEnlace,
  sePuedeCambiar: boolean
): Promise<{ token: string; tokenHash: string } | null> {
  if (!sePuedeCambiar || cita.manageTokenHash || cita.source !== ORIGEN_RESERVA_PUBLICA) return null
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
  // En producción sin NEXTAUTH_URL, `urlBase` lanza. El recordatorio es lo
  // principal y sale igual, sin el enlace de gestión (y sin crear un token
  // que nadie recibiría): mejor sin botón que con uno a localhost.
  let baseUrl: string | null = null
  try {
    baseUrl = urlBase()
  } catch (error) {
    registrarError("armando los enlaces de los recordatorios", error)
  }
  let enviados = 0
  let fallidos = 0
  let omitidas = 0
  let total = 0
  let dudosos = 0
  let incompleto = false

  const candidatasDe = {
    startTime: { gte: ventana.desde, lt: ventana.hasta },
    status: { notIn: [...ESTADOS_SIN_RECORDATORIO] },
    reminderSentAt: null,
    customer: { email: { not: null } },
  } satisfies Prisma.AppointmentWhereInput

  /**
   * Una página, en orden de inicio y luego de id. Desde la segunda, las que
   * van después de la última leída (por posición, no por `reminderSentAt`:
   * una que se liberó por un envío fallido no se vuelve a leer en la misma
   * corrida).
   */
  const leerPagina = (despuesDe: { startTime: Date; id: string } | null) =>
    prisma.appointment.findMany({
      where: despuesDe
        ? {
            AND: [
              candidatasDe,
              {
                OR: [
                  { startTime: { gt: despuesDe.startTime } },
                  { startTime: despuesDe.startTime, id: { gt: despuesDe.id } },
                ],
              },
            ],
          }
        : candidatasDe,
      select: {
        id: true,
        businessId: true,
        startTime: true,
        title: true,
        status: true,
        source: true,
        manageTokenHash: true,
        customer: { select: { name: true, lastName: true, email: true, businessId: true } },
        business: { select: { name: true, slug: true, timezone: true, cancelacionHorasAntes: true, type: true } },
      },
      orderBy: [{ startTime: "asc" }, { id: "asc" }],
      take: POR_PAGINA,
    })

  try {
    let despuesDe: { startTime: Date; id: string } | null = null
    let paginas = 0
    paginando: for (;;) {
      if (paginas >= TOPE_DE_PAGINAS) {
        incompleto = true
        break
      }
      const pagina = await leerPagina(despuesDe)
      paginas++

      for (const cita of pagina) {
        if (!cita.customer?.email || !esDeMañana(cita.startTime, ahora, cita.business.timezone)) continue
        if (Date.now() - inicio > PRESUPUESTO_MS) {
          incompleto = true
          break paginando
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
        // Si el correo seguro no salió: sólo entonces se libera la marca y se
        // borra el enlace nuevo. Si falló antes de intentar enviarlo, tampoco salió.
        let noSalio = true
        let enlaceNuevo: { token: string; tokenHash: string } | null = null
        try {
          const sePuedeCambiar = dentroDelPlazo(cita.startTime, cita.business.cancelacionHorasAntes, ahora)
          enlaceNuevo = baseUrl ? await enlaceParaCitaSinToken(cita, sePuedeCambiar) : null
          const { fecha, hora } = fechaYHoraEnElNegocio(cita.startTime, cita.business.timezone)
          // Desde acá el correo pudo salir aunque después algo falle.
          noSalio = false
          const resultado = await enviarRecordatorio({
            rubro: cita.business.type,
            emailCliente: cita.customer.email,
            nombreCliente: nombreCompletoDeCliente(cita.customer),
            nombreNegocio: cita.business.name,
            servicio: cita.title,
            fecha,
            hora,
            ...(enlaceNuevo && baseUrl
              ? {
                  enlaceDeGestion: `${baseUrl}/reservar/${encodeURIComponent(cita.business.slug)}/cita/${enlaceNuevo.token}`,
                  plazoHoras: plazoValido(cita.business.cancelacionHorasAntes),
                }
              : {}),
            sePuedeCambiar,
          })
          if (resultado?.error) {
            // Sólo el código de Resend: su mensaje puede repetir el destinatario.
            console.error("Error enviando un recordatorio:", { name: resultado.error.name })
          }
          enviado = resultado !== null && !resultado.error
          noSalio = !enviado && seguroQueNoSalio(resultado)
        } catch (error) {
          registrarError("enviando un recordatorio", error)
        }

        if (enviado) {
          enviados++
          continue
        }
        fallidos++
        // Error ambiguo: el correo pudo llegar. La marca se queda (no se
        // reintenta: sería un segundo recordatorio) y el enlace nuevo también
        // (borrarlo dejaba en ese correo un enlace que da 404, #140).
        if (!noSalio) {
          dudosos++
          continue
        }
        try {
          if (enlaceNuevo) {
            // Una sola escritura: liberar la marca y quitar el hash que puso esta
            // corrida van juntos. Con dos, si fallara la segunda quedaría un hash
            // cuyo token se perdió y el cliente nunca recibiría su enlace. Si el
            // hash cambió entretanto, no se toca nada.
            await prisma.appointment.updateMany({
              where: {
                id: cita.id,
                businessId: cita.businessId,
                reminderSentAt: ahora,
                manageTokenHash: enlaceNuevo.tokenHash,
              },
              data: { reminderSentAt: null, manageTokenHash: null },
            })
          } else {
            await prisma.appointment.updateMany({
              where: { id: cita.id, reminderSentAt: ahora },
              data: { reminderSentAt: null },
            })
          }
        } catch (error) {
          registrarError("liberando un recordatorio", error)
        }
      }

      if (pagina.length < POR_PAGINA) break
      const ultima = pagina[pagina.length - 1]
      despuesDe = { startTime: ultima.startTime, id: ultima.id }
    }
  } catch (error) {
    registrarError("en el cron de recordatorios", error)
    return NextResponse.json({ error: "Error interno", total, enviados, fallidos, dudosos, omitidas }, { status: 500 })
  }

  return NextResponse.json({
    mensaje: `Recordatorios procesados: ${enviados} enviados, ${fallidos} fallidos`,
    total,
    enviados,
    fallidos,
    dudosos,
    omitidas,
    incompleto,
  })
}
