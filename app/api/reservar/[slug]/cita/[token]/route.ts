import { NextResponse, type NextRequest } from "next/server"
import { dentroDelPlazo } from "@/lib/gestion-de-cita"
import { serviciosDeLaCita } from "@/lib/servicios-de-la-reserva"
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
  return NextResponse.json({
    negocio: { nombre: cita.business.name },
    // Con varios servicios (#89a), los nombres unidos y la duración total.
    servicio: { nombre: servicios.nombre, duracion: servicios.duracion },
    profesional: cita.member?.user?.name?.trim() || null,
    ...fechaYHora(cita.startTime, zona),
    zona,
    plazoHoras,
    sePuedeCambiar: dentroDelPlazo(cita.startTime, plazoHoras, ahora),
    // Reagendar ofrece horas de los mismos servicios: si alguno se desactivó
    // o se borró, sólo se cancela.
    sePuedeReagendar: servicios.activos && servicios.duracion !== null,
  })
}
