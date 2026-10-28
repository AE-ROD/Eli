import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { cuerpoDelPedido } from "@/lib/cuerpo-del-pedido"
import { esFechaCalendario } from "@/lib/zona-horaria"
import { actorDeSesion, puedeCerrarLiquidacion, whereDeLiquidaciones } from "@/lib/permisos"
import {
  ErrorDeLiquidacion,
  SELECCION_DE_RESUMEN,
  cerrarLiquidacion,
  formatearResumen,
  quienFirma,
  respuestaDeErrorDePlata,
} from "@/lib/liquidacion"

/** Cuántas se listan de una vez: el historial de un negocio chico en años. */
const MAXIMO_DEL_HISTORIAL = 200

/**
 * El historial de liquidaciones. La gestión ve las del negocio (todas, o las
 * de `?miembro=`); el profesional, sólo las suyas, mande lo que mande:
 * `whereDeLiquidaciones` lo acota y `?miembro=` sólo puede achicar.
 */
export async function GET(request: NextRequest) {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  try {
    const miembro = new URL(request.url).searchParams.get("miembro")
    const filas = await prisma.liquidacion.findMany({
      where: whereDeLiquidaciones(actor, miembro ? { memberId: miembro } : {}),
      select: SELECCION_DE_RESUMEN,
      orderBy: [{ desde: "desc" }, { cerradaAt: "desc" }],
      take: MAXIMO_DEL_HISTORIAL,
    })
    return NextResponse.json(filas.map(formatearResumen))
  } catch (error) {
    return respuestaDeErrorDePlata(error, "listando liquidaciones")
  }
}

const cierreSchema = z.object({
  miembroId: z.string().min(1).max(100),
  /** El `desde` de la vista previa que se vio: si ya no es el próximo, 409. */
  desde: z.string().refine(esFechaCalendario, "La fecha del período no es válida."),
  excluirMovimientos: z.array(z.string().min(1).max(100)).max(200).default([]),
  nota: z.string().trim().max(500, "La nota no puede pasar de 500 caracteres.").optional(),
})

/**
 * Cierra la próxima liquidación de un profesional. Sólo la dueña. Todo en
 * una transacción, bajo un candado por negocio y miembro: un segundo cierre
 * simultáneo espera, recalcula, ve que el período ya cambió y responde 409.
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)
  if (!actor || !puedeCerrarLiquidacion(actor)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  try {
    const cuerpo = cierreSchema.parse(await cuerpoDelPedido(request))
    const firma = await quienFirma(prisma, actor, session?.user?.id)
    if (!firma) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const id = await prisma.$transaction(async (tx) => {
      const id = await cerrarLiquidacion(tx, {
        businessId: actor.businessId,
        memberId: cuerpo.miembroId,
        desdeEsperado: cuerpo.desde,
        excluirMovimientos: cuerpo.excluirMovimientos,
        nota: cuerpo.nota ? cuerpo.nota : null,
        cerradaPorId: firma.id,
        cerradaPorNombre: firma.nombre,
        ahora: new Date(),
      })
      const creada = await tx.liquidacion.findFirst({ where: { id, businessId: actor.businessId }, select: SELECCION_DE_RESUMEN })
      if (!creada) throw new ErrorDeLiquidacion(409, "La liquidación no se pudo leer después de cerrarla.")
      return formatearResumen(creada)
    })

    return NextResponse.json(id, { status: 201 })
  } catch (error) {
    return respuestaDeErrorDePlata(error, "cerrando liquidación")
  }
}
