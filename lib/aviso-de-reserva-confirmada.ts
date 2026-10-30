import { after } from "next/server"
import { prisma } from "@/lib/prisma"
import { clienteNoEliminado } from "@/lib/clientes-eliminados"
import { enviarReservaConfirmadaPorElLocal } from "@/lib/email"
import { fechaYHoraEnElNegocio } from "@/lib/recordatorios"
import { registrarError } from "@/lib/registro-de-errores"

/**
 * El correo al cliente cuando el local confirma una reserva que había
 * entrado por confirmar (#84). Va después de responder (`after` de Next):
 * quien confirma no espera el correo, y si falla la cita ya está confirmada.
 */

export interface ReservaConfirmada {
  /** El negocio de la sesión de quien confirmó: la cita se vuelve a leer con él. */
  businessId: string
  citaId: string
}

/** Programa el aviso. Nunca lanza: la cita ya se confirmó y tiene que responder. */
export function avisarReservaConfirmadaPorElLocal(confirmada: ReservaConfirmada): void {
  try {
    after(() => enviarAvisoDeReservaConfirmada(confirmada))
  } catch (error) {
    // Sólo fuera de un pedido de Next (scripts, tests).
    registrarError("programando el aviso de reserva confirmada", error)
  }
}

/**
 * Lee la cita (por id Y negocio) y le escribe al cliente, si tiene correo y
 * no fue eliminado. La fecha y la hora van en el reloj del negocio. Devuelve
 * si se envió. Nunca lanza.
 */
export async function enviarAvisoDeReservaConfirmada({ businessId, citaId }: ReservaConfirmada): Promise<boolean> {
  try {
    const cita = await prisma.appointment.findFirst({
      // Un cliente eliminado no recibe nada (y ya no tiene correo).
      where: { id: citaId, businessId, status: "confirmada", customer: clienteNoEliminado },
      select: {
        title: true,
        startTime: true,
        customer: { select: { name: true, lastName: true, email: true } },
        member: { select: { user: { select: { name: true } } } },
        business: { select: { name: true, timezone: true } },
      },
    })
    if (!cita?.customer?.email) return false

    const { fecha, hora } = fechaYHoraEnElNegocio(cita.startTime, cita.business.timezone)
    const resultado = await enviarReservaConfirmadaPorElLocal({
      emailCliente: cita.customer.email,
      nombreCliente: cita.customer.lastName ? `${cita.customer.name} ${cita.customer.lastName}` : cita.customer.name,
      nombreNegocio: cita.business.name,
      servicio: cita.title,
      fecha,
      hora,
      profesional: cita.member?.user.name ?? null,
    })
    if (resultado?.error) {
      // Sólo el código de Resend: su mensaje puede repetir el destinatario.
      console.error("Error enviando el aviso de reserva confirmada:", { name: resultado.error.name })
    }
    return resultado !== null && !resultado.error
  } catch (error) {
    registrarError("enviando el aviso de reserva confirmada", error)
    return false
  }
}
