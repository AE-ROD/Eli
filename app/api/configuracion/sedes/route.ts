import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { cuerpoConTope, respuestaDeCuerpoDemasiadoGrande } from "@/lib/cuerpo-del-pedido"
import { actorDeSesion, puedeGestionarSedes } from "@/lib/permisos"
import { respuestaDeDatosInvalidos } from "@/lib/respuesta-de-validacion"
import {
  crearSede,
  datosDeSedeSchema,
  leerSedes,
  planDeLaBase,
  respuestaDeErrorDeSedes,
  tomarCandadoDePlanYSedes,
} from "@/lib/sedes-servidor"

/**
 * Las sedes del negocio (plan Independiente, etapa 9): hasta `MAX_SEDES`
 * locales, cada uno con su dirección y su horario semanal.
 *
 * GET: el plan del negocio (leído de la base) y todas sus sedes, activas e
 * inactivas, con su horario y cuántas horas tienen por delante. Las ve todo
 * rol, como las ve la agenda; un negocio sin sedes (el plan Equipo, o un
 * Independiente que todavía no pasó a varias) recibe la lista vacía.
 *
 * POST: agrega una sede. Sólo la dueña y sólo en el plan Independiente
 * (`puedeGestionarSedes`). Un negocio SIN sedes no usa esto: pasa a tener dos
 * con `/convertir`, que le lleva el horario y las horas que ya tiene. 409 con
 * `MAX_SEDES` activas, o con un nombre repetido.
 *
 * El negocio sale siempre de la sesión, nunca del pedido. El límite de
 * peticiones es el del panel (`proxy.ts`).
 */
export async function GET() {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const plan = await planDeLaBase(prisma, actor.businessId)
  const sedes = await leerSedes(prisma, actor)
  return NextResponse.json({ plan, sedes })
}

export async function POST(request: NextRequest) {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  if (!puedeGestionarSedes(actor)) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const recibido = await cuerpoConTope(request)
  if (recibido.excedido) return respuestaDeCuerpoDemasiadoGrande()
  const datos = datosDeSedeSchema.safeParse(recibido.cuerpo)
  if (!datos.success) return respuestaDeDatosInvalidos(datos.error)

  try {
    const sede = await prisma.$transaction(async (tx) => {
      await tomarCandadoDePlanYSedes(tx, actor.businessId)
      return crearSede(tx, actor, datos.data)
    })
    return NextResponse.json({ sede }, { status: 201 })
  } catch (error) {
    return respuestaDeErrorDeSedes(error, "creando una sede")
  }
}
