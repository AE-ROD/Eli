import { NextResponse, type NextRequest } from "next/server"
import { diasConAtencionDeLaReserva } from "@/lib/agenda-publica"
import {
  dentroDelPlazo,
  leerProfesionalesParaCambiar,
  lugarDeLaCitaDelEnlace,
  profesionalesParaMostrar,
} from "@/lib/gestion-de-cita"
import { enlacesDeMapa } from "@/lib/pagina-del-negocio"
import { prisma } from "@/lib/prisma"
import { esRubroDental } from "@/lib/rubros"
import { hayServicioDeUrgencia, serviciosDeLaCita } from "@/lib/servicios-de-la-reserva"
import { abrirEnlace, fechaYHora, type Params } from "./_comun"

/**
 * GET /api/reservar/[slug]/cita/[token] — la cita del enlace de gestión, en
 * el reloj del negocio, y si todavía se puede cambiar. Sólo lo que se le
 * muestra al cliente: ni ids ni datos de contacto.
 *
 * Plan Independiente: si la cita tiene sede, responde su nombre y dirección
 * (con los enlaces de "Cómo llegar"), y los días que se pueden elegir al
 * reagendar son los de ESA sede. Sin sede, la respuesta es la de siempre.
 *
 * Con quién: si hay a quién elegir al reagendar (`profesionalesParaMostrar`),
 * `profesionales`: los que hacen todos los servicios de la cita y atienden en su
 * sede, con los días en que atiende cada uno y `actual` en quien la atiende hoy.
 * Sólo lo que ya publica la reserva (id, nombre, especialidad y foto). Sin nada
 * que elegir (un solo profesional posible, o ninguno) no viene la clave.
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
        sedeId: cita.sedeId,
      })
    : null
  // Clínica dental: una urgencia sólo se mueve a otra hora de hoy (lo valida
  // `reagendar`); el calendario sólo deja elegir hoy. En otro rubro no viene.
  const soloHoy =
    sePuedeReagendar &&
    esRubroDental(cita.business.type) &&
    (await hayServicioDeUrgencia(prisma, cita.businessId, servicios.ids))
  // A quién se puede pasar la cita: sólo si todavía se puede cambiar y reagendar.
  const sePuedeCambiar = dentroDelPlazo(cita.startTime, plazoHoras, ahora)
  const profesionales =
    sePuedeReagendar && sePuedeCambiar
      ? profesionalesParaMostrar(await leerProfesionalesParaCambiar(prisma, cita, servicios.ids), cita.memberId)
      : []
  const lugar = lugarDeLaCitaDelEnlace(cita)
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
    sePuedeCambiar,
    // Reagendar ofrece horas de los mismos servicios: si alguno se desactivó
    // o se borró, sólo se cancela.
    sePuedeReagendar,
    diasConAtencion,
    ...(profesionales.length > 0 && { profesionales }),
    ...(soloHoy && { soloHoy: true }),
    ...(lugar && { sede: { ...lugar, mapas: enlacesDeMapa(lugar.direccion, lugar.comuna) } }),
  })
}
