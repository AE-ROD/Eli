import { NextResponse, type NextRequest } from "next/server"
import { dentroDelPlazo } from "@/lib/gestion-de-cita"
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
  return NextResponse.json({
    negocio: { nombre: cita.business.name },
    servicio: { nombre: cita.service?.name ?? cita.title, duracion: cita.service?.duration ?? null },
    profesional: cita.member?.user?.name?.trim() || null,
    ...fechaYHora(cita.startTime, zona),
    zona,
    plazoHoras,
    sePuedeCambiar: dentroDelPlazo(cita.startTime, plazoHoras, ahora),
    // Reagendar ofrece horas del mismo servicio: si se desactivó, sólo se cancela.
    sePuedeReagendar: !!cita.service?.active,
  })
}
