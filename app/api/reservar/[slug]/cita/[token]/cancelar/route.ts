import { NextResponse, type NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { enviarAvisoDeCambioDelCliente } from "@/lib/email"
import { ESTADOS_GESTIONABLES, dentroDelPlazo, mensajeFueraDePlazo } from "@/lib/gestion-de-cita"
import { programarAvisoDeHoraLiberada } from "@/lib/lista-de-espera"
import { serviciosDeLaCita } from "@/lib/servicios-de-la-reserva"
import { abrirEnlace, fechaYHora, noEncontrada, nombreDelCliente, type Params } from "../_comun"

/**
 * POST /api/reservar/[slug]/cita/[token]/cancelar — el cliente cancela su
 * cita, dentro del plazo del negocio. Queda `cancelada` por el `cliente`, con
 * la hora, y el horario se libera. El enlace deja de servir (404).
 */
export async function POST(request: NextRequest, contexto: Params) {
  const enlace = await abrirEnlace(request, contexto, "reserva")
  if (enlace instanceof NextResponse) return enlace
  const { cita, zona, ahora } = enlace

  const plazo = cita.business.cancelacionHorasAntes
  if (!dentroDelPlazo(cita.startTime, plazo, ahora)) {
    return NextResponse.json({ error: mensajeFueraDePlazo(plazo) }, { status: 409 })
  }

  // Acotado por negocio, estado y hora de inicio también al escribir: si
  // entretanto el local la movió o la cerró, no se pisa.
  const { count } = await prisma.appointment.updateMany({
    where: {
      id: cita.id,
      businessId: cita.businessId,
      status: { in: [...ESTADOS_GESTIONABLES] },
      startTime: cita.startTime,
    },
    data: { status: "cancelada", canceladaPor: "cliente", canceladaEn: ahora },
  })
  if (count === 0) return noEncontrada()

  // La hora quedó libre: a la lista de espera de ese día, después de responder.
  programarAvisoDeHoraLiberada({ businessId: cita.businessId, inicio: cita.startTime })

  const { fecha, hora } = fechaYHora(cita.startTime, zona)
  await enviarAvisoDeCambioDelCliente({
    tipo: "cancelo",
    emailNegocio: cita.business.user.email,
    nombreNegocio: cita.business.name,
    nombreCliente: nombreDelCliente(cita),
    servicio: serviciosDeLaCita(cita).nombre,
    profesional: cita.member?.user?.name ?? null,
    fecha,
    hora,
  }).catch(() => null)

  return NextResponse.json({ mensaje: "Cita cancelada" })
}
