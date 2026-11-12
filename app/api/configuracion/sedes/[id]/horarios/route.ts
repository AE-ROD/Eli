import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { cuerpoConTope, respuestaDeCuerpoDemasiadoGrande } from "@/lib/cuerpo-del-pedido"
import { grillaDeSedeSchema } from "@/lib/grilla-de-sede"
import { actorDeSesion, puedeGestionarSedes, whereDeSedes } from "@/lib/permisos"
import { MENSAJE_SEDE_NO_ENCONTRADA } from "@/lib/reglas-de-sedes"
import { respuestaDeDatosInvalidos } from "@/lib/respuesta-de-validacion"
import { guardarHorarioDeSede, respuestaDeErrorDeSedes, tomarCandadoDePlanYSedes } from "@/lib/sedes-servidor"

const noEncontrada = () => NextResponse.json({ error: MENSAJE_SEDE_NO_ENCONTRADA }, { status: 404 })

/**
 * PUT /api/configuracion/sedes/[id]/horarios — reemplaza TODA la grilla
 * semanal de la sede: `{ dias: [{ dayOfWeek, franjas: [{ start, end }] }] }`.
 * Vacío = la sede no atiende. Responde con la sede.
 *
 * 400 por una hora mal escrita, un inicio que no es anterior al fin, franjas
 * que se pisan dentro de la misma sede o un día repetido. 409 con
 * `{ error, choques: [{ dayOfWeek, conSede }] }` si una franja se pisa con la
 * de OTRA sede activa el mismo día (tocarse sí vale). Reemplazar es borrar y
 * crear bajo el candado del negocio, como el horario general.
 *
 * Primero la pertenencia (404), después el permiso (`puedeGestionarSedes`).
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const { id } = await params
  const existente = await prisma.sede.findFirst({ where: whereDeSedes(actor, { id }), select: { id: true } })
  if (!existente) return noEncontrada()
  if (!puedeGestionarSedes(actor)) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const recibido = await cuerpoConTope(request)
  if (recibido.excedido) return respuestaDeCuerpoDemasiadoGrande()
  const grilla = grillaDeSedeSchema.safeParse(recibido.cuerpo)
  if (!grilla.success) return respuestaDeDatosInvalidos(grilla.error)

  try {
    const sede = await prisma.$transaction(async (tx) => {
      await tomarCandadoDePlanYSedes(tx, actor.businessId)
      return guardarHorarioDeSede(tx, actor, existente.id, grilla.data)
    })
    return NextResponse.json({ sede })
  } catch (error) {
    return respuestaDeErrorDeSedes(error, "guardando el horario de una sede")
  }
}
