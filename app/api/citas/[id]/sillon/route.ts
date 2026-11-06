import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { cuerpoConTope, respuestaDeCuerpoDemasiadoGrande } from "@/lib/cuerpo-del-pedido"
import { respuestaDeDatosInvalidos } from "@/lib/respuesta-de-validacion"
import { actorDeSesion, puedeAsignarSillon, whereDeAgenda, whereDeSillones } from "@/lib/permisos"
import { sePuedeMover } from "@/lib/mover-cita"
import { ocupaElHorario } from "@/lib/ocupacion"
import {
  MENSAJE_SILLON_DE_CITA_CERRADA,
  MENSAJE_SILLON_INACTIVO,
  MENSAJE_SILLON_NO_ENCONTRADO,
  SillonOcupado,
  asegurarSillonLibre,
  sillonDeLaCita,
} from "@/lib/sillones"
import { zonaDelNegocio } from "@/lib/zona-horaria"

const asignacionSchema = z.object({ sillonId: sillonDeLaCita() })

const SELECCION = { id: true, sillonId: true, sillon: { select: { id: true, nombre: true } } } as const

const citaNoEncontrada = () => NextResponse.json({ error: "Cita no encontrada" }, { status: 404 })

/**
 * Asigna, cambia o quita el sillón de una cita (`{ sillonId }`; `null` lo
 * quita). Es el "Asignar sillón" del inicio y de la agenda: no toca la hora
 * ni el profesional, y se puede con el paciente ya en la sala de espera.
 *
 * - Sólo en una clínica dental (`puedeAsignarSillon`): en otro rubro, 404.
 * - Qué citas toca cada uno lo dice `whereDeAgenda`: el odontólogo, las
 *   suyas; la ajena, 404.
 * - El sillón tiene que ser de la clínica (404) y estar activo (400).
 * - Una cita cancelada, completada o de alguien que no vino no cambia de
 *   sillón (409).
 * - Si la cita ocupa su horario y el sillón ya tiene otra cita que se pisa,
 *   409 con `codigo: "sillon-ocupado"`; se revisa con el sillón trabado, en
 *   la misma transacción que escribe.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  if (!puedeAsignarSillon(actor)) return citaNoEncontrada()

  const { id } = await params
  const cita = await prisma.appointment.findFirst({
    where: whereDeAgenda(actor, { id }),
    select: { id: true, status: true, startTime: true, endTime: true, sillonId: true },
  })
  if (!cita) return citaNoEncontrada()

  let datos: z.infer<typeof asignacionSchema>
  try {
    const recibido = await cuerpoConTope(request)
    if (recibido.excedido) return respuestaDeCuerpoDemasiadoGrande()
    datos = asignacionSchema.parse(recibido.cuerpo)
  } catch (error) {
    if (error instanceof z.ZodError) return respuestaDeDatosInvalidos(error)
    throw error
  }

  const { sillonId } = datos
  const leerCita = () => prisma.appointment.findFirst({ where: whereDeAgenda(actor, { id: cita.id }), select: SELECCION })

  // Ya está así: no hay nada que escribir.
  if (sillonId === cita.sillonId) {
    const actual = await leerCita()
    return actual ? NextResponse.json(actual) : citaNoEncontrada()
  }

  if (!sePuedeMover(cita.status)) {
    return NextResponse.json({ error: MENSAJE_SILLON_DE_CITA_CERRADA }, { status: 409 })
  }

  if (sillonId) {
    const sillon = await prisma.sillon.findFirst({ where: whereDeSillones(actor, { id: sillonId }), select: { activo: true } })
    if (!sillon) return NextResponse.json({ error: MENSAJE_SILLON_NO_ENCONTRADO }, { status: 404 })
    if (!sillon.activo) return NextResponse.json({ error: MENSAJE_SILLON_INACTIVO }, { status: 400 })
  }

  const negocio = sillonId
    ? await prisma.business.findUnique({ where: { id: actor.businessId }, select: { timezone: true } })
    : null

  try {
    const escrita = await prisma.$transaction(async (tx) => {
      if (sillonId && ocupaElHorario(cita.status)) {
        await asegurarSillonLibre(tx, {
          businessId: actor.businessId,
          sillonId,
          tramo: { startTime: cita.startTime, endTime: cita.endTime },
          ignorarCitaId: cita.id,
          zona: zonaDelNegocio(negocio?.timezone),
        })
      }
      // Sólo si sigue como se leyó (hora y estado): si otro la movió o la
      // cerró entretanto, no se pisa y se responde 409.
      const { count } = await tx.appointment.updateMany({
        where: {
          id: cita.id,
          businessId: actor.businessId,
          status: cita.status,
          startTime: cita.startTime,
          endTime: cita.endTime,
        },
        data: { sillonId },
      })
      return count
    })
    if (escrita === 0) {
      return NextResponse.json({ error: "La cita cambió mientras tanto: vuelve a cargar la agenda." }, { status: 409 })
    }
  } catch (error) {
    if (error instanceof SillonOcupado) {
      return NextResponse.json({ error: error.message, codigo: error.codigo }, { status: error.status })
    }
    console.error("Error asignando sillón:", error)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }

  const actualizada = await leerCita()
  return actualizada ? NextResponse.json(actualizada) : citaNoEncontrada()
}
