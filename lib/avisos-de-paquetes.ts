import { prisma } from "@/lib/prisma"
import { enviarSaldoDePaquete } from "@/lib/email"
import { registrarError } from "@/lib/registro-de-errores"
import { urlBase } from "@/lib/url-base"
import type { AvisoDeSaldo } from "@/lib/paquetes-servidor"

/**
 * (servidor) Después de cobrar: le avisa por correo a la clienta de la
 * atención que a un paquete suyo le queda una sesión, o que usó la última.
 * Nunca lanza: el cobro ya está hecho, y un correo que no sale no lo deshace.
 * La clienta y el negocio se leen de la base, acotados al negocio.
 */
export async function avisarSaldoDePaquetes(businessId: string, visitId: string, avisos: readonly AvisoDeSaldo[]): Promise<void> {
  try {
    const atencion = await prisma.visit.findFirst({
      where: { id: visitId, businessId },
      select: {
        customer: { select: { name: true, email: true } },
        business: { select: { name: true, slug: true } },
      },
    })
    const email = atencion?.customer?.email
    if (!atencion || !email) return

    let enlaceReservar: string | null = null
    try {
      enlaceReservar = `${urlBase()}/reservar/${atencion.business.slug}`
    } catch {
      // Sin URL base (producción mal configurada): el correo sale sin botón antes que con un enlace a localhost.
    }
    for (const aviso of avisos) {
      await enviarSaldoDePaquete({
        emailCliente: email,
        nombreCliente: atencion.customer?.name ?? "",
        nombreNegocio: atencion.business.name,
        servicio: aviso.servicio,
        sesiones: aviso.sesiones,
        restantes: aviso.restantes,
        enlaceReservar,
      })
    }
  } catch (error) {
    registrarError("avisando el saldo de un paquete", error)
  }
}
