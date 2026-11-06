import { NextResponse, type NextRequest } from "next/server"
import { diasConAtencionDeLaReserva } from "@/lib/agenda-publica"
import { dentroDelPlazo } from "@/lib/gestion-de-cita"
import { prisma } from "@/lib/prisma"
import { esRubroDental } from "@/lib/rubros"
import { hayServicioDeUrgencia, serviciosDeLaCita } from "@/lib/servicios-de-la-reserva"
import { abrirEnlace, fechaYHora, type Params } from "./_comun"

/**
 * GET /api/reservar/[slug]/cita/[token] — la cita del enlace de gestión, en
 * el reloj del negocio, y si todavía se puede cambiar. Sólo lo que se le
 * muestra al cliente: ni ids ni datos de contacto.
 */
export async function GET(request: NextRequest, contexto: Params) {
  const enlace = await abrirEnlace(request, contexto, "lecturaPublica")
  if (enlace instanceof NextResponse) return enlace
  const { cita, zona, ahora } = enlace

  const plazoHoras = cita.business.cancelacionHorasAntes
  const servicios = serviciosDeLaCita(cita)
  const sePuedeReagendar = servicios.activos && servicios.duracion !== null
  // Los días en que alguien que puede tomarla atiende (QA#19): el calendario
  // de reagendar no deja elegir los demás, como el de la reserva. `null` si
  // ya no hay quién: el calendario ofrece todos y la disponibilidad lo dice.
  const diasConAtencion = sePuedeReagendar
    ? await diasConAtencionDeLaReserva(prisma, {
        businessId: cita.businessId,
        serviceIds: servicios.ids,
        profesionalId: cita.memberId,
      })
    : null
  // Clínica dental: una urgencia sólo se mueve a otra hora de hoy (lo valida
  // `reagendar`); el calendario sólo deja elegir hoy. En otro rubro no viene.
  const soloHoy =
    sePuedeReagendar &&
    esRubroDental(cita.business.type) &&
    (await hayServicioDeUrgencia(prisma, cita.businessId, servicios.ids))
  return NextResponse.json({
    negocio: { nombre: cita.business.name },
    // Con varios servicios (#89a), los nombres unidos y la duración total.
    servicio: { nombre: servicios.nombre, duracion: servicios.duracion },
    // Lo que cuesta hoy: al reagendar a una hora con otro precio (hora valle,
    // #89c), la pantalla muestra los dos antes de confirmar.
    precio: cita.price,
    profesional: cita.member?.user?.name?.trim() || null,
    ...fechaYHora(cita.startTime, zona),
    zona,
    plazoHoras,
    sePuedeCambiar: dentroDelPlazo(cita.startTime, plazoHoras, ahora),
    // Reagendar ofrece horas de los mismos servicios: si alguno se desactivó
    // o se borró, sólo se cancela.
    sePuedeReagendar,
    diasConAtencion,
    ...(soloHoy && { soloHoy: true }),
  })
}
