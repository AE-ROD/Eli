import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { asignarCandidatoLibre, candidatosDeLaReserva, candidatosQueCubren, tramoDeLaReserva } from "@/lib/agenda-publica"
import { cuerpoConTope, respuestaDeCuerpoDemasiadoGrande } from "@/lib/cuerpo-del-pedido"
import { enviarAvisoDeCambioDelCliente } from "@/lib/email"
import { ESTADOS_GESTIONABLES, dentroDelPlazo, mensajeFueraDePlazo } from "@/lib/gestion-de-cita"
import {
  MENSAJE_FECHA_MUY_LEJANA,
  MENSAJE_HORA_PASADA,
  fechaNoReservable,
  yaPasoLaHora,
} from "@/lib/reserva-publica"
import { existeLaHora, rangoDelDiaEn } from "@/lib/zona-horaria"
import { abrirEnlace, enTransaccionSerializable, fechaYHora, noEncontrada, nombreDelCliente, type Params } from "../_comun"

const reagendarSchema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha no es válida: tiene que tener el formato AAAA-MM-DD"),
  hora: z.string().regex(/^\d{2}:\d{2}$/, "La hora no es válida: tiene que tener el formato HH:MM"),
})

const FUERA_DE_ATENCION = "Ese horario está fuera de la atención. Elige otra hora."
const HORARIO_TOMADO = "El horario ya no está disponible"

type Resultado = { tipo: "movida"; memberId: string | null } | { tipo: "rechazada"; error: string; status: number }

/**
 * POST /api/reservar/[slug]/cita/[token]/reagendar — mueve la cita a otra
 * hora libre del mismo servicio y profesional, dentro del plazo del negocio.
 * Las mismas reglas que confirmar una reserva nueva: horario, choques y
 * bloqueos, re-verificados dentro de una transacción `Serializable`.
 */
export async function POST(request: NextRequest, contexto: Params) {
  const enlace = await abrirEnlace(request, contexto, "reserva")
  if (enlace instanceof NextResponse) return enlace
  const { cita, zona, ahora } = enlace

  const recibido = await cuerpoConTope(request)
  if (recibido.excedido) return respuestaDeCuerpoDemasiadoGrande()
  const datos = reagendarSchema.safeParse(recibido.cuerpo)
  if (!datos.success) {
    return NextResponse.json({ error: datos.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 })
  }
  const { fecha, hora } = datos.data

  const plazo = cita.business.cancelacionHorasAntes
  if (!dentroDelPlazo(cita.startTime, plazo, ahora)) {
    return NextResponse.json({ error: mensajeFueraDePlazo(plazo) }, { status: 409 })
  }
  const servicio = cita.service
  if (!servicio?.active) {
    return NextResponse.json({ error: "Este servicio ya no se reserva por acá. Contacta al local." }, { status: 409 })
  }

  if (!existeLaHora(fecha, hora, zona)) return NextResponse.json({ error: FUERA_DE_ATENCION }, { status: 409 })
  if (yaPasoLaHora(fecha, hora, ahora, zona)) return NextResponse.json({ error: MENSAJE_HORA_PASADA }, { status: 409 })
  if (fechaNoReservable(fecha, ahora, zona) === "muy-lejana") {
    return NextResponse.json({ error: MENSAJE_FECHA_MUY_LEJANA }, { status: 409 })
  }

  const reserva = await candidatosDeLaReserva(prisma, {
    businessId: cita.businessId,
    serviceId: servicio.id,
    profesionalId: cita.memberId,
    fecha,
  })
  if (reserva.tipo === "profesional-no-disponible") {
    return NextResponse.json({ error: "No hay horas para reagendar por acá. Contacta al local." }, { status: 409 })
  }
  const candidatos = candidatosQueCubren(reserva.candidatos, hora, servicio.duration)
  if (candidatos.length === 0) return NextResponse.json({ error: FUERA_DE_ATENCION }, { status: 409 })

  const tramo = tramoDeLaReserva(fecha, hora, servicio.duration, zona)

  const resultado = await enTransaccionSerializable<Resultado>(
    async (tx) => {
      const asignacion = await asignarCandidatoLibre(tx, {
        businessId: cita.businessId,
        candidatos,
        tramo,
        dia: rangoDelDiaEn(fecha, zona),
        ignorarCitaId: cita.id,
      })
      if (!asignacion.libre) return { tipo: "rechazada", error: HORARIO_TOMADO, status: 409 }

      // Sólo si sigue como se leyó: si el local la movió o la cerró, no se pisa.
      const { count } = await tx.appointment.updateMany({
        where: {
          id: cita.id,
          businessId: cita.businessId,
          status: { in: [...ESTADOS_GESTIONABLES] },
          startTime: cita.startTime,
        },
        data: { startTime: tramo.startTime, endTime: tramo.endTime, memberId: asignacion.memberId },
      })
      if (count === 0) return { tipo: "rechazada", error: "", status: 404 }
      return { tipo: "movida", memberId: asignacion.memberId }
    },
    () => ({ tipo: "rechazada", error: HORARIO_TOMADO, status: 409 })
  )

  if (resultado.tipo === "rechazada") {
    return resultado.status === 404 ? noEncontrada() : NextResponse.json({ error: resultado.error }, { status: resultado.status })
  }

  const profesional = resultado.memberId
    ? (reserva.profesionales.find((candidato) => candidato.id === resultado.memberId)?.nombre ?? null)
    : null
  const antes = fechaYHora(cita.startTime, zona)
  await enviarAvisoDeCambioDelCliente({
    tipo: "reagendo",
    emailNegocio: cita.business.user.email,
    nombreNegocio: cita.business.name,
    nombreCliente: nombreDelCliente(cita),
    servicio: servicio.name,
    profesional,
    fecha,
    hora,
    fechaAnterior: antes.fecha,
    horaAnterior: antes.hora,
  }).catch(() => null)

  return NextResponse.json({ mensaje: "Cita reagendada", fecha, hora, profesional })
}
