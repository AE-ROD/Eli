import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { candidatosDeLaReserva, horasLibresDelDia } from "@/lib/agenda-publica"
import { dentroDelPlazo, mensajeFueraDePlazo } from "@/lib/gestion-de-cita"
import { MENSAJE_FECHA_MUY_LEJANA, MENSAJE_FECHA_PASADA, fechaNoReservable } from "@/lib/reserva-publica"
import { serviciosDeLaCita } from "@/lib/servicios-de-la-reserva"
import { esFechaCalendario } from "@/lib/zona-horaria"
import { abrirEnlace, type Params } from "../_comun"

const fechaSchema = z
  .string({ required_error: "Falta la fecha (AAAA-MM-DD)", invalid_type_error: "Falta la fecha (AAAA-MM-DD)" })
  .refine(esFechaCalendario, "La fecha no es válida: tiene que ser un día real, con el formato AAAA-MM-DD")

/**
 * GET /api/reservar/[slug]/cita/[token]/disponibilidad?fecha= — las horas a
 * las que se puede mover la cita: mismos servicios y mismo profesional (o
 * cualquiera, si la cita no tenía), con la misma regla que la reserva
 * (`lib/agenda-publica.ts`). Con varios servicios (#89a), el bloque entero:
 * la duración total copiada al reservar. La propia cita no se ocupa a sí misma.
 */
export async function GET(request: NextRequest, contexto: Params) {
  const enlace = await abrirEnlace(request, contexto, "lecturaPublica")
  if (enlace instanceof NextResponse) return enlace
  const { cita, zona, ahora } = enlace

  const fecha = fechaSchema.safeParse(new URL(request.url).searchParams.get("fecha") ?? undefined)
  if (!fecha.success) return NextResponse.json({ error: fecha.error.issues[0].message }, { status: 400 })

  const plazo = cita.business.cancelacionHorasAntes
  if (!dentroDelPlazo(cita.startTime, plazo, ahora)) {
    return NextResponse.json({ slots: [], mensaje: mensajeFueraDePlazo(plazo) })
  }
  const servicios = serviciosDeLaCita(cita)
  if (!servicios.activos || servicios.duracion === null) {
    return NextResponse.json({ slots: [], mensaje: "Este servicio ya no se reserva por acá. Contacta al local." })
  }

  const noReservable = fechaNoReservable(fecha.data, ahora, zona)
  if (noReservable) {
    return NextResponse.json({
      slots: [],
      mensaje: noReservable === "pasada" ? MENSAJE_FECHA_PASADA : MENSAJE_FECHA_MUY_LEJANA,
    })
  }

  const reserva = await candidatosDeLaReserva(prisma, {
    businessId: cita.businessId,
    serviceIds: servicios.ids,
    profesionalId: cita.memberId,
    fecha: fecha.data,
  })
  if (reserva.tipo === "profesional-no-disponible") {
    return NextResponse.json({ slots: [], mensaje: "No hay horas para reagendar por acá. Contacta al local." })
  }
  const candidatos = reserva.candidatos.filter((candidato) => candidato.franjas.length > 0)
  if (candidatos.length === 0) return NextResponse.json({ slots: [], mensaje: "No hay atención ese día" })

  const slots = await horasLibresDelDia(prisma, {
    businessId: cita.businessId,
    zona,
    fecha: fecha.data,
    duracion: servicios.duracion,
    candidatos,
    ahora,
    ignorarCitaId: cita.id,
  })
  return NextResponse.json({ slots })
}
