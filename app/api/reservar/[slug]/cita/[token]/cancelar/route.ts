import { NextResponse, type NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { correosDelAviso } from "@/lib/avisos-al-negocio"
import { soltarLoClinicoDeLaCita } from "@/lib/citas-de-la-clinica"
import { enviarAvisoDeCambioDelCliente } from "@/lib/email"
import { dentroDelPlazo, mensajeFueraDePlazo, whereDeEscrituraDelEnlace } from "@/lib/gestion-de-cita"
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
  // `ahora` es la hora de la base (`abrirEnlace`, #152), y la misma para las
  // dos cosas: decidir si sigue dentro del plazo y registrar `canceladaEn`.
  // Así lo que se guarda es exactamente la hora con que se aceptó, y calza
  // con las cancelaciones desde el panel y al anular la atención.
  const { cita, zona, ahora } = enlace

  const plazo = cita.business.cancelacionHorasAntes
  if (!dentroDelPlazo(cita.startTime, plazo, ahora)) {
    return NextResponse.json({ error: mensajeFueraDePlazo(plazo, cita.business.type) }, { status: 409 })
  }

  // Acotado por negocio, estado y hora de inicio también al escribir: si
  // entretanto el local la movió o la cerró, no se pisa. En la misma
  // transacción, lo clínico de la cita (clínica dental): las prestaciones del
  // plan agendadas en ella vuelven a "por agendar", como al cancelar desde la
  // agenda (`lib/citas-de-la-clinica.ts`). En otro rubro no hay nada que
  // soltar y no cambia nada.
  const count = await prisma.$transaction(async (tx) => {
    const { count: canceladas } = await tx.appointment.updateMany({
      // Y sin atención viva: si el cliente llegó entretanto, gana la llegada.
      where: whereDeEscrituraDelEnlace(cita),
      data: { status: "cancelada", canceladaPor: "cliente", canceladaEn: ahora },
    })
    if (canceladas > 0) await soltarLoClinicoDeLaCita(tx, cita.businessId, cita.id, "cancela")
    return canceladas
  })
  if (count === 0) return noEncontrada(cita.business.type)

  // La hora quedó libre: a la lista de espera de ese día, después de responder.
  programarAvisoDeHoraLiberada({ businessId: cita.businessId, inicio: cita.startTime })

  // A la dueña y al profesional de la cita, como el aviso de reserva nueva (#104).
  const { fecha, hora } = fechaYHora(cita.startTime, zona)
  const avisados = await correosDelAviso(cita.businessId, cita.business.user.email, [cita.memberId])
  await Promise.all(
    avisados.map((emailNegocio) =>
      enviarAvisoDeCambioDelCliente({
        rubro: cita.business.type,
        tipo: "cancelo",
        emailNegocio,
        nombreNegocio: cita.business.name,
        nombreCliente: nombreDelCliente(cita),
        servicio: serviciosDeLaCita(cita).nombre,
        profesional: cita.member?.user?.name ?? null,
        fecha,
        hora,
      }).catch(() => null)
    )
  )

  return NextResponse.json({ mensaje: "Cita cancelada" })
}
