import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { asignarCandidatoLibre, candidatosDeLaReserva, candidatosQueOfrecen, tramoDeLaReserva } from "@/lib/agenda-publica"
import { cuerpoConTope, respuestaDeCuerpoDemasiadoGrande } from "@/lib/cuerpo-del-pedido"
import { correosDelAviso } from "@/lib/avisos-al-negocio"
import { enviarAvisoDeCambioDelCliente } from "@/lib/email"
import {
  LARGO_MAXIMO_DE_ID_DE_PROFESIONAL,
  MENSAJE_PROFESIONAL_NO_VALIDO,
  dentroDelPlazo,
  leerProfesionalDelPedido,
  lugarDeLaCitaDelEnlace,
  mensajeFueraDePlazo,
  mensajeServicioYaNoSeReserva,
  mensajeSinHorasParaReagendar,
  resolverProfesionalDelEnlace,
  whereDeEscrituraDelEnlace,
} from "@/lib/gestion-de-cita"
import { programarAvisoDeHoraLiberada } from "@/lib/lista-de-espera"
import {
  MENSAJE_FECHA_MUY_LEJANA,
  MENSAJE_HORA_PASADA,
  MENSAJE_URGENCIA_SOLO_HOY,
  esHoyEn,
  fechaNoReservable,
  mensajeProfesionalNoDisponible,
  yaPasoLaHora,
} from "@/lib/reserva-publica"
import { esRubroDental } from "@/lib/rubros"
import { SillonOcupado, asegurarSillonLibre } from "@/lib/sillones"
import { leerHoraValle, precioAlReagendar } from "@/lib/hora-valle"
import {
  duracionAlReagendar,
  hayServicioDeUrgencia,
  leerServiciosDeLaReserva,
  serviciosDeLaCita,
} from "@/lib/servicios-de-la-reserva"
import { existeLaHora, rangoDelDiaEn } from "@/lib/zona-horaria"
import { abrirEnlace, enTransaccionSerializable, fechaYHora, noEncontrada, nombreDelCliente, type Params } from "../_comun"

const reagendarSchema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha no es válida: tiene que tener el formato AAAA-MM-DD"),
  hora: z.string().regex(/^\d{2}:\d{2}$/, "La hora no es válida: tiene que tener el formato HH:MM"),
  // Sin él, el mismo profesional; `null` o vacío, cualquiera; un id, ese profesional (se revalida abajo).
  profesionalId: z
    .string({ invalid_type_error: MENSAJE_PROFESIONAL_NO_VALIDO })
    .max(LARGO_MAXIMO_DE_ID_DE_PROFESIONAL, MENSAJE_PROFESIONAL_NO_VALIDO)
    .nullable()
    .optional(),
})

const FUERA_DE_ATENCION = "Ese horario está fuera de la atención. Elige otra hora."
const HORARIO_TOMADO = "El horario ya no está disponible"
/**
 * Clínica dental: el sillón de la cita está ocupado a esa hora. Sin nombrar
 * el sillón ni la otra cita: el paciente no ve los sillones.
 */
const SILLON_TOMADO = "Esa hora ya no está disponible. Elige otra."

type Resultado =
  | { tipo: "movida"; memberId: string | null; precio: number | null }
  | { tipo: "rechazada"; error: string; status: number }

/**
 * POST /api/reservar/[slug]/cita/[token]/reagendar — mueve la cita a otra
 * hora libre de los mismos servicios y profesional, dentro del plazo del
 * negocio. Con varios servicios (#89a) se mueve el bloque entero, con la
 * duración total copiada al reservar (o la que tiene hoy, si es mayor).
 * Las mismas reglas que confirmar una reserva nueva: horario, choques y
 * bloqueos, re-verificados dentro de una transacción `Serializable`.
 *
 * Clínica dental: la cita conserva su sillón (lo asignó la clínica; la
 * reserva pública nunca lo elige) y la hora nueva tiene que dejarlo libre
 * (`asegurarSillonLibre`, dentro de la transacción): si no, 409. Una
 * urgencia sólo se mueve a otra hora de hoy.
 *
 * Plan Independiente: la cita conserva su sede (`sedeId` no se toca) y la hora
 * nueva tiene que caer en el horario de ESA sede. Para cambiar de sede se
 * cancela y se reserva de nuevo.
 *
 * Con quién: `profesionalId` es opcional. Sin él, queda con quien la atiende
 * (como siempre); con un id, pasa a esa persona; `null` o vacío es "cualquiera",
 * y lo asigna `asignarCandidatoLibre` con el criterio de la reserva. El id se
 * revalida contra el negocio del `slug`, los servicios y la sede de la cita
 * (`resolverProfesionalDelEnlace`): uno que no existe, es de otro negocio, no
 * hace los servicios o no atiende en la sede es el mismo 404. El profesional se
 * cambia en la MISMA transacción y con los mismos candados que la hora; cambiar
 * sólo de profesional (misma fecha y hora) es un reagendo más: mismo plazo.
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
  const eleccion = leerProfesionalDelPedido(datos.data.profesionalId)
  if (!eleccion) return NextResponse.json({ error: MENSAJE_PROFESIONAL_NO_VALIDO }, { status: 400 })

  const plazo = cita.business.cancelacionHorasAntes
  if (!dentroDelPlazo(cita.startTime, plazo, ahora)) {
    return NextResponse.json({ error: mensajeFueraDePlazo(plazo, cita.business.type) }, { status: 409 })
  }
  const servicios = serviciosDeLaCita(cita)
  // La mayor entre la suma de las filas y lo que dura hoy (`duracionAlReagendar`).
  const duracion = duracionAlReagendar(cita, servicios)
  if (!servicios.activos || duracion === null) {
    return NextResponse.json({ error: mensajeServicioYaNoSeReserva(cita.business.type) }, { status: 409 })
  }

  // Con quién: el mismo, cualquiera o uno que se revalida acá (nunca se le cree al navegador).
  const quien = await resolverProfesionalDelEnlace(prisma, cita, servicios.ids, eleccion)
  if (quien.tipo === "no-disponible") {
    return NextResponse.json({ error: mensajeProfesionalNoDisponible(cita.business.type) }, { status: 404 })
  }

  if (!existeLaHora(fecha, hora, zona)) return NextResponse.json({ error: FUERA_DE_ATENCION }, { status: 409 })
  if (yaPasoLaHora(fecha, hora, ahora, zona)) return NextResponse.json({ error: MENSAJE_HORA_PASADA }, { status: 409 })
  if (fechaNoReservable(fecha, ahora, zona) === "muy-lejana") {
    return NextResponse.json({ error: MENSAJE_FECHA_MUY_LEJANA }, { status: 409 })
  }
  // Urgencia dental: sólo hoy, como al reservarla (`confirmar`).
  const clinicaDental = esRubroDental(cita.business.type)
  if (clinicaDental && !esHoyEn(fecha, ahora, zona) && (await hayServicioDeUrgencia(prisma, cita.businessId, servicios.ids))) {
    return NextResponse.json({ error: MENSAJE_URGENCIA_SOLO_HOY }, { status: 400 })
  }

  const reserva = await candidatosDeLaReserva(prisma, {
    businessId: cita.businessId,
    serviceIds: servicios.ids,
    profesionalId: quien.profesionalId,
    fecha,
    sedeId: cita.sedeId,
  })
  if (reserva.tipo === "profesional-no-disponible") {
    return NextResponse.json({ error: mensajeSinHorasParaReagendar(cita.business.type) }, { status: 409 })
  }
  // Sólo una hora de la grilla que ofrece la disponibilidad (#46).
  const candidatos = candidatosQueOfrecen(reserva.candidatos, hora, duracion)
  if (candidatos.length === 0) return NextResponse.json({ error: FUERA_DE_ATENCION }, { status: 409 })

  const tramo = tramoDeLaReserva(fecha, hora, duracion, zona)

  // Hora valle (#89c), `precioAlReagendar`: con la opción encendida, el
  // precio nuevo es el del catálogo de hoy con el % de la hora nueva. Apagada,
  // o si el negocio editó el precio a mano en el panel, la cita conserva el
  // suyo. Las citas de antes, sin filas, sólo si su precio es el de su
  // servicio de siempre.
  const horaValle = await leerHoraValle(prisma, cita.businessId)
  const catalogo = horaValle.activa ? await leerServiciosDeLaReserva(prisma, cita.businessId, servicios.ids) : null
  const precioNuevo = precioAlReagendar(cita, catalogo, tramo.startTime, zona, horaValle)

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

      // Clínica dental: el sillón se lee acá, dentro de la transacción (la
      // clínica pudo asignarlo o cambiarlo recién), y se traba y revisa antes
      // de escribir. La cita lo conserva: no se le quita ni se cambia.
      if (clinicaDental) {
        const actual = await tx.appointment.findFirst({
          where: { id: cita.id, businessId: cita.businessId },
          select: { sillonId: true },
        })
        if (actual?.sillonId) {
          try {
            await asegurarSillonLibre(tx, {
              businessId: cita.businessId,
              sillonId: actual.sillonId,
              tramo,
              ignorarCitaId: cita.id,
              zona,
            })
          } catch (error) {
            if (error instanceof SillonOcupado) return { tipo: "rechazada", error: SILLON_TOMADO, status: 409 }
            throw error
          }
        }
      }

      // Sólo si sigue como se leyó: si el local la movió o la cerró, o el
      // cliente llegó (atención viva en el Tablero), no se pisa. También si
      // sigue con quien la tenía: si el local la pasó a otro profesional
      // entretanto, este reagendo (que parte de lo que se leyó) no lo deshace.
      const { count } = await tx.appointment.updateMany({
        where: { ...whereDeEscrituraDelEnlace(cita), memberId: cita.memberId },
        data: {
          startTime: tramo.startTime,
          endTime: tramo.endTime,
          // A la hora nueva le corresponde su propio recordatorio: el de la
          // hora anterior (si ya salió) no la cubre.
          reminderSentAt: null,
          memberId: asignacion.memberId,
          ...(precioNuevo && { price: precioNuevo.total }),
        },
      })
      if (count === 0) return { tipo: "rechazada", error: "", status: 404 }
      // Y cada fila con su precio nuevo, en la misma transacción. Los precios
      // vienen en el orden de los servicios, que es el de las filas.
      if (precioNuevo) {
        for (const [indice, fila] of cita.servicios.entries()) {
          await tx.appointmentService.updateMany({
            where: { appointmentId: cita.id, businessId: cita.businessId, orden: fila.orden },
            data: { price: precioNuevo.precios[indice] },
          })
        }
      }
      return { tipo: "movida", memberId: asignacion.memberId, precio: precioNuevo ? precioNuevo.total : cita.price }
    },
    () => ({ tipo: "rechazada", error: HORARIO_TOMADO, status: 409 })
  )

  if (resultado.tipo === "rechazada") {
    return resultado.status === 404 ? noEncontrada(cita.business.type) : NextResponse.json({ error: resultado.error }, { status: resultado.status })
  }

  // La hora anterior quedó libre: a la lista de espera de ese día.
  programarAvisoDeHoraLiberada({ businessId: cita.businessId, inicio: cita.startTime })

  const profesional = resultado.memberId
    ? (reserva.profesionales.find((candidato) => candidato.id === resultado.memberId)?.nombre ?? null)
    : null
  const antes = fechaYHora(cita.startTime, zona)
  // A la dueña y al profesional (#104). Si cambió de profesional (la cita no
  // tenía y se asignó al reagendar, o quien tiene el enlace eligió a otro), a
  // los dos: al de antes se le liberó la hora y al de ahora le llegó la cita.
  // El correo dice el profesional de ahora y, si cambió, el de antes
  // (`profesionalAnterior`: "Antes ... con Ana", "Ahora ... con Bea").
  const profesionalAnterior = cita.memberId
    ? (reserva.profesionales.find((candidato) => candidato.id === cita.memberId)?.nombre ?? null)
    : null
  const lugar = lugarDeLaCitaDelEnlace(cita)
  const avisados = await correosDelAviso(cita.businessId, cita.business.user.email, [cita.memberId, resultado.memberId])
  await Promise.all(
    avisados.map((emailNegocio) =>
      enviarAvisoDeCambioDelCliente({
        rubro: cita.business.type,
        tipo: "reagendo",
        emailNegocio,
        nombreNegocio: cita.business.name,
        nombreCliente: nombreDelCliente(cita),
        servicio: servicios.nombre,
        profesional,
        ...(resultado.memberId !== cita.memberId && profesionalAnterior && { profesionalAnterior }),
        fecha,
        hora,
        fechaAnterior: antes.fecha,
        horaAnterior: antes.hora,
        // Dónde es: sólo si la cita tiene sede (si no, el correo es el de siempre).
        ...(lugar && { lugar }),
      }).catch(() => null)
    )
  )

  return NextResponse.json({ mensaje: "Cita reagendada", fecha, hora, profesional, precio: resultado.precio })
}
