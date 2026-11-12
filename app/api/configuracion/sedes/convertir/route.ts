import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { cuerpoConTope, respuestaDeCuerpoDemasiadoGrande } from "@/lib/cuerpo-del-pedido"
import { actorDeSesion, puedeGestionarSedes } from "@/lib/permisos"
import { respuestaDeDatosInvalidos } from "@/lib/respuesta-de-validacion"
import {
  conversionASedesSchema,
  convertirASedes,
  respuestaDeErrorDeSedes,
  tomarCandadoDePlanYSedes,
} from "@/lib/sedes-servidor"

/**
 * POST /api/configuracion/sedes/convertir — el negocio pasa de "cero sedes"
 * (su dirección y su horario general de siempre) a dos sedes, de una vez y
 * en una sola transacción: crea la sede principal con los datos que manda la
 * pantalla (que trae la dirección actual del negocio), le pasa el horario
 * general, le pone esa sede a las horas por delante y a la lista de espera
 * activa, y crea la sede nueva, todavía sin horario. Responde 201 con todas
 * las sedes.
 *
 * Sólo la dueña y sólo en el plan Independiente (`puedeGestionarSedes`). 409
 * si el negocio ya tiene sedes activas, o si un nombre está repetido.
 */
export async function POST(request: NextRequest) {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  if (!puedeGestionarSedes(actor)) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const recibido = await cuerpoConTope(request)
  if (recibido.excedido) return respuestaDeCuerpoDemasiadoGrande()
  const datos = conversionASedesSchema.safeParse(recibido.cuerpo)
  if (!datos.success) return respuestaDeDatosInvalidos(datos.error)

  try {
    const sedes = await prisma.$transaction(async (tx) => {
      await tomarCandadoDePlanYSedes(tx, actor.businessId)
      return convertirASedes(tx, actor, datos.data)
    })
    return NextResponse.json({ sedes }, { status: 201 })
  } catch (error) {
    return respuestaDeErrorDeSedes(error, "convirtiendo el negocio a sedes")
  }
}
